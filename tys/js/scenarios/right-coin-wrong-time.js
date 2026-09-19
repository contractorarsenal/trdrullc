/* 10. RIGHT COIN, WRONG TIME. A good coin and a bad entry are different things. */
(function (root) {
  'use strict';
  var S = root.TYS.Scenarios, C = S.common;
  S.register({
    id: 'right-coin-wrong-time', title: 'RIGHT COIN, WRONG TIME', category: 'entries', tags: ['fomo', 'entries'],
    concepts: ['good coin versus good entry', 'timing', 'drawdown before the payoff'],
    educationalContext: 'A coin can be right and still be the wrong buy at that price. The coin and the entry are two separate decisions.',
    brief: { lines: ['A strong narrative. Growing holders. Real attention.', 'This looks like a coin you want to own.'], question: 'When do you get in?' },
    reflection: { question: 'Was it the coin, the timing, or both?', placeholder: 'A sentence or two is enough.' },
    hints: [{ from: 0, text: 'What makes this a good coin? Does that tell you what price to pay?' }, { from: 12, text: 'How much has it already moved?' }, { from: 22, text: 'What has the price done to people who bought at the high?' }],
    actions: C.entry().concat(C.sells()),
    analysis: { kind: 'coin-timing' },
    stages: [{
      id: 'main', token: { name: 'Lumen Otter', ticker: '$LUMEN' }, start: { cash: 100, capital: 100 },
      market: {
        history: C.climb(3101, 40, 100, 20, { seed: 3101 }),
        live: {
          seed: 3202, open: 100, n: 36, phi: 0.38, wick: 0.55,
          waypoints: [[0, 100], [4, 130], [8, 160], [12, 196], [14, 210], [16, 190], [20, 150], [24, 126], [28, 150], [32, 210], [35, 250]],
          sigma: [[0, 1.8], [35, 2.2]], vol: [[0, 14], [14, 34], [24, 18], [35, 30]],
          fakeouts: [{ at: 6, len: 3, amp: -0.06, min: 'experienced' }, { at: 18, len: 3, amp: 0.07, min: 'experienced' }, { at: 26, len: 3, amp: -0.08, min: 'advanced' }]
        },
        signals: { holders: [[0, 4000], [14, 7400], [24, 7900], [35, 9800]], liquidity: [[0, 80], [14, 170], [24, 150], [35, 220]], buys: [[0, 62], [12, 68], [16, 50], [24, 52], [32, 64], [35, 66]], social: [[0, 120], [14, 420], [24, 160], [35, 480]] },
        events: [
          { at: 0, label: 'Strong narrative, growing holders', kind: 'note' }, { at: 14, label: 'Peak near $210K', kind: 'peak' }, { at: 24, label: 'Correction low near $126K', kind: 'low' },
          { at: 32, label: 'Recovers to new highs', kind: 'peak' }, { at: 35, label: 'Ends near $250K', kind: 'note' }
        ]
      }
    }]
  });
})(typeof window !== 'undefined' ? window : globalThis);
