/*
 * PORTFOLIO + ORDER ENGINE.
 * Cash, one token position (average cost), realized and unrealized P&L. Sells always act on the CURRENT
 * remaining position. Every position is tracked as an "episode" (open -> add/trim -> flat) so the analytics
 * layer can talk about entries, sizing and exits without re-deriving anything.
 */
(function (root) {
  'use strict';
  var TYS = root.TYS = root.TYS || {};
  var EPS = 1e-12, num = TYS.fmt.num;

  /*
   * start: { cash, position: {costUsd, entryMcap}, realized, proceeds, capital }
   *   position: an already-open position (cost basis and the market cap it was bought at)
   *   realized: profit already banked before the scenario begins
   *   proceeds: cash already taken out of the position (used by the capital tracker)
   *   capital:  the original capital the student put in ("initial capital")
   */
  TYS.createPortfolio = function (start) {
    start = start || {};
    var p = { cash: num(start.cash), shares: 0, cost: 0, realized: num(start.realized), proceeds: num(start.proceeds), capital: num(start.capital),
      episodes: [], current: null, peakValue: 0 };
    p.startTotal = p.cash;
    if (start.position) {
      p.shares = start.position.costUsd / start.position.entryMcap; p.cost = start.position.costUsd; p.startTotal += 0;
      p.current = { n: 1, pre: true, openT: 0, openMcap: start.position.entryMcap, invested: start.position.costUsd, buys: [], sells: [], realized: 0, closedT: null };
      p.episodes.push(p.current);
    }
    p.initial = { cash: p.cash, shares: p.shares, cost: p.cost, realized: p.realized, proceeds: p.proceeds };

    p.hasPosition = function (price) { return p.shares > EPS && p.shares * price >= 0.005; };
    p.value = function (price) {
      var pv = p.shares * price;
      return { cash: p.cash, shares: p.shares, cost: p.cost, realized: p.realized, proceeds: p.proceeds, positionValue: pv, unrealized: pv - p.cost, total: p.cash + pv,
        unrealizedPct: p.cost > EPS ? (pv - p.cost) / p.cost : 0, avgEntry: p.shares > EPS ? p.cost / p.shares : null };
    };
    // portfolio value before an order, used to express order size as a share of the portfolio
    p.totalAt = function (price) { return p.cash + p.shares * price; };

    p.buy = function (usd, price, t) {
      usd = num(usd);
      if (!(price > 0) || !isFinite(price)) return { ok: false, reason: 'bad-price' };
      if (!(usd >= 0.01)) return { ok: false, reason: 'invalid-amount' };
      if (usd > p.cash + 1e-9) return { ok: false, reason: 'insufficient-cash' };
      usd = Math.min(usd, p.cash);
      var before = p.totalAt(price), sizePct = before > EPS ? usd / before : 0, first = !p.hasPosition(price);
      p.shares += usd / price; p.cash -= usd; p.cost += usd;
      if (Math.abs(p.cash) < 1e-9) p.cash = 0;
      if (first || !p.current) { p.current = { n: p.episodes.length + 1, openT: t, openMcap: price, invested: 0, buys: [], sells: [], realized: 0, closedT: null, sizeBefore: before }; p.episodes.push(p.current); }
      p.current.invested += usd; p.current.buys.push({ t: t, mcap: price, usd: usd, sizePct: sizePct, cashBefore: p.cash + usd });
      return { ok: true, usd: usd, shares: usd / price, sizePct: sizePct, episode: p.current, added: !first };
    };

    // fraction of the CURRENT remaining position
    p.sell = function (fraction, price, t) {
      if (!p.hasPosition(price)) return { ok: false, reason: 'no-position' };
      var f = Math.min(1, Math.max(0.0001, num(fraction, 1))), sellShares = f >= 0.9999 ? p.shares : p.shares * f;
      var proceeds = sellShares * price, costPart = f >= 0.9999 ? p.cost : p.cost * (sellShares / p.shares);
      p.cash += proceeds; p.proceeds += proceeds; p.realized += proceeds - costPart; p.shares -= sellShares; p.cost -= costPart;
      if (p.shares * price < 0.005) { var dust = p.shares * price; p.cash += dust; p.proceeds += dust; p.realized += dust - p.cost; proceeds += dust; costPart += p.cost; p.shares = 0; p.cost = 0; }
      if (p.shares <= EPS) { p.shares = 0; p.cost = 0; }
      var delta = proceeds - costPart, ep = p.current;
      if (ep) { ep.sells.push({ t: t, mcap: price, pct: f, usd: proceeds, realizedDelta: delta }); ep.realized += delta; if (p.shares <= EPS) { ep.closedT = t; ep.closeMcap = price; p.current = null; } }
      return { ok: true, usd: proceeds, shares: sellShares, pct: f, realizedDelta: delta, flat: p.shares <= EPS, episode: ep };
    };

    // Capital tracker: has the original capital been taken out, and what is the remaining "moon bag" worth?
    p.capitalState = function (price) {
      var v = p.value(price), cap = p.capital;
      return { capital: cap, recovered: cap > 0 && p.proceeds >= cap - 1e-9, proceeds: p.proceeds, realized: p.realized, remainingValue: v.positionValue, exposureOfCapital: cap > 0 ? Math.max(0, v.cost) / cap : 0 };
    };

    p.snapshot = function () { return { cash: p.cash, shares: p.shares, cost: p.cost, realized: p.realized, proceeds: p.proceeds }; };
    return p;
  };
})(typeof window !== 'undefined' ? window : globalThis);
