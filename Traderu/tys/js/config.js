/* TYS configuration: timing, storage and the order-panel confirmation copy. */
(function (root) {
  'use strict';
  var TYS = root.TYS = root.TYS || {};
  TYS.CONFIG = {
    version: 'adaptive-2',
    storageKey: 'trdu.tys.adaptive.v2',   // this build has its own key; it never reads another simulator's session
    ticksPerCandle: 12,
    unit: 1000,                 // candle numbers are $K of market cap
    candleMs: 1000,             // simulation ms per candle at speed 1
    supply: 1000000000,
    fastForward: 3,             // offered only when the student has nothing left to decide
    actionCooldownMs: 450,      // swallows accidental double-clicks
    feedbackMs: 3500,           // how long WAIT / HOLD / SELL confirmations stay on screen
    baselineCapital: 100,
    // Confirmation copy. Tokens: {cost} {entry} {mcap} {delta} {realized} {pct} {left} {open} {waits} {usd}
    feedback: {
      buy:      { title: 'POSITION OPEN', sub: '{usd} @ {mcap}' },
      add:      { title: 'ADDED', sub: '{usd} @ {mcap}. Average entry {entry}.' },
      wait:     { title: 'WAITING', sub: 'Watching for another setup.' },
      watching: { sub: 'No position. Waited {waits}x so far.' },
      pass:     { title: 'PASSED', sub: 'No position opened.' },
      hold:     { title: 'HOLDING', sub: 'Position unchanged at {mcap}.' },
      sell:     { title: 'SOLD {pct}', sub: 'Sold at {mcap}. Realized {delta}.{left}' },
      partial:  { title: '{open} STILL OPEN', sub: 'Realized {realized} so far.' },
      open:     { title: 'POSITION OPEN', sub: '{invested} @ {entry}' },
      closed:   { title: 'POSITION CLOSED', sub: 'Realized {realized}. Watch how the rest of the move plays out.' }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
