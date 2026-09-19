/* 8. POSITION SIZE. Not "do you buy" but "how much". Three setups, three levels of uncertainty. */
(function (root) {
  'use strict';
  var S = root.TYS.Scenarios, C = S.common;
  function market(seed, from, closes, signals, events, hist) {
    return {
      history: C.climb(seed, from * 0.5, from, 16, { seed: seed }),
      live: { seed: seed + 1, open: from, n: closes.length, phi: 0.4, wick: 0.55, waypoints: C.closes(closes), sigma: [[0, 1.6], [closes.length - 1, 2]], vol: [[0, 10], [closes.length - 1, 14]],
        fakeouts: hist || [] },
      signals: signals, events: events
    };
  }
  S.register({
    id: 'position-size', title: 'POSITION SIZE', category: 'risk', tags: ['sizing', 'overtrading'],
    concepts: ['position sizing', 'uncertainty', 'risking a share of the portfolio'],
    educationalContext: 'A good setup does not mean the whole portfolio belongs in it. Size is a decision of its own.',
    brief: { lines: ['You have a $100 portfolio.', 'Three setups, one after another.', 'This time the question is how much.'], question: 'How much do you put in?' },
    reflection: { question: 'Why did you size the setups the way you did?', placeholder: 'A sentence or two is enough.' },
    hints: [{ from: 0, text: 'How sure are you, and how much are you willing to lose if you are wrong?' }],
    actions: [
      { id: 'buy', label: 'BUY $5', usd: 5, min: 'student' }, { id: 'buy', label: 'BUY $10', usd: 10 }, { id: 'buy', label: 'BUY $20', usd: 20, min: 'student' }, { id: 'buy', label: 'BUY $40', usd: 40 },
      { id: 'buy', label: 'CUSTOM', custom: true, min: 'student' }, { id: 'wait', label: 'WAIT' }, { id: 'pass', label: 'PASS' }
    ].concat(C.sells()),
    analysis: { kind: 'size' },
    stages: [
      { id: 'clear', tag: 'SETUP 1 / 3', token: { name: 'Jade Stag', ticker: '$STAG' }, start: { cash: 100, capital: 100 },
        brief: { lines: ['Setup 1 of 3.', 'Volume and buying pressure are rising together.'], question: 'How much do you put in?' },
        market: market(1901, 50, [52, 55, 54, 57, 60, 58, 62, 65, 64, 68, 71, 70, 73, 75],
          { buys: [[0, 60], [13, 68]], holders: [[0, 1800], [13, 2300]], social: [[0, 60], [13, 160]], liquidity: [[0, 60], [13, 80]] },
          [{ at: 0, label: 'Setup 1: aligned signals', kind: 'note' }, { at: 8, label: 'Steady climb', kind: 'note' }], [{ at: 5, len: 3, amp: -0.05, min: 'experienced' }]) },
      { id: 'mixed', tag: 'SETUP 2 / 3', carry: true, token: { name: 'Onyx Ibis', ticker: '$IBIS' },
        brief: { lines: ['Setup 2 of 3.', 'Some signals are good. Some are not.'], question: 'How much do you put in?' },
        market: market(1911, 80, [84, 88, 82, 78, 74, 79, 85, 80, 72, 70, 76, 82, 84, 83],
          { buys: [[0, 52], [6, 44], [9, 40], [13, 55]], holders: [[0, 1400], [13, 1420]], social: [[0, 90], [6, 20], [13, 60]], liquidity: [[0, 36], [13, 34]] },
          [{ at: 0, label: 'Setup 2: mixed signals', kind: 'note' }, { at: 3, label: 'Early pop', kind: 'peak' }, { at: 9, label: 'Pullback low', kind: 'low' }], [{ at: 3, len: 3, amp: 0.06, min: 'experienced' }, { at: 10, len: 3, amp: -0.06, min: 'advanced' }]) },
      { id: 'uncertain', tag: 'SETUP 3 / 3', carry: true, token: { name: 'Slate Kiwi', ticker: '$KIWI' },
        brief: { lines: ['Setup 3 of 3.', 'Fast, thin, and hard to read.'], question: 'How much do you put in?' },
        market: market(1921, 120, [130, 145, 152, 140, 122, 108, 112, 104, 98, 102, 96, 94, 92, 90],
          { buys: [[0, 64], [3, 66], [5, 38], [13, 34]], holders: [[0, 900], [13, 880]], social: [[0, 300], [3, 500], [13, 40]], liquidity: [[0, 14], [13, 10]] },
          [{ at: 0, label: 'Setup 3: thin liquidity', kind: 'note' }, { at: 3, label: 'Early spike', kind: 'peak' }, { at: 6, label: 'Fast reversal', kind: 'drop' }], [{ at: 6, len: 3, amp: 0.07, min: 'advanced' }]) }
    ]
  });
})(typeof window !== 'undefined' ? window : globalThis);
