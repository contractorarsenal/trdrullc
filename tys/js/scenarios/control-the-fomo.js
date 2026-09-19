/* 3. CONTROL THE FOMO. You missed the move. It keeps going. Everyone sees the same market. */
(function (root) {
  'use strict';
  var S = root.TYS.Scenarios, C = S.common;
  S.register({
    id: 'control-the-fomo', title: 'CONTROL THE FOMO', category: 'psychology', tags: ['fomo'],
    concepts: ['FOMO', 'chasing', 'missing a move'],
    educationalContext: 'Missing a trade and needing to enter now feel the same in the moment. They are different decisions.',
    brief: { lines: ['You saw this coin earlier and never entered.', "It's still running. Green candles. Everyone is talking about it.", 'You have $100 and no position.'], question: 'What do you do?' },
    reflection: { question: 'What made you enter, wait, or move on?', placeholder: 'A sentence or two is enough.' },
    hints: [{ from: 0, text: 'What does the chart look like compared with where the coin started?' }, { from: 10, text: 'If you buy now, how much room is left before the move is stretched?' }, { from: 19, text: 'Would you have wanted this price if you had seen it an hour ago?' }],
    actions: C.entry({ pass: 'MOVE ON' }).concat(C.sells()),
    analysis: { kind: 'fomo' },
    stages: [{
      id: 'main', token: { name: 'Turbo Walrus', ticker: '$WALRUS' }, start: { cash: 100, capital: 100 },
      market: {
        history: C.climb(5511, 55, 170, 24, { seed: 5511 }),
        live: {
          seed: 6611, open: 170, n: 36, phi: 0.35, wick: 0.5,
          waypoints: C.closes([174, 180, 187, 185, 193, 202, 212, 222, 218, 230, 244, 258, 254, 270, 288, 306, 300, 322, 344, 366, 360, 388, 410, 432, 452, 470, 462, 430, 398, 365, 340, 315, 300, 288, 270, 262]),
          sigma: [[0, 1.3], [25, 1.8], [35, 2.2]], vol: [[0, 26], [25, 44], [35, 30]], cap: null,
          fakeouts: [{ at: 8, len: 4, amp: -0.07, min: 'experienced' }, { at: 16, len: 4, amp: -0.08, min: 'experienced' }, { at: 28, len: 4, amp: 0.09, min: 'advanced' }]
        },
        signals: {
          social: [[0, 150], [10, 320], [20, 700], [26, 900], [30, 500], [35, 180]], buys: [[0, 66], [14, 72], [25, 74], [27, 40], [30, 30], [35, 32]],
          holders: [[0, 3000], [25, 7800], [35, 7000]], liquidity: [[0, 60], [25, 130], [35, 90]]
        },
        events: [
          { at: 0, label: 'The move is already extended', kind: 'note' }, { at: 10, label: 'Attention accelerates', kind: 'note' }, { at: 20, label: 'Price is far above where the round began', kind: 'note' },
          { at: 25, label: 'New high near $470K', kind: 'peak' }, { at: 27, label: 'First sharp red candle', kind: 'drop' }, { at: 32, label: 'Sell-off continues', kind: 'drop' }
        ]
      }
    }]
  });
})(typeof window !== 'undefined' ? window : globalThis);
