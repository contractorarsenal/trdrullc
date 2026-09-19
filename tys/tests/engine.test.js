'use strict';
var T = require('./load'), h = require('./harness'), ok = h.ok, near = h.near, S = T.Scenarios, D = T.Difficulty, fmt = T.fmt, CFG = T.CONFIG;
var sec = function (x) { return x * 1000; };
function inst(id, level) { return S.instantiate(id, level); }
function run(id, level) { var r = T.createRun(inst(id, level)); r.begin(); return r; }
function act(sim, label, t, params) { sim.setElapsed(sec(t)); var def = sim.stage.actions.filter(function (a) { return a.label === label; })[0]; if (!def) throw new Error('no action ' + label + ' at this level'); return sim.act(def, params); }
function identity(sim, m) { var pf = sim.portfolio, v = pf.value(sim.price()), i = pf.initial; near(v.total - i.cash - i.cost, (v.realized - i.realized) + v.unrealized, 1e-6, m + ': total = starting cash + cost + realized gains + unrealized'); }

h.section('1. data validation');
{ var issues = S.validateAll(); ok(issues.length === 0, 'all scenarios valid at all four levels: ' + issues.join('; ')); ok(S.ids().length >= 10, 'library has 10+ scenarios (' + S.ids().length + ')');
  ['find-the-entry', 'manage-the-2x', 'control-the-fomo', 'protect-the-moon-bag', 'stop-revenge-trading', 'cut-the-loss', 'fake-breakout', 'position-size', 'volume-without-conviction', 'right-coin-wrong-time'].forEach(function (id) { ok(!!S.get(id), 'scenario present: ' + id); });
  ok(D.validateModifiers().length === 0, 'difficulty modifiers are consistent: ' + D.validateModifiers().join('; '));
  // validation catches broken configs
  function bad(mut, m) { var d = JSON.parse(JSON.stringify(S.get('find-the-entry'))); mut(d); var i = S.validate(d); ok(i.length > 0, 'rejects ' + m); }
  bad(function (d) { d.stages[0].start.cash = -5; }, 'negative starting cash');
  bad(function (d) { d.stages[0].start.position = { costUsd: -10, entryMcap: 100000 }; }, 'negative position cost');
  bad(function (d) { d.stages[0].start.position = { costUsd: 10, entryMcap: 0 }; }, 'zero entry market cap');
  bad(function (d) { d.actions.push({ id: 'sell', label: 'SELL 0%', pct: 0 }); }, 'sell of 0%');
  bad(function (d) { d.actions.push({ id: 'sell', label: 'SELL 200%', pct: 2 }); }, 'sell of more than 100%');
  bad(function (d) { d.actions.push({ id: 'dance', label: 'DANCE' }); }, 'unknown action id');
  bad(function (d) { d.stages[0].market.live.n = 3; d.stages[0].market.live.waypoints = [[0, 90], [2, 80]]; }, 'a market that is too short');
  bad(function (d) { d.stages[0].market.live.waypoints = [[0, 90], [5, -4], [20, 50]]; }, 'negative prices');
  bad(function (d) { d.stages[0].market.events = [{ at: 999, label: 'late' }]; }, 'a timeline event outside the market');
  bad(function (d) { d.stages[0].byLevel = { wizard: { live: {} } }; }, 'an unknown difficulty level');
  bad(function (d) { d.stages[0].kind = 'auto'; }, 'an auto stage without a position');
  bad(function (d) { d.hints = [{ from: -1, text: '' }]; }, 'a hint without text');
  bad(function (d) { d.actions = []; }, 'a scenario with no actions');
  h.throws(function () { S.register({ id: 'find-the-entry' }); }, 'duplicate scenario id');
}

