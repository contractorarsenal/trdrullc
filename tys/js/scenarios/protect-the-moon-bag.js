/* 4. PROTECT THE MOON BAG. Initial capital is already out. What do you do with what is left? */
(function (root) {
  'use strict';
  var S = root.TYS.Scenarios, C = S.common;
  S.register({
    id: 'protect-the-moon-bag', title: 'PROTECT THE MOON BAG', category: 'exits', tags: ['profit'],
    concepts: ['recovering capital', 'controlled exposure', 'the tradeoff of holding'],
    educationalContext: 'Once your original capital is out, what is left is playing with profit. Keeping a smaller position lets you take part if the move continues, without putting the original money back at risk.',
    brief: {
      lines: ['You entered early with $100.', 'The position grew to $300.', 'You sold enough to recover your $100.', 'The remaining position is your moon bag.'],
      question: 'What do you do with the rest?'
    },
    reflection: { question: 'You already protected your initial capital. What made you reduce or keep the remaining position?', placeholder: 'A sentence or two is enough.' },
    hints: [{ from: 0, text: 'How much of your original capital is still at risk?' }, { from: 9, text: 'What are you protecting by selling now, and what are you giving up?' }, { from: 20, text: 'Would you be comfortable if the moon bag went to zero?' }],
    capitalTracker: true,
    actions: [
      { id: 'sell', label: 'SELL 25%', pct: 0.25, min: 'student' }, { id: 'sell', label: 'SELL 50%', pct: 0.5 }, { id: 'sell', label: 'SELL ALL', pct: 1 },
      { id: 'hold', label: 'HOLD' },
      { id: 'buy', label: 'RE-ENTER', size: 'max', min: 'experienced', group: 'entry' }, { id: 'wait', label: 'STAY OUT', min: 'experienced' }
    ],
    analysis: { kind: 'moonbag' },
    stages: [{
      id: 'main', token: { name: 'Solar Badger', ticker: '$BADGER' },
      // $100 became $300. One third was sold to recover the $100. $100 cash, $200 still in the coin (cost basis $66.67).
      start: { cash: 100, position: { costUsd: 66.6667, entryMcap: 100000 }, realized: 66.6667, proceeds: 100, capital: 100 },
      headline: { label: 'from your entry', mcap: 100 },
      market: {
        history: { seed: 7101, open: 98, n: 30, phi: 0.4, wick: 0.6, waypoints: [[0, 100], [8, 135], [16, 190], [24, 250], [29, 300]], sigma: 1.9, shocks: [[4, -3], [11, -4], [19, -4], [26, -3]], vol: [[0, 5], [29, 16]] },
        live: {
          seed: 7202, open: 300, n: 31, phi: 0.4, wick: 0.55,
          waypoints: [[0, 300], [3, 400], [6, 550], [9, 700], [12, 610], [15, 760], [18, 900], [21, 820], [24, 1100], [27, 870], [30, 1400]],
          sigma: [[0, 2.0], [30, 2.6]], vol: [[0, 20], [30, 40]],
          fakeouts: [{ at: 4, len: 3, amp: -0.06, min: 'experienced' }, { at: 13, len: 3, amp: -0.09, min: 'experienced' }, { at: 22, len: 3, amp: -0.1, min: 'advanced' }, { at: 28, len: 2, amp: 0.08, min: 'advanced' }]
        },
        signals: { social: [[0, 120], [9, 300], [12, 150], [18, 400], [24, 650], [27, 220], [30, 900]], buys: [[0, 60], [9, 66], [12, 46], [18, 62], [24, 68], [27, 42], [30, 70]] },
        events: [
          { at: 0, label: 'Initial capital recovered. Moon bag open', kind: 'note' }, { at: 9, label: 'First peak near $700K', kind: 'peak' }, { at: 12, label: 'Pullback', kind: 'drop' },
          { at: 24, label: 'New high near $1.1M', kind: 'peak' }, { at: 27, label: 'Sharp pullback', kind: 'drop' }, { at: 30, label: 'Push to $1.4M', kind: 'peak' }
        ]
      }
    }]
  });
})(typeof window !== 'undefined' ? window : globalThis);
