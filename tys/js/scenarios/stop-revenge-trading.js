/* 5. STOP REVENGE TRADING. A loss first, then a tempting second setup. Watch what you do with size. */
(function (root) {
  'use strict';
  var S = root.TYS.Scenarios, C = S.common;
  S.register({
    id: 'stop-revenge-trading', title: 'STOP REVENGE TRADING', category: 'psychology', tags: ['overtrading', 'discipline'],
    concepts: ['position size after a loss', 'discipline', 'missing the next move'],
    educationalContext: 'A previous loss should not decide the size or the quality bar of the next trade.',
    brief: { lines: ['Your last trade did not work out.', 'A new coin is moving fast.'], question: 'What do you do?' },
    reflection: { question: 'Did the previous loss affect your next decision?', placeholder: 'A sentence or two is enough.' },
    hints: [{ from: 0, text: 'Would you take this same trade, at this size, if the last one had gone well?' }, { from: 8, text: 'What is the price you are paying, and what are you hoping it does?' }],
    sessionRows: true,
    actions: [
      { id: 'buy', label: 'BUY $10', usd: 10 }, { id: 'buy', label: 'BUY $25', usd: 25 }, { id: 'buy', label: 'BUY $50', usd: 50, min: 'student' }, { id: 'buy', label: 'BUY MAX', size: 'max', min: 'student' },
      { id: 'wait', label: 'WAIT' }, { id: 'pass', label: 'PASS' }
    ].concat(C.sells()),
    analysis: { kind: 'revenge' },
    stages: [
      { // the losing trade first: scripted, the student watches it happen
        id: 'previous', tag: 'PREVIOUS TRADE', kind: 'auto', token: { name: 'Pebble Frog', ticker: '$PEBBLE' }, start: { cash: 60, position: { costUsd: 40, entryMcap: 60000 }, capital: 100 },
        brief: { lines: ['You bought $40 of $PEBBLE.', 'It is moving against you.'], question: '' },
        auto: { exitAt: 11 }, headline: { label: 'from your entry', mcap: 60 },
        market: {
          history: C.climb(8101, 22, 60, 20, { seed: 8101 }),
          live: { seed: 8202, open: 60, n: 12, phi: 0.35, wick: 0.5, waypoints: C.closes([58, 54, 56, 51, 48, 45, 46, 41, 38, 35, 33, 33]), sigma: 1.4, vol: [[0, 9], [11, 14]] },
          signals: { buys: [[0, 48], [6, 40], [11, 32]] }, events: [{ at: 11, label: 'Stopped out. -$18.00', kind: 'drop' }]
        }
      },
      {
        id: 'next', tag: 'NEXT SETUP', carry: true, token: { name: 'Rocket Newt', ticker: '$NEWT' },
        brief: { lines: ['Another coin is ripping.'], question: 'What do you do?' },
        market: {
          history: C.climb(8301, 30, 90, 22, { seed: 8301 }),
          live: {
            seed: 8402, open: 90, n: 36, phi: 0.4, wick: 0.6,
            waypoints: C.closes([98, 108, 118, 126, 120, 111, 104, 116, 130, 146, 160, 152, 140, 128, 120, 132, 150, 170, 190, 206, 196, 184, 172, 180, 196, 214, 232, 220, 206, 194, 186, 198, 210, 204, 200, 200]),
            sigma: [[0, 2.2], [35, 2.6]], vol: [[0, 20], [35, 34]],
            fakeouts: [{ at: 4, len: 4, amp: 0.09, min: 'experienced' }, { at: 14, len: 4, amp: -0.1, min: 'experienced' }, { at: 22, len: 4, amp: 0.1, min: 'advanced' }]
          },
          signals: { buys: [[0, 62], [4, 68], [7, 44], [10, 66], [15, 46], [20, 64], [24, 50], [27, 60], [31, 46], [35, 52]], social: [[0, 200], [10, 380], [20, 600], [27, 700], [35, 380]], holders: [[0, 1500], [20, 3200], [35, 3900]] },
          events: [{ at: 4, label: 'First pump peaks', kind: 'peak' }, { at: 7, label: 'Sharp pullback', kind: 'drop' }, { at: 20, label: 'Second pump peaks', kind: 'peak' }, { at: 27, label: 'New high', kind: 'peak' }, { at: 33, label: 'Chop', kind: 'note' }]
        }
      }
    ]
  });
})(typeof window !== 'undefined' ? window : globalThis);