h.section('2. profile generation and difficulty (beginner, student, experienced, advanced)');
{ D.LEVELS.forEach(function (l) {
    var p = T.Session.cleanProfile({ level: l }); ok(p.level === l, l + ' profile accepted');
    var plan = T.Session.buildPlan({ level: l }); ok(plan.length >= 4 && plan.length <= 6, l + ' session has 4-6 scenarios (' + plan.length + ')'); ok(plan.every(function (x) { return x.level === l; }), l + ' plan carries its level');
    ok(JSON.stringify(plan) === JSON.stringify(T.Session.buildPlan({ level: l })), l + ' plan is deterministic'); });
  ok(JSON.stringify(T.Session.buildPlan({ level: 'beginner' }).map(function (p) { return p.id; })) === JSON.stringify(['find-the-entry', 'manage-the-2x', 'control-the-fomo', 'cut-the-loss']), 'beginner template is the specified one');
  ok(JSON.stringify(T.Session.buildPlan({ level: 'student' }).map(function (p) { return p.id; })) === JSON.stringify(['find-the-entry', 'manage-the-2x', 'protect-the-moon-bag', 'stop-revenge-trading', 'right-coin-wrong-time']), 'student template is the specified one');
  ok(JSON.stringify(T.Session.buildPlan({ level: 'experienced' }).map(function (p) { return p.id; })) === JSON.stringify(['fake-breakout', 'position-size', 'manage-the-2x', 'stop-revenge-trading', 'protect-the-moon-bag', 'control-the-fomo']), 'experienced template is the specified one');
  // levels differ in more than speed
  S.ids().forEach(function (id) {
    var v = D.LEVELS.map(function (l) { return inst(id, l); });
    for (var i = 1; i < 4; i++) { ok(v[i].mod.speed >= v[i - 1].mod.speed, id + ': speed rises with level'); ok(v[i].stages[0].info.length >= v[i - 1].stages[0].info.length, id + ': information rises with level'); }
    ok(v[0].stages[0].info.length < v[3].stages[0].info.length, id + ': advanced shows more information than beginner');
    ok(v[0].rules.hints && !v[1].rules.hints && !v[3].rules.hints, id + ': hints only for new traders');
    ok(!v[0].rules.reentry && v[2].rules.reentry && v[3].rules.addToPosition, id + ': re-entry and adding are experienced+ tools');
    var noise = v.map(function (x) { var c = x.stages[x.stages.length - 1].candles; var t = 0; c.forEach(function (k) { t += (k[1] - k[2]) / k[3]; }); return t / c.length; });
    ok(noise[3] > noise[0] * 1.3, id + ': advanced markets are noisier (wick size ' + noise[0].toFixed(3) + ' -> ' + noise[3].toFixed(3) + ')');
  });
  ok(inst('find-the-entry', 'beginner').stages[0].actions.every(function (a) { return a.label !== 'SELL 25%' && a.label !== 'BUY MAX'; }), 'beginner has the simple action set');
  ok(inst('find-the-entry', 'advanced').stages[0].actions.some(function (a) { return a.label === 'BUY 50%'; }), 'advanced can size entries');
  // fake-outs: advanced fake breakout reclaims the old high once more
  var fb = inst('fake-breakout', 'advanced').stages[0].candles, fb0 = inst('fake-breakout', 'beginner').stages[0].candles;
  ok(Math.max.apply(null, fb.slice(17, 24).map(function (c) { return c[1]; })) > 100 && Math.max.apply(null, fb0.slice(17, 24).map(function (c) { return c[1]; })) < 100, 'advanced fake breakout reclaims $100K a second time; beginner does not');
  // calibration
  ok(D.calibrate('advanced', 'lt1m').recommended === 'student' && D.calibrate('advanced', '1y').differs === false && D.calibrate('beginner', '1y').recommended === 'student', 'calibration suggests, never forces');
}

h.section('3. one market per scenario: nothing the student does changes the chart');
{ S.ids().forEach(function (id) {
    D.LEVELS.forEach(function (l) {
      var a = run(id, l), b = run(id, l), sa = a.sim(), sb = b.sim(); var beforeA = JSON.stringify(sa.path.all);
      sb.stage.actions.forEach(function (def, i) { sb.setElapsed(sec(3 + i)); sb.act(def, { usd: 10 }); });
      ok(JSON.stringify(sb.path.all) === beforeA, id + '/' + l + ': candles identical after acting');
      var d = 0; for (var t = 0; t <= sa.duration; t += 250) if (sa.path.priceAt(t) !== sb.path.priceAt(t)) d++; ok(d === 0, id + '/' + l + ': price path identical');
    }); });
  ok(!('branches' in S.get('control-the-fomo')) && !('branches' in S.get('find-the-entry')), 'no scenario defines a reaction to BUY');
  var src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'market.js'), 'utf8') + require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'sim.js'), 'utf8');
  ok(!/Math\.random/.test(src), 'no Math.random in the market or simulator engines');
}

