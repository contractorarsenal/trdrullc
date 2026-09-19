'use strict';
var T = require('./load'), h = require('./harness'), ok = h.ok, near = h.near, S = T.Scenarios, fmt = T.fmt;
var sec = function (x) { return x * 1000; };
function act(sim, label, t, params) { sim.setElapsed(sec(t)); var def = sim.stage.actions.filter(function (a) { return a.label === label; })[0]; return sim.act(def, params); }
// a minimal sessionStorage
var store = {}; globalThis.sessionStorage = { getItem: function (k) { return k in store ? store[k] : null; }, setItem: function (k, v) { store[k] = String(v); }, removeItem: function (k) { delete store[k]; } };

h.section('10. sessionStorage recovery');
{ var state = T.Session.newState({ level: 'student', struggles: ['fomo'], experience: '1-3m', test: 'psychology' });
  var rec = state.records[0], run = T.Session.makeRun(rec); run.begin(); var s = run.sim();
  act(s, 'WAIT', 5); act(s, 'BUY', 14); act(s, 'SELL 25%', 18); s.setElapsed(sec(21)); rec.run = run.snapshot(); rec.note = 'noted'; state.index = 0;
  T.Session.save(state, { phase: 'play' }); var loaded = T.Session.load(); ok(!!loaded, 'session loads back'); ok(loaded.ui.phase === 'play', 'ui state saved');
  ok(JSON.stringify(loaded.state.profile) === JSON.stringify(state.profile), 'profile preserved'); ok(JSON.stringify(loaded.state.plan) === JSON.stringify(state.plan), 'plan preserved'); ok(loaded.state.records[0].note === 'noted', 'reflection answer preserved');
  var r2 = T.Session.makeRun(loaded.state.records[0]), s2 = r2.sim();
  near(s2.elapsed, s.elapsed, 1e-9, 'same clock'); near(s2.portfolio.value(s2.price()).total, s.portfolio.value(s.price()).total, 1e-9, 'same portfolio'); near(s2.portfolio.realized, s.portfolio.realized, 1e-9, 'same realized P&L'); ok(s2.log.length === 3 && s2.log[1].type === 'buy', 'same decision history');
  var d = 0; for (var t = 0; t <= s.duration; t += 200) if (s.path.priceAt(t) !== s2.path.priceAt(t)) d++; ok(d === 0, 'same chart');
  // corrupt / foreign data is ignored, never crashes
  store[T.CONFIG.storageKey] = '{not json'; ok(T.Session.load() === null, 'garbage is ignored');
  store[T.CONFIG.storageKey] = JSON.stringify({ v: 'other', state: {} }); ok(T.Session.load() === null, 'another version is ignored');
  store[T.CONFIG.storageKey] = T.Session.serialize(Object.assign({}, state, { plan: [{ id: 'nope', level: 'student' }], records: [state.records[0]] })); ok(T.Session.load() === null, 'unknown scenario ids are rejected');
  store[T.CONFIG.storageKey] = T.Session.serialize(Object.assign({}, state, { records: [Object.assign({}, state.records[0], { run: { stage: 0, sims: [{ started: true, elapsed: 'abc', actions: [{ id: 'buy', t: 'x' }, { id: 'sell', pct: 9, t: 4000 }] }] } })].concat(state.records.slice(1)) }));
  var lz = T.Session.load(); ok(!!lz && lz.state.records[0].run.sims[0].actions.length === 1, 'malformed actions are dropped'); var rr = T.Session.makeRun(lz.state.records[0]); ok(rr.sim().log.length === 0, 'an impossible order is not replayed');
  T.Session.clear(); ok(T.Session.load() === null, 'clear removes the session');
  ok(!('level' in {}) && T.CONFIG.storageKey !== 'tys.session.v2' && T.CONFIG.storageKey !== 'tys.session.v3', 'own storage key, separate from the other simulator'); }
{ // a two-stage scenario survives a refresh in stage 2
  var st = T.Session.newState({ level: 'student' }); var idx = st.plan.findIndex(function (p) { return p.id === 'stop-revenge-trading'; }); var rc = st.records[idx], rv = T.Session.makeRun(rc); rv.begin(); rv.sim().setElapsed(rv.sim().duration); var s2 = rv.nextStage(); act(s2, 'WAIT', 4); act(s2, 'BUY $25', 9); s2.setElapsed(sec(13)); rc.run = rv.snapshot(); T.Session.save(st, {}); var back = T.Session.makeRun(T.Session.load().state.records[idx]);
  ok(back.stageIndex === 1 && back.sim().log.length === 2, 'restores into stage 2 with the decisions'); near(back.sim().portfolio.cash, s2.portfolio.cash, 1e-9, 'carried cash restored'); near(back.carry.sessionPct, rv.carry.sessionPct, 1e-9, 'session P&L restored'); ok(back.sim().portfolio.episodes.length === 1, 'the position restored'); }

