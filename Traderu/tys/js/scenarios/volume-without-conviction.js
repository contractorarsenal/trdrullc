/* 9. VOLUME WITHOUT CONVICTION. Loud volume, quiet everything else. How much weight does volume get? */
(function (root) {
  'use strict';
  var S = root.TYS.Scenarios, C = S.common;
  S.register({
    id: 'volume-without-conviction', title: 'VOLUME WITHOUT CONVICTION', category: 'reading', tags: ['volume'],
    concepts: ['volume', 'liquidity', 'holder growth', 'weighing signals'],
    educationalContext: 'Volume says people are trading. It does not say who is winning. Weigh it against the rest of what you can see.',
    brief: { lines: ['This coin is trading a lot.', 'Volume is very high.', 'Look at everything else too.'], question: 'How much weight does volume get?' },
    reflection: { question: 'How much weight did you give volume compared with everything else?', placeholder: 'A sentence or two is enough.' },
    hints: [{ from: 0, text: 'Volume is high. What else on the screen agrees with it, and what does not?' }, { from: 12, text: 'Is more trading turning into a higher price?' }],
    info: ['liquidity', 'holders', 'churn', 'wallets'],
    actions: C.entry().concat(C.sells()),
    analysis: { kind: 'volume' },
    stages: [{
      id: 'main', token: { name: 'Static Moth', ticker: '$MOTH' }, start: { cash: 100, capital: 100 },
      market: {
        history: C.climb(2101, 30, 60, 24, { seed: 2101 }),
        live: {
          seed: 2202, open: 60, n: 32, phi: 0.4, wick: 0.7,
          waypoints: C.closes([64, 70, 76, 82, 88, 96, 100, 104, 100, 106, 98, 104, 94, 100, 90, 97, 88, 94, 85, 90, 82, 86, 79, 84, 76, 80, 74, 78, 72, 75, 72, 70]),
          sigma: [[0, 2.2], [31, 2.6]], vol: [[0, 30], [8, 60], [31, 50]],
          fakeouts: [{ at: 9, len: 3, amp: 0.07, min: 'experienced' }, { at: 20, len: 4, amp: 0.08, min: 'advanced' }]
        },
        signals: {
          volume: [[0, 150], [6, 420], [10, 520], [20, 480], [31, 430]], liquidity: [[0, 18], [10, 16], [31, 12]], holders: [[0, 820], [10, 826], [31, 830]],
          churn: [[0, 45], [10, 78], [31, 88]], buys: [[0, 55], [6, 60], [10, 50], [16, 46], [24, 42], [31, 40]],
          wallets: [[0, 'MIXED'], [8, 'DISTRIBUTING'], [14, 'DISTRIBUTING'], [20, 'MIXED'], [24, 'DISTRIBUTING']], social: [[0, 80], [8, 240], [16, 140], [31, 70]]
        },
        events: [
          { at: 6, label: 'Volume spikes to $420K', kind: 'note' }, { at: 10, label: 'Large sell prints', kind: 'warning' }, { at: 14, label: 'Volume stays high, price fails to advance', kind: 'note' },
          { at: 24, label: 'Continuation is weak', kind: 'drop' }
        ]
      }
    }]
  });
})(typeof window !== 'undefined' ? window : globalThis);
