'use strict';
var h = module.exports = { pass: 0, fail: 0, failures: [] };
h.section = function (name) { console.log(name); };
h.ok = function (c, m) { if (c) h.pass++; else { h.fail++; h.failures.push(m); console.log('  FAIL: ' + m); } };
h.near = function (a, b, e, m) { h.ok(Math.abs(a - b) <= (e == null ? 1e-6 : e), m + ' (got ' + a + ', want ' + b + ')'); };
h.throws = function (fn, m) { var t = false; try { fn(); } catch (e) { t = true; } h.ok(t, m + ' (should throw)'); };