h.section('11. playback: fake time, pause / resume, fast-forward');
{ var r = T.createRun(S.instantiate('find-the-entry', 'student')); r.begin(); var pl = T.createPlayer(r); var s = r.sim();
  pl.tick(100); pl.tick(100); near(s.elapsed, 200, 1e-9, 'the clock advances with fake ms (normal speed)');
  pl.pause(); var before = s.elapsed; pl.tick(100); pl.tick(100); near(s.elapsed, before, 1e-9, 'PAUSE freezes the clock'); ok(!pl.playing(), 'not playing while paused'); pl.resume(); pl.tick(100); ok(s.elapsed > before, 'RESUME continues');
  pl.toggle(); ok(pl.paused, 'toggle pauses'); pl.toggle(); ok(!pl.paused, 'toggle resumes');
  var rb = T.createRun(S.instantiate('find-the-entry', 'beginner')); rb.begin(); var pb = T.createPlayer(rb); pb.tick(100); near(rb.sim().elapsed, 75, 1e-9, 'beginner runs at 0.75x'); var ra = T.createRun(S.instantiate('find-the-entry', 'advanced')); ra.begin(); var pa = T.createPlayer(ra); pa.tick(100); near(ra.sim().elapsed, 140, 1e-9, 'advanced runs at 1.4x');
  var rr = T.createRun(S.instantiate('find-the-entry', 'student')); rr.begin(); var pr = T.createPlayer(rr, { speed: 1 }); pr.tick(100); pr.pause(); var t0 = rr.sim().elapsed; pr.gate = true; pr.tick(100); near(rr.sim().elapsed, t0, 1e-9, 'a restore gate freezes the clock');
  ok(!pl.canFastForward(), 'no fast-forward while there is still a decision to make'); act(s, 'PASS', 6); ok(pl.canFastForward(), 'fast-forward after PASS'); ok(pl.setFastForward(true) === 3, 'x3'); var e0 = s.elapsed; pl.tick(100); near(s.elapsed - e0, 300, 1e-9, 'fast-forward triples the clock');
  var guard = 0, res; while (!(res = pl.tick(100)) && guard++ < 2000); ok(res === 'run-end' && s.done(), 'runs to the end of a single-stage scenario'); ok(pl.ff === 1, 'fast-forward switches off at the end');
  // an open position cannot be fast-forwarded through
  var r3 = T.createRun(S.instantiate('find-the-entry', 'student')); r3.begin(); var p3 = T.createPlayer(r3); act(r3.sim(), 'BUY', 13); ok(!p3.canFastForward() && p3.setFastForward(true) === 1, 'no fast-forward while holding a position'); }
{ // stage hand-off in the revenge scenario; the scripted stage can be skipped
  var rv = T.createRun(S.instantiate('stop-revenge-trading', 'student')); rv.begin(); var pv = T.createPlayer(rv); ok(pv.canFastForward(), 'the scripted previous trade can be fast-forwarded'); pv.setFastForward(true);
  var g = 0, out; while (!(out = pv.tick(100)) && g++ < 400); ok(out === 'stage-end', 'stage 1 ends with a stage hand-off'); ok(rv.sim().summary().realized < -15, 'previous trade closed for a loss'); var nx = pv.advanceStage(); ok(nx && rv.stageIndex === 1 && nx.started && !nx.done(), 'stage 2 starts'); ok(pv.ff === 1 && !pv.paused, 'playback resets for the new stage'); }
{ var rs = T.createRun(S.instantiate('control-the-fomo', 'student')); rs.begin(); var ps = T.createPlayer(rs); act(rs.sim(), 'WAIT', 3); ps.restartRun(); ok(rs.sim().elapsed === 0 && rs.sim().log.length === 0 && rs.sim().started, 'RESTART SCENARIO clears decisions and rewinds'); }

h.section('12. presenter: NEXT EVENT');
{ var r = T.createRun(S.instantiate('control-the-fomo', 'student')); r.begin(); var p = T.createPlayer(r); var s = r.sim(); var times = s.events.map(function (e) { return e.t; }); ok(times.length >= 5 && times.every(function (t, i) { return !i || t >= times[i - 1]; }), 'events are ordered');
  var seen = []; for (var i = 0; i < s.events.length; i++) { var ev = p.nextEvent(); seen.push(ev.t); ok(p.paused, 'NEXT EVENT pauses'); ok(Math.abs(s.elapsed - ev.t) < 1e-9, 'lands exactly on the event: ' + ev.label); }
  ok(seen.every(function (t, k) { return !k || t > seen[k - 1]; }), 'each press moves forward'); var end = p.nextEvent(); ok(end.kind === 'end' && s.done(), 'past the last event it goes to the end'); }
{ var r = T.createRun(S.instantiate('control-the-fomo', 'student')); r.begin(); var p = T.createPlayer(r), s = r.sim(); p.nextEvent(); var t1 = s.elapsed; act(s, 'WAIT', t1 / 1000); ok(s.log.length === 1, 'the presenter can take an action while paused'); p.resume(); p.tick(100); ok(s.elapsed > t1, 'and then resume'); p.nextEvent(); ok(s.elapsed > t1 && p.paused, 'NEXT EVENT after resuming'); }

