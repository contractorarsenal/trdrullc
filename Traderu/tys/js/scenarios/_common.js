/* Shared building blocks for scenario files. Pure data helpers, no behaviour. */
(function (root) {
  'use strict';
  var TYS = root.TYS = root.TYS || {};
  TYS.Scenarios.common = {
    // BUY / WAIT / PASS. New traders and students get one simple BUY (all cash); experienced and advanced
    // traders choose a size and can add to a position.
    entry: function (o) {
      o = o || {};
      return [
        { id: 'buy', label: 'BUY', size: 'max', max: 'student' },
        { id: 'buy', label: 'BUY 50%', pct: 0.5, min: 'experienced' },
        { id: 'buy', label: 'BUY MAX', size: 'max', min: 'experienced' },
        { id: 'wait', label: 'WAIT' },
        { id: 'pass', label: o.pass || 'PASS' }
      ];
    },
    sells: function () {
      return [
        { id: 'sell', label: 'SELL 25%', pct: 0.25, min: 'student' },
        { id: 'sell', label: 'SELL 50%', pct: 0.5 },
        { id: 'sell', label: 'SELL 100%', pct: 1 }
      ];
    },
    // a market's early history: a climb to a known level, used to give the chart context
    climb: function (seed, from, to, n, extra) {
      var wp = [[0, from], [Math.round(n * 0.3), from + (to - from) * 0.28], [Math.round(n * 0.6), from + (to - from) * 0.62], [n - 1, to]];
      var o = { seed: seed, open: from * 0.97, n: n, waypoints: wp, sigma: 1.6, wick: 0.6, vol: [[0, 4], [n - 1, 14]], shocks: [[Math.round(n * 0.2), -3], [Math.round(n * 0.45), -3.5], [Math.round(n * 0.75), -2.5]] };
      for (var k in (extra || {})) o[k] = extra[k];
      return o;
    },
    closes: function (arr) { return arr.map(function (v, i) { return [i, v]; }); }
  };
})(typeof window !== 'undefined' ? window : globalThis);
