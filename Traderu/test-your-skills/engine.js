/*
 * TEST YOUR SKILLS: simulation engine.
 *
 * Pure logic. No DOM, no network, no randomness. Everything is driven by scenario data
 * (scenarios.js).
 *
 * The market is scripted, but some scenarios BRANCH on the student's entry. A branch is chosen from
 * the entry's zone (see scenario.entryZones) and replaces the rest of the path from the next price
 * tick onward. Price is still a pure function of (scenario, the recorded decisions, time), so a
 * refresh replays the same decisions and lands on the same branch. Nothing is random.
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
    pctAbs: function (f) { return Math.abs(num(f) * 100).toFixed(1) + '%'; },
    usd0: function (v) {            // "$100" when whole, "$100.50" otherwise
      v = num(v);
      return Math.abs(v - Math.round(v)) < 0.005 ? (v < 0 ? '-$' : '$') + commas(Math.abs(Math.round(v))) : fmt.usd(v);
    },
    int: function (v) { return String(Math.round(num(v))); },
    signed: function (v) { v = Math.round(num(v)); return (v < 0 ? '-' : '+') + Math.abs(v) + '%'; },
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
    return finishTicks(v);
  }
  function finishTicks(v) {
    var pmax = new Array(v.length), pmin = new Array(v.length);
    for (var j = 0; j < v.length; j++) {
      pmax[j] = j ? Math.max(pmax[j - 1], v[j]) : v[j];
      pmin[j] = j ? Math.min(pmin[j - 1], v[j]) : v[j];
    }
    return { v: v, max: pmax, min: pmin };
  }

  function s_ok(v) { return v != null && isFinite(v); }
  function times(n) { return n === 1 ? 'once' : n === 2 ? 'twice' : n + ' times'; }

  /* ---------------------------------------------------------------- simulation */
  TYS.createSim = function (scenario, cfg) {
    cfg = cfg || TYS.CONFIG;
    var unit = cfg.unit || 1000, T = cfg.ticksPerCandle || 12, SUPPLY = cfg.supply || 1e9;
    var hist = (scenario.history || []).map(function (a) { return normCandle(a, unit); });
    var live = (scenario.candles || []).map(function (a) { return normCandle(a, unit); });
    if (!live.length) throw new Error('Scenario has no live candles');
    // `all` and `ticks` are edited in place when a branch replaces the rest of the path
    var all = hist.concat(live), H = hist.length, N = live.length;
    var ticks = all.map(function (c, i) { return buildTicks(c, i, T); });
    var candleMs = scenario.candleMs || cfg.candleMs || 1000;
    var D = N * candleMs;
    var startPos = scenario.startingPosition || null;
    var baseline = num(scenario.baselineCapital, cfg.baselineCapital || 100);
    var phases = scenario.phases || [];
    var revPhase = null; phases.forEach(function (p) { if (p.reversal && !revPhase) revPhase = p; });
    var ath = 0; hist.forEach(function (c) { if (c.h > ath) ath = c.h; });

    var st = { cash: num(scenario.startingCash), shares: 0, cost: 0, realized: 0 };
    if (startPos) { st.shares = startPos.costUsd / startPos.entryMcap; st.cost = startPos.costUsd; }
    var initialState = { cash: st.cash, shares: st.shares, cost: st.cost, realized: 0 };
    var initialShares = st.shares;

    var sim = { scenario: scenario, cfg: cfg, all: all, H: H, N: N, candleMs: candleMs, duration: D,
      elapsed: 0, started: false, locked: false, decision: null, decisionT: null, decisionMcap: null,
      entry: null, trades: [], log: [], actions: [], branch: null, firstShown: live[0].o, ath: ath };

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

    // highest / lowest print anywhere on the scripted path between two times (recap facts)
    function extremes(t0, t1) {
      t0 = clamp(t0, 0, D); t1 = clamp(t1, 0, D);
      var hi = Math.max(priceAt(t0), priceAt(t1)), lo = Math.min(priceAt(t0), priceAt(t1)), hiT = t0, loT = t0, kk, jj, tt, pv;
      for (kk = Math.floor(t0 / candleMs); kk < N && kk * candleMs <= t1; kk++) for (jj = 0; jj <= T; jj++) {
        tt = (kk + jj / T) * candleMs; if (tt < t0 || tt > t1) continue;
        pv = ticks[H + kk].v[jj]; if (pv > hi) { hi = pv; hiT = tt; } if (pv < lo) { lo = pv; loT = tt; }
      }
      return { high: hi, highT: hiT, low: lo, lowT: loT };
    }
    function refreshShape() {
      sim.N = N; sim.duration = D;
      var e = extremes(0, D);
      sim.livePeak = e.high; sim.livePeakT = e.highT; sim.liveLow = e.low; sim.liveLowT = e.lowT;
    }
    refreshShape();
    sim.reversalT = revPhase ? revPhase.from * candleMs : sim.livePeakT;

    // Which scripted phase (see scenario.phases) a moment falls in. Recap use only.
    function phaseAt(t) {
      var u = t / candleMs, i;
      for (i = 0; i < phases.length; i++) if (u >= phases[i].from - 1e-9 && u < phases[i].to - 1e-9) return phases[i].id;
      return phases.length ? phases[phases.length - 1].id : null;
    }
    sim.phaseAt = phaseAt;

    // The candle currently forming, with running high/low so far.
    sim.forming = function () {
      var L = locate(sim.elapsed), c = all[H + L.k], tk = ticks[H + L.k];
      var px = priceAt(sim.elapsed), pj = Math.min(T, Math.floor(L.p * T));
      return { index: H + L.k, k: L.k, p: L.p, o: c.o, h: Math.max(tk.max[pj], px), l: Math.min(tk.min[pj], px), c: px, v: c.v * L.p };
    };

    /* ---- entry zones and branching ---- */
    // First matching zone wins. Bounds: minPrice / maxPrice in the candles' units ($K), from / to in candles, phases by id.
    function zoneFor(price, t) {
      var zs = scenario.entryZones || [], u = t / candleMs, ph = phaseAt(t), i, z, p = price / unit;
      for (i = 0; i < zs.length; i++) {
        z = zs[i];
        if (z.minPrice != null && p < z.minPrice) continue;
        if (z.maxPrice != null && p > z.maxPrice) continue;
        if (z.from != null && u < z.from) continue;
        if (z.to != null && u >= z.to) continue;
        if (z.phases && z.phases.indexOf(ph) === -1) continue;
        return z.id;
      }
      return null;
    }
    // Replace the rest of the path with a branch template, starting at the next price tick so the
    // price the student just paid is not disturbed. Template candle 0 is the remainder of the candle the
    // student acted in; the others are full candles. Template numbers are ratios of the price at the start.
    function applyBranch(br) {
      var L = locate(sim.elapsed), k0 = L.k, jb = Math.ceil(L.p * T - 1e-9), full = jb >= T, idx0, prefix, subT, pb, tpl = br.candles, first = tpl[0], sub, i;
      if (full) { idx0 = H + k0 + 1; prefix = []; subT = T; pb = all[H + k0].c; }
      else { idx0 = H + k0; prefix = ticks[idx0].v.slice(0, jb); subT = T - jb; pb = ticks[idx0].v[jb]; }
      var cd0 = { o: pb, h: Math.max(pb * first[1], pb, pb * first[3]), l: Math.max(Math.min(pb * first[2], pb, pb * first[3]), 1), c: pb * first[3], v: num(first[4]) * unit };
      if (subT >= 4) sub = buildTicks(cd0, idx0, subT).v;
      else { sub = []; for (i = 0; i <= subT; i++) sub.push(pb + (cd0.c - pb) * i / subT); }
      var v = prefix.concat(sub), hi = -Infinity, lo = Infinity;
      for (i = 0; i < v.length; i++) { if (v[i] > hi) hi = v[i]; if (v[i] < lo) lo = v[i]; }
      all.length = idx0; ticks.length = idx0;
      all.push({ o: full ? pb : v[0], h: hi, l: lo, c: v[T], v: cd0.v });
      ticks.push(finishTicks(v));
      for (i = 1; i < tpl.length; i++) {
        var a = tpl[i], prevC = all[all.length - 1].c;
        var cd = normCandle([prevC * 1 / unit, pb * a[1] / unit, pb * a[2] / unit, pb * a[3] / unit, a[4]], unit);
        all.push(cd); ticks.push(buildTicks(cd, all.length - 1, T));
      }
      N = all.length - H; D = N * candleMs;
      sim.branch = { id: br.id, zone: br.zone, t: sim.elapsed, k: idx0 - H, startT: (idx0 - H) * candleMs, price0: pb, length: tpl.length };
      refreshShape();
      sim.reversalT = br.reversalAt != null ? (idx0 - H + br.reversalAt) * candleMs : sim.livePeakT;
    }
    function branchFor(zone) {
      var bs = scenario.branches || [], i;
      for (i = 0; i < bs.length; i++) if (bs[i].zone === zone) return bs[i];
      return null;
    }

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
    sim.remainingFraction = function () { var base = initialShares > EPS ? initialShares : (sim.entry ? sim.trades[0].shares : 0); return base > EPS ? st.shares / base : 0; };

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
      if ((id === 'pass' || id === 'wait') && (hasPosition() || sim.entry)) return { enabled: false, reason: 'in-position' };
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
      var branchTo = null;

      if (id === 'buy') {
        var usd = st.cash, bought = usd / price;
        st.shares += bought; st.cash -= usd; st.cost += usd;
        if (Math.abs(st.cash) < 1e-9) st.cash = 0;
        rec.usd = usd; rec.shares = bought;
        var L = locate(t), gi = H + L.k, streak = 0, zone = zoneFor(price, t);
        while (gi - 1 - streak >= 0 && all[gi - 1 - streak].c > all[gi - 1 - streak].o && streak < 12) streak++;
        sim.entry = { t: t, mcap: price, k: L.k, streak: streak, phase: phaseAt(t), zone: zone };
        rec.zone = zone; rec.after = snap(); sim.trades.push(rec); lockIf('buy');
        branchTo = branchFor(zone);
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
      if (branchTo) applyBranch(branchTo);
      return { ok: true, trade: rec, branched: !!branchTo };
    };

    /* ---- clock ---- */
    sim.start = function () { sim.started = true; };
    sim.advance = function (dt) { if (!sim.started) return; sim.elapsed = clamp(sim.elapsed + num(dt), 0, D); };
    sim.done = function () { return sim.started && sim.elapsed >= D - 1e-9; };
    sim.progress = function () { return D ? sim.elapsed / D : 0; };

    /* ---- market stats: derived from the candles themselves, so they follow whatever branch is playing ---- */
    var baseVol = 0; (function () { var n = Math.min(8, H || N), i; for (i = 0; i < n; i++) baseVol += (H ? all[i] : all[H + i]).v; baseVol = n ? baseVol / n : 1; })();
    function statsAt(t) {
      var L = locate(t), gi = H + L.k, px = priceAt(t), a = Math.max(0, gi - 4), base = all[a].o, ret = base > 0 ? px / base - 1 : 0, i, vol = 0, recent = 0, rn = 0;
      for (i = Math.max(0, gi - 23); i <= gi; i++) vol += all[i].v * (i === gi ? L.p : 1);
      for (i = Math.max(0, gi - 5); i <= gi; i++) { recent += all[i].v * (i === gi ? Math.max(L.p, 0.3) : 1); rn += i === gi ? Math.max(L.p, 0.3) : 1; }
      var ratio = baseVol > 0 && rn > 0 ? (recent / rn) / baseVol : 1;
      var mom = ret >= 0.12 ? 'EXTREME' : ret >= 0.05 ? 'HIGH' : ret >= 0.015 ? 'BUILDING' : ret > -0.015 ? 'STEADY' : ret > -0.06 ? 'FADING' : 'WEAKENING';
      var buys = clamp(50 + 300 * ret, 14, 88);
      return { volume: vol, liquidity: px * 0.3, buys: buys, sells: 100 - buys, social: clamp((ratio - 1) * 60, -40, 900), momentum: mom };
    }
    sim.statsAt = statsAt;
    sim.stats = function () { return statsAt(sim.elapsed); };

    /* ---- replay: exact analytics independent of frame rate ---- */
    function replay(tEnd) {
      tEnd = clamp(tEnd, 0, D);
      var times = [0, tEnd], kMax = Math.min(N - 1, Math.floor(tEnd / candleMs)), kk, jj, tt;
      for (kk = 0; kk <= kMax; kk++) for (jj = 0; jj <= T; jj++) { tt = (kk + jj / T) * candleMs; if (tt <= tEnd) times.push(tt); }
      sim.trades.forEach(function (tr) { if (tr.t <= tEnd) times.push(tr.t); });
      times.sort(function (a, b) { return a - b; });
      var s = { cash: initialState.cash, shares: initialState.shares, cost: initialState.cost, realized: 0 };
      var m = { peakPos: 0, peakUnreal: -Infinity, peakUnrealPct: 0, peakTotal: -Infinity, maxDD: 0, peakAfterEntry: null, trough: null };
      var ti = 0, tr = sim.trades, entryT = sim.entry ? sim.entry.t : null;
      function ev(state, price) {
        var pv = state.shares * price, un = pv - state.cost, tot = state.cash + pv;
        if (state.shares > EPS) {
          if (pv > m.peakPos) m.peakPos = pv;
          var upct = state.cost > EPS ? un / state.cost : 0;
          if (m.trough === null || upct < m.trough) m.trough = upct;
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
      var totalInitial = initialShares > EPS ? initialShares : (buys.length ? buys[0].shares : 0);
      var soldBefore = 0, soldBeforeRev = 0, sharesAtRev = initialShares;
      sells.forEach(function (x) {
        if (totalInitial <= EPS) return;
        if (x.t < sim.livePeakT - 1e-6) soldBefore += x.shares / totalInitial;
        if (x.t < sim.reversalT - 1e-6) soldBeforeRev += x.shares / totalInitial;
      });
      sim.trades.forEach(function (x) { if (x.t <= sim.reversalT + 1e-6) sharesAtRev = x.after.shares; });
      var en = sim.entry, waits = sim.log.filter(function (x) { return x.type === 'wait'; });
      var waitsBefore = waits.filter(function (x) { return !en || x.t < en.t; }).length;
      var passT = sim.decision === 'pass' ? sim.decisionT : null;
      var decision = sim.decision || (sim.done() ? 'none' : null);
      if (!sim.decision && en) decision = 'buy';
      var positionPnl = pf.realized + pf.unrealized;
      var afterEntry = en ? extremes(en.t, tEnd) : null, afterPass = passT != null ? extremes(passT, tEnd) : null;
      var finalExitT = sells.length && !hasPosition() ? sells[sells.length - 1].t : null;
      var afterExit = finalExitT != null ? extremes(finalExitT, tEnd) : null;
      var lowBefore = en ? extremes(0, en.t).low : null;
      return {
        scenarioId: scenario.id, done: sim.done(),
        firstShownMcap: sim.firstShown, peakMcap: sim.livePeak, peakT: sim.livePeakT, lowMcap: sim.liveLow, finalMcap: price,
        athMcap: ath || null, moveSinceStartPct: sim.firstShown > 0 ? price / sim.firstShown - 1 : 0,
        startEntryMcap: startPos ? startPos.entryMcap : null,
        entryMcap: en ? en.mcap : null, entry: en, entryT: en ? en.t : null, entryPhase: en ? en.phase : null, entryZone: en ? en.zone : null,
        entryBelowAth: en && ath ? 1 - en.mcap / ath : null,
        entryAboveLow: en && lowBefore > 0 ? en.mcap / lowBefore - 1 : null,
        entryFromStartPct: en && sim.firstShown > 0 ? en.mcap / sim.firstShown - 1 : null,
        lowBeforeEntry: lowBefore, lowAfterEntry: afterEntry ? afterEntry.low : null,
        peakGainPct: en && m.peakAfterEntry != null ? m.peakAfterEntry / en.mcap - 1 : null,
        finalVsEntryPct: en ? price / en.mcap - 1 : null,
        troughUnrealPct: m.trough,
        decision: decision, decisionMcap: sim.decisionMcap,
        cash: pf.cash, positionValue: pf.positionValue, totalValue: pf.total,
        unrealizedPnl: pf.unrealized, realizedPnl: pf.realized, positionPnl: positionPnl,
        invested: invested, positionPnlPct: invested > EPS ? positionPnl / invested : 0,
        peakPositionValue: m.peakPos, peakUnrealizedPnl: m.peakUnreal, peakUnrealizedPnlPct: m.peakUnrealPct,
        peakTotalValue: m.peakTotal, maxDrawdownPct: m.maxDD,
        drawdownFromPeakPct: m.peakTotal > EPS ? Math.max(0, (m.peakTotal - pf.total) / m.peakTotal) : 0,
        peakAfterEntry: m.peakAfterEntry,
        sells: sells, firstExitMcap: sells.length ? sells[0].mcap : null, firstExitT: sells.length ? sells[0].t : null,
        firstSellPhase: sells.length ? phaseAt(sells[0].t) : null,
        secsToFirstExit: sells.length && en ? Math.max(0, Math.round((sells[0].t - en.t) / 1000)) : null,
        finalExitMcap: finalExitT != null ? sells[sells.length - 1].mcap : null, finalExitT: finalExitT,
        highAfterFinalExit: afterExit ? afterExit.high : null,
        soldBeforePeakPct: soldBefore, remainingPct: totalInitial > EPS ? pf.shares / totalInitial : 0,
        waitCount: waits.length, waitText: times(waits.length),
        waitsBeforeEntry: waitsBefore, waitsBeforeEntryText: times(waitsBefore),
        passT: passT, passMcap: passT != null ? sim.decisionMcap : null, passPhase: passT != null ? phaseAt(passT) : null,
        lowAfterPass: afterPass ? afterPass.low : null,
        reversalT: sim.reversalT, branchId: sim.branch ? sim.branch.id : null,
        soldBeforeReversalPct: soldBeforeRev,
        heldAtReversalPct: totalInitial > EPS && en && en.t < sim.reversalT ? sharesAtRev / totalInitial : 0,
        holdCount: sim.log.filter(function (x) { return x.type === 'hold'; }).length,
        hasPosition: hasPosition(), baseline: baseline
      };
    };

    /* ---- persistence: decisions are replayed, so a restored session lands on the same branch ---- */
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
    var startedWithPos = s.startEntryMcap != null, entered = s.entryMcap != null, sells = s.sells || [];
    var quick = entered && sells.length > 0 && s.secsToFirstExit != null && s.secsToFirstExit <= 4;
    var flags = {
      entered: entered,
      notEntered: !entered,
      passed: s.decision === 'pass',
      none: s.decision === 'none' && !entered,
      noSells: startedWithPos && sells.length === 0,
      soldBeforePeak: s.soldBeforePeakPct > 0.0005,
      firstSellAfterPeak: sells.length > 0 && s.firstExitT >= s.peakT - 1e-6,
      hasSells: sells.length > 0,
      flat: sells.length > 0 && !s.hasPosition,
      stillOpen: sells.length > 0 && s.hasPosition,
      waited: s.waitCount > 0,
      waitedBefore: entered && s.waitsBeforeEntry > 0,
      noWaitBefore: entered && s.waitsBeforeEntry === 0,
      hadDrawdown: entered && s.troughUnrealPct != null && s.troughUnrealPct < -0.03,
      enteredNoSells: entered && sells.length === 0,
      quickExit: quick,
      soldBeforeReversal: entered && s.soldBeforeReversalPct > 0.0005,
      heldIntoReversal: entered && s.heldAtReversalPct > 0.0005
    };
    if (s.entryZone) flags['zone_' + s.entryZone] = true;
    if (s.entryPhase) flags['entry_' + s.entryPhase] = true;
    if (s.passPhase) flags['pass_' + s.passPhase] = true;
    if (s.firstSellPhase) flags['firstSell_' + s.firstSellPhase] = true;
    return flags;
  };
  TYS.formatValue = function (s, f) {
    var v = s[f.key];
    if (f.needsEntry && s.entryMcap == null) return f.empty || '-';
    if (v == null || !isFinite(v)) return f.empty || '-';
    if (f.fmt === 'clock') return fmt.clock(v);
    if (f.fmt === 'int') return fmt.int(v);
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
      if (typeof v === 'string') return v;
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
    function all(x) { return [].concat(x || []).every(function (k) { return flags[k]; }); }
    function any(x) { return [].concat(x || []).some(function (k) { return flags[k]; }); }
    (r.rules || []).forEach(function (rule) { if (all(rule.when) && !any(rule.unless)) sentences.push(fill(rule.text, s, band)); });
    return { heading: r.heading || scenario.title, sentences: sentences,
      fields: (r.fields || []).map(function (f) { return { label: f.label, value: TYS.formatValue(s, f) }; }) };
  };
  // One line of the student's decision history: {t, clock, kind, name, detail}. Used by Your Activity and the results.
  // Shows only what the student did: "00:16 BUY $100 @ $52.4K", "00:24 SELL 50% @ $78.2K", "00:08 WAIT".
  TYS.describeLog = function (scenario, tr) {
    var acts = scenario.actions || [], name, detail = '', i;
    if (tr.type === 'sell') name = 'SELL ' + fmt.pct0(tr.pct);
    else {
      name = tr.type.toUpperCase();
      for (i = 0; i < acts.length; i++) if (acts[i].id === tr.type && acts[i].label) { name = acts[i].label; break; }
    }
    if (tr.type === 'buy') detail = fmt.usd0(tr.usd) + ' @ ' + fmt.mcap(tr.mcap);
    else if (tr.type === 'sell') detail = '@ ' + fmt.mcap(tr.mcap);
    return { t: tr.t, clock: fmt.clock(tr.t), kind: tr.type, name: name, detail: detail };
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
    (sc.branches || []).forEach(function (b) {
      if (!b.candles || !b.candles.length) { issues.push('branch ' + b.id + ' has no candles'); return; }
      if (Math.abs(b.candles[0][0] - 1) > 1e-6) issues.push('branch ' + b.id + ': first candle must open at 1 (a ratio of the entry price)');
      b.candles.forEach(function (a, i) {
        if (a.slice(0, 4).some(function (x) { return !isFinite(x) || x <= 0; })) issues.push('branch ' + b.id + '[' + i + '] is not a valid candle');
        else if (a[1] < Math.max(a[0], a[3]) - 1e-9 || a[2] > Math.min(a[0], a[3]) + 1e-9) issues.push('branch ' + b.id + '[' + i + '] high/low do not contain open/close');
      });
      if (!(sc.entryZones || []).some(function (z) { return z.id === b.zone; })) issues.push('branch ' + b.id + ' refers to unknown zone ' + b.zone);
    });
    return issues;
  };
})(typeof window !== 'undefined' ? window : globalThis);
