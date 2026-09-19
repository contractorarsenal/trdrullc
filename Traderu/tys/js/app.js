/*
 * APP: the session state machine and the animation loop.
 * Phases: intro -> onboard -> [ brief -> play -> (stage -> play)* -> reflect ] x scenarios -> results -> replay
 *
 * Query parameters (none appear in the normal UI):
 *   ?presenter=true   presenter controls: PAUSE, RESUME, NEXT EVENT, RESTART SCENARIO
 *   ?speed=dev|normal|presenter|<n>   playback speed multiplier for testing
 */
(function () {
  'use strict';
  var TYS = window.TYS, UI = TYS.UI, CFG = TYS.CONFIG, Session = TYS.Session, $ = UI.$;

  var params = new URLSearchParams(window.location.search);
  var presenter = /^(true|1|yes)$/i.test(params.get('presenter') || '');
  var SPEEDS = { dev: 12, normal: 1, presenter: 0.8 };
  var SPEED_FACTOR = (function () { var k = params.get('speed'); if (k) { if (SPEEDS[k] != null) return SPEEDS[k]; var n = parseFloat(k); if (isFinite(n) && n > 0) return Math.min(n, 60); } return presenter ? SPEEDS.presenter : 1; })();

  var session = null, phase = 'intro', run = null, player = null, lastTs = 0, lastSave = 0;

  /* ------------------------------------------------------------ persistence */
  function persist() {
    if (!session) return;
    var rec = session.records[session.index]; if (run && rec) rec.run = run.snapshot();
    Session.save(session, { phase: phase === 'replay' ? 'results' : phase });
  }
  function rec() { return session.records[session.index]; }

  /* ------------------------------------------------------------ scenarios */
  function mkPlayer(r) { return TYS.createPlayer(r, { speed: TYS.Difficulty.mod(r.level).speed * SPEED_FACTOR }); }
  function phaseFor(r) {
    var s = r.sim(); if (!s || !s.started) return 'brief';
    if (s.done()) return r.isLastStage() ? 'reflect' : 'stage';
    return 'play';
  }
  function loadScenario(i, restored) {
    session.index = i; var record = rec();
    run = Session.makeRun(record); player = mkPlayer(run);
    TYS.UI.terminal.load({ run: run, player: player, record: record, index: i, total: session.plan.length, phase: function () { return phase; } });
    phase = phaseFor(run);
    if (phase === 'play' && restored) { player.paused = true; player.gate = true; }
    UI.showView('terminal'); TYS.UI.terminal.applyPhase(phase, true); presenterUi(); persist();
    UI.announce('Scenario ' + (i + 1) + ' of ' + session.plan.length + '. ' + run.def.title + '.');
  }
  function beginRound() {
    if (phase !== 'brief') return; run.begin(); phase = 'play'; player.paused = false; lastTs = 0;
    TYS.UI.terminal.applyPhase(phase); presenterUi(); persist(); UI.announce('Started. ' + (run.stage().brief || run.def.brief).question);
  }
  function onStageContinue() {
    if (phase !== 'stage') return; player.advanceStage(); phase = 'play'; lastTs = 0; TYS.UI.terminal.stageChanged(); TYS.UI.terminal.applyPhase(phase); persist(); presenterUi();
  }
  function enterStage() { phase = 'stage'; persist(); TYS.UI.terminal.applyPhase(phase, true); presenterUi(); UI.announce('Stage complete.'); }
  function enterReflect() { phase = 'reflect'; persist(); TYS.UI.terminal.applyPhase(phase, true); presenterUi(); UI.announce('Scenario complete.'); }
  function onReflectContinue() {
    persist();
    if (session.index < session.plan.length - 1) loadScenario(session.index + 1); else showResults();
  }
  function resume() { if (phase !== 'play') return; player.resume(); lastTs = 0; TYS.UI.terminal.applyPhase(phase); presenterUi(); }

  /* ------------------------------------------------------------ results / replay */
  function resultRuns() { return session.records.map(function (r) { var rr = Session.makeRun(r); rr.sims.forEach(function (s, i) { if (i < rr.sims.length - 1) s.closeOut(); }); return rr; }); }
  function showResults() {
    phase = 'results'; run = null; var runs = resultRuns(); UI.renderResults(session, runs); UI.showView('results'); UI.focus($('res-title')); persist(); presenterUi();
    UI.announce('Session complete. Your decisions are listed on the page.');
  }
  function openReplay() { phase = 'replay'; UI.replay.open(resultRuns(), function () { phase = 'results'; UI.showView('results'); presenterUi(); }); presenterUi(); }
  function restartAll() { Session.clear(); session = null; run = null; player = null; phase = 'intro'; UI.showView('intro'); UI.focus($('intro-title')); presenterUi(); }

  function startOnboarding() {
    phase = 'onboard'; UI.onboarding(function (profile) { session = Session.newState(profile); persist(); loadScenario(0); });
  }

  /* ------------------------------------------------------------ presenter */
  function presenterUi() {
    if (!presenter) return;
    var inRound = phase === 'brief' || phase === 'play' || phase === 'stage' || phase === 'reflect', inReplay = phase === 'replay';
    $('btn-pause').disabled = phase !== 'play'; $('btn-pause').textContent = player && player.paused ? 'Resume' : 'Pause';
    $('btn-next-event').disabled = !(phase === 'play' || inReplay); $('btn-prestart').disabled = !inRound;
    $('presenter-state').textContent = phase === 'play' ? (player.paused ? 'Paused' : 'Running') : phase;
  }
  function togglePause() { if (phase !== 'play') return; if (player.gate) { resume(); return; } player.toggle(); lastTs = 0; presenterUi(); UI.announce(player.paused ? 'Paused.' : 'Resumed.'); }
  function nextEvent() {
    if (phase === 'replay') { UI.replay.next(); return; }
    if (phase !== 'play') return; var ev = player.nextEvent(); presenterUi(); persist();
    if (ev) UI.announce(ev.label);
    if (player.status === 'stage-end') enterStage(); else if (player.status === 'run-end') enterReflect();
  }
  function restartScenario() {
    if (!session || !(phase === 'brief' || phase === 'play' || phase === 'stage' || phase === 'reflect')) return;
    var record = rec(); record.run = null; record.note = ''; record.hints = 0; loadScenario(session.index); UI.announce('Scenario restarted.');
  }

  /* ------------------------------------------------------------ loop */
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!lastTs) lastTs = ts; var dt = Math.min(100, Math.max(0, ts - lastTs)); lastTs = ts;
    if (!run || !(phase === 'brief' || phase === 'play' || phase === 'stage' || phase === 'reflect')) return;
    var playing = phase === 'play' && !player.paused && !player.gate;
    if (phase === 'play') {
      var r = player.tick(dt);
      if (r === 'stage-end') enterStage(); else if (r === 'run-end') enterReflect(); else if (ts - lastSave > 1000) { lastSave = ts; persist(); }
    }
    TYS.UI.terminal.render(playing || phase === 'brief' ? dt : 0);
  }

  /* ------------------------------------------------------------ wiring */
  UI.terminal.init({ onBegin: beginRound, onStageContinue: onStageContinue, onResume: resume, onReflectContinue: onReflectContinue, onChange: persist, onNote: function () { clearTimeout(noteTimer); noteTimer = setTimeout(persist, 350); } });
  var noteTimer = 0;
  $('btn-start').addEventListener('click', startOnboarding);
  $('btn-restart').addEventListener('click', restartAll);
  $('btn-replay').addEventListener('click', openReplay);
  if (presenter) {
    $('presenter-bar').hidden = false; $('btn-pause').addEventListener('click', togglePause); $('btn-next-event').addEventListener('click', nextEvent); $('btn-prestart').addEventListener('click', restartScenario);
    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || ''; if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'p' || e.key === 'P') togglePause(); else if (e.key === 'n' || e.key === 'N') nextEvent();
    });
    presenterUi();
  }
  window.addEventListener('pagehide', function () { if (run && phase === 'play') persist(); });
  document.addEventListener('visibilitychange', function () { lastTs = 0; if (document.hidden && run && phase === 'play') persist(); });

  // restore an interrupted session (an accidental refresh)
  var saved = Session.load();
  if (saved && saved.ui && saved.ui.phase !== 'intro') {
    session = saved.state; var ph = saved.ui.phase;
    if (ph === 'results') showResults(); else loadScenario(session.index, true);
  }
  requestAnimationFrame(frame);
})();
