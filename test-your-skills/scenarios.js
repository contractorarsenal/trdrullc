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
 *   - The market path is fixed data. Nothing here is random, and nothing reacts to the user's clicks.
 *
 * TIMING
 *   Scenario length = candles.length x candleMs (per scenario, falling back to CONFIG.candleMs).
 *   Playback speed multipliers live in CONFIG.speeds (?presenter=true and ?speed=dev use them).
 *
 * STATS
 *   `stats` are keyframes at candle indexes. Numbers interpolate between keyframes; `momentum`
 *   steps to the label of the latest keyframe. volume/liquidity are $K, buys is % of trades that are buys.
 *
 * EVENTS
 *   Lines that appear in the market feed when the clock reaches candle index `at`.
 *
 * PHASES (optional, used only by the recap)
 *   `phases` label stretches of the scripted path by candle index ({id, from, to}, `to` exclusive).
 *   The phase with `reversal: true` marks where the scripted reversal starts. The recap uses the
 *   phase a decision was made in. Phases are never shown during play and never change the market.
 *
 * ACTIONS
 *   Each action is {id, label, pct?, group?}. group 'entry' (buy / wait / pass) is shown while the
 *   user has no position, group 'manage' (sell / hold) once they hold one. Defaults: buy, wait and
 *   pass are 'entry', sell and hold are 'manage'.
 *
 * FEEDBACK
 *   CONFIG.feedback holds the confirmation copy shown in the order panel. A scenario may override
 *   any key with its own `feedback`. Tokens: {entry} {mcap} {delta} {realized} {pct} {waits}.
 */