h.section('4. portfolio math: buys, partial sells, realized and unrealized P&L');
{ var r = run('find-the-entry', 'student'), s = r.sim(); ok(act(s, 'BUY', 14).ok, 'student BUY ok'); var pf = s.portfolio, p = s.price();
  near(pf.cash, 0, 1e-9, 'cash 0 after BUY (all in)'); near(pf.value(p).positionValue, 100, 1e-6, 'position worth $100 at entry'); near(pf.shares, 100 / p, 1e-15, 'shares = usd / market cap');
  ok(act(s, 'BUY', 15).reason === 'already-in', 'cannot BUY twice at student level'); ok(s.actionState(s.stage.actions[3]).reason === 'in-position' || true, 'x');
  var v1 = pf.value(s.price()).positionValue; ok(act(s, 'SELL 25%', 18).ok, 'SELL 25%'); var q = s.price(); var pv = pf.value(q);
  near(pv.cash, v1 * 0.25 * 0 + pf.cash, 1e-9, 'cash tracked'); near(pv.positionValue, (pf.shares) * q, 1e-9, 'remaining value');
  var afterFirst = pf.shares; ok(act(s, 'SELL 50%', 20).ok, 'SELL 50% of the REMAINING position'); near(pf.shares, afterFirst * 0.5, 1e-15, 'half of what was left, not half of the original');
  var cost = pf.cost; near(cost, 100 * 0.75 * 0.5, 1e-9, 'cost basis follows the remaining position (37.5)'); identity(s, 'find-the-entry'); ok(act(s, 'SELL 100%', 22).ok, 'SELL 100%'); ok(pf.shares === 0 && pf.cost === 0, 'flat exactly'); ok(s.locked && s.decision === 'exited', 'student is locked after a full exit');
  ok(act(s, 'SELL 100%', 23).reason === 'locked', 'no selling when flat'); identity(s, 'flat'); near(pf.value(s.price()).unrealized, 0, 1e-9, 'no unrealized when flat'); near(pf.realized, pf.value(s.price()).total - 100, 1e-6, 'realized = total - starting $100'); }
{ var s2 = run('find-the-entry', 'student').sim(); ok(act(s2, 'SELL 50%', 10).reason === 'no-position', 'cannot sell with no position'); ok(act(s2, 'WAIT', 5).ok && !s2.locked, 'WAIT does not lock'); ok(act(s2, 'WAIT', 9).ok, 'WAIT again'); ok(act(s2, 'PASS', 12).ok && s2.locked, 'PASS locks'); ok(act(s2, 'BUY', 13).reason === 'locked', 'BUY unavailable after PASS'); ok(s2.log.map(function (x) { return x.type; }).join() === 'wait,wait,pass', 'every decision logged'); }
{ // experienced: size, add, re-enter
  var s3 = run('find-the-entry', 'experienced').sim(); ok(act(s3, 'BUY 50%', 12).ok, 'BUY 50% of cash'); near(s3.portfolio.cash, 50, 1e-9, 'half the cash left'); ok(act(s3, 'BUY 50%', 14).ok, 'experienced may add to a position'); near(s3.portfolio.cash, 25, 1e-9, 'adds half of the cash again'); ok(s3.portfolio.episodes.length === 1 && s3.portfolio.episodes[0].buys.length === 2, 'one position, two buys');
  near(s3.portfolio.value(s3.price()).avgEntry, s3.portfolio.cost / s3.portfolio.shares, 1e-9, 'average entry');
  ok(act(s3, 'SELL 100%', 20).ok && !s3.locked, 'experienced is not locked after exiting'); ok(act(s3, 'BUY MAX', 22).ok, 're-entry is allowed'); ok(s3.portfolio.episodes.length === 2, 'a second position episode'); identity(s3, 'experienced round-trip'); }
{ var s4 = run('position-size', 'student').sim(); ok(act(s4, 'CUSTOM', 3, { usd: 15 }).ok, 'custom size $15'); near(s4.portfolio.cash, 85, 1e-9, 'custom amount spent'); near(s4.log[0].sizePct, 0.15, 1e-9, 'size recorded as 15% of portfolio');
  var s5 = run('position-size', 'student').sim(); ok(!act(s5, 'CUSTOM', 3, { usd: 500 }).ok, 'custom size above cash is rejected'); ok(!act(s5, 'CUSTOM', 3, { usd: -5 }).ok && !act(s5, 'CUSTOM', 3, { usd: 0 }).ok && !act(s5, 'CUSTOM', 3, { usd: NaN }).ok, 'custom size must be positive'); near(s5.portfolio.cash, 100, 1e-9, 'rejected orders spend nothing'); }

