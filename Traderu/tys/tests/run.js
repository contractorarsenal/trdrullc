'use strict';
/* Run with:  node tys/tests/run.js   (no dependencies, no browser, no waiting: playback uses fake time) */
var fs = require('fs'), path = require('path'), h = require('./harness');
fs.readdirSync(__dirname).filter(function (f) { return /\.test\.js$/.test(f); }).sort().forEach(function (f) { console.log('\n# ' + f); require(path.join(__dirname, f)); });
console.log('\n' + h.pass + ' passed, ' + h.fail + ' failed');
process.exit(h.fail ? 1 : 0);
