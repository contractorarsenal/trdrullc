/*
 * DIFFICULTY ENGINE.
 * One scenario library, four levels. A level never makes the price "more random". It changes how the
 * decision is presented and how much there is to weigh: pace, how much information is shown, how much
 * explanation and help is given, how noisy and conflicted the data is, how many fake-outs the scripted
 * market contains and which order tools (sizing, adding, re-entering) the student gets.
 * Every value here is read by the other engines; nothing else in the code base branches on a level name.
 */
(function (root) {
  'use strict';
  var TYS = root.TYS = root.TYS || {};
  var LEVELS = ['beginner', 'student', 'experienced', 'advanced'];

  // Which market metrics the terminal shows at each level. Scenarios may add to (never remove from) these.
  var INFO = {
    beginner:    ['mcap', 'volume', 'buys'],
    student:     ['mcap', 'volume', 'liquidity', 'buys', 'momentum', 'social'],
    experienced: ['mcap', 'volume', 'liquidity', 'buys', 'momentum', 'social', 'velocity', 'holders', 'wallets', 'ath'],
    advanced:    ['mcap', 'volume', 'liquidity', 'buys', 'momentum', 'social', 'velocity', 'holders', 'holderGrowth', 'wallets', 'ath', 'fromAth', 'fees', 'age', 'rank']
  };

  var MODIFIERS = {
    beginner: {
      label: 'NEW TRADER', short: 'New Trader',
      tagline: "I'm still learning how trading works.",
      blurb: 'Slower markets, fewer numbers, plain-language definitions and optional hints. One idea at a time.',
      speed: 0.75, noise: 0.55, signalNoise: 0, fakeouts: 0, ambiguity: 0,
      info: INFO.beginner, explain: true, hints: true, context: true, thesisHelp: true,
      simpleActions: true, sizing: false, addToPosition: false, reentry: false, noiseMetrics: false
    },
    student: {
      label: 'TRADER U STUDENT', short: 'Trader U Student',
      tagline: "I understand the basics and I'm building consistency.",
      blurb: 'Normal speed and normal statistics. Realistic pullbacks, partial exits, no hints. You read the signals together.',
      speed: 1, noise: 1, signalNoise: 0.15, fakeouts: 0, ambiguity: 0.35,
      info: INFO.student, explain: false, hints: false, context: true, thesisHelp: false,
      simpleActions: false, sizing: true, addToPosition: false, reentry: false, noiseMetrics: false
    },
    experienced: {
      label: 'EXPERIENCED TRADER', short: 'Experienced Trader',
      tagline: 'I trade regularly and understand most of the fundamentals.',
      blurb: 'Faster markets, conflicting signals, false momentum and fake breakouts. Size your positions, add, trim and re-enter.',
      speed: 1.2, noise: 1.5, signalNoise: 0.4, fakeouts: 1, ambiguity: 0.65,
      info: INFO.experienced, explain: false, hints: false, context: false, thesisHelp: false,
      simpleActions: false, sizing: true, addToPosition: true, reentry: true, noiseMetrics: false
    },
    advanced: {
      label: 'ADVANCED', short: 'Advanced',
      tagline: 'I want the hardest version.',
      blurb: 'You know the definitions. Fast, noisy markets, competing data, extra fake-outs, more decision points and no explanations.',
      speed: 1.4, noise: 2.1, signalNoise: 0.7, fakeouts: 1.5, ambiguity: 1,
      info: INFO.advanced, explain: false, hints: false, context: false, thesisHelp: false,
      simpleActions: false, sizing: true, addToPosition: true, reentry: true, noiseMetrics: true
    }
  };

  var Difficulty = TYS.Difficulty = {
    LEVELS: LEVELS, MODIFIERS: MODIFIERS, INFO: INFO,
    index: function (level) { return Math.max(0, LEVELS.indexOf(level)); },
    isLevel: function (level) { return LEVELS.indexOf(level) !== -1; },
    mod: function (level) { return MODIFIERS[Difficulty.isLevel(level) ? level : 'student']; },
    // true when `level` is at or above `min`
    atLeast: function (level, min) { return Difficulty.index(level) >= Difficulty.index(min); },
    // an item with optional {min, max, only} level limits
    allowed: function (item, level) {
      if (!item) return false;
      if (item.only && item.only.indexOf(level) === -1) return false;
      if (item.min && !Difficulty.atLeast(level, item.min)) return false;
      if (item.max && Difficulty.index(level) > Difficulty.index(item.max)) return false;
      return true;
    },
    // Calibration: suggest a level from the student's own description and how long they have traded.
    // Never blocks the student's own choice; it only recommends when the two answers disagree strongly.
    calibrate: function (level, experience) {
      var chosen = Difficulty.isLevel(level) ? level : 'student', idx = Difficulty.index(chosen), recommended = chosen, note = '';
      if (experience === 'lt1m' && idx >= 2) { recommended = 'student'; note = 'You said you have traded for less than a month. Trader U Student is the better starting point for that. You can keep your choice.'; }
      else if (experience === '1y' && idx === 0) { recommended = 'student'; note = 'You said you have traded for over a year. Trader U Student may be a better fit. You can keep your choice.'; }
      return { chosen: chosen, recommended: recommended, differs: recommended !== chosen, note: note };
    },
    // Validation of a scenario's per-level configuration (see scenario.js).
    validateModifiers: function () {
      var issues = [];
      LEVELS.forEach(function (l) {
        var m = MODIFIERS[l];
        if (!m) { issues.push('missing modifiers for ' + l); return; }
        ['speed', 'noise'].forEach(function (k) { if (!(m[k] > 0) || !isFinite(m[k])) issues.push(l + '.' + k + ' must be a positive number'); });
        if (!m.info || !m.info.length || m.info.indexOf('mcap') === -1) issues.push(l + ' must show market cap');
      });
      for (var i = 1; i < LEVELS.length; i++) {
        if (MODIFIERS[LEVELS[i]].speed < MODIFIERS[LEVELS[i - 1]].speed) issues.push('speed must not decrease with level');
        if (MODIFIERS[LEVELS[i]].info.length < MODIFIERS[LEVELS[i - 1]].info.length) issues.push('information must not decrease with level');
      }
      return issues;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