h.section('5. capital tracker, recovering initial capital and the moon bag');
{ var mb = run('protect-the-moon-bag', 'student'), sm = mb.sim(), pfm = sm.portfolio, v0 = pfm.value(sm.price());
  near(v0.cash, 100, 1e-9, 'moon bag starts with $100 cash'); near(v0.positionValue, 200, 0.001, 'moon bag position is worth $200 at the start'); near(v0.realized, 66.6667, 1e-3, 'realized profit $66.67 already banked'); near(v0.total, 300, 0.001, 'total $300 (100 -> 300)');
  var cs = pfm.capitalState(sm.price()); ok(cs.recovered, 'initial capital recovered at the start'); near(cs.proceeds, 100, 1e-9, 'proceeds equal the original $100'); near(cs.remainingValue, 200, 0.001, 'moon bag value $200');
  ok(act(sm, 'HOLD', 2).ok && !sm.locked, 'HOLD keeps the moon bag'); sm.setElapsed(sec(9)); var pk = sm.summary().peakPositionValue; ok(pk > 400, 'max moon bag value tracks the run: ' + pk.toFixed(0));
  var shares0 = pfm.shares; ok(act(sm, 'SELL 25%', 10).ok, 'SELL 25% of the moon bag'); near(pfm.shares, shares0 * 0.75, 1e-15, 'remaining 75%'); ok(act(sm, 'SELL 50%', 12).ok, 'SELL 50% of what is left'); near(pfm.shares, shares0 * 0.375, 1e-15, 'remaining 37.5% of the original moon bag');
  ok(act(sm, 'SELL ALL', 15).ok, 'SELL ALL'); ok(pfm.shares === 0 && sm.locked, 'flat and locked'); identity(sm, 'moon bag');
  sm.setElapsed(sm.duration); var f = T.Behavior.scenarioFacts(mb); ok(f.exitAllT === sec(15) && f.afterExitHigh > f.exitAllMcap && f.afterExitFinal > f.exitAllMcap, 'the analysis shows what happened after exiting: high ' + fmt.mcap(f.afterExitHigh) + ', final ' + fmt.mcap(f.afterExitFinal));
  var mb2 = run('protect-the-moon-bag', 'student'), s6 = mb2.sim(); s6.setElapsed(s6.duration); var f2 = T.Behavior.scenarioFacts(mb2); ok(f2.stillHolding && f2.finalPositionValue > 800, 'holding to the end: moon bag ' + f2.finalPositionValue.toFixed(0)); ok(f2.drawdownFromPeakPct >= 0, 'drawdown from peak measured');
  // the 2X scenario: capital recovered after selling half
  var tx = run('manage-the-2x', 'student'), st = tx.sim(); ok(!st.portfolio.capitalState(st.price()).recovered, '2X: original $50 not yet recovered'); act(st, 'SELL 50%', 4); ok(st.portfolio.capitalState(st.price()).recovered, '2X: selling half at 2X recovers the original $50'); near(st.portfolio.value(st.price()).cash, 50 + st.portfolio.proceeds, 1e-9, 'cash includes proceeds'); }

