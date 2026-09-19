/*
 * SESSION ENGINE.
 * The trader profile, the deterministic session builder and persistence (sessionStorage, no backend).
 * A session is the profile + an ordered plan of scenarios + one record per scenario (decisions, notes).
 * Everything needed to rebuild the whole session is plain JSON, so a backend could later store the same object.
 */
(function (root) {
  'use strict';
  var TYS = root.TYS = root.TYS || {}, D = TYS.Difficulty, CFG = TYS.CONFIG;

  var TEMPLATES = {
    beginner:    ['find-the-entry', 'manage-the-2x', 'control-the-fomo', 'cut-the-loss'],
    student:     ['find-the-entry', 'manage-the-2x', 'protect-the-moon-bag', 'stop-revenge-trading', 'right-coin-wrong-time'],
    experienced: ['fake-breakout', 'position-size', 'manage-the-2x', 'stop-revenge-trading', 'protect-the-moon-bag', 'control-the-fomo'],
    advanced:    ['fake-breakout', 'position-size', 'manage-the-2x', 'stop-revenge-trading', 'protect-the-moon-bag', 'control-the-fomo']
  };
  var STRUGGLES = [
    { id: 'entries', label: 'Finding entries' }, { id: 'profit', label: 'Taking profit' }, { id: 'losses', label: 'Cutting losses' }, { id: 'fomo', label: 'FOMO' },
    { id: 'overtrading', label: 'Overtrading' }, { id: 'sizing', label: 'Position sizing' }, { id: 'volume', label: 'Reading volume' }, { id: 'discipline', label: 'Discipline' }
  ];
  var STRUGGLE_MAP = {
    entries: ['find-the-entry', 'fake-breakout', 'right-coin-wrong-time'], profit: ['manage-the-2x', 'protect-the-moon-bag'], losses: ['cut-the-loss'], fomo: ['control-the-fomo', 'right-coin-wrong-time'],
    overtrading: ['stop-revenge-trading', 'position-size'], sizing: ['position-size'], volume: ['volume-without-conviction'], discipline: ['stop-revenge-trading', 'cut-the-loss']
  };
  var TESTS = [{ id: 'entries', label: 'Entries' }, { id: 'exits', label: 'Exits' }, { id: 'risk', label: 'Risk' }, { id: 'psychology', label: 'Psychology' }, { id: 'surprise', label: 'Surprise me' }];
  var TEST_MAP = {
    entries: ['find-the-entry', 'fake-breakout', 'right-coin-wrong-time'], exits: ['manage-the-2x', 'protect-the-moon-bag', 'cut-the-loss'],
    risk: ['position-size', 'cut-the-loss', 'stop-revenge-trading'], psychology: ['control-the-fomo', 'stop-revenge-trading', 'right-coin-wrong-time']
  };
  var EXPERIENCE = [{ id: 'lt1m', label: 'Less than 1 month' }, { id: '1-3m', label: '1–3 months' }, { id: '3-12m', label: '3–12 months' }, { id: '1y', label: '1+ year' }];

  function uniq(a) { var seen = {}; return a.filter(function (x) { return seen[x] ? false : (seen[x] = true); }); }
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  var Session = TYS.Session = { TEMPLATES: TEMPLATES, STRUGGLES: STRUGGLES, TESTS: TESTS, EXPERIENCE: EXPERIENCE };

  Session.cleanProfile = function (p) {
    p = p || {};
    var struggles = (Array.isArray(p.struggles) ? p.struggles : []).filter(function (s) { return STRUGGLE_MAP[s]; }).slice(0, 2);
    return { level: D.isLevel(p.level) ? p.level : 'student', experience: EXPERIENCE.some(function (e) { return e.id === p.experience; }) ? p.experience : null,
      struggles: uniq(struggles), test: TESTS.some(function (t) { return t.id === p.test; }) ? p.test : null };
  };

  // Deterministic: the same profile always produces the same session. No randomness anywhere.
  Session.buildPlan = function (profile) {
    profile = Session.cleanProfile(profile);
    var base = TEMPLATES[profile.level].slice(), n = Math.max(4, Math.min(6, base.length)), priority = [];
    profile.struggles.forEach(function (s) { priority = priority.concat(STRUGGLE_MAP[s]); });
    if (profile.test && profile.test !== 'surprise') priority = priority.concat(TEST_MAP[profile.test]);
    var known = TYS.Scenarios.ids(); priority = uniq(priority).filter(function (id) { return known.indexOf(id) !== -1; });
    var plan = uniq(priority.slice(0, 3).concat(base)).slice(0, n);
    if (profile.test === 'surprise') {   // "surprise me": one deterministic swap, derived from the answers
      var pool = known.filter(function (id) { return plan.indexOf(id) === -1; });
      if (pool.length) { var pick = pool[hashStr(JSON.stringify(profile)) % pool.length]; plan[plan.length - 1] = pick; }
    }
    return plan.map(function (id) { return { id: id, level: profile.level }; });
  };

  Session.newState = function (profile) {
    profile = Session.cleanProfile(profile);
    var plan = Session.buildPlan(profile);
    return { v: CFG.version, profile: profile, plan: plan, index: 0, phase: 'brief', records: plan.map(function (p) { return { id: p.id, level: p.level, run: null, note: '', hints: 0, stageSeen: 0 }; }) };
  };

  /* ---- runs: build (and restore) the simulation for one record ---- */
  Session.makeRun = function (record) {
    var inst = TYS.Scenarios.instantiate(record.id, record.level), run = TYS.createRun(inst);
    run.restore(record.run); run.hintsUsed = record.hints || 0; return run;
  };

  /* ---- persistence ---- */
  function sanitizeRecord(r) {
    r = r || {};
    var run = r.run && typeof r.run === 'object' && Array.isArray(r.run.sims) ? {
      stage: Math.max(0, +r.run.stage || 0),
      sims: r.run.sims.map(function (s) { return { started: !!s.started, elapsed: Math.max(0, +s.elapsed || 0), actions: (Array.isArray(s.actions) ? s.actions : []).filter(function (a) { return a && typeof a.id === 'string' && isFinite(+a.t); }).map(function (a) { return { id: a.id, pct: a.pct == null ? undefined : +a.pct, usd: a.usd == null ? undefined : +a.usd, label: typeof a.label === 'string' ? a.label : undefined, t: +a.t }; }) }; })
    } : null;
    return { id: r.id, level: D.isLevel(r.level) ? r.level : 'student', run: run, note: typeof r.note === 'string' ? r.note.slice(0, 500) : '', hints: Math.max(0, +r.hints || 0), stageSeen: Math.max(0, +r.stageSeen || 0) };
  }
  Session.serialize = function (state, ui) { return JSON.stringify({ v: CFG.version, state: state, ui: ui || null }); };
  Session.deserialize = function (raw) {
    try {
      var d = JSON.parse(raw); if (!d || d.v !== CFG.version || !d.state) return null;
      var s = d.state; s.profile = Session.cleanProfile(s.profile);
      if (!Array.isArray(s.plan) || !s.plan.length || !Array.isArray(s.records) || s.records.length !== s.plan.length) return null;
      var known = TYS.Scenarios.ids();
      if (s.plan.some(function (p) { return known.indexOf(p.id) === -1 || !D.isLevel(p.level); })) return null;
      s.records = s.records.map(sanitizeRecord); s.index = Math.min(Math.max(0, +s.index || 0), s.plan.length - 1);
      return { state: s, ui: d.ui || null };
    } catch (e) { return null; }
  };
  Session.save = function (state, ui) { try { root.sessionStorage.setItem(CFG.storageKey, Session.serialize(state, ui)); } catch (e) { /* storage unavailable */ } };
  Session.load = function () { try { var raw = root.sessionStorage.getItem(CFG.storageKey); return raw ? Session.deserialize(raw) : null; } catch (e) { return null; } };
  Session.clear = function () { try { root.sessionStorage.removeItem(CFG.storageKey); } catch (e) { /* ignore */ } };

  // fixed labels used by the UI and the results
  Session.levelLabel = function (level) { return D.mod(level).label; };
  Session.explain = function (profile) {   // what will be different in this session, in plain words
    var m = D.mod(profile.level), out = [];
    out.push(m.speed < 1 ? 'Markets move slower than real time.' : m.speed === 1 ? 'Markets move at normal speed.' : 'Markets move ' + Math.round((m.speed - 1) * 100) + '% faster than normal.');
    out.push(m.info.length + ' market statistics on screen' + (m.noiseMetrics ? ', including some that do not matter.' : '.'));
    out.push(m.hints ? 'Hints are available. Definitions are shown next to each number.' : 'No hints and no definitions.');
    out.push(m.fakeouts ? 'Expect fake-outs and conflicting signals.' : 'Clear moves with few fake-outs.');
    out.push(m.reentry ? 'You can size positions, add to them and re-enter after an exit.' : m.sizing ? 'Position size is part of some decisions.' : 'Simple choices: buy, wait, pass, sell.');
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);
