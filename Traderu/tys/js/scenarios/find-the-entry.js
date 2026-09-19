/* 1. FIND THE ENTRY. A coin ran to a $100K high and is pulling back. Where do you get in? */
(function (root) {
  'use strict';
  var S = root.TYS.Scenarios, C = S.common;
  S.register({
    id: 'find-the-entry', title: 'FIND THE ENTRY', category: 'entries', tags: ['entries'],
    concepts: ['entries', 'pullbacks', 'chasing'],
    educationalContext: 'A coin that has just made a high often gives some of it back. The price you pay matters as much as the coin.',
    brief: { lines: ['This coin ran to a $100K all-time high.', "Now it's pulling back.", 'Where do you want to get in?'], question: 'Where do you enter?' },
    reflection: { question: 'What information influenced your decision?', placeholder: 'A sentence or two is enough.' },
    hints: [
      { from: 0, text: 'How far has the price already fallen from the high?' },
      { from: 10, text: 'What would make this price a better entry than the one a few seconds ago?' },
      { from: 22, text: 'Has the move already happened, or is it just starting?' }
    ],
    levelsLine: [{ price: 100, label: 'ATH' }],
    actions: C.entry().concat(C.sells()),
    analysis: { kind: 'entry' },
    stages: [{
      id: 'main', token: { name: 'Neon Otter', ticker: '$OTTER' }, start: { cash: 100, capital: 100 },
      headline: { label: 'from ATH', mcap: 100 },
      market: {
        history: { seed: 1101, open: 31, n: 30, phi: 0.4, wick: 0.6, waypoints: [[0, 32], [6, 42], [12, 55], [18, 68], [23, 84], [26, 96], [27, 99], [28, 96], [29, 93]], sigma: 1.6, shocks: [[3, -3], [8, -3.5], [14, -3], [20, -3.5], [24, -2.5]], cap: { idx: 27, high: 100 }, vol: [[0, 4], [27, 14], [29, 12]] },
        live: {
          seed: 2211, open: 93, n: 34, phi: 0.35, wick: 0.55,
          waypoints: C.closes([88, 84, 86, 78, 72, 74, 66, 62, 58, 60, 54, 51, 49.5, 52, 50.5, 53, 55, 54, 57, 60, 59, 62, 65, 64, 68, 71, 70, 73, 76, 80, 78, 74, 70, 68]),
          sigma: [[0, 1.5], [12, 1.6], [33, 1.5]], vol: [[0, 11], [10, 15], [12, 10], [16, 7], [33, 9]],
          fakeouts: [{ at: 4, len: 4, amp: 0.08, min: 'experienced' }, { at: 14, len: 3, amp: -0.07, min: 'advanced' }, { at: 26, len: 4, amp: 0.09, min: 'experienced' }]
        },
        signals: {
          buys: [[0, 40], [8, 38], [12, 44], [16, 55], [22, 60], [28, 64], [31, 48], [33, 42]],
          holders: [[0, 1200], [10, 1150], [14, 1140], [20, 1210], [28, 1300], [33, 1290]],
          social: [[0, 40], [10, -10], [14, -20], [20, 10], [28, 60], [33, 25]],
          liquidity: [[0, 42], [12, 30], [33, 36]]
        },
        events: [
          { at: 0, label: 'Pullback begins from the $100K high', kind: 'note' }, { at: 12, label: 'Price reaches the ~50% retracement', kind: 'low' },
          { at: 16, label: 'Base holds near $50K', kind: 'note' }, { at: 21, label: 'Recovery is underway', kind: 'note' },
          { at: 29, label: 'Extended move near $80K', kind: 'peak' }, { at: 31, label: 'Rollover begins', kind: 'drop' }
        ]
      }
    }]
  });
})(typeof window !== 'undefined' ? window : globalThis);