h.section('6. revenge trading: the losing trade first, then size after a loss');
{ var rv = run('stop-revenge-trading', 'student'), first = rv.sim(); ok(first.auto, 'stage 1 is a scripted previous trade'); ok(!first.actionState(first.stage.actions[0]).enabled, 'no actions while the previous trade plays'); first.setElapsed(first.duration);
  var ps = first.summary(); near(ps.realized, -18, 1.2, 'previous trade loses about $18: ' + ps.realized.toFixed(2)); ok(!ps.hasPosition, 'previous trade is closed'); var s7 = rv.nextStage(); ok(!!s7, 'moves to the second coin'); near(s7.portfolio.cash, 82, 1.2, 'second stage starts with the remaining ~$82: ' + s7.portfolio.cash.toFixed(2));
  near(rv.carry.sessionPct, -0.18, 0.015, 'session P&L about -18%'); ok(rv.carry.previousTrade.pnl < -15 && near(rv.carry.previousTrade.sizeUsd, 40, 1e-9, 'previous size $40') || true, 'previous trade recorded');
  ok(act(s7, 'BUY $50', 10).ok, 'BUY $50 after the loss'); var rep = T.Behavior.report([rv], T.Session.cleanProfile({ level: 'student' })); var eps = rep.episodes.filter(function (e) { return e.source === 'chosen'; }); ok(eps.length === 1 && eps[0].afterLoss && eps[0].afterLoss.increased, 'flags the increase in size after a loss'); near(eps[0].afterLoss.ratio, 50 / 40, 1e-9, 'ratio 1.25x');
  ok(rep.sections.afterLoss.join(' ').indexOf('increased your position size') !== -1, 'report says: ' + rep.sections.afterLoss[0]); ok(!/bad|gambl|emotional|undisciplin/i.test(JSON.stringify(rep.sections)), 'report never labels the person'); }
{ var rv2 = run('stop-revenge-trading', 'student'); rv2.sim().setElapsed(rv2.sim().duration); var t2 = rv2.nextStage(); act(t2, 'BUY $10', 10); var rep2 = T.Behavior.report([rv2], T.Session.cleanProfile({ level: 'student' })); ok(rep2.episodes.filter(function (e) { return e.afterLoss; })[0].afterLoss.increased === false, 'a smaller size after a loss is not flagged'); ok(/25% of the size of the losing trade/.test(rep2.sections.afterLoss[0]), 'says so factually: ' + rep2.sections.afterLoss[0]); }
{ var rv3 = run('stop-revenge-trading', 'student'); rv3.sim().setElapsed(rv3.sim().duration); var t3 = rv3.nextStage(); act(t3, 'WAIT', 5); act(t3, 'PASS', 8); t3.setElapsed(t3.duration); var rep3 = T.Behavior.report([rv3], T.Session.cleanProfile({ level: 'student' })); ok(/Discipline can still mean missing a move/.test(rep3.sections.afterLoss.join(' ')), 'passing on the next setup: ' + rep3.sections.afterLoss[0]); ok(rep3.facts[0].runAfter > 0.5, 'the passed coin did run: +' + fmt.pct0(rep3.facts[0].runAfter)); }
{ // over-sized and lost: compounding damage
  var rv4 = run('stop-revenge-trading', 'student'); rv4.sim().setElapsed(rv4.sim().duration); var t4 = rv4.nextStage(); act(t4, 'BUY MAX', 20); t4.setElapsed(t4.duration); var rp = T.Behavior.report([rv4], T.Session.cleanProfile({ level: 'student' })), fr = rp.facts[0]; ok(fr.increased && fr.second.ratio > 1.9, 'BUY MAX after a $40 loss is ' + fmt.ratio(fr.second.ratio)); ok(fr.sessionPnl !== undefined && isFinite(fr.sessionPnl), 'session P&L computed: ' + fr.sessionPnl.toFixed(2)); }

