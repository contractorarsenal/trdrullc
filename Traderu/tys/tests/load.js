/* Loads every engine module into a Node global, in the same order as index.html. */
'use strict';
var path = require('path');
global.window = undefined;
var root = path.join(__dirname, '..', 'js');
['format', 'difficulty', 'config', 'market', 'portfolio', 'scenario', 'sim', 'behavior', 'session', 'replay', 'player'].forEach(function (f) {
  if (f === 'scenario') { require(path.join(root, 'scenario.js')); require(path.join(root, 'scenarios', '_common.js')); return; }
  try { require(path.join(root, f + '.js')); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND' || String(e.message).indexOf(path.join(root, f + '.js')) === -1) throw e; }
  if (f === 'sim') require('fs').readdirSync(path.join(root, 'scenarios')).filter(function (n) { return n[0] !== '_'; }).sort().forEach(function (n) { require(path.join(root, 'scenarios', n)); });
});
module.exports = globalThis.TYS;