(function (root) {
  'use strict';
  var TYS = root.TYS = root.TYS || {};

  TYS.CONFIG = {
    version: '2',
    storageKey: 'tys.session.v2',
    supply: 1000000000,          // fictional token supply (price = market cap / supply)
    unit: 1000,                  // candle numbers are in $K
    candleMs: 1000,              // simulation ms per candle at speed 1
    ticksPerCandle: 12,          // price steps inside each candle
    speeds: { normal: 1, presenter: 0.8, dev: 12 },
    fastForward: 3,              // available only after the user's decision is locked
    actionCooldownMs: 450,       // ignores accidental double-clicks
    baselineCapital: 100,
    waitFeedbackMs: 3500,        // how long the WAIT / HOLD / SELL confirmation stays on screen
    feedback: {
      buy:     { title: 'POSITION OPEN', sub: 'Entry: {entry}' },
      wait:    { title: 'WAITING', sub: 'No entry. Watching for more confirmation.' },
      watching:{ sub: 'No position. Waited {waits}x so far.' },
      pass:    { title: 'PASSED', sub: 'You chose not to enter this setup.' },
      hold:    { title: 'HOLDING', sub: 'Position unchanged at {mcap}.' },
      sell:    { title: 'SOLD {pct}', sub: 'Sold at {mcap}. Realized {delta}.' },
      closed:  { title: 'POSITION CLOSED', sub: 'Realized {realized}. Watch how the rest of the move plays out.' }
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
      actions: [
        { id: 'buy', label: 'BUY', group: 'entry' },
        { id: 'wait', label: 'WAIT', group: 'entry' },
        { id: 'pass', label: 'PASS', group: 'entry' },
        { id: 'sell', pct: 0.25, label: 'SELL 25%', group: 'manage' },
        { id: 'sell', pct: 0.5,  label: 'SELL 50%', group: 'manage' },
        { id: 'sell', pct: 1,    label: 'SELL 100%', group: 'manage' }
      ],
      lockOn: ['pass'],            // PASS is final. BUY opens a position that can then be managed.
      lockWhenFlat: true,          // once the position is fully sold the round's decisions are done
      brief: {
        lines: [
          'You just found a coin.',
          "It's trading around a $100K market cap.",
          "There's some buying activity.",
          "The setup isn't obvious yet."
        ],
        setup: ['$100 simulated cash', 'No open position', 'Wait as often as you like. Pass is final.'],
        question: 'What do you do?'
      },
      // Fixed path, 60 candles (1 candle = 1 second at normal speed):
      //   0-17  early / unclear   ~$93K-$104K, choppy, a dip to ~$93K around 00:10
      //   18-35 developing        $104K -> $160K, volume and social building, pullbacks at 00:23 and 00:28
      //   36-45 FOMO              $160K -> $290K (peak print $300K in candle 45), large green candles
      //   46-59 reversal          $290K -> $106K, heavy sells, one dead-cat bounce at 00:51
      // The same candles play for every user. Nothing here reacts to BUY, WAIT, PASS or SELL.
      phases: [
        { id: 'early',      from: 0,  to: 18 },
        { id: 'developing', from: 18, to: 36 },
        { id: 'fomo',       from: 36, to: 46 },
        { id: 'reversal',   from: 46, to: 60, reversal: true }
      ],
      history: [
        [96.0, 97.5, 95.9, 97.0, 2.1],  // 0
        [97.0, 97.8, 96.5, 97.6, 1.9],
        [97.6, 97.7, 95.8, 95.9, 2.1],
        [95.9, 96.0, 94.7, 95.1, 1.9],
        [95.1, 95.2, 94.9, 95.0, 1.7],
        [95.0, 95.1, 94.6, 95.0, 2.9],
        [95.0, 97.1, 94.8, 96.2, 2.1],
        [96.2, 97.1, 96.0, 96.8, 1.7],
        [96.8, 98.2, 96.2, 97.6, 1.9],
        [97.6, 98.7, 97.0, 98.3, 2.1],
        [98.3, 99.5, 98.1, 99.0, 4.2],  // 10
        [99.0, 99.1, 97.9, 98.3, 2.5],
        [98.3, 99.2, 97.7, 98.9, 3.3],
        [98.9, 100.5, 98.3, 100.0, 2.1],
        [100.0, 100.5, 100.0, 100.4, 1.7],
        [100.4, 101.6, 99.9, 100.0, 2.0]
      ],
      candles: [
        [100.0, 100.9, 99.9, 100.0, 3.5],  // 0
        [100.0, 101.8, 99.6, 101.5, 2.3],
        [101.5, 103.4, 101.3, 103.0, 3.4],
        [103.0, 103.0, 100.6, 100.7, 3.4],
        [100.7, 101.9, 100.6, 101.4, 2.2],
        [101.4, 101.5, 99.5, 100.0, 2.9],
        [100.0, 100.3, 95.9, 96.9, 3.6],
        [96.9, 97.4, 94.8, 95.2, 4.4],
        [95.2, 95.6, 93.7, 94.0, 4.4],
        [94.0, 94.2, 93.9, 94.0, 2.1],
        [94.0, 94.3, 93.2, 93.5, 3.4],  // 10
        [93.5, 96.8, 93.3, 96.3, 4.6],
        [96.3, 97.2, 96.1, 97.0, 2.3],
        [97.0, 99.7, 96.5, 99.4, 3.9],
        [99.4, 100.2, 98.4, 99.1, 2.4],
        [99.1, 102.6, 98.9, 102.0, 3.3],
        [102.0, 102.9, 101.5, 101.9, 2.9],
        [101.9, 104.2, 101.8, 104.0, 3.0],
        [104.0, 108.9, 103.5, 108.1, 5.1],
        [108.1, 111.2, 107.9, 110.2, 5.9],
        [110.2, 111.2, 110.1, 111.0, 4.3],  // 20
        [111.0, 116.2, 110.4, 115.6, 10.1],
        [115.6, 122.6, 115.2, 121.0, 9.1],
        [121.0, 121.1, 114.5, 114.7, 10.0],
        [114.7, 117.8, 114.6, 117.0, 10.0],
        [117.0, 120.2, 116.6, 120.0, 7.8],
        [120.0, 127.2, 119.5, 126.7, 13.8],
        [126.7, 131.5, 125.9, 131.0, 10.8],
        [131.0, 131.4, 129.3, 130.2, 10.9],
        [130.2, 139.8, 130.1, 138.5, 16.4],
        [138.5, 140.2, 137.2, 139.0, 9.8],  // 30
        [139.0, 142.4, 138.8, 140.3, 13.3],
        [140.3, 140.7, 138.4, 140.0, 8.5],
        [140.0, 144.7, 139.7, 143.6, 13.9],
        [143.6, 154.0, 141.9, 153.0, 23.1],
        [153.0, 161.1, 151.1, 160.0, 19.7],
        [160.0, 168.4, 159.5, 166.5, 16.5],
        [166.5, 182.8, 164.4, 182.0, 28.7],
        [182.0, 205.4, 181.4, 204.3, 37.3],
        [204.3, 214.5, 200.3, 212.0, 33.5],
        [212.0, 217.1, 211.4, 215.2, 18.9],  // 40
        [215.2, 238.2, 209.1, 236.0, 52.5],
        [236.0, 239.1, 229.2, 231.9, 22.9],
        [231.9, 262.9, 230.7, 262.0, 53.8],
        [262.0, 287.2, 251.2, 278.6, 44.9],
        [278.6, 300.0, 269.8, 290.0, 38.6],
        [290.0, 295.5, 269.2, 272.0, 55.3],
        [272.0, 278.5, 233.0, 240.0, 67.9],
        [240.0, 243.8, 210.1, 212.0, 59.2],
        [212.0, 212.7, 188.9, 192.4, 56.1],
        [192.4, 192.7, 175.4, 178.0, 42.1],  // 50
        [178.0, 187.2, 173.2, 187.0, 38.0],
        [187.0, 187.2, 154.9, 155.8, 62.1],
        [155.8, 156.0, 148.3, 150.0, 34.0],
        [150.0, 155.0, 148.4, 152.3, 17.8],
        [152.3, 153.7, 137.2, 138.0, 41.6],
        [138.0, 139.2, 127.1, 128.6, 25.2],
        [128.6, 129.5, 120.0, 121.0, 22.5],
        [121.0, 122.3, 113.9, 114.1, 18.1],
        [114.1, 115.1, 105.3, 106.0, 18.3]
      ],
      stats: [
        { at: 0,  volume: 95,   liquidity: 32, buys: 51, social: 8,   momentum: 'LOW' },
        { at: 8,  volume: 105,  liquidity: 31, buys: 46, social: 10,  momentum: 'LOW' },
        { at: 14, volume: 135,  liquidity: 33, buys: 53, social: 22,  momentum: 'LOW' },
        { at: 18, volume: 200,  liquidity: 38, buys: 57, social: 45,  momentum: 'BUILDING' },
        { at: 26, volume: 430,  liquidity: 48, buys: 62, social: 95,  momentum: 'BUILDING' },
        { at: 30, volume: 580,  liquidity: 56, buys: 64, social: 140, momentum: 'HIGH' },
        { at: 36, volume: 840,  liquidity: 66, buys: 68, social: 230, momentum: 'HIGH' },
        { at: 40, volume: 1200, liquidity: 76, buys: 74, social: 380, momentum: 'EXTREME' },
        { at: 45, volume: 1680, liquidity: 92, buys: 78, social: 520, momentum: 'EXTREME' },
        { at: 47, volume: 1800, liquidity: 84, buys: 40, social: 420, momentum: 'FADING' },
        { at: 50, volume: 1920, liquidity: 70, buys: 27, social: 300, momentum: 'WEAKENING' },
        { at: 59, volume: 2050, liquidity: 52, buys: 24, social: 150, momentum: 'WEAKENING' }
      ],
      events: [
        { at: 0,  text: 'New pair spotted. Market cap around $100K.' },
        { at: 4,  text: 'A few small buys. Nothing decisive yet.' },
        { at: 8,  text: 'Sells slightly ahead of buys. Price drifting lower.' },
        { at: 13, text: 'Buyers return. Volume still light.' },
        { at: 18, text: 'Volume ticking up. Buys ahead of sells.' },
        { at: 22, text: 'Mentions on X starting to climb.' },
        { at: 25, text: 'More wallets buying. Holder count rising.' },
        { at: 28, text: 'A few larger buys in the last several candles.', tone: 'hot' },
        { at: 33, text: 'Social activity increasing. Chart moving faster.', tone: 'hot' },
        { at: 37, text: 'Candles getting larger. Mentions up sharply.', tone: 'hot' },
        { at: 40, text: 'New wallets entering fast. Volume spike.', tone: 'hot' },
        { at: 43, text: 'Timelines full of this ticker. Pushing new highs.', tone: 'hot' },
        { at: 45, text: 'New high. Buyers still piling in.', tone: 'hot' },
        { at: 46, text: 'Large sell hitting. Price rejected at the highs.', tone: 'warn' },
        { at: 47, text: 'Sell pressure surging. Buy pressure fading fast.', tone: 'warn' },
        { at: 49, text: 'Large wallets selling into the move.', tone: 'warn' },
        { at: 52, text: 'Another heavy sell. Bids thinning out.', tone: 'warn' },
        { at: 55, text: 'Volume dropping. Buyers stepping back.', tone: 'warn' }
      ],
      reflection: {
        question: 'What information influenced your decision?',
        placeholder: 'A sentence or two is enough.',
        continueLabel: 'CONTINUE TO ROUND 2',
        fields: [
          { label: 'Your Entry', key: 'entryMcap', fmt: 'mcap' },
          { label: 'Entry Time', key: 'entryT', fmt: 'clock' },
          { label: 'Waits Before Entry', key: 'waitsBeforeEntry', fmt: 'int' },
          { label: 'Scenario Peak', key: 'peakMcap', fmt: 'mcap' },
          { label: 'Final Market Cap', key: 'finalMcap', fmt: 'mcap' },
          { label: 'Net Result', key: 'positionPnl', fmt: 'pnl', pct: 'positionPnlPct' }
        ],
        noEntryTitle: 'No position entered.',
        noEntryFields: [
          { label: 'Waits', key: 'waitCount', fmt: 'int' },
          { label: 'Market Cap At Your Decision', key: 'decisionMcap', fmt: 'mcap', empty: 'No decision' },
          { label: 'Scenario Peak', key: 'peakMcap', fmt: 'mcap' },
          { label: 'Final Market Cap', key: 'finalMcap', fmt: 'mcap' }
        ]
      },
      recap: {
        heading: 'ENTRY',
        rules: [
          // when the user entered, and what the market looked like
          { when: ['entered', 'entry_early', 'noWaitBefore'],       text: 'You entered right away, at {entryT:clock} and {entryMcap:mcap}, before the chart or the feed had shown much.' },
          { when: ['entered', 'entry_early', 'waitedBefore'],       text: 'You waited {waitsBeforeEntryText} and entered at {entryT:clock} ({entryMcap:mcap}), while the setup was still unclear.' },
          { when: ['entered', 'entry_developing', 'noWaitBefore'],  text: 'You entered at {entryT:clock} ({entryMcap:mcap}) without waiting, while the setup was still developing.' },
          { when: ['entered', 'entry_developing', 'waitedBefore'],  text: 'You waited while momentum developed and entered at {entryT:clock} ({entryMcap:mcap}), before the move had accelerated.' },
          { when: ['entered', 'entry_fomo', 'waitedBefore'],        text: 'You waited while momentum developed, but entered after the move had already accelerated. Your entry at {entryMcap:mcap} left little room between you and the reversal.' },
          { when: ['entered', 'entry_fomo', 'noWaitBefore'],        text: 'You entered at {entryT:clock} ({entryMcap:mcap}) after the chart had already accelerated. Your entry left little room between you and the reversal.' },
          { when: ['entered', 'entry_reversal'],                    text: 'You entered at {entryT:clock} ({entryMcap:mcap}), after the reversal had already started.' },
          { when: 'entered', text: 'What the market showed at your entry: momentum {entryMomentum}, social activity {entrySocial:signed}, {entryBuys:int}% of trades were buys.' },
          { when: 'entered', text: 'After your entry the market cap peaked at {peakAfterEntry:mcap} ({peakGainPct:pct}) and finished at {finalMcap:mcap} ({finalVsEntryPct:pct} from your entry).' },
          { when: 'hadDrawdown', text: 'At its worst the position was down {troughUnrealPct:pctAbs}.' },
          // what they did with the position
          { when: ['entered', 'soldBeforeReversal'],                text: 'You reduced {soldBeforeReversalPct:pct0} of the position before the reversal began, starting at {firstExitMcap:mcap}.' },
          { when: ['entered', 'soldBeforeReversal', 'heldIntoReversal'], text: '{heldAtReversalPct:pct0} of the position was still open when the reversal began.' },
          { when: ['entered', 'enteredNoSells', 'heldIntoReversal'], text: 'You did not sell, so the full position was still open when the reversal began.' },
          { when: ['entered', 'firstSellAfterReversal'],            text: 'You were still holding when the reversal began and made your first sale at {firstExitMcap:mcap}.' },
          { when: 'flat',      text: 'You closed the full position at {finalExitMcap:mcap}.' },
          { when: 'stillOpen', text: 'You still held {remainingPct:pct0} of the position when the scenario ended.' },
          { when: 'entered',   text: 'Result: {realizedPnl:signedUsd} realized, {unrealizedPnl:signedUsd} unrealized, {positionPnl:signedUsd} in total.' },
          // passing / never entering
          { when: ['passed', 'waited'],      text: 'You waited {waitText} before passing.' },
          { when: ['passed', 'pass_early'],      text: 'You passed at {passT:clock}, before the setup had developed. The market cap went on to reach {peakMcap:mcap}, then fell to {finalMcap:mcap}. Missing a move is not the same as losing a trade.' },
          { when: ['passed', 'pass_developing'], text: 'You passed at {passT:clock}, while the setup was developing. The market cap went on to reach {peakMcap:mcap}, then fell to {finalMcap:mcap}. Missing a move is not the same as losing a trade.' },
          { when: ['passed', 'pass_fomo'],       text: 'You passed while the chart was accelerating. Within {secsToReversal} seconds the move reversed and the market cap fell from {peakMcap:mcap} to {finalMcap:mcap}. Missing a move is not the same as losing a trade.' },
          { when: ['passed', 'pass_reversal'],   text: 'You stayed out through the acceleration and passed at {passT:clock}, after the reversal had started. The market cap went from {peakMcap:mcap} to {finalMcap:mcap}, so you did not chase the top.' },
          { when: ['none', 'waited'],        text: 'You waited {waitText} and never entered or passed. The market cap went on to reach {peakMcap:mcap}, then fell to {finalMcap:mcap}.' },
          { when: 'none', unless: 'waited', text: 'You watched the whole move without entering or passing.' }
        ],
        fields: [
          { label: 'Your Entry', key: 'entryMcap', fmt: 'mcap', empty: 'No entry' },
          { label: 'Scenario Peak', key: 'peakMcap', fmt: 'mcap' },
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
        [400.0, 401.9, 399.5, 400.0, 10.2],  // 0
        [400.0, 402.4, 396.5, 399.5, 16.7],
        [399.5, 428.2, 396.0, 419.5, 18.7],
        [419.5, 422.8, 417.9, 420.0, 11.3],
        [420.0, 421.4, 411.2, 415.7, 11.7],
        [415.7, 443.8, 413.4, 430.0, 15.2],
        [430.0, 434.5, 426.3, 426.3, 11.2],
        [426.3, 431.5, 426.1, 428.5, 10.7],
        [428.5, 437.7, 427.9, 436.0, 21.1],
        [436.0, 443.8, 423.9, 430.6, 13.5],
        [430.6, 446.2, 425.7, 445.0, 16.4],  // 10
        [445.0, 448.5, 443.5, 444.8, 11.1],
        [444.8, 446.8, 410.2, 411.4, 26.4],
        [411.4, 438.3, 409.3, 429.8, 17.7],
        [429.8, 433.8, 427.6, 430.4, 19.3],
        [430.4, 432.7, 418.3, 420.0, 17.7],
        [420.0, 434.8, 413.9, 434.7, 28.5],
        [434.7, 439.3, 431.6, 437.5, 11.6],
        [437.5, 442.9, 435.2, 441.4, 11.2],
        [441.4, 460.0, 434.3, 453.7, 21.8],
        [453.7, 462.5, 451.4, 460.0, 13.8],  // 20
        [460.0, 472.5, 455.1, 463.1, 21.5],
        [463.1, 463.2, 446.2, 451.6, 26.8],
        [451.6, 469.6, 448.4, 465.4, 17.6],
        [465.4, 475.2, 445.9, 457.3, 15.3],
        [457.3, 490.0, 454.2, 482.7, 23.4],
        [482.7, 482.7, 469.1, 476.3, 15.1],
        [476.3, 480.8, 444.8, 447.3, 21.1],
        [447.3, 477.4, 437.6, 476.3, 29.4],
        [476.3, 481.2, 468.7, 476.3, 13.8],
        [476.3, 476.5, 460.2, 470.0, 18.0],  // 30
        [470.0, 470.8, 461.1, 467.3, 12.0],
        [467.3, 469.4, 455.1, 455.3, 20.6],
        [455.3, 459.0, 444.8, 447.4, 16.3],
        [447.4, 454.3, 425.7, 432.9, 17.6],
        [432.9, 436.0, 427.0, 430.0, 16.9],
        [430.0, 432.0, 411.7, 412.3, 25.0],
        [412.3, 417.2, 404.5, 405.3, 26.2],
        [405.3, 407.1, 405.2, 406.4, 13.3],
        [406.4, 410.2, 392.5, 402.5, 16.0],
        [402.5, 408.8, 389.8, 390.0, 19.6],  // 40
        [390.0, 393.3, 364.1, 366.5, 28.4],
        [366.5, 381.5, 358.2, 370.6, 26.1],
        [370.6, 385.2, 359.7, 361.1, 20.5],
        [361.1, 370.0, 350.0, 350.0, 23.0]
      ],
      stats: [
        { at: 0,  volume: 2100, liquidity: 196, buys: 60, social: 120, momentum: 'HIGH' },
        { at: 10, volume: 2300, liquidity: 205, buys: 58, social: 110, momentum: 'HIGH' },
        { at: 16, volume: 2450, liquidity: 196, buys: 47, social: 85,  momentum: 'STEADY' },
        { at: 22, volume: 2700, liquidity: 214, buys: 59, social: 130, momentum: 'HIGH' },
        { at: 26, volume: 2850, liquidity: 220, buys: 54, social: 90,  momentum: 'STEADY' },
        { at: 32, volume: 3000, liquidity: 208, buys: 44, social: 60,  momentum: 'FADING' },
        { at: 38, volume: 3150, liquidity: 190, buys: 38, social: 35,  momentum: 'WEAKENING' },
        { at: 44, volume: 3250, liquidity: 172, buys: 34, social: 10,  momentum: 'WEAKENING' }
      ],
      events: [
        { at: 0,  text: 'Position open. Entry $200K. Market cap now $400K.' },
        { at: 6,  text: 'Volume steady. Buyers still active.' },
        { at: 11, text: 'Price slowing near the recent highs.' },
        { at: 15, text: 'Pullback. Sells picking up.', tone: 'warn' },
        { at: 21, text: 'Buyers return. Push higher.', tone: 'hot' },
        { at: 26, text: 'New high on lower volume.' },
        { at: 31, text: 'Sell pressure rising.', tone: 'warn' },
        { at: 36, text: 'Momentum fading. Lower highs forming.', tone: 'warn' },
        { at: 41, text: 'Large holder moving tokens to exchanges.', tone: 'warn' }
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
          { when: 'noSells',            text: 'You held the entire position through the whole scenario.' },
          { when: 'soldBeforePeak',     text: 'You reduced {soldBeforePeakPct:pct0} of the position before the scenario peak.' },
          { when: 'firstSellAfterPeak', text: 'Your first reduction came after the scenario peak.' },
          { when: 'flat',               text: 'You closed the full position at {finalExitMcap:mcap} market cap.' },
          { when: 'stillOpen',          text: 'You still held {remainingPct:pct0} of the position when the scenario ended.' }
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
        { id: 'buy', label: 'BUY' },
        { id: 'wait', label: 'WAIT' },
        { id: 'pass', label: 'MOVE ON' }
      ],
      lockOn: ['buy', 'pass'],
      lockWhenFlat: false,
      feedback: {
        buy:  { title: 'POSITION OPEN', sub: 'Entry: {entry}. Watch how the market plays out.' },
        pass: { title: 'MOVED ON', sub: 'You chose not to chase this move.' }
      },
      brief: {
        lines: [
          'You saw this coin earlier but never entered.',
          'It has continued running and is now near a new all-time high.',
          'Momentum still looks strong.'
        ],
        setup: ['$100 simulated cash', 'No open position'],
        question: 'What do you do?'
      },
      history: [
        [140.0, 152.2, 139.2, 150.0, 15.3],  // 0
        [150.0, 164.0, 148.1, 160.1, 13.8],
        [160.1, 164.9, 159.4, 161.7, 10.8],
        [161.7, 161.9, 154.1, 154.6, 15.3],
        [154.6, 164.1, 154.0, 163.3, 19.9],
        [163.3, 165.4, 163.2, 164.9, 14.2],
        [164.9, 169.6, 164.4, 168.7, 20.5],
        [168.7, 181.3, 167.6, 180.0, 29.5],
        [180.0, 190.6, 178.7, 189.7, 33.9],
        [189.7, 194.5, 183.2, 185.9, 25.0],
        [185.9, 201.8, 184.9, 201.0, 36.9],  // 10
        [201.0, 213.1, 197.0, 212.2, 31.2],
        [212.2, 212.4, 203.6, 206.9, 47.4],
        [206.9, 231.8, 206.1, 224.2, 38.6],
        [224.2, 231.3, 222.3, 230.0, 31.3],
        [230.0, 233.5, 229.7, 231.7, 21.8],
        [231.7, 265.1, 231.4, 264.2, 77.6],
        [264.2, 282.3, 261.6, 276.0, 39.9],
        [276.0, 283.4, 275.8, 277.0, 22.2],
        [277.0, 277.7, 268.6, 272.4, 27.0],
        [272.4, 298.5, 269.7, 296.5, 62.6],  // 20
        [296.5, 316.7, 293.1, 310.0, 45.7],
        [310.0, 319.1, 308.5, 312.7, 50.3],
        [312.7, 343.2, 312.3, 341.0, 86.0],
        [341.0, 359.7, 338.3, 358.8, 58.7],
        [358.8, 384.4, 357.7, 381.9, 59.8],
        [381.9, 419.4, 371.9, 417.5, 84.3],
        [417.5, 431.1, 413.6, 430.3, 46.2],
        [430.3, 443.8, 411.3, 440.0, 38.7],
        [440.0, 440.0, 416.5, 423.1, 74.8],
        [423.1, 467.6, 414.9, 462.0, 74.9],  // 30
        [462.0, 486.4, 458.8, 483.9, 76.9],
        [483.9, 512.4, 482.4, 501.8, 55.0],
        [501.8, 521.6, 495.8, 510.3, 77.9],
        [510.3, 557.3, 493.6, 550.2, 106.6],
        [550.2, 610.2, 547.0, 590.0, 87.0]
      ],
      candles: [
        [590.0, 592.0, 589.0, 590.0, 44.3],  // 0
        [590.0, 607.3, 578.3, 602.6, 60.0],
        [602.6, 634.0, 587.6, 626.4, 71.4],
        [626.4, 687.0, 622.9, 679.1, 93.5],
        [679.1, 692.7, 670.8, 681.1, 39.3],
        [681.1, 722.8, 674.1, 720.0, 112.5],
        [720.0, 736.1, 716.6, 732.9, 50.5],
        [732.9, 736.7, 690.8, 704.1, 75.9],
        [704.1, 754.0, 701.2, 750.4, 122.9],
        [750.4, 812.5, 742.1, 810.8, 98.2],
        [810.8, 865.5, 801.7, 850.0, 100.0],  // 10
        [850.0, 892.7, 841.6, 862.5, 56.0],
        [862.5, 865.9, 833.4, 836.1, 91.1],
        [836.1, 884.0, 833.2, 874.2, 82.5],
        [874.2, 930.4, 868.5, 927.4, 105.3],
        [927.4, 931.4, 915.8, 920.0, 113.3],
        [920.0, 920.5, 910.3, 919.9, 59.3],
        [919.9, 931.8, 889.1, 899.0, 81.7],
        [899.0, 915.2, 896.9, 910.3, 79.5],
        [910.3, 994.4, 892.1, 965.5, 140.6],
        [965.5, 1024.4, 950.1, 1020.0, 131.3],  // 20
        [1020.0, 1083.5, 984.9, 1069.2, 104.5],
        [1069.2, 1071.1, 991.1, 1016.6, 98.4],
        [1016.6, 1072.0, 1009.2, 1066.6, 131.3],
        [1066.6, 1069.2, 1052.1, 1054.5, 84.2],
        [1054.5, 1070.1, 1038.1, 1069.2, 114.5],
        [1069.2, 1082.8, 1066.3, 1069.2, 67.8],
        [1069.2, 1074.1, 953.9, 1000.9, 174.2],
        [1000.9, 1056.6, 996.4, 1050.7, 144.4],
        [1050.7, 1076.4, 1046.9, 1060.6, 98.1],
        [1060.6, 1100.0, 1018.4, 1083.5, 90.1],  // 30
        [1083.5, 1083.5, 1024.4, 1051.1, 98.3],
        [1051.1, 1071.0, 1035.4, 1044.6, 75.5],
        [1044.6, 1052.4, 966.1, 1003.2, 106.6],
        [1003.2, 1038.9, 978.7, 982.8, 147.1],
        [982.8, 988.6, 957.5, 980.0, 62.4],
        [980.0, 994.5, 975.4, 987.6, 81.4],
        [987.6, 1002.1, 931.7, 941.7, 117.7],
        [941.7, 953.2, 905.4, 923.1, 79.8],
        [923.1, 932.6, 819.8, 834.1, 140.9],
        [834.1, 840.5, 833.8, 840.0, 82.9],  // 40
        [840.0, 841.6, 791.1, 802.9, 98.3],
        [802.9, 837.1, 756.3, 763.2, 145.6],
        [763.2, 763.5, 710.7, 711.0, 114.2],
        [711.0, 726.1, 662.1, 667.1, 128.2],
        [667.1, 696.4, 651.5, 690.0, 89.7],
        [690.0, 694.2, 640.9, 641.0, 135.6],
        [641.0, 651.5, 629.3, 632.6, 62.6],
        [632.6, 648.2, 628.4, 635.6, 83.9],
        [635.6, 657.4, 634.3, 656.1, 100.4],
        [656.1, 667.5, 631.5, 632.1, 86.8],  // 50
        [632.1, 638.2, 591.1, 610.0, 87.8]
      ],
      stats: [
        { at: 0,  volume: 6800,  liquidity: 410, buys: 64, social: 520,  momentum: 'HIGH' },
        { at: 10, volume: 9500,  liquidity: 480, buys: 68, social: 680,  momentum: 'EXTREME' },
        { at: 20, volume: 13800, liquidity: 560, buys: 71, social: 900,  momentum: 'EXTREME' },
        { at: 30, volume: 17500, liquidity: 610, buys: 66, social: 1010, momentum: 'EXTREME' },
        { at: 35, volume: 19200, liquidity: 590, buys: 48, social: 760,  momentum: 'FADING' },
        { at: 42, volume: 20400, liquidity: 520, buys: 39, social: 430,  momentum: 'WEAKENING' },
        { at: 51, volume: 21200, liquidity: 460, buys: 36, social: 220,  momentum: 'WEAKENING' }
      ],
      events: [
        { at: 0,  text: 'Chart already extended. Price near its all-time high.' },
        { at: 6,  text: 'Timelines full of this ticker.', tone: 'hot' },
        { at: 12, text: 'Volume surging. Buyers stepping in fast.', tone: 'hot' },
        { at: 20, text: 'Above $1M market cap. Attention at its highest.', tone: 'hot' },
        { at: 27, text: 'Price still pushing higher.' },
        { at: 31, text: 'New all-time high.' },
        { at: 36, text: 'First sharp red candle. Sells increasing.', tone: 'warn' },
        { at: 41, text: 'Buyers stepping in less aggressively.', tone: 'warn' },
        { at: 46, text: 'Volume dropping. Bids thinning out.', tone: 'warn' }
      ],
      reflection: {
        question: 'What made you enter, wait, or move on?',
        placeholder: 'A sentence or two is enough.',
        continueLabel: 'SEE YOUR DECISIONS',
        fields: [
          { label: 'Entry Market Cap', key: 'entryMcap', fmt: 'mcap' },
          { label: 'Peak After Entry', key: 'peakAfterEntry', fmt: 'mcap' },
          { label: 'Final Market Cap', key: 'finalMcap', fmt: 'mcap' },
          { label: 'Peak P&L', key: 'peakUnrealizedPnl', fmt: 'pnl', pct: 'peakUnrealizedPnlPct' },
          { label: 'Final P&L', key: 'positionPnl', fmt: 'pnl', pct: 'positionPnlPct' }
        ],
        noEntryTitle: 'No position entered.',
        noEntryFields: [
          { label: 'Market Cap When First Shown', key: 'firstShownMcap', fmt: 'mcap' },
          { label: 'Scenario Peak', key: 'peakMcap', fmt: 'mcap' },
          { label: 'Final Market Cap', key: 'finalMcap', fmt: 'mcap' }
        ]
      },
      recap: {
        heading: 'FOMO',
        entryBands: [
          { max: 0.62, text: 'before the final push higher' },
          { max: 0.80, text: 'while the price was still extending' },
          { max: 0.93, text: 'after a large extension' },
          { max: 9,    text: 'near the scenario high' }
        ],
        rules: [
          { when: 'entered', text: 'You entered {band}.' },
          { when: 'streak2', text: 'The {streak} candles before your entry all closed green.' },
          { when: 'entered', text: 'After your entry the market cap peaked at {peakAfterEntry:mcap} and finished at {finalMcap:mcap}.' },
          { when: 'passed',  text: 'You remained out of the market while the price reached {peakMcap:mcap} and then reversed.' },
          { when: 'none',    text: 'You watched the whole move without entering or moving on.' }
        ],
        fields: [
          { label: 'Entry', key: 'entryMcap', fmt: 'mcap', empty: 'No entry' },
          { label: 'Final', key: 'finalMcap', fmt: 'mcap' }
        ]
      }
    }
  ];
})(typeof window !== 'undefined' ? window : globalThis);
