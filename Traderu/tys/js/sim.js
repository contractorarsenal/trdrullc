/*
 * SIMULATOR ENGINE.
 * One stage of a scenario: a fixed market path (market.js) + a portfolio (portfolio.js) + order rules.
 * Nothing the student does changes the path. Their result changes because of timing, size, entry and exit.
 *
 *   TYS.createSim(stage, opts)   one stage        opts: {rules, level, cash (carried in)}
 *   TYS.createRun(instance)      a whole scenario (one or more stages, portfolio carried between them)
 */
(function (root) {
  'use strict';
  var TYS = root.TYS = root.TYS || {}, num = TYS.fmt.num, EPS = 1e-12;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  TYS.createSim = function (stage, opts) {
    opts = opts || {};
    var cfg = TYS.CONFIG, rules = opts.rules || {}, T = cfg.ticksPerCandle, unit = cfg.unit, candleMs = stage.candleMs || cfg.candleMs;
    var path = TYS.Market.createPath({ history: stage.history, candles: stage.candles, unit: unit, ticks: T, candleMs: candleMs });
    var D = path.duration;
    var start = stage.start ? JSON.parse(JSON.stringify(stage.start)) : { cash: 0 };
    if (stage.carry) start.cash = num(opts.cash);
    var pf = TYS.createPortfolio(start);
    var sim = { stage: stage, path: path, portfolio: pf, rules: rules, level: opts.level, candleMs: candleMs, duration: D,
      elapsed: 0, started: false, locked: false, decision: null, decisionT: null, log: [], actions: [], autoDone: false, closed: false };
    sim.startValue = pf.cash + pf.shares * path.priceAt(0);
    sim.auto = stage.kind === 'auto';
    sim.autoT = sim.auto && stage.auto ? stage.auto.exitAt * candleMs : null;

    sim.price = function () { return path.priceAt(sim.elapsed); };
    sim.forming = function () { return path.forming(sim.elapsed); };
    sim.value = function () { return pf.value(sim.price()); };
    sim.metrics = function (t) { return TYS.Market.metricsAt(path, stage.signals, t == null ? sim.elapsed : t, { signalNoise: (TYS.Difficulty.mod(opts.level).signalNoise), seed: stage.seed }); };
    sim.hasPosition = function () { return pf.hasPosition(sim.price()); };
    sim.everHeld = function () { return pf.episodes.length > 0; };

    /* ---- actions ---- */
    function amountFor(def, params) {
      if (def.custom) return num(params && params.usd);
      if (def.size === 'max') return pf.cash;
      if (def.pct && def.id === 'buy') return pf.cash * def.pct;
      return def.usd;
    }
    sim.findDef = function (id, pct, usd, label) {
      var a = stage.actions, i;
      for (i = 0; i < a.length; i++) if (a[i].id === id && (label == null || a[i].label === label) && (id !== 'sell' || Math.abs((a[i].pct || 1) - (pct || 1)) < 1e-9) && (id !== 'buy' || a[i].custom || a[i].size === 'max' || a[i].pct || Math.abs((a[i].usd || 0) - (usd || 0)) < 1e-9 || usd == null)) return a[i];
      return null;
    };
    sim.actionState = function (def, params) {
      if (!def) return { enabled: false, reason: 'unavailable' };
      if (sim.auto) return { enabled: false, reason: 'auto' };
      if (!sim.started) return { enabled: false, reason: 'not-started' };
      if (sim.elapsed >= D) return { enabled: false, reason: 'ended' };
      if (sim.locked) return { enabled: false, reason: 'locked' };
      var holding = sim.hasPosition();
      if (def.id === 'buy') {
        if (def.add && !holding) return { enabled: false, reason: 'no-position' };
        if (!def.add && holding && !rules.addToPosition) return { enabled: false, reason: 'already-in' };
        var amt = amountFor(def, params);
        if (pf.cash < 0.01) return { enabled: false, reason: 'no-cash' };
        if (def.custom) { if (params && params.usd != null && !(amt >= 1)) return { enabled: false, reason: 'invalid-amount' }; if (params && amt > pf.cash + 1e-9) return { enabled: false, reason: 'insufficient-cash' }; }
        else if (amt > pf.cash + 1e-9) return { enabled: false, reason: 'insufficient-cash' };
      }
      if (def.id === 'sell' || def.id === 'hold') if (!holding) return { enabled: false, reason: 'no-position' };
      if (def.id === 'wait' && holding) return { enabled: false, reason: 'in-position' };
      if (def.id === 'pass' && (holding || sim.everHeld())) return { enabled: false, reason: 'in-position' };
      return { enabled: true };
    };
    sim.act = function (def, params) {
      params = params || {};
      var chk = sim.actionState(def, params); if (!chk.enabled) return { ok: false, reason: chk.reason };
      var price = sim.price(), t = sim.elapsed, rec = { type: def.id, t: t, mcap: price, label: def.label }, res;
      if (def.id === 'buy') {
        var amt = def.custom ? Math.min(num(params.usd), pf.cash) : def.size === 'max' ? pf.cash : def.pct ? pf.cash * def.pct : def.usd;
        res = pf.buy(amt, price, t); if (!res.ok) return res;
        rec.usd = res.usd; rec.shares = res.shares; rec.sizePct = res.sizePct; rec.added = res.added; rec.custom = !!def.custom; rec.add = !!def.add; rec.episode = res.episode.n;
      } else if (def.id === 'sell') {
        res = pf.sell(def.pct, price, t); if (!res.ok) return res;
        rec.pct = res.pct; rec.usd = res.usd; rec.shares = res.shares; rec.realizedDelta = res.realizedDelta; rec.flat = res.flat; rec.episode = res.episode && res.episode.n;
        if (res.flat && !rules.reentry) { sim.locked = true; sim.decision = 'exited'; sim.decisionT = t; }
      } else if (def.id === 'pass') { sim.locked = true; sim.decision = 'pass'; sim.decisionT = t; }
      rec.after = pf.snapshot();
      sim.log.push(rec); sim.actions.push({ id: def.id, pct: def.pct, usd: def.custom ? params.usd : def.usd, label: def.label, t: t });
      return { ok: true, trade: rec };
    };

    /* ---- clock ---- */
    // Scripted "previous trade": closes at a fixed moment whatever the student does (they cannot act in an auto stage).
    function settleAuto() {
      if (!sim.auto || sim.autoDone || sim.autoT == null || sim.elapsed < sim.autoT - 1e-9) return;
      var price = path.priceAt(sim.autoT), res = pf.sell(1, price, sim.autoT);
      sim.autoDone = true;
      if (res.ok) sim.log.push({ type: 'sell', auto: true, t: sim.autoT, mcap: price, pct: 1, usd: res.usd, shares: res.shares, realizedDelta: res.realizedDelta, flat: true, episode: res.episode && res.episode.n, after: pf.snapshot() });
    }
    sim.start = function () { sim.started = true; };
    sim.setElapsed = function (t) { sim.elapsed = clamp(num(t), 0, D); settleAuto(); };
    sim.advance = function (dt) { if (!sim.started) return; sim.setElapsed(sim.elapsed + num(dt)); };
    sim.done = function () { return sim.started && sim.elapsed >= D - 1e-9; };
    sim.progress = function () { return D ? sim.elapsed / D : 0; };

    /* ---- events (presenter NEXT EVENT, replay annotations) ---- */
    sim.events = (stage.events || []).map(function (e) { return { at: e.at, t: e.at * candleMs, label: e.label, kind: e.kind || 'note' }; });
    sim.nextEventT = function (t) { for (var i = 0; i < sim.events.length; i++) if (sim.events[i].t > t + 1) return sim.events[i].t; return null; };
    sim.prevEventT = function (t) { var r = 0; for (var i = 0; i < sim.events.length; i++) if (sim.events[i].t < t - 1) r = sim.events[i].t; return r; };

    // Close an open position at the final price so the portfolio can be carried to the next stage.
    sim.closeOut = function () {
      if (sim.closed) return; sim.closed = true;
      if (sim.auto) { sim.elapsed = D; settleAuto(); }
      var price = path.priceAt(D);
      if (stage.autoClose !== false && pf.hasPosition(price)) {
        var res = pf.sell(1, price, D);
        if (res.ok) sim.log.push({ type: 'sell', auto: true, close: true, t: D, mcap: price, pct: 1, usd: res.usd, shares: res.shares, realizedDelta: res.realizedDelta, flat: true, episode: res.episode && res.episode.n, after: pf.snapshot() });
      }
    };

    /* ---- exact analytics, independent of frame rate ---- */
    // Walks every price tick and every trade in order. Episodes get their own peak / trough.
    sim.analyze = function (tEnd) {
      tEnd = clamp(tEnd == null ? sim.elapsed : tEnd, 0, D);
      var times = [0, tEnd], kMax = Math.min(path.N - 1, Math.floor(tEnd / candleMs)), k, j, tt;
      for (k = 0; k <= kMax; k++) for (j = 0; j <= T; j++) { tt = (k + j / T) * candleMs; if (tt <= tEnd) times.push(tt); }
      sim.log.forEach(function (x) { if (x.t <= tEnd) times.push(x.t); });
      times.sort(function (a, b) { return a - b; });
      var s = TYS.createPortfolio(start); if (stage.carry) s.cash = start.cash;
      var m = { peakPositionValue: 0, peakUnrealPct: 0, troughUnrealPct: null, peakTotal: -Infinity, maxDrawdownPct: 0, episodes: {} };
      var li = 0, entries = sim.log.filter(function (x) { return x.t <= tEnd; });
      function ev(price, t) {
        var v = s.value(price), ep = s.current;
        if (v.shares > EPS) {
          if (v.positionValue > m.peakPositionValue) m.peakPositionValue = v.positionValue;
          if (m.troughUnrealPct === null || v.unrealizedPct < m.troughUnrealPct) m.troughUnrealPct = v.unrealizedPct;
          if (v.unrealizedPct > m.peakUnrealPct) m.peakUnrealPct = v.unrealizedPct;
          if (ep) { var e = m.episodes[ep.n] || (m.episodes[ep.n] = { peakValue: 0, trough: null, peak: -Infinity, troughT: 0, peakT: 0 });
            if (v.positionValue > e.peakValue) { e.peakValue = v.positionValue; }
            if (e.trough === null || v.unrealizedPct < e.trough) { e.trough = v.unrealizedPct; e.troughT = t; }
            if (v.unrealizedPct > e.peak) { e.peak = v.unrealizedPct; e.peakT = t; } }
        }
        if (v.total > m.peakTotal) m.peakTotal = v.total;
        var dd = m.peakTotal > EPS ? (m.peakTotal - v.total) / m.peakTotal : 0; if (dd > m.maxDrawdownPct) m.maxDrawdownPct = dd;
      }
      for (var i = 0; i < times.length; i++) {
        var tm = times[i], p = path.priceAt(tm);
        while (li < entries.length && entries[li].t <= tm) {
          var x = entries[li++]; ev(x.mcap, x.t);
          if (x.type === 'buy') s.buy(x.usd, x.mcap, x.t); else if (x.type === 'sell') s.sell(x.pct, x.mcap, x.t);
          ev(x.mcap, x.t);
        }
        ev(p, tm);
      }
      m.portfolio = s; return m;
    };

    sim.summary = function () {
      var price = sim.price(), v = pf.value(price), m = sim.analyze(sim.elapsed), sells = sim.log.filter(function (x) { return x.type === 'sell' && !x.auto; });
      var userLog = sim.log.filter(function (x) { return !x.auto; });
      return { done: sim.done(), price: price, total: v.total, cash: v.cash, positionValue: v.positionValue, realized: v.realized, unrealized: v.unrealized,
        startValue: sim.startValue, pnl: v.total - sim.startValue, pnlPct: sim.startValue > EPS ? (v.total - sim.startValue) / sim.startValue : 0,
        peakPositionValue: m.peakPositionValue, troughUnrealPct: m.troughUnrealPct, peakUnrealPct: m.peakUnrealPct, maxDrawdownPct: m.maxDrawdownPct,
        peakTotal: m.peakTotal, drawdownFromPeakPct: m.peakTotal > EPS ? Math.max(0, (m.peakTotal - v.total) / m.peakTotal) : 0,
        episodes: pf.episodes, episodeMetrics: m.episodes, sells: sells, waits: userLog.filter(function (x) { return x.type === 'wait'; }).length,
        holds: userLog.filter(function (x) { return x.type === 'hold'; }).length, hasPosition: pf.hasPosition(price), decision: sim.decision || (sim.done() ? 'none' : null),
        capital: pf.capitalState(price), peak: path.peak, low: path.low, first: path.first, final: path.priceAt(D) };
    };

    /* ---- persistence: decisions are replayed, so a refresh lands in exactly the same place ---- */
    sim.snapshot = function () { return { started: sim.started, elapsed: sim.elapsed, actions: sim.actions.map(function (a) { return { id: a.id, pct: a.pct, usd: a.usd, label: a.label, t: a.t }; }) }; };
    sim.restore = function (snap) {
      if (!snap) return sim;
      if (snap.started) sim.start();
      (snap.actions || []).forEach(function (a) { sim.setElapsed(clamp(num(a.t), 0, D)); var def = sim.findDef(a.id, a.pct, a.usd, a.label); if (def) sim.act(def, { usd: a.usd }); });
      sim.setElapsed(num(snap.elapsed)); return sim;
    };
    return sim;
  };

  /* ------------------------------------------------------------ a run = one scenario, one or more stages */
  TYS.createRun = function (instance) {
    var run = { instance: instance, def: instance.def, level: instance.level, stageIndex: 0, sims: [], carry: { previousTrade: null, sessionPnl: 0, sessionPct: 0, startCapital: null } };
    function build(i) {
      var st = instance.stages[i], cash = null;
      if (st.carry) { var prev = run.sims[i - 1]; prev.closeOut(); cash = prev.portfolio.cash; }
      var sim = TYS.createSim(st, { rules: instance.rules, level: instance.level, cash: cash });
      if (i === 0) run.carry.startCapital = sim.startValue;
      if (i > 0) { var p = run.sims[i - 1], ps = p.summary(); run.carry.previousTrade = { pnl: ps.realized - (p.portfolio.initial.realized || 0), sizeUsd: p.portfolio.episodes.length ? p.portfolio.episodes[0].invested : 0 }; run.carry.sessionPnl = sim.startValue - run.carry.startCapital; run.carry.sessionPct = run.carry.startCapital > 0 ? run.carry.sessionPnl / run.carry.startCapital : 0; }
      run.sims[i] = sim; return sim;
    }
    run.sim = function () { return run.sims[run.stageIndex]; };
    run.stage = function () { return instance.stages[run.stageIndex]; };
    run.stageCount = instance.stages.length;
    run.isLastStage = function () { return run.stageIndex >= run.stageCount - 1; };
    run.reset = function () { run.sims = []; run.stageIndex = 0; run.carry = { previousTrade: null, sessionPnl: 0, sessionPct: 0, startCapital: null }; run.init(); return run; };
    run.begin = function () { if (!run.sims[0]) build(0); run.sims[0].start(); };
    run.init = function () { if (!run.sims[0]) build(0); return run.sims[0]; };
    run.nextStage = function () { if (run.isLastStage()) return null; run.sim().closeOut(); run.stageIndex++; var s = build(run.stageIndex); s.start(); return s; };
    run.finished = function () { return run.isLastStage() && run.sim().done(); };
    run.snapshot = function () { return { stage: run.stageIndex, sims: run.sims.map(function (s) { return s.snapshot(); }) }; };
    run.restore = function (snap) {
      run.init();
      if (!snap || !snap.sims) return run;
      for (var i = 0; i < snap.sims.length; i++) {
        if (i > 0) { run.stageIndex = i; build(i); }
        run.sims[i].restore(snap.sims[i]);
        if (i < snap.sims.length - 1) run.sims[i].closeOut();
      }
      run.stageIndex = Math.min(snap.stage || 0, run.stageCount - 1);
      if (run.stageIndex >= run.sims.length) run.stageIndex = run.sims.length - 1;
      return run;
    };
    // every stage's summary, for behavior analytics and results
    run.summaries = function () { return run.sims.map(function (s) { return s.summary(); }); };
    return run;
  };

  // One line of the student's decision history: "00:16 BUY $100 @ $52.4K", "00:24 SELL 50% @ $78.2K", "00:08 WAIT".
  TYS.describeLogLine = function (stage, tr) {
    var fmt = TYS.fmt, name = tr.label || tr.type.toUpperCase(), detail = '';
    if (tr.type === 'sell') name = 'SELL ' + fmt.pct0(tr.pct);
    if (tr.type === 'buy') { name = tr.label && /^ADD/.test(tr.label) ? tr.label.replace(/\s*\$.*/, '') : 'BUY'; detail = fmt.usd0(tr.usd) + ' @ ' + fmt.mcap(tr.mcap); }
    else if (tr.type === 'sell') detail = '@ ' + fmt.mcap(tr.mcap);
    return { t: tr.t, clock: fmt.clock(tr.t), kind: tr.type, name: name, detail: detail };
  };
})(typeof window !== 'undefined' ? window : globalThis);
