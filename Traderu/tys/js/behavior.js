/*
 * BEHAVIOR ANALYTICS.
 * Reads what the student actually did (episodes, orders, sizes, timing) against the fixed market and
 * reports it factually. No scores, no grades, no labels for the person. It never runs during play.
 *
 *   Behavior.episodes(runs)        every position across the session, in order, with market context
 *   Behavior.scenarioFacts(run)    scenario-specific facts (moon bag, revenge, cut the loss ...)
 *   Behavior.report(runs, profile) the final review: sections, skill areas and per-scenario lines
 */
(function (root) {
  'use strict';
  var TYS = root.TYS = root.TYS || {}, fmt = TYS.fmt, EPS = 1e-9;
  function sum(a, f) { return a.reduce(function (s, x) { return s + (f ? f(x) : x); }, 0); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  /* ------------------------------------------------------------ market context at a moment */
  function context(sim, t, mcap) {
    var p = sim.path, L = p.locate(t), gi = p.H + L.k, i, lo = Infinity, hi = 0, greens = 0;
    for (i = Math.max(0, gi - 6); i < gi; i++) if (p.all[i].l < lo) lo = p.all[i].l;
    for (i = Math.max(0, gi - 12); i < gi; i++) if (p.all[i].h > hi) hi = p.all[i].h;
    for (i = gi - 1; i >= 0 && p.all[i].c > p.all[i].o && greens < 12; i--) greens++;
    var ath = p.athBefore(t), expansion = isFinite(lo) && lo > 0 ? mcap / lo - 1 : 0;
    return { expansion: expansion, greens: greens, ath: ath, nearHigh: mcap >= ath * 0.97, fromLocalHigh: hi > 0 ? mcap / hi - 1 : 0,
      expanded: expansion >= 0.2 || mcap >= ath * 0.97, pullback: hi > 0 && mcap <= hi * 0.85 };
  }

  /* ------------------------------------------------------------ episodes */
  var Behavior = TYS.Behavior = {};
  Behavior.episodes = function (runs) {
    var out = [], seq = 0;
    runs.forEach(function (r, ri) {
      r.sims.forEach(function (sim, si) {
        var s = sim.summary(), pf = sim.portfolio, price = sim.price();
        pf.episodes.forEach(function (ep) {
          var em = s.episodeMetrics[ep.n] || {}, open = pf.current === ep;
          var unreal = open ? pf.value(price).unrealized : 0, first = ep.buys[0];
          var e = {
            seq: seq++, run: ri, scenario: r.def.id, title: r.def.title, level: r.level, stage: si, sim: sim,
            source: sim.auto ? 'scripted' : (ep.pre ? 'given' : 'chosen'), n: ep.n,
            openT: ep.openT, openMcap: ep.openMcap, invested: ep.invested, sizePct: first ? first.sizePct : null,
            buys: ep.buys, sells: ep.sells, closedT: ep.closedT, open: open, realized: ep.realized, net: ep.realized + unreal,
            peakValue: em.peakValue || 0, trough: em.trough == null ? null : em.trough, troughT: em.troughT || 0, peakPct: em.peak == null ? null : em.peak
          };
          e.profitable = e.net > 0.005; e.loss = e.net < -0.005;
          if (e.source === 'chosen' && first) e.ctx = context(sim, first.t, first.mcap);
          var partials = ep.sells.filter(function (x) { return x.pct < 0.9999; });
          e.partialProfit = ep.sells.some(function (x) { return x.pct < 0.9999 && x.realizedDelta > 0; }) || (ep.sells.some(function (x) { return x.realizedDelta > 0; }) && open);
          e.tookPartial = partials.length > 0;
          var last = ep.sells.length ? ep.sells[ep.sells.length - 1] : null;
          e.soldAllInOne = !!(last && ep.sells.length === 1 && last.pct >= 0.9999);
          if (e.soldAllInOne) { var c2 = context(sim, last.t, last.mcap); e.soldAfterShake = c2.fromLocalHigh <= -0.12; }
          e.heldThroughDrawdown = e.trough != null && e.trough <= -0.2 && !ep.sells.some(function (x) { return x.t < e.troughT; });
          out.push(e);
        });
      });
    });
    // immediate re-entry: a chosen entry within 8 seconds of the same stage's previous loss
    out.forEach(function (e) {
      var prev = out.filter(function (x) { return x.run === e.run && x.stage === e.stage && x.seq < e.seq && x.closedT != null; }).pop();
      e.reentryAfterLoss = !!(e.source === 'chosen' && prev && prev.loss && e.openT - prev.closedT <= 8000);
    });
    // size relative to the previous position when that position lost money
    var prevEp = null;
    out.forEach(function (e) {
      e.afterLoss = null;
      if (e.source !== 'given') {
        if (e.source === 'chosen' && prevEp && prevEp.loss && !prevEp.open && prevEp.invested > EPS) e.afterLoss = { prevSize: prevEp.invested, prevLoss: prevEp.net, ratio: e.invested / prevEp.invested, increased: e.invested >= prevEp.invested * 1.1, prevSource: prevEp.source };
        prevEp = e;
      }
    });
    return out;
  };

  /* ------------------------------------------------------------ scenario-specific facts */
  function firstUser(sim, id) { for (var i = 0; i < sim.log.length; i++) if (!sim.log[i].auto && (id == null || sim.log[i].type === id)) return sim.log[i]; return null; }
  function stateAt(sim, t) { var m = sim.analyze(t), pf = m.portfolio, price = sim.path.priceAt(t), v = pf.value(price); return { value: v, price: price, holding: pf.hasPosition(price) }; }

  Behavior.scenarioFacts = function (run) {
    var def = run.def, kind = (def.analysis || {}).kind, sim = run.sims[run.sims.length - 1], s = sim.summary(), sums = run.sims.map(function (x) { return x.summary(); }), f = { kind: kind, title: def.title, level: run.level };
    var user = sim.log.filter(function (x) { return !x.auto; });
    f.waits = sum(run.sims, function (x) { return x.log.filter(function (y) { return y.type === 'wait'; }).length; });
    f.decision = s.decision; f.pnl = s.pnl; f.pnlPct = s.pnlPct; f.total = s.total; f.realized = s.realized; f.unrealized = s.unrealized;
    var buys = user.filter(function (x) { return x.type === 'buy'; }), sells = user.filter(function (x) { return x.type === 'sell'; });
    f.entry = buys[0] || null; f.sells = sells;
    if (kind === 'moonbag' || kind === 'manage') {
      var v0 = sim.portfolio.initial, first = sim.path.first, startValue = v0.shares * first;
      f.startPositionValue = startValue; f.peakPositionValue = s.peakPositionValue; f.finalPositionValue = s.positionValue; f.capital = s.capital; f.capitalAtStart = sim.portfolio.initial.proceeds >= (sim.portfolio.capital || 0) - EPS && sim.portfolio.capital > 0;
      f.drawdownFromPeakPct = s.peakPositionValue > EPS ? Math.max(0, (s.peakPositionValue - s.positionValue) / s.peakPositionValue) : 0;
      var exitAll = sells.length && !s.hasPosition ? sells[sells.length - 1] : null; f.exitAllT = exitAll ? exitAll.t : null; f.exitAllMcap = exitAll ? exitAll.mcap : null;
      if (exitAll) { var after = sim.path.extremes(exitAll.t, sim.duration); f.afterExitHigh = after.high; f.afterExitFinal = sim.path.priceAt(sim.duration); }
      f.heldToEnd = s.hasPosition; f.sellCount = sells.length; f.firstSellT = sells.length ? sells[0].t : null;
      f.stillHolding = s.hasPosition;
      f.peakMcap = s.peak; f.finalMcap = s.final;
    }
    if (kind === 'revenge') {
      var prev = run.sims[0], ps = prev.summary(), prevEp = prev.portfolio.episodes[0];
      f.previousTrade = { pnl: ps.realized, size: prevEp ? prevEp.invested : 0 };
      var chosen = run.sims[1].portfolio.episodes.filter(function (e) { return !e.pre; });
      f.second = chosen.length ? { size: chosen[0].invested, ratio: f.previousTrade.size > 0 ? chosen[0].invested / f.previousTrade.size : null, sizePct: chosen[0].buys[0].sizePct, net: null } : null;
      f.sessionStart = run.carry.startCapital; f.afterLossCash = run.sims[1].startValue;
      var s2 = run.sims[1].summary(); f.secondPnl = s2.pnl; f.sessionPnl = (s2.total - (run.carry.startCapital || 100)); f.sessionPct = run.carry.startCapital ? f.sessionPnl / run.carry.startCapital : 0;
      if (f.second) f.second.net = chosen[0].realized + (run.sims[1].portfolio.current === chosen[0] ? run.sims[1].portfolio.value(run.sims[1].price()).unrealized : 0);
      f.increased = !!(f.second && f.second.ratio >= 1.1); f.passed = s2.decision === 'pass'; f.waited = s2.waits;
      var post = run.sims[1].path; f.runAfter = post.peak / post.first - 1; f.runFinal = post.final / post.first - 1;
    }
    if (kind === 'cut') {
      var warn = (def.thesis && def.thesis.warnings) || [], w = warn.map(function (x) { var t = x.at * sim.candleMs, st = stateAt(sim, t); return { at: x.at, t: t, holding: st.holding, pct: st.value.shares > EPS ? st.value.unrealizedPct : null, price: st.price }; });
      f.warnings = w; f.maxDrawdown = s.troughUnrealPct; f.finalLoss = s.pnl;
      f.added = user.filter(function (x) { return x.type === 'buy'; }); f.addedWhileLosing = f.added.filter(function (x) { var st = stateAt(sim, x.t - 1); return st.value.unrealizedPct < 0; }).length;
      f.exitT = sells.length && !s.hasPosition ? sells[sells.length - 1].t : null; f.reduced = sells.filter(function (x) { return x.pct < 1; }).length; f.heldToEnd = s.hasPosition;
      f.finalPct = s.pnlPct;
    }
    if (kind === 'size') {
      f.setups = run.sims.map(function (x, i) {
        var xs = x.summary(), b = x.log.filter(function (y) { return y.type === 'buy' && !y.auto; });
        return { index: i, stage: def.stages[i].id, usd: sum(b, function (y) { return y.usd; }), sizePct: b.length ? b[0].sizePct : 0, entered: b.length > 0, passed: xs.decision === 'pass', net: (function () { var ep = x.portfolio.episodes[0]; return ep ? ep.realized + (x.portfolio.current === ep ? x.portfolio.value(x.price()).unrealized : 0) : 0; })(), pathReturn: x.path.priceAt(x.duration) / x.path.first - 1, waits: xs.waits };
      });
      f.risked = f.setups.filter(function (x) { return x.entered; }).map(function (x) { return x.sizePct; });
      f.maxPct = f.risked.length ? Math.max.apply(null, f.risked) : 0; f.avgPct = f.risked.length ? sum(f.risked) / f.risked.length : 0;
      f.sizesByClarity = f.setups.map(function (x) { return x.sizePct; });
    }
    if (kind === 'volume') {
      f.entryMetrics = f.entry ? sim.metrics(f.entry.t).raw : null; var mm = f.entry ? sim.metrics(f.entry.t) : null; f.entryText = mm ? { volume: mm.volume.text, liquidity: mm.liquidity.text, holders: mm.holders.text, wallets: mm.wallets.text, churn: mm.churn.text } : null;
      f.peakMcap = s.peak; f.finalMcap = s.final; f.movePct = s.final / s.first - 1;
    }
    if (kind === 'coin-timing') {
      f.coinReturn = s.final / s.first - 1; f.lowMcap = s.low; f.peakMcap = s.peak;
      if (f.entry) { f.entryVsLow = f.entry.mcap / s.low - 1; f.entryVsPeak = f.entry.mcap / sim.path.extremes(0, f.entry.t).high - 1; f.troughAfter = s.troughUnrealPct; f.entryPct = f.entry.mcap / s.first - 1; f.pnlAtEnd = s.pnlPct; f.entryPhase = f.entry.t / sim.duration; }
    }
    if (kind === 'entry' || kind === 'fomo' || kind === 'breakout') {
      f.peakMcap = s.peak; f.lowMcap = s.low; f.finalMcap = s.final; f.firstMcap = s.first; f.moveSinceStart = s.final / s.first - 1;
      if (f.entry) { f.entryCtx = context(sim, f.entry.t, f.entry.mcap); f.entryRise = f.entry.mcap / s.first - 1; f.waitsBeforeEntry = user.filter(function (x) { return x.type === 'wait' && x.t < f.entry.t; }).length; f.troughAfter = s.troughUnrealPct; f.entryFromAth = f.entry.mcap / sim.path.athBefore(f.entry.t) - 1; f.entryFromLow = f.entry.mcap / sim.path.extremes(0, f.entry.t).low - 1; }
      var pass = user.filter(function (x) { return x.type === 'pass'; })[0]; f.pass = pass || null;
      if (pass) { var af = sim.path.extremes(pass.t, sim.duration); f.afterPassHigh = af.high; f.afterPassLow = af.low; f.passRise = pass.mcap / s.first - 1; }
      if (kind === 'breakout' && f.entry) { var lvl = (def.analysis || {}).level * 1000; f.entryAboveLevel = f.entry.mcap > lvl; f.entryVsLevel = f.entry.mcap / lvl - 1; }
    }
    return f;
  };

  /* ------------------------------------------------------------ the review */
  function usdShort(v) { return fmt.usd0(Math.round(v * 100) / 100); }
  Behavior.report = function (runs, profile) {
    var eps = Behavior.episodes(runs), chosen = eps.filter(function (e) { return e.source === 'chosen'; }), facts = runs.map(Behavior.scenarioFacts), byId = {};
    facts.forEach(function (f, i) { byId[runs[i].def.id] = f; });
    var R = { profile: profile, scenarios: runs.length, episodes: eps, facts: facts, sections: {}, skills: {}, perScenario: [], metrics: {} };
    var m = R.metrics;
    m.entries = chosen.length; m.expanded = chosen.filter(function (e) { return e.ctx && e.ctx.expanded; }).length; m.pullback = chosen.filter(function (e) { return e.ctx && e.ctx.pullback; }).length;
    m.nearHigh = chosen.filter(function (e) { return e.ctx && e.ctx.nearHigh; }).length;
    m.waitedFirst = chosen.filter(function (e) { var f = e.sim.log.filter(function (x) { return x.type === 'wait' && x.t < e.openT; }).length; return f > 0; }).length;
    m.repeatedWaits = facts.filter(function (f) { return f.waits >= 3; }).length; m.totalWaits = sum(facts, function (f) { return f.waits; });
    m.passes = runs.reduce(function (n, r) { return n + r.sims.filter(function (x) { return x.decision === 'pass'; }).length; }, 0);
    var sizes = chosen.map(function (e) { return e.sizePct; }).filter(function (x) { return x != null; });
    m.maxSizePct = sizes.length ? Math.max.apply(null, sizes) : null; m.avgSizePct = sizes.length ? sum(sizes) / sizes.length : null;
    m.maxSizeEntries = chosen.filter(function (e) { return e.sizePct >= 0.9; }).length;
    var prof = eps.filter(function (e) { return e.source !== 'scripted' && e.profitable && (e.sells.length || e.open); });
    m.profitable = prof.length; m.partialProfit = prof.filter(function (e) { return e.partialProfit; }).length; m.neverPartial = prof.filter(function (e) { return e.sells.length === 0 || !e.tookPartial; }).length;
    m.soldAllAfterShake = eps.filter(function (e) { return e.soldAfterShake; }).length; m.heldDrawdowns = eps.filter(function (e) { return e.heldThroughDrawdown; }).length;
    m.reentries = eps.filter(function (e) { return e.reentryAfterLoss; }).length;
    var afl = eps.filter(function (e) { return e.afterLoss; }); m.afterLoss = afl; m.afterLossIncreased = afl.filter(function (e) { return e.afterLoss.increased; }).length;
    m.hintsUsed = runs.reduce(function (n, r) { return n + (r.hintsUsed || 0); }, 0);

    var E = [], P = [], K = [], A = [], F = [];
    /* ENTRIES */
    if (m.entries) {
      E.push('You entered ' + plural(m.entries, 'trade') + ' across ' + plural(runs.length, 'scenario') + '.');
      if (m.expanded) E.push(m.expanded + ' of ' + m.entries + ' entries came after the price had already expanded or was near its high.');
      if (m.pullback) E.push(m.pullback + ' of ' + m.entries + ' entries were made during a pullback.');
      if (m.waitedFirst) E.push('You waited before entering in ' + m.waitedFirst + ' of ' + m.entries + ' trades.');
      else E.push('You entered without waiting first in every trade.');
    } else E.push('You did not enter any trades. You passed or watched in every scenario.');
    if (m.repeatedWaits) E.push('You used WAIT three or more times in ' + plural(m.repeatedWaits, 'scenario') + '.');
    /* POSITION MANAGEMENT */
    var mb = byId['protect-the-moon-bag'];
    if (mb) {
      P.push('You started the moon bag with your initial capital already recovered and ' + usdShort(mb.startPositionValue) + ' still in the position.');
      if (mb.exitAllT != null) P.push('You sold the full moon bag at ' + fmt.mcap(mb.exitAllMcap) + '. Afterward the price reached as high as ' + fmt.mcap(mb.afterExitHigh) + ' and finished at ' + fmt.mcap(mb.afterExitFinal) + '.');
      else if (mb.sellCount) P.push('You reduced the moon bag ' + plural(mb.sellCount, 'time') + ' and finished holding ' + usdShort(mb.finalPositionValue) + ' of it.');
      else P.push('You held the full moon bag through the whole scenario. It peaked at ' + usdShort(mb.peakPositionValue) + ' and finished at ' + usdShort(mb.finalPositionValue) + '.');
      if (mb.drawdownFromPeakPct > 0.05 && mb.stillHolding) P.push('At the end the moon bag was ' + fmt.pct0(mb.drawdownFromPeakPct) + ' below its peak value.');
    }
    var m2 = byId['manage-the-2x'];
    if (m2) {
      if (!m2.sellCount) P.push('In the 2X scenario you held the whole position. It peaked at ' + usdShort(m2.peakPositionValue) + ' and finished at ' + usdShort(m2.finalPositionValue) + '.');
      else P.push('In the 2X scenario you sold ' + plural(m2.sellCount, 'time') + ' and finished with ' + usdShort(m2.total) + ' in total. The position had peaked at ' + usdShort(m2.peakPositionValue) + '.');
    }
    if (m.profitable) P.push('You took partial profit in ' + m.partialProfit + ' of ' + plural(m.profitable, 'profitable position') + '.');
    if (m.soldAllAfterShake) P.push('You sold an entire position right after a sharp drop in ' + plural(m.soldAllAfterShake, 'trade') + '.');
    if (m.heldDrawdowns) P.push('You held through a drawdown of 20% or more in ' + plural(m.heldDrawdowns, 'position') + '.');
    /* RISK */
    if (m.maxSizePct != null) {
      K.push('Your largest position was ' + fmt.pct0(m.maxSizePct) + ' of the simulated portfolio.');
      K.push('Your average position was ' + fmt.pct0(m.avgSizePct) + ' of the portfolio.');
      if (m.maxSizeEntries) K.push('You entered with nearly all of your cash in ' + m.maxSizeEntries + ' of ' + m.entries + ' trades.');
    }
    var ps = byId['position-size'];
    if (ps && ps.risked.length) K.push('In the sizing scenario you put ' + ps.setups.map(function (x) { return x.entered ? fmt.pct0(x.sizePct) : 'nothing'; }).join(', then ') + ' of your portfolio into the three setups.');
    var cl = byId['cut-the-loss'];
    if (cl) {
      var w1 = cl.warnings[0], w2 = cl.warnings[1];
      K.push('At the first warning the position was ' + (w1 && w1.pct != null ? fmt.pctAbs(w1.pct) + (w1.pct < 0 ? ' down' : ' up') : 'already closed') + (w2 ? '; at the second warning it was ' + (w2.pct != null ? fmt.pctAbs(w2.pct) + (w2.pct < 0 ? ' down' : ' up') : 'already closed') : '') + '.');
      if (cl.addedWhileLosing) K.push('You added to the position ' + plural(cl.addedWhileLosing, 'time') + ' while it was losing.');
      K.push(cl.exitT != null ? 'You fully exited at ' + fmt.clock(cl.exitT) + '. The final result was ' + fmt.signedUsd(cl.finalLoss) + '.' : 'You still held part of the position at the end. The result was ' + fmt.signedUsd(cl.finalLoss) + '.');
    }
    /* AFTER A LOSS */
    var rvFacts = byId['stop-revenge-trading'];
    m.afterLoss.forEach(function (e) {
      if (rvFacts && rvFacts.second && e.scenario === 'stop-revenge-trading') return;   // the revenge scenario has its own, fuller sentence below
      A.push('Your first position after a ' + (e.afterLoss.prevSource === 'scripted' ? 'losing trade you watched' : 'loss') + ' was ' + fmt.ratio(e.afterLoss.ratio) + ' the size of the one before it (' + usdShort(e.invested) + ' versus ' + usdShort(e.afterLoss.prevSize) + ').');
    });
    var rv = byId['stop-revenge-trading'];
    if (rv) {
      if (rv.second) { A.push(rv.increased ? 'You increased your position size ' + fmt.pct0(rv.second.ratio - 1) + ' immediately after a loss.' : 'You sized your next trade at ' + fmt.pct0(rv.second.ratio) + ' of the size of the losing trade.'); A.push('Session P&L after the second trade: ' + fmt.signedUsd(rv.sessionPnl) + '. The second trade alone was ' + fmt.signedUsd(rv.secondPnl) + '.'); }
      else if (rv.passed) A.push('After the loss you passed on the next setup. That coin later rose ' + fmt.pct0(rv.runAfter) + ' at its peak. Discipline can still mean missing a move.');
      else A.push('After the loss you did not take the next trade. That coin later rose ' + fmt.pct0(rv.runAfter) + ' at its peak. Discipline can still mean missing a move.');
    }
    if (m.reentries) A.push('You re-entered within seconds of a losing exit ' + plural(m.reentries, 'time') + '.');
    if (!A.length) A.push('No trade in this session came directly after a loss you took.');
    /* FOMO */
    var fo = byId['control-the-fomo'];
    if (fo) {
      if (fo.entry) F.push('You entered at ' + fmt.mcap(fo.entry.mcap) + ', ' + fmt.pct0(fo.entryRise) + ' above where the round began' + (fo.waitsBeforeEntry ? ', after waiting ' + fmt.times(fo.waitsBeforeEntry) : '') + '. The price peaked at ' + fmt.mcap(fo.peakMcap) + ' and finished at ' + fmt.mcap(fo.finalMcap) + '.');
      else F.push('You did not chase the move. It climbed ' + fmt.pct0(fo.moveSinceStart) + ' during the round, and you were not in it. You do not have to catch every move.');
    }
    var rc = byId['right-coin-wrong-time'];
    if (rc) {
      F.push('GOOD COIN: it rose ' + fmt.pct0(rc.coinReturn) + ' from the start of the scenario.');
      F.push(rc.entry ? 'GOOD ENTRY: you entered ' + fmt.pct0(rc.entryVsLow) + ' above the correction low and the position was down as much as ' + fmt.pctAbs(rc.troughAfter) + ' along the way.' : 'GOOD ENTRY: you did not enter, so the coin\'s ' + fmt.pct0(rc.coinReturn) + ' rise was not yours. A good coin and a good entry are separate decisions.');
    }
    if (m.nearHigh) F.push('You entered ' + m.nearHigh + ' of ' + m.entries + ' trades near a high.');
    if (!F.length) F.push('Nothing in this session was set up to test FOMO directly.');
    R.sections = { entries: E, management: P, risk: K, afterLoss: A, fomo: F };

    /* SKILL AREAS (what they did, never a rating) */
    var ent = E.slice(0, 3), mgmt = P.slice(0, 3), rsk = K.slice(0, 3), dis = A.slice(0, 2).concat(m.repeatedWaits ? ['You used WAIT repeatedly in ' + plural(m.repeatedWaits, 'scenario') + '.'] : []);
    var reading = [], vol = byId['volume-without-conviction'], fb = byId['fake-breakout'];
    if (vol) reading.push(vol.entry ? 'In the volume scenario you entered at ' + fmt.mcap(vol.entry.mcap) + ' when volume was ' + vol.entryText.volume + ', liquidity ' + vol.entryText.liquidity + ' and wallet activity ' + vol.entryText.wallets + '. The price finished ' + fmt.pct0(vol.movePct) + ' from the start.' : 'In the volume scenario you did not enter. Volume stayed high while the price moved ' + fmt.pct0(vol.movePct) + '.');
    if (fb) reading.push(fb.entry ? (fb.entryAboveLevel ? 'At the breakout you entered above the previous high at ' + fmt.mcap(fb.entry.mcap) + '; the price finished at ' + fmt.mcap(fb.finalMcap) + '.' : 'You entered below the previous high at ' + fmt.mcap(fb.entry.mcap) + '.') : 'You did not enter the breakout. The price finished at ' + fmt.mcap(fb.finalMcap) + '.');
    var fe = byId['find-the-entry'];
    if (fe) reading.push(fe.entry ? 'In the entry scenario you entered ' + fmt.pct0(-fe.entryFromAth) + ' below the all-time high, ' + fmt.pct0(fe.entryFromLow) + ' above the low that had printed by then.' : 'In the entry scenario you did not enter. The price fell to ' + fmt.mcap(fe.lowMcap) + ' before recovering.');
    R.skills = { entry: ent.length ? ent : ['No entries were taken.'], profit: mgmt.length ? mgmt : ['No positions were managed in this session.'], risk: rsk.length ? rsk : ['No positions were opened, so no position size was recorded.'], discipline: dis.length ? dis : ['No loss-related decisions came up in this session.'], reading: reading.length ? reading : ['No signal-reading scenario was part of this session.'] };
    R.perScenario = runs.map(function (r, i) { return { id: r.def.id, title: r.def.title, level: r.level, facts: facts[i] }; });
    return R;
  };
})(typeof window !== 'undefined' ? window : globalThis);