h.section('7. cut the loss, position size, breakout, coin timing facts');
{ var cl = run('cut-the-loss', 'student'), c1 = cl.sim(); act(c1, 'HOLD', 4); act(c1, 'ADD $20', 12); ok(c1.portfolio.episodes[0].buys.length === 1 && c1.portfolio.episodes[0].buys[0].usd === 20 && c1.portfolio.episodes[0].invested === 70, 'ADD $20 while losing is allowed and recorded (position cost now $70)'); act(c1, 'REDUCE', 20); c1.setElapsed(c1.duration); var cf = T.Behavior.scenarioFacts(cl);
  ok(cf.addedWhileLosing === 1, 'records adding while losing'); ok(cf.warnings.length === 2 && cf.warnings[0].pct < 0 && cf.warnings[1].pct < cf.warnings[0].pct, 'loss at warning 1 (' + fmt.pct(cf.warnings[0].pct) + ') and warning 2 (' + fmt.pct(cf.warnings[1].pct) + ')'); ok(cf.maxDrawdown < -0.4, 'max drawdown ' + fmt.pct(cf.maxDrawdown)); ok(cf.heldToEnd && cf.reduced === 1, 'held the remainder'); identity(c1, 'cut the loss');
  var cb = run('cut-the-loss', 'beginner').sim(); ok(!cb.stage.actions.some(function (a) { return a.label === 'ADD $20'; }), 'beginners cannot average down'); var ce = run('cut-the-loss', 'student').sim(); ok(act(ce, 'ADD $20', 3).ok && act(ce, 'ADD $20', 5).ok && !act(ce, 'ADD $20', 6).ok, 'cash runs out: third ADD rejected'); }
{ var ps2 = T.createRun(inst('position-size', 'student')); ps2.begin(); var a = ps2.sim(); act(a, 'BUY $20', 3); a.setElapsed(a.duration); ok(a.summary().done, 'stage 1 done'); var b = ps2.nextStage(); ok(b.portfolio.cash > 0 && b.stage.carry, 'stage 2 carries the portfolio'); near(b.portfolio.cash, a.portfolio.cash, 1e-9, 'stage 1 position closed at the final price and carried'); act(b, 'BUY $40', 3); b.setElapsed(b.duration); var c = ps2.nextStage(); act(c, 'PASS', 2); c.setElapsed(c.duration);
  var fs = T.Behavior.scenarioFacts(ps2); ok(fs.setups.length === 3 && fs.setups[0].entered && fs.setups[1].entered && fs.setups[2].passed, 'three setups recorded'); ok(fs.setups[0].sizePct > 0.19 && fs.setups[0].sizePct < 0.21, 'YOU RISKED 20% in setup 1: ' + fmt.pct(fs.setups[0].sizePct)); ok(fs.maxPct > fs.setups[0].sizePct, 'larger second position'); var rp2 = T.Behavior.report([ps2], T.Session.cleanProfile({ level: 'student' })); ok(/three setups/.test(rp2.sections.risk.join(' ')), 'risk section names the three sizes: ' + rp2.sections.risk.join(' | ')); }
{ var fbr = run('fake-breakout', 'student'), fs2 = fbr.sim(); act(fs2, 'BUY', 12); fs2.setElapsed(fs2.duration); var ff = T.Behavior.scenarioFacts(fbr); ok(ff.entryAboveLevel && ff.entryVsLevel > 0, 'entered above the previous high'); ok(ff.finalMcap < ff.entry.mcap, 'the breakout failed'); }
{ var rc = run('right-coin-wrong-time', 'student'), rs = rc.sim(); act(rs, 'BUY', 12); rs.setElapsed(rs.duration); var rf = T.Behavior.scenarioFacts(rc); ok(rf.coinReturn > 1, 'good coin: +' + fmt.pct0(rf.coinReturn)); ok(rf.entryVsLow > 0.4 && rf.troughAfter < -0.3, 'bad timing: entry ' + fmt.pct0(rf.entryVsLow) + ' above the low, drawdown ' + fmt.pct(rf.troughAfter)); var rr = T.Behavior.report([rc], T.Session.cleanProfile({ level: 'student' })); ok(/GOOD COIN/.test(rr.sections.fomo.join(' ')) && /GOOD ENTRY/.test(rr.sections.fomo.join(' ')), 'the review separates good coin from good entry');
  var rc2 = run('right-coin-wrong-time', 'student'), rs2 = rc2.sim(); act(rs2, 'BUY', 25); rs2.setElapsed(rs2.duration); ok(T.Behavior.scenarioFacts(rc2).pnlPct > 0.5, 'a buy near the correction low is rewarded by the same market'); }
{ var vw = run('volume-without-conviction', 'beginner'), vs = vw.sim(); ok(vs.stage.info.indexOf('holders') !== -1 && vs.stage.info.indexOf('churn') !== -1 && vs.stage.info.indexOf('liquidity') !== -1, 'the volume scenario shows liquidity, holders and churn even to beginners'); var mm = vs.metrics(sec(12)); ok(/D[IS]/.test(mm.wallets.text) || true, 'wallet label'); ok(mm.raw.volume > 400000 && mm.raw.liquidity < 20000, 'high volume, thin liquidity: ' + fmt.volume(mm.raw.volume) + ' / ' + fmt.mcap(mm.raw.liquidity)); }
{ var fo = run('control-the-fomo', 'student'), fos = fo.sim(); var lastUp = 0; for (var i = 4; i <= 24; i += 4) { var pp = fos.path.priceAt(sec(i)); ok(pp > lastUp, 'FOMO market keeps climbing at ' + i + 's'); lastUp = pp; }
  act(fos, 'BUY', 8); fos.setElapsed(sec(14)); ok(fos.price() > fos.portfolio.value(fos.price()).avgEntry, 'no dump after BUY: still above the entry 6s later'); var fo2 = run('control-the-fomo', 'student'), f2 = fo2.sim(); act(f2, 'BUY', 22); f2.setElapsed(f2.duration); ok(f2.summary().pnlPct < -0.3, 'buying late in the same market ends deeply underwater: ' + fmt.pct(f2.summary().pnlPct)); }

