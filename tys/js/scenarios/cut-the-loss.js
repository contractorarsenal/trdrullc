/* 6. CUT THE LOSS. A trade with a thesis. The setup weakens slowly, with plenty of reasons to stay. */
(function (root) {
  'use strict';
  var S = root.TYS.Scenarios, C = S.common;
  S.register({
    id: 'cut-the-loss', title: 'CUT THE LOSS', category: 'risk', tags: ['losses', 'discipline'],
    concepts: ['thesis', 'cutting losses', 'averaging down'],
    educationalContext: 'A trade is opened for a reason. When that reason stops being true, the position is a different decision.',
    brief: { lines: ['You bought $50 with a clear reason.', 'Price is starting to move against you.'], question: 'Has the original setup changed?' },
    reflection: { question: 'Has the original setup changed? What made you hold, reduce or exit?', placeholder: 'A sentence or two is enough.' },
    hints: [{ from: 0, text: 'What was the reason for the trade?' }, { from: 8, text: 'Is that reason still true?' }, { from: 16, text: 'If you had no position, would you buy here?' }],
    thesis: { text: 'Support near $75K holds and buyers stay active.', warnings: [{ at: 8 }, { at: 16 }] },
    actions: [
      { id: 'hold', label: 'HOLD' }, { id: 'sell', label: 'REDUCE', pct: 0.5 }, { id: 'sell', label: 'EXIT', pct: 1 },
      { id: 'buy', label: 'ADD $20', usd: 20, add: true, min: 'student' }
    ],
    analysis: { kind: 'cut' },
    stages: [{
      id: 'main', token: { name: 'Marble Fox', ticker: '$MFOX' }, start: { cash: 50, position: { costUsd: 50, entryMcap: 80000 }, capital: 100 },
      headline: { label: 'from your entry', mcap: 80 },
      market: {
        history: C.climb(9101, 40, 80, 24, { seed: 9101 }),
        live: {
          seed: 9202, open: 80, n: 30, phi: 0.4, wick: 0.55,
          waypoints: C.closes([82, 79, 77, 76, 78, 74, 71, 72, 75, 77, 73, 70, 66, 68, 70, 64, 60, 58, 61, 63, 57, 52, 49, 47, 50, 46, 42, 40, 38, 36]),
          sigma: [[0, 1.4], [29, 2.0]], vol: [[0, 9], [29, 15]],
          fakeouts: [{ at: 9, len: 3, amp: 0.07, min: 'experienced' }, { at: 19, len: 3, amp: 0.08, min: 'experienced' }, { at: 24, len: 3, amp: 0.09, min: 'advanced' }]
        },
        signals: {
          buys: [[0, 58], [7, 48], [9, 56], [12, 42], [16, 40], [19, 52], [22, 34], [29, 30]], holders: [[0, 2100], [8, 2080], [16, 1990], [29, 1800]],
          social: [[0, 60], [8, 10], [12, -10], [16, -25], [29, -40]]
        },
        events: [
          { at: 8, label: 'First warning: support near $75K is lost', kind: 'warning' }, { at: 9, label: 'Bounce back toward support', kind: 'note' },
          { at: 16, label: 'Second warning: lower high, sellers in control', kind: 'warning' }, { at: 20, label: 'Another bounce', kind: 'note' }, { at: 23, label: 'Losses widen', kind: 'drop' }
        ]
      }
    }]
  });
})(typeof window !== 'undefined' ? window : globalThis);
