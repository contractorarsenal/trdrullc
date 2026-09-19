/*
 * PLAYBACK CONTROLLER (no DOM).
 * Drives a run's clock: real-time playback at the level's speed, pause / resume, fast-forward, the presenter's
 * NEXT EVENT and the hand-off between stages. The UI calls this; tests call it with fake time (tick(ms)).
 */
(function (root) {
  'use strict';
  var TYS = root.TYS = root.TYS || {};

  TYS.createPlayer = function (run, opts) {
    opts = opts || {};
    var pl = { run: run, paused: false, gate: false, ff: 1, baseSpeed: opts.speed != null ? opts.speed : TYS.Difficulty.mod(run.level).speed, status: 'idle', lastEvent: null };
    pl.sim = function () { return run.sim(); };
    pl.speed = function () { return pl.baseSpeed * pl.ff; };
    pl.playing = function () { var s = run.sim(); return !!s && s.started && !s.done() && !pl.paused && !pl.gate; };
    // nothing left for the student to decide (passed, exited, or a scripted stage), so the rest can be skipped
    pl.canFastForward = function () { var s = run.sim(); return !!s && s.started && !s.done() && (s.locked || s.auto); };
    pl.setFastForward = function (on) { pl.ff = on && pl.canFastForward() ? TYS.CONFIG.fastForward : 1; return pl.ff; };
    pl.pause = function () { pl.paused = true; };
    pl.resume = function () { pl.paused = false; pl.gate = false; };
    pl.toggle = function () { if (pl.gate) { pl.resume(); return; } pl.paused = !pl.paused; };
    // Advance the clock by `ms` of real time. Returns 'stage-end' | 'run-end' | null when a stage finishes.
    pl.tick = function (ms) {
      var s = run.sim(); if (!s || !pl.playing()) return null;
      s.advance(Math.min(100, Math.max(0, ms)) * pl.speed());
      if (pl.ff > 1 && !pl.canFastForward() && !s.done()) pl.ff = 1;
      if (s.done()) { pl.ff = 1; pl.status = run.isLastStage() ? 'run-end' : 'stage-end'; return pl.status; }
      return null;
    };
    // Presenter: jump straight to the next scripted event and stop there.
    pl.nextEvent = function () {
      var s = run.sim(); if (!s || !s.started) return null;
      var t = s.nextEventT(s.elapsed), ev = null;
      if (t == null) { s.setElapsed(s.duration); pl.paused = true; pl.status = run.isLastStage() ? 'run-end' : 'stage-end'; return { t: s.duration, label: 'End of scenario', kind: 'end' }; }
      s.setElapsed(t); pl.paused = true; pl.ff = 1;
      s.events.forEach(function (e) { if (Math.abs(e.t - t) < 1) ev = e; });
      pl.lastEvent = ev; return ev;
    };
    pl.advanceStage = function () { var s = run.nextStage(); pl.status = 'idle'; pl.paused = false; pl.ff = 1; return s; };
    pl.restartRun = function () { run.reset(); run.begin(); pl.paused = false; pl.gate = false; pl.ff = 1; pl.status = 'idle'; pl.lastEvent = null; return run.sim(); };
    return pl;
  };
})(typeof window !== 'undefined' ? window : globalThis);
