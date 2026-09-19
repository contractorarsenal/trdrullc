/*
 * TEST YOUR SKILLS: scenario content.
 *
 * Everything an instructor may want to change lives in this file. The simulator
 * (engine.js / chart.js / app.js) contains no scenario numbers or copy.
 *
 * CANDLE FORMAT
 *   [open, high, low, close, volume]   all in $K of market cap (see CONFIG.unit)
 *   - `history` candles are shown on the chart before the round starts (not played).
 *   - `candles` are the live, scripted candles. Each one lasts `candleMs` of simulation time.
 *   - The first live candle should open where the last history candle closed.
 *   - Highs/lows are auto-corrected if they do not contain the open/close.
 *   - Nothing here is random. The same decisions always produce the same chart.
 *
 * BRANCHING (rounds 1 and 3)
 *   `entryZones` classify where the student bought (first match wins). A zone is matched on any of:
 *   minPrice / maxPrice ($K), from / to (candles into the round), phases (ids from `phases`).
 *   `branches` say what happens next. A branch {id, zone, reversalAt, candles} replaces the rest of the
 *   chart from the next price tick after the BUY. Its candles are RATIOS of the price at that moment
 *   (1.00 = the price the student paid). Candle 0 is the remainder of the candle the BUY happened in,
 *   the others are full candles. `reversalAt` is the candle where the drop begins (recap only).
 *   A zone with no branch just plays the main path. If the student never buys, the main path plays.
 *
 * TIMING
 *   Main path length = candles.length x candleMs. A branch adds its own candles after the BUY, so a
 *   branching round ends when its branch ends. Speed multipliers live in CONFIG.speeds.
 *
 * PHASES (optional, recap only)
 *   `phases` label stretches of the main path by candle index ({id, from, to}, `to` exclusive).
 *   The phase with `reversal: true` marks where the scripted reversal starts.
 *
 * ACTIONS
 *   Each action is {id, label, pct?, group?}. group 'entry' (buy / wait / pass) is shown while the
 *   student has no position, group 'manage' (sell / hold) once they hold one.
 *
 * FEEDBACK
 *   CONFIG.feedback holds the confirmation copy shown in the order panel. A scenario may override
 *   any key with its own `feedback`. Tokens: {cost} {entry} {mcap} {delta} {realized} {pct} {left} {open} {waits}.
 */
