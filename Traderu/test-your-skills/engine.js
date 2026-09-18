/*
 * TEST YOUR SKILLS: simulation engine.
 *
 * Pure logic. No DOM, no network, no randomness. Everything is driven by scenario data
 * (scenarios.js). The market path is a pure function of simulation time, so every user sees
 * the same market and a click never changes the future.
 *
 * Money model: the user owns a fraction of the token supply ("shares" = usd / marketCap).
 * Position value = shares x current market cap. Sells always act on the *remaining* position.
 */
(function (root) {
  'use strict';
  var TYS = root.TYS = root.TYS || {};
  var EPS = 1e-12;
  var PATTERNS = [[3, 8], [4, 9], [2, 6], [5, 10]];   // where inside a candle the two extremes print

  function num(v, d) { v = +v; return isFinite(v) ? v : (d || 0); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function hash(i, j) { var x = Math.sin(i * 127.1 + j * 311.7 + 13.37) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; }

  /* ---------------------------------------------------------------- formatting */
  function commas(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  var fmt = TYS.fmt = {
    mcap: function (v) {
      v = num(v);
      if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
      if (v >= 1000) return '$' + (Math.round(v / 100) / 10).toFixed(1).replace(/\.0$/, '') + 'K';
      return '$' + Math.round(v);
    },
    usd: function (v) {
      v = num(v); if (Math.abs(v) < 0.005) v = 0;
      var s = Math.abs(v).toFixed(2).split('.');
      return (v < 0 ? '-' : '') + '$' + commas(s[0]) + '.' + s[1];
    },
    signedUsd: function (v) {
      v = num(v); if (Math.abs(v) < 0.005) v = 0;
      return (v < 0 ? '-' : '+') + '$' + commas(Math.abs(v).toFixed(2).split('.')[0]) + '.' + Math.abs(v).toFixed(2).split('.')[1];
    },
    pct: function (f) { f = num(f); if (Math.abs(f) < 0.0005) f = 0; return (f < 0 ? '-' : '+') + Math.abs(f * 100).toFixed(1) + '%'; },
    pct0: function (f) { return Math.round(num(f) * 100) + '%'; },
    volume: function (v) { v = num(v); return v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : '$' + Math.round(v / 1000) + 'K'; },
    price: function (v) { v = num(v); return '$' + (v < 0.01 ? v.toFixed(7) : v.toFixed(4)); },
    clock: function (ms) { var s = Math.floor(Math.max(0, ms) / 1000); return (s < 600 ? '0' : '') + Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); },
    pnl: function (v, p) { return fmt.signedUsd(v) + (p == null ? '' : ' (' + fmt.pct(p) + ')'); }
  };

  /* ---------------------------------------------------------------- candles */
  function normCandle(a, unit) {
    var o = num(a[0]) * unit, c = num(a[3]) * unit;
    var h = Math.max(num(a[1]) * unit, o, c);
    var l = Math.max(Math.min(num(a[2]) * unit, o, c), 1);
    return { o: o, h: h, l: l, c: c, v: num(a[4]) * unit };
  }

  // Deterministic intra-candle path with the extremes landing exactly on tick anchors.
  function buildTicks(cd, gi, T) {
    var pat = PATTERNS[(gi * 7 + 3) % 4];
    var t1 = Math.max(1, Math.round(pat[0] / 12 * T));
    var t2 = Math.min(T - 1, Math.max(t1 + 1, Math.round(pat[1] / 12 * T)));
    var bull = cd.c >= cd.o;
    var e1 = bull ? cd.l : cd.h, e2 = bull ? cd.h : cd.l;
    var R = cd.h - cd.l, v = new Array(T + 1), j, a, b, x0, x1, f, val;
    for (j = 0; j <= T; j++) {
      if (j <= t1) { a = cd.o; b = e1; x0 = 0; x1 = t1; }
      else if (j <= t2) { a = e1; b = e2; x0 = t1; x1 = t2; }
      else { a = e2; b = cd.c; x0 = t2; x1 = T; }
      f = (j - x0) / (x1 - x0);
      val = a + (b - a) * f;
      if (R > 0 && j !== 0 && j !== T && j !== t1 && j !== t2) {
        val += hash(gi, j) * 0.10 * R;
        val = Math.min(cd.h - 0.02 * R, Math.max(cd.l + 0.02 * R, val));
      }
      v[j] = val;
    }
    v[0] = cd.o; v[t1] = e1; v[t2] = e2; v[T] = cd.c;
    var pmax = new Array(T + 1), pmin = new Array(T + 1);
    for (j = 0; j <= T; j++) {
      pmax[j] = j ? Math.max(pmax[j - 1], v[j]) : v[j];
      pmin[j] = j ? Math.min(pmin[j - 1], v[j]) : v[j];
    }
    return { v: v, max: pmax, min: pmin };
  }

  /* ---------------------------------------------------------------- simulation */
  TYS.createSim = function (scenario, cfg) {
    cfg = cfg || TYS.CONFIG;
    var unit = cfg.unit || 1000, T = cfg.ticksPerCandle || 12, SUPPLY = cfg.supply || 1e9;
    var hist = (scenario.history || []).map(function (a) { return normCandle(a, unit); });
    var live = (scenario.candles || []).map(function (a) { return normCandle(a, unit); });
    if (!live.length) throw new Error('Scenario has no live candles');
    var all = hist.concat(live), H = hist.length, N = live.length;
    var ticks = all.map(function (c, i) { return buildTicks(c, i, T); });
    var candleMs = scenario.candleMs || cfg.candleMs || 1000;
    var D = N * candleMs;
    var startPos = scenario.startingPosition || null;
    var baseline = num(scenario.baselineCapital, cfg.baselineCapital || 100);

    var st = { cash: num(scenario.startingCash), shares: 0, cost: 0, realized: 0 };
    if (startPos) { st.shares = startPos.costUsd / startPos.entryMcap; st.cost = startPos.costUsd; }
    var initialState = { cash: st.cash, shares: st.shares, cost: st.cost, realized: 0 };
    var initialShares = st.shares;

    var sim = { scenario: scenario, cfg: cfg, all: all, H: H, N: N, candleMs: candleMs, duration: D,
      elapsed: 0, started: false, locked: false, decision: null, decisionT: null, decisionMcap: null,
      entry: null, trades: [], log: [], actions: [] };

    // livePeak: the highest print anywhere on the scripted path
    var livePeak = 0, livePeakT = 0, k, j;
    for (k = 0; k < N; k++) for (j = 0; j <= T; j++) {
      var pv = ticks[H + k].v[j];
      if (pv > livePeak) { livePeak = pv; livePeakT = (k + j / T) * candleMs; }
    }
    sim.livePeak = livePeak; sim.livePeakT = livePeakT;

    function locate(t) {
      t = clamp(t, 0, D);
      var kk = Math.min(N - 1, Math.floor(t / candleMs));
      var p = t >= D ? 1 : (t - kk * candleMs) / candleMs;
      return { k: kk, p: p };
    }
    function priceAt(t) {
      var L = locate(t), tk = ticks[H + L.k].v, jf = L.p * T, jj = Math.min(T - 1, Math.floor(jf));
      return tk[jj] + (tk[jj + 1] - tk[jj]) * (jf - jj);
    }
    sim.priceAt = priceAt;
    sim.price = function () { return priceAt(sim.elapsed); };

    // The candle currently forming, with running high/low so far.
    sim.forming = function () {
      var L = locate(sim.elapsed), c = all[H + L.k], tk = ticks[H + L.k];
      var px = priceAt(sim.elapsed), pj = Math.min(T, Math.floor(L.p * T));
      return { index: H + L.k, k: L.k, p: L.p, o: c.o, h: Math.max(tk.max[pj], px), l: Math.min(tk.min[pj], px), c: px, v: c.v * L.p };
    };

    /* ---- portfolio ---- */
    function value(state, price) {
      var pv = state.shares * price;
      return { cash: state.cash, shares: state.shares, tokens: state.shares * SUPPLY, cost: state.cost, realized: state.realized,
        positionValue: pv, unrealized: pv - state.cost, total: state.cash + pv,
        unrealizedPct: state.cost > EPS ? (pv - state.cost) / state.cost : 0,
        avgEntry: state.shares > EPS ? state.cost / state.shares : null };
    }
    sim.portfolio = function () { return value(st, sim.price()); };
    function snap() { return { cash: st.cash, shares: st.shares, cost: st.cost, realized: st.realized }; }
    function hasPosition() { return st.shares * sim.price() >= 0.005 && st.shares > EPS; }

    /* ---- actions ---- */
    function defFor(id, pct) {
      var acts = scenario.actions || [];
      for (var i = 0; i < acts.length; i++) if (acts[i].id === id && (id !== 'sell' || Math.abs((acts[i].pct || 1) - (pct || 1)) < 1e-9)) return acts[i];
      return null;
    }
    sim.actionState = function (id, pct) {
      if (!defFor(id, pct)) return { enabled: false, reason: 'unavailable' };
      if (!sim.started) return { enabled: false, reason: 'not-started' };
      if (sim.elapsed >= D) return { enabled: false, reason: 'ended' };
      if (sim.locked) return { enabled: false, reason: 'locked' };
      if (id === 'buy') {
        if (hasPosition()) return { enabled: false, reason: 'already-in' };
        if (st.cash < 0.01) return { enabled: false, reason: 'no-cash' };
      }
      if (id === 'sell' && !hasPosition()) return { enabled: false, reason: 'no-position' };
      if (id === 'pass' && hasPosition()) return { enabled: false, reason: 'in-position' };
      return { enabled: true };
    };
    function lockIf(id) {
      var lockOn = scenario.lockOn || [];
      if (lockOn.indexOf(id) !== -1) { sim.locked = true; sim.decision = id; sim.decisionT = sim.elapsed; sim.decisionMcap = sim.price(); }
    }
    sim.act = function (id, opts) {
      opts = opts || {};
      var pct = opts.pct, chk = sim.actionState(id, pct);
      if (!chk.enabled) return { ok: false, reason: chk.reason };
      var price = sim.price(), t = sim.elapsed, rec = { type: id, t: t, mcap: price };
      if (!(price > 0) || !isFinite(price)) return { ok: false, reason: 'bad-price' };

      if (id === 'buy') {
        var usd = st.cash, bought = usd / price;
        st.shares += bought; st.cash -= usd; st.cost += usd;
        if (Math.abs(st.cash) < 1e-9) st.cash = 0;
        rec.usd = usd; rec.shares = bought;
        var L = locate(t), gi = H + L.k, streak = 0;
        while (gi - 1 - streak >= 0 && all[gi - 1 - streak].c > all[gi - 1 - streak].o && streak < 12) streak++;
        sim.entry = { t: t, mcap: price, k: L.k, streak: streak };
        rec.after = snap(); sim.trades.push(rec); lockIf('buy');
      } else if (id === 'sell') {
        var f = clamp(num(pct, 1), 0.0001, 1), sellShares = f >= 0.9999 ? st.shares : st.shares * f;
        var proceeds = sellShares * price, costPart = f >= 0.9999 ? st.cost : st.cost * (sellShares / st.shares);
        st.cash += proceeds; st.realized += proceeds - costPart; st.shares -= sellShares; st.cost -= costPart;
        if (st.shares * price < 0.005) {              // sweep dust so the position can close cleanly
          var dust = st.shares * price; st.cash += dust; st.realized += dust - st.cost; st.shares = 0; st.cost = 0; proceeds += dust;
        }
        if (st.shares <= EPS) { st.shares = 0; st.cost = 0; }
        rec.pct = f; rec.usd = proceeds; rec.shares = sellShares; rec.realizedDelta = proceeds - costPart;
        rec.after = snap(); sim.trades.push(rec);
        if (!hasPosition() && scenario.lockWhenFlat) {
          sim.locked = true; sim.decision = 'exited'; sim.decisionT = t; sim.decisionMcap = price;
        }
      } else {
        lockIf(id);
      }
      sim.log.push(rec); sim.actions.push({ type: id, pct: pct, t: t });
      return { ok: true, trade: rec };
    };

    /* ---- clock ---- */
    sim.start = function () { sim.started = true; };
    sim.advance = function (dt) { if (!sim.started) return; sim.elapsed = clamp(sim.elapsed + num(dt), 0, D); };
    sim.done = function () { return sim.started && sim.elapsed >= D - 1e-9; };
    sim.progress = function () { return D ? sim.elapsed / D : 0; };

    /* ---- market stats & feed ---- */
    sim.stats = function () {
      var ks = scenario.stats || [], u = sim.elapsed / candleMs, i = 0;
      if (!ks.length) return null;
      while (i < ks.length - 1 && ks[i + 1].at <= u) i++;
      var a = ks[i], b = ks[Math.min(i + 1, ks.length - 1)];
      var f = b.at > a.at ? clamp((u - a.at) / (b.at - a.at), 0, 1) : 0;
      function L(x, y) { return num(x) + (num(y) - num(x)) * f; }
      var buys = L(a.buys, b.buys);
      return { volume: L(a.volume, b.volume) * unit, liquidity: L(a.liquidity, b.liquidity) * unit,
        buys: buys, sells: 100 - buys, social: L(a.social, b.social), momentum: a.momentum };
    };
    sim.feed = function () {
      var out = [], evs = scenario.events || [];
      for (var i = 0; i < evs.length; i++) if (evs[i].at * candleMs <= sim.elapsed + 1e-6) out.push({ t: evs[i].at * candleMs, text: evs[i].text, tone: evs[i].tone || '' });
      return out;
    };

    /* ---- replay: exact analytics independent of frame rate ---- */
    function replay(tEnd) {
      tEnd = clamp(tEnd, 0, D);
      var times = [0, tEnd], kMax = Math.min(N - 1, Math.floor(tEnd / candleMs)), kk, jj, tt;
      for (kk = 0; kk <= kMax; kk++) for (jj = 0; jj <= T; jj++) { tt = (kk + jj / T) * candleMs; if (tt <= tEnd) times.push(tt); }
      sim.trades.forEach(function (tr) { if (tr.t <= tEnd) times.push(tr.t); });
      times.sort(function (a, b) { return a - b; });
      var s = { cash: initialState.cash, shares: initialState.shares, cost: initialState.cost, realized: 0 };
      var m = { peakPos: 0, peakUnreal: -Infinity, peakUnrealPct: 0, peakTotal: -Infinity, maxDD: 0, peakAfterEntry: null };
      var ti = 0, tr = sim.trades, entryT = sim.entry ? sim.entry.t : null;
      function ev(state, price) {
        var pv = state.shares * price, un = pv - state.cost, tot = state.cash + pv;
        if (state.shares > EPS) {
          if (pv > m.peakPos) m.peakPos = pv;
          if (un > m.peakUnreal) { m.peakUnreal = un; m.peakUnrealPct = state.cost > EPS ? un / state.cost : 0; }
        }
        if (tot > m.peakTotal) m.peakTotal = tot;
        var dd = m.peakTotal > EPS ? (m.peakTotal - tot) / m.peakTotal : 0;
        if (dd > m.maxDD) m.maxDD = dd;
      }
      for (var i = 0; i < times.length; i++) {
        var tm = times[i], p = priceAt(tm);
        while (ti < tr.length && tr[ti].t <= tm) { ev(s, tr[ti].mcap); s = tr[ti].after; ti++; ev(s, tr[ti - 1].mcap); }
        ev(s, p);
        if (entryT != null && tm >= entryT - 1e-9) m.peakAfterEntry = m.peakAfterEntry == null ? p : Math.max(m.peakAfterEntry, p);
      }
      if (m.peakUnreal === -Infinity) m.peakUnreal = 0;
      return m;
    }

    sim.summary = function () {
      var tEnd = sim.elapsed, m = replay(tEnd), price = priceAt(tEnd), pf = value(st, price);
      var sells = sim.trades.filter(function (x) { return x.type === 'sell'; });
      var buys = sim.trades.filter(function (x) { return x.type === 'buy'; });
      var invested = (startPos ? startPos.costUsd : 0) + buys.reduce(function (a, x) { return a + x.usd; }, 0);
      var soldBefore = 0;
      sells.forEach(function (x) { if (x.t < livePeakT - 1e-6 && initialShares > EPS) soldBefore += x.shares / initialShares; });
      var totalInitial = initialShares > EPS ? initialShares : (buys.length ? buys[0].shares : 0);
      var decision = sim.decision || (sim.done() ? 'none' : null);
      if (!sim.decision && sim.entry) decision = 'buy';
      var positionPnl = pf.realized + pf.unrealized;
      var sum = {
        scenarioId: scenario.id, done: sim.done(),
        firstShownMcap: live[0].o, peakMcap: livePeak, peakT: livePeakT, finalMcap: price,
        startEntryMcap: startPos ? startPos.entryMcap : null,
        entryMcap: sim.entry ? sim.entry.mcap : null, entry: sim.entry,
        decision: decision, decisionMcap: sim.decisionMcap,
        cash: pf.cash, positionValue: pf.positionValue, totalValue: pf.total,
        unrealizedPnl: pf.unrealized, realizedPnl: pf.realized, positionPnl: positionPnl,
        invested: invested, positionPnlPct: invested > EPS ? positionPnl / invested : 0,
        peakPositionValue: m.peakPos, peakUnrealizedPnl: m.peakUnreal, peakUnrealizedPnlPct: m.peakUnrealPct,
        peakTotalValue: m.peakTotal, maxDrawdownPct: m.maxDD,
        drawdownFromPeakPct: m.peakTotal > EPS ? Math.max(0, (m.peakTotal - pf.total) / m.peakTotal) : 0,
        peakAfterEntry: m.peakAfterEntry,
        sells: sells, firstExitMcap: sells.length ? sells[0].mcap : null, firstExitT: sells.length ? sells[0].t : null,
        finalExitMcap: sells.length && !hasPosition() ? sells[sells.length - 1].mcap : null,
        soldBeforePeakPct: soldBefore, remainingPct: totalInitial > EPS ? pf.shares / totalInitial : 0,
        waitCount: sim.log.filter(function (x) { return x.type === 'wait'; }).length,
        holdCount: sim.log.filter(function (x) { return x.type === 'hold'; }).length,
        hasPosition: hasPosition(), baseline: baseline
      };
      return sum;
    };

    /* ---- persistence ---- */
    sim.snapshot = function () { return { started: sim.started, elapsed: sim.elapsed, actions: sim.actions.map(function (a) { return { type: a.type, pct: a.pct, t: a.t }; }) }; };
    sim.restore = function (snapshot) {
      if (!snapshot) return sim;
      if (snapshot.started) sim.start();
      (snapshot.actions || []).forEach(function (a) { sim.elapsed = clamp(num(a.t), 0, D); sim.act(a.type, { pct: a.pct }); });
      sim.elapsed = clamp(num(snapshot.elapsed), 0, D);
      return sim;
    };
    return sim;
  };

  TYS.restoreSim = function (scenario, cfg, snapshot) { return TYS.createSim(scenario, cfg).restore(snapshot); };

  /* ---------------------------------------------------------------- recap text */
  TYS.recapFlags = function (s) {
    var startedWithPos = s.startEntryMcap != null;
    return {
      entered: s.entryMcap != null,
      passed: s.decision === 'pass',
      none: s.decision === 'none' && s.entryMcap == null,
      streak2: !!(s.entry && s.entry.streak >= 2),
      noSells: startedWithPos && s.sells.length === 0,
      soldBeforePeak: s.soldBeforePeakPct > 0.0005,
      firstSellAfterPeak: s.sells.length > 0 && s.firstExitT >= s.peakT - 1e-6,
      flat: s.sells.length > 0 && !s.hasPosition,
      stillOpen: s.sells.length > 0 && s.hasPosition
    };
  };
  TYS.formatValue = function (s, f) {
    var v = s[f.key];
    if (v == null || !isFinite(v)) return f.empty || '-';
    if (f.fmt === 'mcap') return fmt.mcap(v);
    if (f.fmt === 'usd') return fmt.usd(v);
    if (f.fmt === 'pnl') return fmt.pnl(v, f.pct ? s[f.pct] : null);
    if (f.fmt === 'pct') return fmt.pct(v);
    return String(v);
  };
  function fill(tpl, s, band) {
    return tpl.replace(/\{(\w+)(?::(\w+))?\}/g, function (_, key, type) {
      if (key === 'band') return band || '';
      if (key === 'streak') return s.entry ? s.entry.streak : 0;
      var v = s[key];
      if (v == null || !isFinite(v)) return '-';
      return type && fmt[type] ? fmt[type](v) : String(v);
    });
  }
  TYS.buildRecap = function (scenario, s) {
    var r = scenario.recap || {}, flags = TYS.recapFlags(s), band = '';
    if (s.entryMcap != null && r.entryBands && s.peakMcap > 0) {
      var ratio = s.entryMcap / s.peakMcap;
      for (var i = 0; i < r.entryBands.length; i++) if (ratio <= r.entryBands[i].max) { band = r.entryBands[i].text; break; }
    }
    var sentences = [];
    (r.rules || []).forEach(function (rule) { if (flags[rule.when]) sentences.push(fill(rule.text, s, band)); });
    return { heading: r.heading || scenario.title, sentences: sentences,
      fields: (r.fields || []).map(function (f) { return { label: f.label, value: TYS.formatValue(s, f) }; }) };
  };
  TYS.buildReflection = function (scenario, s) {
    var r = scenario.reflection || {}, entered = s.entryMcap != null || s.startEntryMcap != null;
    var useNoEntry = scenario.startingPosition ? false : s.entryMcap == null;
    var defs = useNoEntry ? (r.noEntryFields || []) : (r.fields || []);
    return { noEntry: useNoEntry, noEntryTitle: r.noEntryTitle, entered: entered,
      fields: defs.map(function (f) { return { label: f.label, value: TYS.formatValue(s, f) }; }) };
  };

  /* ---------------------------------------------------------------- data checks (dev / tests) */
  TYS.validateScenario = function (sc) {
    var issues = [], unit = 1;
    function chk(list, name) {
      (list || []).forEach(function (a, i) {
        if (!Array.isArray(a) || a.length < 4 || a.slice(0, 4).some(function (x) { return !isFinite(x) || x <= 0; })) issues.push(name + '[' + i + '] is not a valid candle');
        else if (a[1] < Math.max(a[0], a[3]) || a[2] > Math.min(a[0], a[3])) issues.push(name + '[' + i + '] high/low do not contain open/close (auto-corrected)');
      });
    }
    chk(sc.history, 'history'); chk(sc.candles, 'candles');
    if (sc.history && sc.history.length && sc.candles.length && Math.abs(sc.history[sc.history.length - 1][3] - sc.candles[0][0]) > 0.5) issues.push('first live candle does not open at the last history close');
    var last = -1; (sc.stats || []).forEach(function (k) { if (k.at < last) issues.push('stats keyframes must be in ascending order'); last = k.at; });
    return issues;
  };
})(typeof window !== 'undefined' ? window : globalThis);