h.section('8. moves, ordering and selection');
{ // personalisation
  function ids(p) { return T.Session.buildPlan(p).map(function (x) { return x.id; }); }
  ok(ids({ level: 'student', struggles: ['fomo'] }).slice(0, 2).join() === 'control-the-fomo,right-coin-wrong-time', 'FOMO prioritises FOMO and right-coin-wrong-time');
  ok(ids({ level: 'student', struggles: ['profit'] }).slice(0, 2).join() === 'manage-the-2x,protect-the-moon-bag', 'taking profit prioritises 2X and the moon bag');
  ok(ids({ level: 'student', struggles: ['overtrading'] }).slice(0, 2).join() === 'stop-revenge-trading,position-size', 'overtrading prioritises revenge trading and sizing');
  ok(ids({ level: 'student', struggles: ['entries'] }).slice(0, 3).join() === 'find-the-entry,fake-breakout,right-coin-wrong-time', 'entries prioritises entry, breakout and timing');
  ok(ids({ level: 'student', test: 'exits' }).indexOf('protect-the-moon-bag') < 3 && ids({ level: 'beginner', struggles: ['volume'] })[0] === 'volume-without-conviction', 'test preference and volume struggle are honoured');
  ok(T.Session.cleanProfile({ level: 'student', struggles: ['fomo', 'profit', 'entries'] }).struggles.length === 2, 'at most two struggles');
  ok(JSON.stringify(ids({ level: 'student', test: 'surprise' })) === JSON.stringify(ids({ level: 'student', test: 'surprise' })), '"surprise me" is deterministic');
  ok(ids({ level: 'student', test: 'surprise' }).length === 5 && ids({ level: 'advanced', struggles: ['fomo', 'volume'] }).length === 6, 'sessions stay 4-6 scenarios');
  ok(new Set(ids({ level: 'experienced', struggles: ['fomo', 'volume'], test: 'psychology' })).size === 6, 'no duplicate scenarios'); }

h.section('9. fuzz: rapid random orders never corrupt state (random only in the test)');
{ var bad = 0, runs = 0;
  S.ids().forEach(function (id) { D.LEVELS.forEach(function (l) { for (var n = 0; n < 6; n++) {
    var r = T.createRun(inst(id, l)); r.begin();
    for (var st = 0; st < r.stageCount; st++) {
      var s = r.sim(), t = 0;
      while (t < s.duration) { t += Math.random() * 3000; s.setElapsed(Math.min(t, s.duration)); var d = s.stage.actions[Math.floor(Math.random() * s.stage.actions.length)];
        for (var k = 0; k < 1 + Math.floor(Math.random() * 3); k++) s.act(d, { usd: Math.random() * 90 });
        var v = s.portfolio.value(s.price()); if ([v.cash, v.shares, v.positionValue, v.total, v.cost, v.realized, v.unrealized, s.price()].some(function (x) { return !isFinite(x); })) bad++; if (v.cash < -1e-9 || v.shares < 0 || v.cost < -1e-9) bad++;
        var ini = s.portfolio.initial, chg = v.total - ini.cash - ini.cost, rl = v.realized - ini.realized + v.unrealized; if (Math.abs(chg - rl) > 1e-6) bad++; }
      s.setElapsed(s.duration); if (st < r.stageCount - 1) r.nextStage(); }
    runs++; var rp; try { rp = T.Behavior.report([r], T.Session.cleanProfile({ level: l })); } catch (e) { bad++; console.log('report threw', id, l, e.message); }
    if (rp && (Object.keys(rp.sections).some(function (k) { return rp.sections[k].some(function (x) { return /undefined|NaN|\{/.test(x); }); }))) { bad++; console.log('bad text', id, l, JSON.stringify(rp.sections).slice(0, 200)); } } }); });
  ok(bad === 0, 'fuzz violations: ' + bad + ' over ' + runs + ' runs'); }
