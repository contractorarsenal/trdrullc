/* 2. MANAGE THE 2X. Already up 2X. Partial profit, full exit, or hold? */
(function (root) {
  'use strict';
  var S = root.TYS.Scenarios, C = S.common;
  S.register({
    id: 'manage-the-2x', title: 'MANAGE THE 2X', category: 'exits', tags: ['profit'],
    concepts: ['taking profit', 'partial exits', 'giving back gains'],
    educationalContext: 'Being up 2X is only a paper gain until some of it is sold. There is more than one reasonable way to handle it.',
    brief: { lines: ["You're already in this trade.", 'You entered at a $200K market cap with $50.', 'The market cap is now $400K.', "You're already up 2X."], question: 'What do you do now?' },
    reflection: { question: 'What changed between the peak and your final decision?', placeholder: 'A sentence or two is enough.' },
    hints: [{ from: 0, text: 'How much of your original $50 is still exposed?' }, { from: 8, text: 'What would you do if this pullback keeps going?' }, { from: 17, text: 'What has changed since the last high?' }],
    capitalTracker: true,
    actions: [
      { id: 'sell', label: 'SELL 25%', pct: 0.25, min: 'student' }, { id: 'sell', label: 'SELL 50%', pct: 0.5 }, { id: 'sell', label: 'SELL 100%', pct: 1 },
      { id: 'hold', label: 'HOLD' },
      { id: 'buy', label: 'RE-ENTER', size: 'max', min: 'experienced', group: 'entry' }, { id: 'wait', label: 'STAY OUT', min: 'experienced' }
    ],
    analysis: { kind: 'manage' },
    stages: [{
      id: 'main', token: { name: 'Ghost Lobster', ticker: '$GLOB' }, start: { cash: 50, position: { costUsd: 50, entryMcap: 200000 }, capital: 50 },
      headline: { label: 'from your entry', mcap: 200 },
      market: {
        history: { seed: 3303, open: 172, n: 44, phi: 0.4, wick: 0.6, waypoints: [[0, 172], [6, 200], [14, 232], [22, 290], [30, 332], [38, 384], [43, 400]], sigma: [[0, 1.6], [43, 2.0]], shocks: [[3, -3], [10, -4], [13, -3.5], [19, -5], [24, -3], [27, -4.5], [32, -4], [35, -4], [40, -2.5]], vol: [[0, 6], [43, 14]] },
        live: {
          seed: 4410, open: 400, n: 30, phi: 0.4, wick: 0.6,
          waypoints: C.closes([410, 425, 440, 455, 468, 480, 468, 452, 440, 432, 440, 452, 468, 486, 500, 512, 524, 512, 490, 468, 452, 440, 425, 405, 388, 372, 360, 352, 347, 344]),
          sigma: [[0, 1.5], [16, 1.9], [29, 2.3]], vol: [[0, 14], [16, 20], [29, 22]],
          fakeouts: [{ at: 2, len: 3, amp: -0.05, min: 'experienced' }, { at: 8, len: 4, amp: -0.07, min: 'experienced' }, { at: 19, len: 4, amp: 0.09, min: 'advanced' }, { at: 24, len: 3, amp: 0.07, min: 'advanced' }]
        },
        signals: {
          social: [[0, 90], [6, 110], [16, 60], [20, 20], [29, -10]], buys: [[0, 62], [6, 66], [10, 50], [16, 58], [20, 44], [29, 32]],
          holders: [[0, 5200], [16, 6100], [29, 5800]]
        },
        events: [
          { at: 0, label: 'Position is up 2X', kind: 'note' }, { at: 5, label: 'First push peaks near $480K', kind: 'peak' }, { at: 9, label: 'Pullback low near $432K', kind: 'low' },
          { at: 16, label: 'Second push makes a new high', kind: 'peak' }, { at: 17, label: 'Reversal begins', kind: 'drop' }, { at: 27, label: 'Selling continues', kind: 'drop' }
        ]
      }
    }]
  });
})(typeof window !== 'undefined' ? window : globalThis);