h.section('13. replay');
{ var st = T.Session.newState({ level: 'student' }); var runs = st.plan.map(function (pl, i) { var rr = T.Session.makeRun(st.records[i]); rr.begin(); return rr; });
  runs.forEach(function (rr) { for (var k = 0; k < rr.stageCount; k++) { var s = rr.sim(); if (!s.auto) { var buy = s.stage.actions.filter(function (a) { return a.id === 'buy'; })[0]; if (buy) { s.setElapsed(sec(12)); s.act(buy, { usd: 20 }); s.setElapsed(sec(18)); var sell = s.stage.actions.filter(function (a) { return a.id === 'sell' && a.pct === 0.5; })[0]; if (sell) s.act(sell); } } s.setElapsed(s.duration); if (k < rr.stageCount - 1) rr.nextStage(); } });
  var items = T.Replay.build(runs); ok(items.length === st.plan.length + 1, 'one replay item per stage (' + items.length + ')'); var it = items[0]; ok(it.marks.length >= 1 && it.anchors.length >= 4, 'markers and anchors present'); ok(it.anchors.some(function (a) { return a.source === 'peak'; }) && it.anchors.some(function (a) { return a.source === 'low'; }) && it.anchors.some(function (a) { return a.source === 'decision'; }), 'replay marks the peak, the low and the decisions');
  ok(it.anchors.every(function (a, i) { return !i || a.t >= it.anchors[i - 1].t; }), 'anchors are chronological');
  var at0 = T.Replay.stateAt(it, 0), atEnd = T.Replay.stateAt(it, it.duration); ok(at0.marks.length === 0 && atEnd.marks.length === it.marks.length, 'markers appear as time passes'); ok(at0.value.total > 0 && isFinite(atEnd.value.total), 'portfolio value at any time');
  var buyMark = it.marks.filter(function (m) { return m.type === 'buy'; })[0]; var mid = T.Replay.stateAt(it, buyMark.t + 500); ok(mid.holding && mid.value.positionValue > 0, 'replay shows the position while held'); near(mid.value.total, it.sim.analyze(buyMark.t + 500).portfolio.value(it.sim.path.priceAt(buyMark.t + 500)).total, 1e-9, 'replay state equals engine state');
  var na = T.Replay.nextAnchor(it, 0); ok(na && na.t > 0, 'next anchor'); var pa = T.Replay.prevAnchor(it, it.duration); ok(pa && pa.t < it.duration, 'previous anchor'); ok(T.Replay.nextAnchor(it, it.duration + 1) === null, 'no anchor after the end');
  var model = T.Replay.chartModel(it, buyMark.t + 500); ok(model.markers.length >= 1 && model.forming && model.all.length === it.sim.path.all.length, 'chart model for the replay');
  var before = JSON.stringify(it.sim.path.all), pnl = it.sim.summary().pnl; T.Replay.stateAt(it, 3000); T.Replay.chartModel(it, 5000); ok(JSON.stringify(it.sim.path.all) === before && it.sim.summary().pnl === pnl, 'replay is read-only'); }
{ // the whole review renders from a session with every kind of behavior
  var st2 = T.Session.newState({ level: 'experienced' }); var runs2 = st2.plan.map(function (pl, i) { var rr = T.Session.makeRun(st2.records[i]); rr.begin(); for (var k = 0; k < rr.stageCount; k++) { var s = rr.sim(); s.setElapsed(s.duration); if (k < rr.stageCount - 1) rr.nextStage(); } return rr; });
  var rep = T.Behavior.report(runs2, st2.profile); ok(Object.keys(rep.sections).length === 5 && Object.keys(rep.skills).length === 5, 'report has the sections and skill areas'); ok(rep.sections.entries[0].indexOf('did not enter') !== -1, 'a session with no trades is reported factually: ' + rep.sections.entries[0]);
  var all = JSON.stringify(rep.sections) + JSON.stringify(rep.skills); ok(!/\b(grade|score|good trader|bad trader|gambler|emotional|undisciplined|\d+\/100|[ABF] grade)\b/i.test(all.replace(/GOOD (COIN|ENTRY)/g, '')), 'no scores, grades or labels for the person'); }
