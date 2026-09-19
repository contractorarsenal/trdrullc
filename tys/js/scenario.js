/*
 * SCENARIO ENGINE.
 * A scenario is DATA (see js/scenarios/*.js). This file registers scenarios, validates them and turns
 * (scenario, level) into a runnable instance: fixed candles, signals, events, actions and rules.
 *
 * Scenario shape (all optional unless marked *):
 *   id*, title*, category*, concepts[], tags[] (personalisation), educationalContext,
 *   brief {lines[], question}, reflection {question, placeholder}, hints [{from, text}]  (beginner help),
 *   actions* [{id, label, pct?, usd?, size?, custom?, add?, group?, min?, max?, only?}],
 *   capitalTracker, thesis {text, warnings[{at}]}, sessionRows, levelsLine [{price,label}],
 *   stages* [ { id, kind:'play'|'auto', token{name,ticker}, brief{lines,setup[],question},
 *               market* { history, live*, signals, events[{at,label,kind}] }   (Market.compose specs, $K)
 *               byLevel { beginner:{live:{...}}, ... }   per-level replacements of live spec fields
 *               start { cash, position{costUsd,entryMcap}, realized, proceeds, capital } | carry:true
 *               auto { exitAt }   kind 'auto': the position is closed at that candle
 *               headline {label, mcap}, info[] extra metrics } ]
 * A scenario has ONE market per stage and level. Nothing here can depend on what the student does.
 */
