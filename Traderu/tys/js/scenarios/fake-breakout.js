/* 7. FAKE BREAKOUT. Price clears a previous high, then comes back under it. */
(function (root) {
  'use strict';
  var S = root.TYS.Scenarios, C = S.common;
  S.register({
    id: 'fake-breakout', title: 'FAKE BREAKOUT', category: 'entries', tags: ['entries'],
    concepts: ['breakouts', 'confirmation', 'failed moves'],
    educationalContext: 'A break above a previous high is a signal, not an automatic entry. What matters is whether the move holds.',
    brief: { lines: ['This coin is pushing up against its previous high.', 'Volume is picking up.'], question: 'What do you do?' },
    reflection: { question: 'What made you enter, wait, or pass at the breakout?', placeholder: 'A sentence or two is enough.' },
    hints: [{ from: 0, text: 'What has the price done at this level before?' }, { from: 10, text: 'Is buying pressure growing as fast as the price is?' }, { from: 15, text: 'Is the price holding above the old high?' }],
    levelsLine: [{ price: 100, label: 'PREV HIGH' }],
    actions: C.entry().concat(C.sells()),
    analysis: { kind: 'breakout', level: 100 },
    stages: [{
      id: 'main', token: { name: 'Copper Heron', ticker: '$HERON' }, start: { cash: 100, capital: 100 },
      market: {
        history: { seed: 1701, open: 58, n: 30, phi: 0.4, wick: 0.6, waypoints: [[0, 60], [10, 85], [18, 98], [20, 100], [24, 90], [29, 94]], sigma: 1.5, shocks: [[4, -3], [12, -3.5], [16, -3]], cap: { idx: 20, high: 100 }, vol: [[0, 5], [20, 12], [29, 9]] },
        live: {
          seed: 1802, open: 94, n: 30, phi: 0.38, wick: 0.55,
          waypoints: C.closes([92, 95, 96, 94, 97, 98, 97, 99, 98, 101, 105, 108, 106, 103, 99, 96, 93, 90, 88, 91, 89, 87, 84, 85, 82, 80, 82, 79, 78, 78]),
          sigma: [[0, 1.2], [29, 1.6]], vol: [[0, 8], [10, 20], [29, 8]],
          fakeouts: [{ at: 5, len: 4, amp: -0.04, min: 'experienced' }, { at: 17, len: 5, amp: 0.13, min: 'advanced' }, { at: 24, len: 3, amp: 0.06, min: 'experienced' }]
        },
        signals: {
          volume: [[0, 80], [8, 110], [10, 220], [12, 260], [14, 180], [16, 120], [22, 70], [29, 60]], buys: [[0, 52], [9, 58], [11, 64], [13, 52], [15, 40], [20, 36], [29, 32]],
          holders: [[0, 2400], [10, 2450], [29, 2430]], social: [[0, 30], [10, 140], [12, 180], [16, 60], [22, 5], [29, -15]]
        },
        events: [
          { at: 10, label: 'Breaks above the $100K high', kind: 'peak' }, { at: 12, label: 'Breakout peaks near $108K', kind: 'peak' }, { at: 15, label: 'Back below the old high', kind: 'drop' },
          { at: 19, label: 'Weak bounce', kind: 'note' }, { at: 24, label: 'Lower highs', kind: 'drop' }
        ]
      }
    }]
  });
})(typeof window !== 'undefined' ? window : globalThis);