(function (root) {
  'use strict';
  var TYS = root.TYS = root.TYS || {};

  TYS.CONFIG = {
    version: '3',
    storageKey: 'tys.session.v3',
    supply: 1000000000,          // fictional token supply (price = market cap / supply)
    unit: 1000,                  // candle numbers are in $K
    candleMs: 1000,              // simulation ms per candle at speed 1
    ticksPerCandle: 12,          // price steps inside each candle
    speeds: { normal: 1, presenter: 0.8, dev: 12 },
    fastForward: 3,              // available only once the student has nothing left to decide
    actionCooldownMs: 450,       // ignores accidental double-clicks
    baselineCapital: 100,
    waitFeedbackMs: 3500,        // how long the WAIT / HOLD / SELL confirmation stays on screen
    feedback: {
      buy:      { title: 'POSITION OPEN', sub: '{cost} @ {entry}' },
      wait:     { title: 'WAITING', sub: 'Watching for another setup.' },
      watching: { sub: 'No position. Waited {waits}x so far.' },
      pass:     { title: 'PASSED', sub: 'No position opened.' },
      hold:     { title: 'HOLDING', sub: 'Position unchanged at {mcap}.' },
      sell:     { title: 'SOLD {pct}', sub: 'Sold at {mcap}. Realized {delta}.{left}' },
      partial:  { title: '{open} STILL OPEN', sub: 'Realized {realized} so far.' },
      closed:   { title: 'POSITION CLOSED', sub: 'Realized {realized}. Watch how the rest of the move plays out.' }
    }
  };

  TYS.SCENARIOS = [

    /* ------------------------------------------------------------------ ROUND 1 */
    {
      id: 'find-the-entry',
      eyebrow: 'ROUND 1',
      title: 'FIND THE ENTRY',
      token: { name: 'Neon Otter', ticker: '$OTTER' },
      startingCash: 100,
      startingPosition: null,
      baselineCapital: 100,
      headline: { label: 'from ATH', mcap: 100 },       // the top bar shows the change from the $100K all-time high
      levels: [{ price: 100, label: 'ATH' }],           // drawn on the chart while in view
      actions: [
        { id: 'buy', label: 'BUY', group: 'entry' },
        { id: 'wait', label: 'WAIT', group: 'entry' },
        { id: 'pass', label: 'PASS', group: 'entry' },
        { id: 'sell', pct: 0.25, label: 'SELL 25%', group: 'manage' },
        { id: 'sell', pct: 0.5,  label: 'SELL 50%', group: 'manage' },
        { id: 'sell', pct: 1,    label: 'SELL 100%', group: 'manage' }
      ],
      lockOn: ['pass'],            // PASS is final. BUY opens a position that can then be managed.
      lockWhenFlat: true,
      feedback: { wait: { sub: 'Watching for a better entry.' } },
      brief: {
        lines: [
          'This coin ran to a $100K all-time high.',
          "Now it's pulling back.",
          'Where do you want to get in?'
        ],
        setup: ['$100 simulated cash', 'No open position', 'Wait as often as you like. Pass is final.'],
        question: 'Where do you enter?'
      },
      // 30 live candles (about 30 seconds). Main path: a pullback from the ATH to about $50K, a base, then a
      // recovery to $76K.
      //   0-10  pullback    $93K -> $54K      11-16 base    ~$50K low       17-29 recovery    $54K -> $76K
      // Entries at or under ~$62K are 'zone' entries (near the low). Entries above $62K while still falling
      // are 'falling'. A BUY once the recovery is already extended (above $62K) branches to a brief
      // continuation and then a sharp reversal.
      phases: [
        { id: 'pullback', from: 0,  to: 11 },
        { id: 'base',     from: 11, to: 17 },
        { id: 'recovery', from: 17, to: 30 }
      ],
      entryZones: [
        { id: 'late',    phases: ['recovery'], minPrice: 62 },
        { id: 'zone',    maxPrice: 61.99 },
        { id: 'falling', minPrice: 62 }
      ],
      branches: [
        { id: 'late', zone: 'late', reversalAt: 2, candles: [
        [1.0000, 1.0104, 0.9985, 1.0060, 7.4000],  // 0
        [1.0060, 1.0146, 0.9983, 1.0120, 9.1000],
        [1.0120, 1.0147, 0.9604, 0.9665, 11.1000],
        [0.9665, 0.9694, 0.9129, 0.9133, 12.0000],
        [0.9133, 0.9146, 0.8813, 0.8859, 11.7000],
        [0.8859, 0.8999, 0.8852, 0.8992, 7.2000],
        [0.8992, 0.8992, 0.8448, 0.8453, 11.0000],
        [0.8453, 0.8464, 0.8003, 0.8030, 12.0000],
        [0.8030, 0.8079, 0.7675, 0.7709, 8.4000],
        [0.7709, 0.7715, 0.7413, 0.7439, 11.1000]
      ] }
      ],
      history: [
        [31.0, 32.3, 30.9, 32.0, 4.5],  // 0
        [32.0, 34.4, 31.7, 34.3, 6.0],
        [34.3, 35.3, 34.2, 35.2, 4.8],
        [35.2, 35.4, 34.9, 35.4, 4.1],
        [35.4, 38.0, 35.3, 37.9, 7.4],
        [37.9, 39.7, 37.6, 39.7, 9.6],
        [39.7, 42.8, 39.5, 42.0, 8.1],
        [42.0, 44.5, 41.9, 44.2, 7.3],
        [44.2, 45.4, 43.7, 44.8, 5.9],
        [44.8, 48.3, 44.3, 47.9, 10.0],
        [47.9, 50.4, 47.8, 50.0, 15.5],  // 10
        [50.0, 51.7, 49.6, 51.6, 9.9],
        [51.6, 55.4, 51.0, 55.0, 15.4],
        [55.0, 58.4, 54.4, 57.8, 10.2],
        [57.8, 58.5, 57.8, 58.3, 6.5],
        [58.3, 62.1, 58.2, 60.7, 10.2],
        [60.7, 64.8, 60.2, 64.5, 11.7],
        [64.5, 67.5, 64.5, 66.9, 10.1],
        [66.9, 69.1, 66.0, 68.0, 10.0],
        [68.0, 73.7, 67.3, 71.8, 13.7],
        [71.8, 74.6, 69.6, 73.8, 12.5],  // 20
        [73.8, 78.9, 73.4, 78.7, 19.9],
        [78.7, 81.8, 77.3, 81.6, 13.2],
        [81.6, 84.5, 81.2, 84.0, 12.0],
        [84.0, 85.3, 82.4, 83.1, 17.3],
        [83.1, 95.6, 82.8, 94.1, 22.9],
        [94.1, 96.2, 94.0, 96.0, 14.8],
        [96.0, 100.0, 95.0, 98.5, 12.0],
        [98.5, 98.5, 95.2, 96.0, 18.4],
        [96.0, 96.1, 92.5, 93.0, 11.9]
      ],
      candles: [
        [93.0, 93.4, 87.3, 88.0, 15.8],  // 0
        [88.0, 88.2, 82.2, 84.0, 17.0],
        [84.0, 87.5, 83.0, 86.0, 10.7],
        [86.0, 86.1, 77.1, 78.0, 20.2],
        [78.0, 78.2, 70.9, 72.0, 17.0],
        [72.0, 74.2, 70.4, 74.0, 13.4],
        [74.0, 74.5, 65.0, 66.0, 30.9],
        [66.0, 66.2, 61.7, 62.0, 16.5],
        [62.0, 62.2, 57.2, 58.0, 19.0],
        [58.0, 60.3, 57.2, 60.0, 16.1],
        [60.0, 60.2, 53.8, 54.0, 23.1],  // 10
        [54.0, 54.6, 50.8, 51.0, 18.4],
        [51.0, 52.2, 49.3, 49.5, 8.2],
        [49.5, 52.3, 49.4, 52.0, 14.9],
        [52.0, 52.5, 50.2, 50.5, 8.2],
        [50.5, 53.4, 50.3, 53.0, 10.2],
        [53.0, 55.3, 52.6, 55.0, 6.4],
        [55.0, 55.2, 53.8, 54.0, 7.4],
        [54.0, 57.5, 53.6, 57.0, 13.6],
        [57.0, 60.2, 56.6, 60.0, 9.7],
        [60.0, 60.3, 58.9, 59.0, 8.2],  // 20
        [59.0, 62.3, 58.5, 62.0, 9.4],
        [62.0, 65.3, 61.6, 65.0, 11.6],
        [65.0, 66.0, 63.5, 64.0, 7.7],
        [64.0, 68.0, 63.4, 68.0, 10.9],
        [68.0, 72.5, 67.7, 71.0, 14.5],
        [71.0, 71.2, 69.8, 70.0, 10.7],
        [70.0, 73.1, 67.8, 73.0, 10.7],
        [73.0, 75.3, 72.7, 75.0, 7.7],
        [75.0, 76.5, 74.5, 76.0, 11.0]
      ],
      reflection: {
        question: 'What information influenced your decision?',
        placeholder: 'A sentence or two is enough.',
        continueLabel: 'CONTINUE TO ROUND 2',
        fields: [
          { label: 'Your Entry', key: 'entryMcap', fmt: 'mcap' },
          { label: 'Entry Time', key: 'entryT', fmt: 'clock' },
          { label: 'Waits Before Entry', key: 'waitsBeforeEntry', fmt: 'int' },
          { label: 'All-Time High', key: 'athMcap', fmt: 'mcap' },
          { label: 'Final Market Cap', key: 'finalMcap', fmt: 'mcap' },
          { label: 'Net Result', key: 'positionPnl', fmt: 'pnl', pct: 'positionPnlPct' }
        ],
        noEntryTitle: 'No position entered.',
        noEntryFields: [
          { label: 'Waits', key: 'waitCount', fmt: 'int' },
          { label: 'Market Cap At Your Decision', key: 'decisionMcap', fmt: 'mcap', empty: 'No decision' },
          { label: 'Lowest Price', key: 'lowMcap', fmt: 'mcap' },
          { label: 'Final Market Cap', key: 'finalMcap', fmt: 'mcap' }
        ]
      },
      recap: {
        heading: 'ENTRY',
        rules: [
          // where they entered
          { when: ['entered', 'zone_zone'],    text: 'You entered at {entryT:clock} near {entryMcap:mcap}, {entryBelowAth:pct0} below the all-time high and close to the low of the pullback.' },
          { when: ['entered', 'zone_zone', 'waitedBefore'], text: 'You waited {waitsBeforeEntryText} for a better price first.' },
          { when: ['entered', 'zone_zone'],    text: 'The price stabilized and recovered to {finalMcap:mcap}, {finalVsEntryPct:pct} from your entry.' },
          { when: ['entered', 'zone_falling'], text: 'You entered at {entryT:clock} ({entryMcap:mcap}) while the price was still falling, only {entryBelowAth:pct0} below the all-time high.' },
          { when: ['entered', 'zone_falling'], text: 'The pullback kept going to {lowAfterEntry:mcap}, and the position was down as much as {troughUnrealPct:pctAbs}. The recovery later took the market cap to {finalMcap:mcap}.' },
          { when: ['entered', 'zone_late'],    text: 'You entered at {entryT:clock} ({entryMcap:mcap}) after the recovery had already extended, {entryAboveLow:pct0} above the low.' },
          { when: ['entered', 'zone_late', 'waitedBefore'], text: 'You waited {waitsBeforeEntryText} and bought once the chart looked obvious.' },
          { when: ['entered', 'zone_late'],    text: 'The move reversed almost immediately and the price finished at {finalMcap:mcap}, {finalVsEntryPct:pct} from your entry. Entering after the move has already happened leaves little room.' },
          // what they did with the position
          { when: ['entered', 'enteredNoSells', 'zone_late'], text: 'You held the full position through the reversal.' },
          { when: ['entered', 'enteredNoSells'], unless: 'zone_late', text: 'You did not sell, so the position stayed open to the end of the round.' },
          { when: ['entered', 'quickExit', 'zone_late'], text: 'You sold {secsToFirstExit} seconds after entering. Selling that quickly avoided the reversal, but the entry itself left almost no room.' },
          { when: ['entered', 'hasSells'], unless: ['quickExit'], text: 'Your first sale came {secsToFirstExit} seconds after you entered, at {firstExitMcap:mcap}.' },
          { when: 'flat',      text: 'You closed the full position at {finalExitMcap:mcap}.' },
          { when: 'stillOpen', text: 'You still held {remainingPct:pct0} of the position when the round ended.' },
          { when: 'entered',   text: 'Result: {realizedPnl:signedUsd} realized, {unrealizedPnl:signedUsd} unrealized, {positionPnl:signedUsd} in total.' },
          // passing / never entering
          { when: ['passed', 'waited'], text: 'You waited {waitText} before passing.' },
          { when: 'passed', text: 'You passed at {passT:clock} ({passMcap:mcap}). From there the price went as low as {lowAfterPass:mcap} and finished at {finalMcap:mcap}. Passing meant no exposure to the drop, and none to the recovery either.' },
          { when: ['none', 'waited'], text: 'You waited {waitText} and never entered or passed. The price fell to {lowMcap:mcap} before recovering to {finalMcap:mcap}.' },
          { when: 'none', unless: 'waited', text: 'You watched the whole move without acting.' }
        ],
        fields: [
          { label: 'Your Entry', key: 'entryMcap', fmt: 'mcap', empty: 'No entry' },
          { label: 'All-Time High', key: 'athMcap', fmt: 'mcap' },
          { label: 'Waits', key: 'waitCount', fmt: 'int' },
          { label: 'Net Result', key: 'positionPnl', fmt: 'pnl', pct: 'positionPnlPct', needsEntry: true, empty: 'No entry' }
        ]
      }
    },

    /* ------------------------------------------------------------------ ROUND 2 */
    {
      id: 'manage-the-position',
      eyebrow: 'ROUND 2',
      title: 'MANAGE THE POSITION',
      token: { name: 'Ghost Lobster', ticker: '$GLOB' },
      startingCash: 50,
      startingPosition: { costUsd: 50, entryMcap: 200000, markerCandle: 6 },
      baselineCapital: 100,
      headline: { label: 'from your entry', mcap: 200 },
      actions: [
        { id: 'sell', pct: 0.25, label: 'SELL 25%' },
        { id: 'sell', pct: 0.5,  label: 'SELL 50%' },
        { id: 'sell', pct: 1,    label: 'SELL 100%' },
        { id: 'hold', label: 'HOLD' }
      ],
      lockOn: [],
      lockWhenFlat: true,
      brief: {
        lines: [
          "You're already in this trade.",
          'You entered at a $200K market cap with $50.',
          'The market cap is now $400K.',
          "You're already up 2X."
        ],
        setup: ['$50 position, $50 cash', 'Entry: $200K market cap', 'Now: $400K market cap (+$50, +100%)'],
        question: 'What do you do now?'
      },
      // 30 live candles. One fixed path with several moments to decide:
      //   0-5 first push  $400K -> $480K     6-9 pullback  -> $432K     10-16 second push  -> $524K (new high)
      //   17-29 reversal  $524K -> $344K
      // Selling part of the position leaves the rest exposed to everything that follows.
      phases: [
        { id: 'leg1',     from: 0,  to: 6 },
        { id: 'pullback', from: 6,  to: 10 },
        { id: 'leg2',     from: 10, to: 17 },
        { id: 'reversal', from: 17, to: 30, reversal: true }
      ],
      history: [
        [172.0, 173.4, 170.2, 172.0, 5.3],  // 0
        [172.0, 177.9, 171.7, 176.5, 8.3],
        [176.5, 177.6, 176.2, 177.5, 4.9],
        [177.5, 180.9, 177.1, 180.5, 6.7],
        [180.5, 184.4, 180.3, 183.7, 7.3],
        [183.7, 196.3, 182.6, 195.5, 8.1],
        [195.5, 200.9, 195.3, 200.0, 6.3],
        [200.0, 204.2, 194.8, 203.7, 5.6],
        [203.7, 211.4, 200.7, 209.3, 11.3],
        [209.3, 222.7, 206.5, 213.9, 6.9],
        [213.9, 214.8, 212.7, 213.6, 8.1],  // 10
        [213.6, 220.5, 211.2, 218.4, 10.2],
        [218.4, 220.0, 215.2, 216.6, 8.7],
        [216.6, 217.4, 211.1, 214.1, 5.7],
        [214.1, 233.9, 211.6, 232.0, 12.9],
        [232.0, 245.0, 231.4, 245.0, 10.7],
        [245.0, 249.0, 244.9, 248.5, 7.1],
        [248.5, 256.0, 248.3, 254.4, 8.9],
        [254.4, 261.6, 252.2, 261.1, 8.7],
        [261.1, 261.4, 236.8, 243.0, 14.6],
        [243.0, 266.0, 233.2, 263.7, 12.8],  // 20
        [263.7, 283.5, 262.5, 282.8, 11.6],
        [282.8, 290.7, 280.9, 290.0, 8.9],
        [290.0, 295.4, 289.4, 294.9, 9.3],
        [294.9, 297.3, 293.4, 297.0, 11.3],
        [297.0, 299.0, 295.1, 298.9, 12.1],
        [298.9, 317.2, 296.7, 316.6, 14.9],
        [316.6, 317.5, 288.9, 289.8, 17.6],
        [289.8, 310.1, 286.9, 307.9, 12.5],
        [307.9, 322.8, 307.7, 320.8, 16.0],
        [320.8, 332.9, 320.5, 332.0, 11.1],  // 30
        [332.0, 337.8, 325.6, 335.6, 7.9],
        [335.6, 343.4, 322.5, 327.6, 13.0],
        [327.6, 340.7, 327.1, 340.4, 16.4],
        [340.4, 344.5, 331.5, 333.8, 13.5],
        [333.8, 343.3, 330.7, 342.4, 10.3],
        [342.4, 365.3, 341.8, 360.2, 14.4],
        [360.2, 371.1, 358.6, 365.6, 10.2],
        [365.6, 386.0, 363.1, 384.0, 20.9],
        [384.0, 400.3, 380.2, 398.2, 18.7],
        [398.2, 407.2, 371.4, 372.7, 17.6],  // 40
        [372.7, 391.8, 368.6, 387.9, 13.6],
        [387.9, 398.3, 379.1, 394.8, 12.3],
        [394.8, 401.6, 394.3, 400.0, 13.5]
      ],
      candles: [
        [400.0, 410.6, 395.7, 410.0, 10.8],  // 0
        [410.0, 428.4, 410.0, 425.0, 15.2],
        [425.0, 440.7, 421.6, 440.0, 14.6],
        [440.0, 457.0, 426.2, 455.0, 15.3],
        [455.0, 468.8, 451.7, 468.0, 14.7],
        [468.0, 488.3, 451.5, 480.0, 19.1],
        [480.0, 480.3, 459.3, 468.0, 23.4],
        [468.0, 472.8, 449.9, 452.0, 21.0],
        [452.0, 459.9, 439.0, 440.0, 18.5],
        [440.0, 444.7, 430.3, 432.0, 19.0],
        [432.0, 442.0, 431.5, 440.0, 13.2],  // 10
        [440.0, 458.9, 436.3, 452.0, 19.1],
        [452.0, 471.3, 444.8, 468.0, 21.7],
        [468.0, 488.0, 467.8, 486.0, 19.7],
        [486.0, 500.3, 481.1, 500.0, 15.6],
        [500.0, 514.1, 486.7, 512.0, 24.1],
        [512.0, 528.3, 511.5, 524.0, 15.5],
        [524.0, 526.6, 502.1, 512.0, 22.6],
        [512.0, 514.5, 489.6, 490.0, 21.9],
        [490.0, 490.6, 463.5, 468.0, 28.5],
        [468.0, 473.5, 444.5, 452.0, 34.6],  // 20
        [452.0, 453.9, 428.6, 440.0, 33.3],
        [440.0, 444.3, 419.6, 425.0, 22.4],
        [425.0, 426.6, 400.6, 405.0, 22.6],
        [405.0, 414.9, 387.0, 388.0, 29.8],
        [388.0, 388.5, 370.1, 372.0, 20.2],
        [372.0, 373.1, 350.8, 360.0, 27.3],
        [360.0, 362.8, 351.1, 352.0, 18.9],
        [352.0, 354.5, 342.4, 347.0, 21.0],
        [347.0, 352.4, 340.9, 344.0, 17.5]
      ],
      reflection: {
        question: 'What changed between the peak and your final decision?',
        placeholder: 'A sentence or two is enough.',
        continueLabel: 'CONTINUE TO ROUND 3',
        fields: [
          { label: 'Entry Market Cap', key: 'startEntryMcap', fmt: 'mcap' },
          { label: 'Peak Market Cap', key: 'peakMcap', fmt: 'mcap' },
          { label: 'First Exit', key: 'firstExitMcap', fmt: 'mcap', empty: 'None' },
          { label: 'Final Exit', key: 'finalExitMcap', fmt: 'mcap', empty: 'None' },
          { label: 'Peak Position Value', key: 'peakPositionValue', fmt: 'usd' },
          { label: 'Final Portfolio Value', key: 'totalValue', fmt: 'usd' },
          { label: 'Realized P&L', key: 'realizedPnl', fmt: 'pnl' },
          { label: 'Unrealized P&L', key: 'unrealizedPnl', fmt: 'pnl' }
        ]
      },
      recap: {
        heading: 'MANAGING THE POSITION',
        rules: [
          { when: 'noSells', text: 'You held the entire position through both pushes and the reversal. It was worth {peakPositionValue:usd} at its peak and {positionValue:usd} at the end.' },
          { when: 'firstSell_leg1',     text: 'You took your first profit during the first push, at {firstExitMcap:mcap}.' },
          { when: 'firstSell_pullback', text: 'Your first sale came during the pullback, at {firstExitMcap:mcap}.' },
          { when: 'firstSell_leg2',     text: 'Your first sale came during the second push, at {firstExitMcap:mcap}.' },
          { when: 'firstSell_reversal', text: 'Your first sale came after the second push had already reversed, at {firstExitMcap:mcap}.' },
          { when: 'soldBeforePeak',     text: 'You reduced {soldBeforePeakPct:pct0} of the position before the scenario peak.' },
          { when: 'flat',               text: 'You closed the full position at {finalExitMcap:mcap}. After that the market cap reached as high as {highAfterFinalExit:mcap} and finished at {finalMcap:mcap}.' },
          { when: 'stillOpen',          text: 'You still held {remainingPct:pct0} of the position when the scenario ended.' },
          { when: 'hasSells',           text: 'Result: {realizedPnl:signedUsd} realized, {unrealizedPnl:signedUsd} unrealized.' }
        ],
        fields: [
          { label: 'First Reduction', key: 'firstExitMcap', fmt: 'mcap', empty: 'None' },
          { label: 'Peak Position Value', key: 'peakPositionValue', fmt: 'usd' },
          { label: 'Final Position Value', key: 'positionValue', fmt: 'usd' }
        ]
      }
    },

    /* ------------------------------------------------------------------ ROUND 3 */
    {
      id: 'control-the-fomo',
      eyebrow: 'ROUND 3',
      title: 'CONTROL THE FOMO',
      token: { name: 'Turbo Walrus', ticker: '$WALRUS' },
      startingCash: 100,
      startingPosition: null,
      baselineCapital: 100,
      actions: [
        { id: 'buy', label: 'BUY', group: 'entry' },
        { id: 'wait', label: 'WAIT', group: 'entry' },
        { id: 'pass', label: 'PASS', group: 'entry' },
        { id: 'sell', pct: 0.25, label: 'SELL 25%', group: 'manage' },
        { id: 'sell', pct: 0.5,  label: 'SELL 50%', group: 'manage' },
        { id: 'sell', pct: 1,    label: 'SELL 100%', group: 'manage' }
      ],
      lockOn: ['pass'],
      lockWhenFlat: true,
      brief: {
        lines: [
          'This coin is already running.',
          'Green candles. Momentum. Everyone is talking about it.',
          "You don't have a position yet."
        ],
        setup: ['$100 simulated cash', 'No open position', 'Wait as often as you like. Pass is final.'],
        question: 'What do you do?'
      },
      // Main path: 26 candles of strong, tempting upside ($170K -> $372K). While the student WAITS or PASSES it
      // keeps climbing to the end. A BUY branches into a very brief continuation and then a reversal that
      // keeps falling for the rest of the branch. The later the BUY, the shorter the continuation.
      //   early    (BUY in the first 6 candles)   4 candles of small green, then about -25%   (18 candles)
      //   mid      (BUY at 6-16 candles)          2 candles of small green, then about -27%   (14 candles)
      //   extended (BUY after 16 candles)         about +0.2%, then an immediate drop, -28%   (10 candles)
      entryZones: [
        { id: 'early',    to: 6 },
        { id: 'mid',      to: 16 },
        { id: 'extended' }
      ],
      branches: [
        { id: 'early',    zone: 'early',    reversalAt: 4, candles: [
        [1.0000, 1.0141, 0.9958, 1.0050, 35.2000],  // 0
        [1.0050, 1.0153, 1.0007, 1.0130, 23.3000],
        [1.0130, 1.0197, 0.9964, 1.0191, 31.9000],
        [1.0191, 1.0258, 1.0149, 1.0222, 23.3000],
        [1.0222, 1.0223, 0.9783, 0.9864, 34.2000],
        [0.9864, 0.9908, 0.9399, 0.9469, 38.8000],
        [0.9469, 0.9490, 0.9170, 0.9233, 21.9000],
        [0.9233, 0.9413, 0.9218, 0.9325, 26.4000],
        [0.9325, 0.9379, 0.8822, 0.8905, 33.3000],
        [0.8905, 0.8977, 0.8528, 0.8594, 27.1000],
        [0.8594, 0.8612, 0.8334, 0.8336, 23.4000],  // 10
        [0.8336, 0.8423, 0.8124, 0.8128, 22.7000],
        [0.8128, 0.8195, 0.7909, 0.7965, 27.7000],
        [0.7965, 0.8019, 0.7715, 0.7845, 29.6000],
        [0.7845, 0.7915, 0.7715, 0.7767, 23.4000],
        [0.7767, 0.7865, 0.7712, 0.7806, 19.7000],
        [0.7806, 0.7812, 0.7635, 0.7650, 21.3000],
        [0.7650, 0.7718, 0.7529, 0.7535, 33.4000]
      ] },
        { id: 'mid',      zone: 'mid',      reversalAt: 2, candles: [
        [1.0000, 1.0080, 0.9993, 1.0040, 19.9000],  // 0
        [1.0040, 1.0179, 1.0004, 1.0100, 25.7000],
        [1.0100, 1.0176, 0.9647, 0.9696, 49.4000],
        [0.9696, 0.9741, 0.9196, 0.9260, 35.9000],
        [0.9260, 0.9275, 0.8941, 0.8982, 28.9000],
        [0.8982, 0.9085, 0.8961, 0.9072, 25.0000],
        [0.9072, 0.9078, 0.8596, 0.8618, 41.9000],
        [0.8618, 0.8623, 0.8268, 0.8274, 56.6000],
        [0.8274, 0.8278, 0.7906, 0.7984, 45.3000],
        [0.7984, 0.8028, 0.7722, 0.7744, 33.1000],
        [0.7744, 0.7763, 0.7536, 0.7551, 32.0000],  // 10
        [0.7551, 0.7554, 0.7360, 0.7400, 28.8000],
        [0.7400, 0.7463, 0.7384, 0.7437, 23.7000],
        [0.7437, 0.7473, 0.7275, 0.7288, 41.2000]
      ] },
        { id: 'extended', zone: 'extended', reversalAt: 1, candles: [
        [1.0000, 1.0073, 0.9926, 1.0020, 27.2000],  // 0
        [1.0020, 1.0048, 0.9595, 0.9619, 44.5000],
        [0.9619, 0.9678, 0.9117, 0.9138, 46.6000],
        [0.9138, 0.9144, 0.8807, 0.8818, 37.3000],
        [0.8818, 0.8977, 0.8805, 0.8924, 42.1000],
        [0.8924, 0.8954, 0.8351, 0.8389, 49.6000],
        [0.8389, 0.8503, 0.7943, 0.7969, 39.4000],
        [0.7969, 0.8008, 0.7629, 0.7651, 58.1000],
        [0.7651, 0.7665, 0.7359, 0.7383, 58.5000],
        [0.7383, 0.7387, 0.7139, 0.7161, 46.7000]
      ] }
      ],
      history: [
        [52.0, 56.0, 51.6, 55.0, 8.3],  // 0
        [55.0, 63.8, 54.5, 62.0, 21.2],
        [62.0, 69.6, 62.0, 68.0, 16.9],
        [68.0, 71.4, 67.4, 71.0, 13.5],
        [71.0, 76.7, 70.3, 76.2, 14.3],
        [76.2, 79.7, 76.0, 79.5, 11.9],
        [79.5, 90.2, 77.0, 88.0, 21.4],
        [88.0, 94.3, 86.4, 94.1, 24.9],
        [94.1, 101.0, 91.7, 100.4, 19.1],
        [100.4, 108.0, 99.7, 108.0, 22.6],
        [108.0, 111.4, 107.4, 110.6, 21.2],  // 10
        [110.6, 121.4, 110.2, 120.3, 29.4],
        [120.3, 127.4, 119.2, 127.0, 24.6],
        [127.0, 129.8, 126.6, 129.3, 20.5],
        [129.3, 137.9, 126.7, 136.8, 23.5],
        [136.8, 147.6, 134.9, 146.0, 28.8],
        [146.0, 148.5, 144.9, 147.7, 22.4],
        [147.7, 153.6, 145.7, 152.1, 24.4],
        [152.1, 159.1, 151.4, 157.0, 23.5],
        [157.0, 163.3, 156.2, 161.7, 24.3],
        [161.7, 164.0, 160.6, 160.7, 21.9],  // 20
        [160.7, 163.7, 157.8, 163.0, 22.0],
        [163.0, 170.0, 162.1, 165.6, 22.5],
        [165.6, 172.1, 164.1, 170.0, 25.1]
      ],
      candles: [
        [170.0, 174.0, 169.1, 174.0, 19.8],  // 0
        [174.0, 179.5, 173.0, 179.0, 28.5],
        [179.0, 185.1, 178.4, 185.0, 26.7],
        [185.0, 187.2, 181.2, 183.0, 25.5],
        [183.0, 190.7, 182.8, 190.0, 31.1],
        [190.0, 197.8, 188.5, 197.0, 46.6],
        [197.0, 205.0, 197.0, 204.0, 28.7],
        [204.0, 212.6, 203.5, 212.0, 27.9],
        [212.0, 212.9, 207.4, 208.0, 33.1],
        [208.0, 217.6, 207.2, 217.0, 36.0],
        [217.0, 226.1, 216.4, 226.0, 52.5],  // 10
        [226.0, 238.0, 224.7, 236.0, 39.5],
        [236.0, 236.4, 232.9, 233.0, 34.1],
        [233.0, 244.0, 228.5, 244.0, 51.1],
        [244.0, 259.6, 243.9, 256.0, 47.9],
        [256.0, 270.5, 252.3, 268.0, 37.8],
        [268.0, 271.4, 260.6, 262.0, 38.3],
        [262.0, 274.3, 261.9, 274.0, 43.1],
        [274.0, 288.0, 268.4, 288.0, 50.6],
        [288.0, 302.7, 287.7, 301.0, 47.8],
        [301.0, 306.5, 297.5, 298.0, 35.0],  // 20
        [298.0, 312.5, 295.0, 312.0, 56.7],
        [312.0, 328.3, 306.4, 326.0, 54.9],
        [326.0, 341.4, 324.0, 341.0, 46.9],
        [341.0, 357.3, 339.4, 356.0, 44.4],
        [356.0, 377.2, 355.9, 372.0, 49.7]
      ],
      reflection: {
        question: 'What made you enter, wait, or pass?',
        placeholder: 'A sentence or two is enough.',
        continueLabel: 'SEE YOUR DECISIONS',
        fields: [
          { label: 'Your Entry', key: 'entryMcap', fmt: 'mcap' },
          { label: 'Entry Time', key: 'entryT', fmt: 'clock' },
          { label: 'Waits Before Entry', key: 'waitsBeforeEntry', fmt: 'int' },
          { label: 'Lowest After Entry', key: 'lowAfterEntry', fmt: 'mcap' },
          { label: 'Final Market Cap', key: 'finalMcap', fmt: 'mcap' },
          { label: 'Net Result', key: 'positionPnl', fmt: 'pnl', pct: 'positionPnlPct' }
        ],
        noEntryTitle: 'No position entered.',
        noEntryFields: [
          { label: 'Waits', key: 'waitCount', fmt: 'int' },
          { label: 'Market Cap When First Shown', key: 'firstShownMcap', fmt: 'mcap' },
          { label: 'Highest Price', key: 'peakMcap', fmt: 'mcap' },
          { label: 'Final Market Cap', key: 'finalMcap', fmt: 'mcap' }
        ]
      },
      recap: {
        heading: 'FOMO',
        rules: [
          // entered
          { when: ['entered', 'waitedBefore'], text: 'You watched the move climb, waited {waitsBeforeEntryText}, and eventually entered at {entryT:clock} ({entryMcap:mcap}), {entryFromStartPct:pct0} above where the round started.' },
          { when: ['entered', 'noWaitBefore'], text: 'You entered at {entryT:clock} ({entryMcap:mcap}), {entryFromStartPct:pct0} above where the round started, without waiting.' },
          { when: ['entered', 'zone_mid'],      text: 'The move was already extended when you bought. The problem was not the coin. It was where you entered.' },
          { when: ['entered', 'zone_extended'], text: 'The move was very extended when you bought. The problem was not the coin. It was where you entered.' },
          { when: ['entered', 'zone_early'],    text: 'You entered early in the run-up, but the move still reversed. Being early did not remove the need for an exit plan.' },
          { when: 'entered', text: 'The price turned right after your entry and fell to {lowAfterEntry:mcap}. The position was down as much as {troughUnrealPct:pctAbs}.' },
          // exits
          { when: ['entered', 'enteredNoSells'], text: 'You did not sell while the position lost value.' },
          { when: ['entered', 'quickExit'], text: 'You exited {secsToFirstExit} seconds after entering.' },
          { when: ['entered', 'hasSells'], unless: 'quickExit', text: 'You started selling {secsToFirstExit} seconds after entering, at {firstExitMcap:mcap}.' },
          { when: 'flat',      text: 'You closed the full position at {finalExitMcap:mcap}.' },
          { when: 'stillOpen', text: 'You still held {remainingPct:pct0} of the position when the round ended.' },
          { when: 'entered',   text: 'Result: {realizedPnl:signedUsd} realized, {unrealizedPnl:signedUsd} unrealized, {positionPnl:signedUsd} in total.' },
          // did not enter
          { when: ['passed', 'waited'], text: 'You kept waiting while the chart climbed, then passed at {passT:clock}. You missed the move, but you also avoided chasing an extended entry.' },
          { when: ['passed'], unless: 'waited', text: 'You passed at {passT:clock} while the chart kept climbing. You missed the move, but you also avoided chasing an extended entry.' },
          { when: ['none', 'waited'], text: 'You kept waiting while the chart climbed and never entered. You missed the move, but you also avoided chasing an extended entry.' },
          { when: ['none'], unless: 'waited', text: 'You watched the move climb without acting. You missed it, and you also avoided chasing an extended entry.' },
          { when: 'notEntered', text: 'The market cap climbed {moveSinceStartPct:pct0} during the round. You do not have to catch every move.' }
        ],
        fields: [
          { label: 'Your Entry', key: 'entryMcap', fmt: 'mcap', empty: 'No entry' },
          { label: 'Waits', key: 'waitCount', fmt: 'int' },
          { label: 'Final Market Cap', key: 'finalMcap', fmt: 'mcap' },
          { label: 'Net Result', key: 'positionPnl', fmt: 'pnl', pct: 'positionPnlPct', needsEntry: true, empty: 'No entry' }
        ]
      }
    }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