(function (root) {
  'use strict';
  var TYS = root.TYS = root.TYS || {};
  var D = TYS.Difficulty, fmt = TYS.fmt;
  var registry = {}, order = [];
  var ACTION_IDS = ['buy', 'sell', 'hold', 'wait', 'pass'];
  var ENTRY_IDS = { buy: 1, wait: 1, pass: 1 };

  var Scenarios = TYS.Scenarios = {
    register: function (def) {
      if (!def || !def.id) throw new Error('scenario needs an id');
      if (registry[def.id]) throw new Error('duplicate scenario id ' + def.id);
      registry[def.id] = def; order.push(def.id); return def;
    },
    get: function (id) { return registry[id] || null; },
    ids: function () { return order.slice(); },
    all: function () { return order.map(function (i) { return registry[i]; }); },
    groupOf: function (a) { return a.group || (a.add ? 'manage' : ENTRY_IDS[a.id] ? 'entry' : 'manage'); }
  };

  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function shallowMerge(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in (b || {})) o[k] = b[k]; return o; }

  /* ------------------------------------------------------------ validation */
  Scenarios.validate = function (def) {
    var issues = [], id = (def && def.id) || '?';
    function bad(m) { issues.push(id + ': ' + m); }
    if (!def || !def.id) return ['scenario without id'];
    if (!def.title) bad('missing title');
    if (!def.category) bad('missing category');
    if (!def.stages || !def.stages.length) { bad('needs at least one stage'); return issues; }
    if (!def.actions || !def.actions.length) bad('needs actions');
    (def.actions || []).forEach(function (a, i) {
      if (ACTION_IDS.indexOf(a.id) === -1) bad('action ' + i + ' has unknown id ' + a.id);
      if (!a.label) bad('action ' + i + ' has no label');
      if (a.id === 'sell' && !(a.pct > 0 && a.pct <= 1)) bad('sell action ' + i + ' needs pct in (0,1]');
      if (a.id === 'buy' && !(a.usd > 0 || a.size === 'max' || a.custom || a.pct > 0)) bad('buy action ' + i + ' needs usd, pct, size:"max" or custom');
      ['min', 'max'].forEach(function (k) { if (a[k] && !D.isLevel(a[k])) bad('action ' + i + ' has bad level ' + a[k]); });
    });
    (def.hints || []).forEach(function (h, i) { if (!(h.from >= 0) || !h.text) bad('hint ' + i + ' needs from and text'); });
    def.stages.forEach(function (st, si) {
      var tag = 'stage ' + si;
      if (!st.market || !st.market.live) { bad(tag + ' has no live market'); return; }
      if (!st.token || !st.token.ticker) bad(tag + ' needs a token');
      var s = st.start || {};
      ['cash', 'realized', 'proceeds', 'capital'].forEach(function (k) { if (s[k] != null && (!isNum(s[k]) || s[k] < 0)) bad(tag + ' start.' + k + ' must be a non-negative number'); });
      if (s.position && !(s.position.costUsd > 0 && s.position.entryMcap > 0)) bad(tag + ' start.position needs positive costUsd and entryMcap');
      if (!st.carry && s.cash == null) bad(tag + ' needs start.cash (or carry:true)');
      if (st.carry && si === 0) bad('the first stage cannot carry');
      if (st.kind === 'auto' && (!s.position || !st.auto || !(st.auto.exitAt > 0))) bad(tag + ' auto stage needs a starting position and auto.exitAt');
      var specs = [st.market.live, st.market.history].concat(Object.keys(st.byLevel || {}).map(function (l) { return ((st.byLevel[l] || {}).live) || null; }));
      specs.forEach(function (sp) {
        if (!sp) return;
        if (sp.open != null && !(sp.open > 0)) bad(tag + ' has a non-positive opening price');
        (sp.waypoints || []).forEach(function (w) { if (!isNum(w[0]) || !isNum(w[1]) || !(w[1] > 0)) bad(tag + ' has a waypoint with a non-positive or invalid price'); });
        if (sp.fakeouts) sp.fakeouts.forEach(function (f) { if (!isNum(f.at) || !isNum(f.amp) || !(f.len > 0)) bad(tag + ' has an invalid fake-out'); });
      });
      var byLevel = st.byLevel || {};
      Object.keys(byLevel).forEach(function (l) { if (!D.isLevel(l)) bad(tag + ' byLevel has unknown level ' + l); });
      D.LEVELS.forEach(function (level) {
        var inst;
        try { inst = instantiateStage(def, si, level); } catch (e) { bad(tag + '/' + level + ': ' + e.message); return; }
        var live = inst.candles, hist = inst.history;
        if (live.length < 6) bad(tag + '/' + level + ' is too short (' + live.length + ' candles)');
        live.concat(hist).forEach(function (c, i) {
          if (c.length < 5 || c.slice(0, 5).some(function (x) { return !isNum(x); }) || c[0] <= 0 || c[1] <= 0 || c[2] <= 0 || c[3] <= 0) bad(tag + '/' + level + ' candle ' + i + ' is invalid');
          else if (c[1] < Math.max(c[0], c[3]) - 1e-6 || c[2] > Math.min(c[0], c[3]) + 1e-6) bad(tag + '/' + level + ' candle ' + i + ' high/low do not contain open/close');
        });
        if (hist.length && Math.abs(hist[hist.length - 1][3] - live[0][0]) > 0.6) bad(tag + '/' + level + ': the first live candle must open where history closed');
        (inst.events || []).forEach(function (e, i) { if (!(e.at >= 0 && e.at <= live.length) || !e.label) bad(tag + '/' + level + ' event ' + i + ' is outside the timeline or has no label'); });
        if (st.kind === 'auto' && inst.auto && inst.auto.exitAt >= live.length) bad(tag + '/' + level + ' auto exit is after the market ends');
        if (def.thesis) (def.thesis.warnings || []).forEach(function (w, i) { if (!(w.at >= 0 && w.at < live.length)) bad(tag + '/' + level + ' thesis warning ' + i + ' is outside the timeline'); });
        Object.keys(inst.signals || {}).forEach(function (k) {
          var ser = inst.signals[k];
          if (!Array.isArray(ser)) return;
          ser.forEach(function (p) { if (!(p[0] >= 0) || (typeof p[1] === 'number' && !isFinite(p[1]))) bad(tag + '/' + level + ' signal ' + k + ' has a bad point'); });
        });
        if (inst.actions.length === 0) bad(tag + '/' + level + ' has no actions at this level');
        if (st.kind !== 'auto' && !inst.actions.some(function (a) { return a.id === 'wait' || a.id === 'hold' || a.id === 'pass'; }) && !inst.actions.some(function (a) { return a.id === 'sell'; })) bad(tag + '/' + level + ' offers no way to decline or exit');
      });
    });
    return issues;
  };
  Scenarios.validateAll = function () { var out = []; D.validateModifiers().forEach(function (m) { out.push('difficulty: ' + m); }); order.forEach(function (id) { out = out.concat(Scenarios.validate(registry[id])); }); return out; };

  /* ------------------------------------------------------------ instantiate */
  function levelSpec(def, st, level) {
    var mod = D.mod(level), base = st.market.live, patch = ((st.byLevel || {})[level] || {}).live || {};
    var live = shallowMerge(base, patch);
    live.seed = (base.seed || 1) * 31 + D.index(level) * 7;
    if (patch.seed != null) live.seed = patch.seed;
    return { live: live, mod: mod };
  }
  function pickActions(def, level, st) {
    var acts = (st.actions || def.actions).filter(function (a) { return D.allowed(a, level); });
    return acts.map(function (a) { var c = {}; for (var k in a) c[k] = a[k]; c.group = Scenarios.groupOf(a); return c; });
  }
  function instantiateStage(def, si, level) {
    var st = def.stages[si], m = st.market, ls = levelSpec(def, st, level), mod = ls.mod;
    var histSpec = m.history ? shallowMerge(m.history, { seed: (m.history.seed || 3) }) : null;
    var history = histSpec ? TYS.Market.compose(histSpec, level, { noise: Math.min(1, mod.noise), fakeouts: 0 }) : [];
    var liveSpec = ls.live; if (history.length) liveSpec = shallowMerge(liveSpec, { open: history[history.length - 1][3] });
    var candles = TYS.Market.compose(liveSpec, level, mod);
    var byLevel = (st.byLevel || {})[level] || {};
    var events = (byLevel.events || m.events || []).slice().sort(function (a, b) { return a.at - b.at; });
    var info = mod.info.slice(); (st.info || def.info || []).forEach(function (k) { if (info.indexOf(k) === -1) info.push(k); });
    return { history: history, candles: candles, signals: byLevel.signals || m.signals || {}, events: events, info: info, actions: pickActions(def, level, st), auto: st.auto || null };
  }

  /*
   * instantiate(id, level) -> { def, level, mod, stages:[stage] }
   * stage: { index, id, kind, token, start, carry, brief, history, candles, signals, events, info, actions, auto,
   *          headline, levelsLine, seed, candleMs }
   */
  Scenarios.instantiate = function (id, level) {
    var def = registry[id]; if (!def) throw new Error('unknown scenario ' + id);
    level = D.isLevel(level) ? level : 'student';
    var mod = D.mod(level), rules = {
      addToPosition: !!mod.addToPosition, reentry: !!mod.reentry,
      sizing: !!mod.sizing, explain: !!mod.explain, hints: !!mod.hints, context: !!mod.context
    };
    var stages = def.stages.map(function (st, si) {
      var inst = instantiateStage(def, si, level);
      return {
        index: si, id: st.id || ('stage-' + si), kind: st.kind || 'play', token: st.token, start: st.start || null, carry: !!st.carry,
        tag: st.tag || null, brief: st.brief || null, history: inst.history, candles: inst.candles, signals: inst.signals, events: inst.events, info: inst.info,
        actions: inst.actions, auto: inst.auto, headline: st.headline || null, levelsLine: st.levelsLine || def.levelsLine || [],
        seed: ((st.market.live.seed || 1) * 31 + D.index(level) * 7) | 0, candleMs: st.candleMs || 1000, autoClose: st.autoClose !== false
      };
    });
    return { def: def, id: def.id, level: level, mod: mod, rules: rules, stages: stages };
  };
})(typeof window !== 'undefined' ? window : globalThis);
