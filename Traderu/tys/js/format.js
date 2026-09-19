/* TYS shared formatting helpers. Pure. */
(function (root) {
  'use strict';
  var TYS = root.TYS = root.TYS || {};
  function num(v, d) { v = +v; return isFinite(v) ? v : (d || 0); }
  function commas(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  var fmt = TYS.fmt = {
    num: num,
    mcap: function (v) {
      v = num(v);
      if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
      if (v >= 1000) return '$' + (Math.round(v / 100) / 10).toFixed(1).replace(/\.0$/, '') + 'K';
      return '$' + Math.round(v);
    },
    usd: function (v) {
      v = num(v); if (Math.abs(v) < 0.005) v = 0;
      var s = Math.abs(v).toFixed(2).split('.');
      return (v < 0 ? '-' : '') + '$' + commas(s[0]) + '.' + s[1];
    },
    usd0: function (v) {           // "$100" when whole, "$100.50" otherwise
      v = num(v);
      return Math.abs(v - Math.round(v)) < 0.005 ? (v < 0 ? '-$' : '$') + commas(Math.abs(Math.round(v))) : fmt.usd(v);
    },
    signedUsd: function (v) {
      v = num(v); if (Math.abs(v) < 0.005) v = 0;
      var s = Math.abs(v).toFixed(2).split('.');
      return (v < 0 ? '-' : '+') + '$' + commas(s[0]) + '.' + s[1];
    },
    pct: function (f) { f = num(f); if (Math.abs(f) < 0.0005) f = 0; return (f < 0 ? '-' : '+') + Math.abs(f * 100).toFixed(1) + '%'; },
    pct0: function (f) { return Math.round(num(f) * 100) + '%'; },
    pctAbs: function (f) { return Math.abs(num(f) * 100).toFixed(1) + '%'; },
    int: function (v) { return String(Math.round(num(v))); },
    times: function (n) { return n === 1 ? 'once' : n === 2 ? 'twice' : n + ' times'; },
    ratio: function (v) { return (Math.round(num(v) * 100) / 100) + '\u00d7'; },
    volume: function (v) { v = num(v); return v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : '$' + Math.round(v / 1000) + 'K'; },
    price: function (v) { v = num(v); return '$' + (v < 0.01 ? v.toFixed(7) : v.toFixed(4)); },
    clock: function (ms) { var s = Math.floor(Math.max(0, num(ms)) / 1000); return (s < 600 ? '0' : '') + Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60); },
    pnl: function (v, p) { return fmt.signedUsd(v) + (p == null ? '' : ' (' + fmt.pct(p) + ')'); },
    list: function (a) { a = a.slice(); if (a.length < 2) return a.join(''); var last = a.pop(); return a.join(', ') + ' and ' + last; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
