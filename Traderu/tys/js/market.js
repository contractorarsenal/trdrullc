/*
 * MARKET ENGINE.
 * Turns a scenario's market spec into a fixed, deterministic price path and the market information
 * (volume, liquidity, flow, momentum, social, holders ...) that goes with it.
 *
 *  - compose(spec, level): waypoints + seeded noise + fake-outs -> candles. Seeded and deterministic.
 *  - createPath(...): price as a pure function of time (candle ticks with real highs/lows).
 *  - metricsAt(...): the terminal's market information at a moment in time.
 * A scenario has ONE market. Nothing in this file knows about the student or what they clicked.
 */
(function (root) {
  'use strict';
  var TYS = root.TYS = root.TYS || {};
  var num = TYS.fmt.num, EPS = 1e-12;
  var PATTERNS = [[3, 8], [4, 9], [2, 6], [5, 10]];   // where inside a candle the two extremes print

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function gauss(r) { var u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function hash(i, j) { var x = Math.sin(i * 127.1 + j * 311.7 + 13.37) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; }
  function interp(pts, i) {
    if (typeof pts === 'number') return pts;
    if (i <= pts[0][0]) return pts[0][1];
    for (var k = 1; k < pts.length; k++) if (i <= pts[k][0]) { var a = pts[k - 1], b = pts[k]; return a[1] + (b[1] - a[1]) * (i - a[0]) / (b[0] - a[0]); }
    return pts[pts.length - 1][1];
  }

  var Market = TYS.Market = { mulberry32: mulberry32, interp: interp, hash: hash };

  /* ------------------------------------------------------------ composing candles */
  /*
   * spec: { seed, open, n, waypoints:[[i,v]...], sigma:pct|[[i,pct]], vol:k|[[i,k]], shocks:[[i,pct]], wick, phi,
   *         cap:{idx,high}, floor, fakeouts:[{at,len,amp,min}] }
   * All prices in $K. A candle closes exactly on a waypoint when it sits on one, so authors control the path.
   * mod: { noise, fakeouts }  (from difficulty.js). Fake-outs are smooth humps multiplied onto the waypoint
   * curve, e.g. {at:12,len:4,amp:0.14} is a 14% false pop that fully reverses by candle 16.
   */
  Market.compose = function (spec, level, mod) {
    mod = mod || { noise: 1, fakeouts: 0 };
    var rnd = mulberry32(spec.seed || 1), g = function () { return gauss(rnd); }, phi = spec.phi == null ? 0.42 : spec.phi;
    var shocks = {}; (spec.shocks || []).forEach(function (s) { shocks[s[0]] = s[1]; });
    var wp = {}; spec.waypoints.forEach(function (w) { wp[w[0]] = 1; });
    var fo = (spec.fakeouts || []).filter(function (f) { return mod.fakeouts > 0 && (!f.min || TYS.Difficulty.atLeast(level, f.min)); });
    var prev = spec.open, noise = 0, out = [], noiseK = mod.noise == null ? 1 : mod.noise;
    for (var i = 0; i < spec.n; i++) {
      var target = interp(spec.waypoints, i);
      fo.forEach(function (f) { if (i >= f.at && i <= f.at + f.len) target *= 1 + f.amp * mod.fakeouts * Math.sin(Math.PI * (i - f.at) / f.len); });
      var sg = interp(spec.sigma == null ? 1.2 : spec.sigma, i) / 100 * noiseK;
      noise = phi * noise + sg * g();
      if (shocks[i] != null) noise += shocks[i] / 100 * Math.sqrt(noiseK);
      if (wp[i]) noise = 0;
      var close = target * (1 + noise);
      if (spec.cap) close = Math.min(close, spec.cap.high * (i === spec.cap.idx ? 0.985 : 0.972));
      close = Math.max(close, spec.floor || 1);
      var open = prev, body = Math.abs(close - open), px = Math.max(open, close), wk = spec.wick || 0.55;
      var wu = Math.abs(g()) * sg * px * wk * (0.5 + rnd()), wd = Math.abs(g()) * sg * px * wk * (0.5 + rnd());
      var hi = Math.max(open, close) + wu, lo = Math.min(open, close) - wd;
      if (spec.cap) hi = i === spec.cap.idx ? spec.cap.high : Math.min(hi, spec.cap.high * 0.985);
      lo = Math.max(lo, spec.floor || 1);
      var v = Math.max(0.3, interp(spec.vol == null ? 10 : spec.vol, i) * (0.55 + 9 * (body / px) + 0.35 * Math.abs(g())));
      out.push([open, hi, lo, close, v]); prev = close;
    }
    return out.map(function (c) { return c.map(function (x, k) { return k < 4 ? Math.round(x * 100) / 100 : Math.round(x * 10) / 10; }); });
  };

  /* ------------------------------------------------------------ price path */
  function normCandle(a, unit) {
    var o = num(a[0]) * unit, c = num(a[3]) * unit;
    return { o: o, h: Math.max(num(a[1]) * unit, o, c), l: Math.max(Math.min(num(a[2]) * unit, o, c), 1), c: c, v: num(a[4]) * unit };
  }
  function finishTicks(v) {
    var mx = new Array(v.length), mn = new Array(v.length);
    for (var j = 0; j < v.length; j++) { mx[j] = j ? Math.max(mx[j - 1], v[j]) : v[j]; mn[j] = j ? Math.min(mn[j - 1], v[j]) : v[j]; }
    return { v: v, max: mx, min: mn };
  }
  function buildTicks(cd, gi, T) {
    var pat = PATTERNS[(gi * 7 + 3) % 4];
    var t1 = Math.max(1, Math.round(pat[0] / 12 * T)), t2 = Math.min(T - 1, Math.max(t1 + 1, Math.round(pat[1] / 12 * T)));
    var bull = cd.c >= cd.o, e1 = bull ? cd.l : cd.h, e2 = bull ? cd.h : cd.l, R = cd.h - cd.l, v = new Array(T + 1), j, a, b, x0, x1, f, val;
    for (j = 0; j <= T; j++) {
      if (j <= t1) { a = cd.o; b = e1; x0 = 0; x1 = t1; } else if (j <= t2) { a = e1; b = e2; x0 = t1; x1 = t2; } else { a = e2; b = cd.c; x0 = t2; x1 = T; }
      f = (j - x0) / (x1 - x0); val = a + (b - a) * f;
      if (R > 0 && j !== 0 && j !== T && j !== t1 && j !== t2) { val += hash(gi, j) * 0.10 * R; val = Math.min(cd.h - 0.02 * R, Math.max(cd.l + 0.02 * R, val)); }
      v[j] = val;
    }
    v[0] = cd.o; v[t1] = e1; v[t2] = e2; v[T] = cd.c;
    return finishTicks(v);
  }

  /*
   * createPath({history, candles, unit, ticks, candleMs}) -> path
   *   path.all / H / N / duration        the full candle list (history then live)
   *   path.priceAt(t) / forming(t)       price and the forming candle at time t (ms since the round began)
   *   path.extremes(t0, t1)              highest / lowest print between two times
   *   path.athBefore(t)                  highest print seen up to time t, history included
   */
  Market.createPath = function (o) {
    var unit = o.unit || 1000, T = o.ticks || 12, candleMs = o.candleMs || 1000;
    var hist = (o.history || []).map(function (a) { return normCandle(a, unit); });
    var live = (o.candles || []).map(function (a) { return normCandle(a, unit); });
    if (!live.length) throw new Error('A market needs live candles');
    var all = hist.concat(live), H = hist.length, N = live.length, D = N * candleMs;
    var ticks = all.map(function (c, i) { return buildTicks(c, i, T); });
    function locate(t) { t = clamp(t, 0, D); var k = Math.min(N - 1, Math.floor(t / candleMs)); return { k: k, p: t >= D ? 1 : (t - k * candleMs) / candleMs }; }
    function priceAt(t) { var L = locate(t), tk = ticks[H + L.k].v, jf = L.p * T, jj = Math.min(T - 1, Math.floor(jf)); return tk[jj] + (tk[jj + 1] - tk[jj]) * (jf - jj); }
    var path = { all: all, H: H, N: N, duration: D, candleMs: candleMs, unit: unit, ticksPerCandle: T, locate: locate, priceAt: priceAt, first: live[0].o };
    path.forming = function (t) {
      var L = locate(t), c = all[H + L.k], tk = ticks[H + L.k], px = priceAt(t), pj = Math.min(T, Math.floor(L.p * T));
      return { index: H + L.k, k: L.k, p: L.p, o: c.o, h: Math.max(tk.max[pj], px), l: Math.min(tk.min[pj], px), c: px, v: c.v * L.p };
    };
    path.extremes = function (t0, t1) {
      t0 = clamp(t0, 0, D); t1 = clamp(t1, 0, D);
      var hi = Math.max(priceAt(t0), priceAt(t1)), lo = Math.min(priceAt(t0), priceAt(t1)), hiT = t0, loT = t0, k, j, tt, pv;
      for (k = Math.floor(t0 / candleMs); k < N && k * candleMs <= t1; k++) for (j = 0; j <= T; j++) {
        tt = (k + j / T) * candleMs; if (tt < t0 || tt > t1) continue;
        pv = ticks[H + k].v[j]; if (pv > hi) { hi = pv; hiT = tt; } if (pv < lo) { lo = pv; loT = tt; }
      }
      return { high: hi, highT: hiT, low: lo, lowT: loT };
    };
    var histHigh = 0; hist.forEach(function (c) { if (c.h > histHigh) histHigh = c.h; });
    path.historyHigh = histHigh;
    path.athBefore = function (t) { var e = path.extremes(0, t); return Math.max(histHigh, e.high); };
    var pk = path.extremes(0, D); path.peak = pk.high; path.peakT = pk.highT; path.low = pk.low; path.lowT = pk.lowT;
    return path;
  };

  /* ------------------------------------------------------------ market information */
  // Row definitions. `explain` is the plain-language definition shown to new traders only.
  Market.METRICS = {
    mcap:         { label: 'Market cap',      explain: 'The price of the whole coin: price times total supply.' },
    volume:       { label: 'Volume',          explain: 'How much has been traded recently. More activity, more attention.' },
    liquidity:    { label: 'Liquidity',       explain: 'Money in the pool. Thin liquidity means big trades move the price a lot.' },
    buys:         { label: 'Buys / sells',    explain: 'The share of recent trades that were buys versus sells.' },
    momentum:     { label: 'Momentum',        explain: 'How strongly price has been moving recently.' },
    social:       { label: 'Social activity', explain: 'How much people are talking about the coin, compared with earlier.' },
    velocity:     { label: 'Tx velocity',     explain: 'Trades per minute.' },
    holders:      { label: 'Holders',         explain: 'Wallets currently holding the coin.' },
    holderGrowth: { label: 'Holder growth',   explain: 'How fast the number of holders is changing.' },
    wallets:      { label: 'Wallet activity', explain: 'What the larger wallets are doing right now.' },
    churn:        { label: 'Churn',           explain: 'How quickly buyers turn into sellers.' },
    ath:          { label: 'Previous high',   explain: 'The highest market cap reached so far.' },
    fromAth:      { label: 'From high',       explain: 'How far below the previous high the price is.' },
    fees:         { label: 'Network fees',    explain: '', noise: true },
    age:          { label: 'Token age',       explain: '', noise: true },
    rank:         { label: 'Trending rank',   explain: '', noise: true }
  };

  /*
   * metricsAt(path, signals, t, opts) -> {id: {text, tone?, raw?}} for every metric, plus raw numbers.
   * `signals` (from the scenario) holds authored series that override the chart-derived defaults:
   *   { holders:[[i,v]..], liquidity:[[i,K]..], buys:[[i,%]..], social:[[i,%]..], churn:[[i,%]..], wallets:[[i,'label']..] ... }
   * `opts.signalNoise` blends in deterministic wobble so that at higher levels not every signal agrees.
   */
  Market.metricsAt = function (path, signals, t, opts) {
    opts = opts || {}; signals = signals || {};
    var fmt = TYS.fmt, L = path.locate(t), gi = path.H + L.k, px = path.priceAt(t), u = t / path.candleMs, all = path.all;
    var a = Math.max(0, gi - 4), base = all[a].o, ret = base > 0 ? px / base - 1 : 0;
    var vol = 0, rec = 0, rn = 0, i, seed = opts.seed || 1;
    for (i = Math.max(0, gi - 23); i <= gi; i++) vol += all[i].v * (i === gi ? L.p : 1);
    for (i = Math.max(0, gi - 5); i <= gi; i++) { var w = i === gi ? Math.max(L.p, 0.3) : 1; rec += all[i].v * w; rn += w; }
    var baseVol = 0, bn = Math.min(8, path.H || path.N); for (i = 0; i < bn; i++) baseVol += all[i].v; baseVol = bn ? baseVol / bn : 1;
    var ratio = baseVol > 0 && rn > 0 ? (rec / rn) / baseVol : 1;
    function wob(k) { return 1 + hash(seed + k, Math.floor(t / 400)) * (opts.signalNoise || 0) * 0.35; }   // conflicting-signal wobble
    function ser(key) { return signals[key] ? interp(signals[key], u) : null; }
    var buys = ser('buys'); buys = buys == null ? clamp(50 + 300 * ret, 14, 88) : buys; buys = clamp(buys * wob(1), 8, 92);
    var liq = ser('liquidity'); liq = liq == null ? px * 0.3 : liq * path.unit; liq *= wob(2);
    var volume = ser('volume'); volume = volume == null ? vol : volume * path.unit;
    var social = ser('social'); social = social == null ? clamp((ratio - 1) * 60, -40, 900) : social; social *= wob(3);
    var vel = ser('velocity'); vel = vel == null ? Math.max(4, Math.round(18 * ratio + Math.abs(ret) * 200)) : vel; vel = Math.round(vel * wob(4));
    var holders = ser('holders'); holders = holders == null ? Math.round(900 + 60 * u + Math.max(0, social) * 1.4) : Math.round(holders);
    var hg = ser('holderGrowth'); if (hg == null) hg = signals.holders ? (interp(signals.holders, u + 1) - interp(signals.holders, u)) / Math.max(1, interp(signals.holders, u)) * 100 : Math.max(-3, ret * 20);
    var ath = path.athBefore(t), fromAth = ath > 0 ? px / ath - 1 : 0, churn = ser('churn');
    var mom = ret >= 0.12 ? 'EXTREME' : ret >= 0.05 ? 'HIGH' : ret >= 0.015 ? 'BUILDING' : ret > -0.015 ? 'STEADY' : ret > -0.06 ? 'FADING' : 'WEAKENING';
    var wl = signals.wallets ? signals.wallets.reduce(function (acc, p) { return p[0] <= u ? p[1] : acc; }, signals.wallets[0][1]) : (buys > 62 ? 'ACCUMULATING' : buys < 38 ? 'DISTRIBUTING' : 'MIXED');
    var out = {
      raw: { px: px, ret: ret, buys: buys, volume: volume, liquidity: liq, social: social, velocity: vel, holders: holders, holderGrowth: hg, ath: ath, fromAth: fromAth, momentum: mom, churn: churn },
      mcap: { text: fmt.mcap(px) }, volume: { text: fmt.volume(volume) }, liquidity: { text: fmt.mcap(liq) },
      buys: { text: Math.round(buys) + ' / ' + Math.round(100 - buys), buys: buys }, momentum: { text: mom, tone: mom === 'EXTREME' ? 'hot' : mom === 'HIGH' || mom === 'BUILDING' ? 'good' : mom === 'FADING' || mom === 'WEAKENING' ? 'cold' : '' },
      social: { text: (social >= 0 ? '+' : '') + Math.round(social) + '%' }, velocity: { text: vel + '/min' },
      holders: { text: holders.toLocaleString('en-US') }, holderGrowth: { text: (hg >= 0 ? '+' : '') + hg.toFixed(1) + '%' },
      wallets: { text: wl, tone: /ACCUM|BUY/.test(wl) ? 'good' : /DISTRIB|SELL/.test(wl) ? 'cold' : '' },
      churn: { text: churn == null ? Math.round(clamp(30 + Math.abs(ret) * 200 + (100 - buys) * 0.3, 10, 95)) + '%' : Math.round(churn) + '%' },
      ath: { text: fmt.mcap(ath) }, fromAth: { text: fmt.pct(fromAth) },
      fees: { text: '$' + (0.4 + Math.abs(hash(seed + 9, Math.floor(t / 2500))) * 1.6).toFixed(2) },
      age: { text: (3 + Math.floor(u / 9)) + 'h ' + (14 + Math.floor(u) % 40) + 'm' },
      rank: { text: '#' + (40 + Math.floor(Math.abs(hash(seed + 11, Math.floor(t / 3000))) * 60)) }
    };
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
