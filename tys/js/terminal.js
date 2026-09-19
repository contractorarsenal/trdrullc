/*
 * UI: the trading terminal. Renders one run (one scenario) and forwards the student's orders to the simulator.
 * It reads the difficulty rules (what to show, which tools) and contains no scenario numbers or copy.
 */
(function (root) {
  'use strict';
  var TYS = root.TYS = root.TYS || {}, UI = TYS.UI, fmt = TYS.fmt, CFG = TYS.CONFIG, D = TYS.Difficulty;
  var $ = UI.$, el = UI.el, setText = UI.setText, setCls = UI.setCls;
  var T = UI.terminal = {}, E = {}, H = {};
  var run, player, record, chart, meta, sim, stage, mod, def;
  var actionBtns = [], rows = {}, lastLogN = -1, notice = null, cooldownUntil = 0, markers = [], markersN = -1, legendEls = null, customDef = null;
  var lastMetricsT = -1e9, cachedMetrics = null, lastTrackerT = -1e9, cachedAnalysis = null, hintSeen = {};
  var ORDER = ['volume', 'liquidity', 'buys', 'momentum', 'social', 'velocity', 'holders', 'holderGrowth', 'wallets', 'churn', 'ath', 'fromAth', 'fees', 'age', 'rank'];
  var MOM = { hot: 'hot', good: 'good', cold: 'cold' };

  T.init = function (handlers) {
    H = handlers || {};
    ['tt-round', 'tt-title', 'tt-level', 'tt-stage', 'tt-ticker', 'tt-name', 'tt-mcap', 'tt-change', 'tt-unit', 'tt-live', 'tt-status', 'tt-timer', 'tt-progress', 'chart-legend', 'chart-host', 'paused-badge',
      'brief-overlay', 'brief-eyebrow', 'brief-title', 'brief-lines', 'brief-context', 'brief-setup', 'brief-question', 'btn-begin', 'stage-overlay', 'stage-eyebrow', 'stage-big', 'stage-lines', 'stage-chips', 'btn-stage',
      'resume-overlay', 'btn-resume', 'market-rows', 'pf-cash', 'pf-pos', 'pf-unreal', 'pf-real', 'pf-total', 'pf-detail', 'pf-tracker', 'pf-session', 'panel-stats', 'panel-port', 'panel-actions',
      'am-mcap', 'am-pnl', 'thesis', 'act-card', 'act-question', 'act-status', 'size-form', 'size-input', 'size-cancel', 'size-err', 'act-grid', 'hint-row', 'btn-hint', 'hint-text', 'ff-wrap', 'btn-ff', 'ff-sub',
      'panel-reflect', 'rf-label', 'rf-title', 'rf-none', 'rf-fields', 'rf-question', 'rf-input', 'btn-continue', 'trades-list'].forEach(function (id) { E[id] = $(id); });
    E['btn-begin'].addEventListener('click', function () { H.onBegin && H.onBegin(); });
    E['btn-stage'].addEventListener('click', function () { H.onStageContinue && H.onStageContinue(); });
    E['btn-resume'].addEventListener('click', function () { H.onResume && H.onResume(); });
    E['btn-ff'].addEventListener('click', function () { if (player) { player.setFastForward(player.ff === 1); } });
    E['btn-hint'].addEventListener('click', showHint);
    E['size-cancel'].addEventListener('click', closeSize);
    E['size-form'].addEventListener('submit', function (e) { e.preventDefault(); submitSize(); });
    E['rf-input'].addEventListener('input', function () { if (record) { record.note = E['rf-input'].value.slice(0, 500); H.onNote && H.onNote(); } });
    E['btn-continue'].addEventListener('click', function () { E['btn-continue'].disabled = true; record.note = E['rf-input'].value.trim().slice(0, 500); H.onReflectContinue && H.onReflectContinue(); });
  };

  function ensureChart() {
    if (chart) return;
    legendEls = {}; ['o', 'h', 'l', 'c', 'v'].forEach(function (k) { var s = el('span'), b = el('b'); s.appendChild(document.createTextNode(k.toUpperCase() + ' ')); s.appendChild(b); E['chart-legend'].appendChild(s); legendEls[k] = b; });
    chart = TYS.createChart(E['chart-host'], { onLegend: function (c) { setText(legendEls.o, fmt.mcap(c.o)); setText(legendEls.h, fmt.mcap(c.h)); setText(legendEls.l, fmt.mcap(c.l)); setText(legendEls.c, fmt.mcap(c.c)); setText(legendEls.v, fmt.volume(c.v)); } });
  }

  /* ------------------------------------------------------------ loading a run / stage */
  T.load = function (o) {
    ensureChart(); run = o.run; player = o.player; record = o.record; meta = o;
    def = run.def; mod = run.instance.mod; notice = null; hintSeen = {}; E['btn-continue'].disabled = false; closeSize();
    buildStage();
  };
  function buildStage() {
    sim = run.sim(); stage = run.stage(); lastLogN = -1; markersN = -1; lastMetricsT = -1e9; lastTrackerT = -1e9; cachedAnalysis = null; notice = null;
    E['tt-round'].textContent = 'SCENARIO ' + (meta.index + 1) + ' / ' + meta.total; E['tt-title'].textContent = def.title; E['tt-level'].textContent = mod.short.toUpperCase();
    var tag = stage.tag || (stage.kind === 'auto' ? 'PREVIOUS TRADE' : ''); E['tt-stage'].hidden = !tag; E['tt-stage'].textContent = tag;
    E['tt-ticker'].textContent = stage.token.ticker; E['tt-name'].textContent = stage.token.name;
    E['trades-list']._t = undefined; E['act-card']._tone = undefined; E['act-card'].removeAttribute('data-tone');
    buildMarketRows(); buildActions(); buildExtras(); chart.reset();
  }
  T.stageChanged = function () { buildStage(); };

  function buildMarketRows() {
    var host = E['market-rows']; host.textContent = ''; rows = {};
    var ids = ORDER.filter(function (k) { return stage.info.indexOf(k) !== -1; });
    ids.forEach(function (id) {
      var m = TYS.Market.METRICS[id], d = el('div', 'kv'), k = el('span', 'k', m.label), v = el('span', 'v');
      if (mod.explain && m.explain) k.appendChild(el('small', '', m.explain));
      d.appendChild(k); d.appendChild(v); host.appendChild(d); rows[id] = { d: d, v: v };
      if (id === 'buys') { var bar = el('div', 'bsbar'); bar.appendChild(el('i', 'bs-buy')); bar.appendChild(el('i', 'bs-sell')); host.appendChild(bar); rows.bar = bar; }
    });
  }

  /* ------------------------------------------------------------ actions */
  function groupOf(a) { return a.group; }
  function buildActions() {
    E['act-grid'].textContent = ''; actionBtns = [];
    stage.actions.forEach(function (a) {
      var b = el('button', 'tbtn ' + (a.id === 'buy' ? 'tbtn-buy' : a.id === 'sell' ? 'tbtn-sell' : 'tbtn-ghost')); b.type = 'button';
      var l = el('span', 'tb-l', a.label), s = el('span', 'tb-s', ''); b.appendChild(l); b.appendChild(s);
      b.addEventListener('click', function () { onAction(a, b); });
      E['act-grid'].appendChild(b); actionBtns.push({ def: a, b: b, s: s });
    });
  }
  function buildExtras() {
    var th = E['thesis']; th.hidden = !def.thesis;
    if (def.thesis) { th.textContent = ''; th.appendChild(el('b', '', 'THESIS')); th.appendChild(document.createTextNode(def.thesis.text + (mod.thesisHelp ? ' Ask yourself: has the original setup changed?' : ''))); }
    E['hint-row'].hidden = !(run.instance.rules.hints && def.hints && def.hints.length); E['hint-text'].hidden = true; E['btn-hint'].textContent = 'Need a hint?';
    var tr = E['pf-tracker']; tr.hidden = !def.capitalTracker; tr.textContent = ''; rows.tracker = null;
    if (def.capitalTracker) {
      var moon = (def.analysis || {}).kind === 'moonbag', L = moon ? ['Initial capital', 'Realized profit', 'Moon bag value', 'Max moon bag value', 'Current value'] : ['Initial capital', 'Realized profit', 'Position value', 'Peak position value', 'Current value'];
      rows.tracker = L.map(function (t) { var d = el('div', 'kv'); d.appendChild(el('span', 'k', t)); var v = el('span', 'v'); d.appendChild(v); tr.appendChild(d); return v; });
    }
    var se = E['pf-session']; se.hidden = true; se.textContent = ''; rows.session = null;
    if (def.sessionRows) { rows.session = ['Previous trade', 'Session P&L'].map(function (t) { var d = el('div', 'kv'); d.appendChild(el('span', 'k', t)); var v = el('span', 'v'); d.appendChild(v); se.appendChild(d); return v; }); }
  }

  function holding() { return sim.hasPosition(); }
  function amountOf(a) { var c = sim.portfolio.cash; return a.custom ? null : a.size === 'max' ? c : (a.id === 'buy' && a.pct) ? c * a.pct : a.usd; }
  function visible(a) {
    if (sim.auto) return false;
    var h = holding(), ever = sim.everHeld(), entryDefs = stage.actions.some(function (x) { return x.group === 'entry'; });
    var showEntry = !h && (!ever || (run.instance.rules.reentry && entryDefs));
    if (showEntry) return a.group === 'entry';
    if (h) return a.group === 'manage' || (a.id === 'buy' && run.instance.rules.addToPosition);
    return a.group === 'manage';      // flat after an exit: show the (disabled) exit controls
  }
  function fbCopy(key) { var d = (CFG.feedback || {})[key] || {}, o = (def.feedback || {})[key] || {}; return { title: o.title != null ? o.title : d.title, sub: o.sub != null ? o.sub : d.sub }; }
  function fbFill(str, c) { return String(str == null ? '' : str).replace(/\{(\w+)\}/g, function (_, k) { return c[k] != null ? c[k] : ''; }); }
  function fbCtx(t) {
    var pf = sim.portfolio, v = pf.value(sim.price()), buys = sim.log.filter(function (x) { return x.type === 'buy' && !x.auto; }), lastBuy = t && t.type === 'buy' ? t : buys[buys.length - 1];
    var open = v.shares > 1e-12 && v.positionValue >= 0.005, base = pf.episodes.length ? (pf.initial.shares > 0 ? pf.initial.shares : (pf.episodes.filter(function (e) { return !e.pre; })[0] || { buys: [{ usd: 0 }] }).buys[0].usd / (buys.length ? buys[0].mcap : 1)) : 0;
    var c = { invested: fmt.usd0(buys.reduce(function (s, x) { return s + x.usd; }, 0)), usd: lastBuy ? fmt.usd0(lastBuy.usd) : '', entry: v.avgEntry ? fmt.mcap(v.avgEntry) : '', mcap: fmt.mcap(t ? t.mcap : sim.price()), realized: fmt.signedUsd(v.realized - pf.initial.realized), waits: sim.log.filter(function (x) { return x.type === 'wait'; }).length, left: '', open: '' };
    var startShares = pf.initial.shares > 0 ? pf.initial.shares : Math.max.apply(null, [0].concat(pf.episodes.map(function (e) { return e.buys.reduce(function (s, b) { return s + b.usd / b.mcap; }, 0); })));
    if (open && startShares > 0) c.open = fmt.pct0(v.shares / startShares);
    if (t && t.type === 'sell') { c.pct = fmt.pct0(t.pct); c.delta = fmt.signedUsd(t.realizedDelta); if (open && startShares > 0) c.left = ' ' + fmt.pct0(v.shares / startShares) + ' of the position is still open.'; }
    return c;
  }
  function flash(tone) { var c = E['act-card']; c.setAttribute('data-tone', tone || ''); c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash'); }

  function onAction(a, btn) {
    if (meta.phase() !== 'play' || player.gate || !sim) return;
    if (a.custom) { openSize(a); return; }
    perform(a, {}, btn);
  }
  function perform(a, params, btn) {
    var now = performance.now(); if (now < cooldownUntil) return;
    var hadFocus = btn && document.activeElement === btn;
    var res = sim.act(a, params); if (!res.ok) { showSizeError(res.reason); return; }
    cooldownUntil = now + CFG.actionCooldownMs; H.onChange && H.onChange();
    var t = res.trade, c = fbCtx(t), key = t.type === 'buy' && t.added ? 'add' : t.type, cp = fbCopy(key), tone = t.type === 'buy' ? 'buy' : t.type;
    var title = fbFill(cp.title, c), sub = fbFill(cp.sub, c);
    if (t.type === 'wait' || t.type === 'hold' || t.type === 'sell' || (t.type === 'buy' && t.added)) { notice = { tone: tone, title: title, sub: sub, until: now + CFG.feedbackMs }; if (t.type === 'wait' && btn) { btn.classList.add('is-picked'); setTimeout(function () { btn.classList.remove('is-picked'); }, 1600); } }
    else notice = null;
    flash(tone); UI.announce(title + '. ' + sub);
    closeSize();
    if (hadFocus) setTimeout(function () { if (btn.hidden || btn.disabled) UI.focus(E['act-question']); }, 0);
  }

  /* custom size ("how much?") */
  function openSize(a) { customDef = a; E['size-form'].hidden = false; E['size-err'].hidden = true; E['size-input'].value = ''; UI.focus(E['size-input']); }
  function closeSize() { customDef = null; E['size-form'].hidden = true; E['size-err'].hidden = true; }
  function showSizeError(reason) {
    var m = { 'invalid-amount': 'Enter an amount of at least $1.', 'insufficient-cash': 'You only have ' + fmt.usd(sim ? sim.portfolio.cash : 0) + ' in cash.', 'no-cash': 'You have no cash left.' }[reason];
    if (m && !E['size-form'].hidden) { E['size-err'].textContent = m; E['size-err'].hidden = false; }
  }
  function submitSize() {
    if (!customDef) return; var raw = E['size-input'].value.replace(/[$,\s]/g, ''), n = parseFloat(raw);
    if (!raw || !isFinite(n) || !(n >= 1)) { showSizeError('invalid-amount'); return; }
    if (n > sim.portfolio.cash + 1e-9) { showSizeError('insufficient-cash'); return; }
    perform(customDef, { usd: Math.round(n * 100) / 100 }, null);
  }

  /* hints prompt thinking; they never say what to press */
  function showHint() {
    if (!def.hints) return; var u = sim.elapsed / sim.candleMs, idx = -1, i;
    for (i = 0; i < def.hints.length; i++) if (def.hints[i].from <= u + 1e-9) idx = i;
    if (idx < 0) idx = 0;
    if (!hintSeen[idx]) { hintSeen[idx] = true; record.hints = (record.hints || 0) + 1; H.onChange && H.onChange(); }
    E['hint-text'].textContent = def.hints[idx].text; E['hint-text'].hidden = false; UI.announce('Hint. ' + def.hints[idx].text);
  }

  /* ------------------------------------------------------------ rendering */
  function chartModel() {
    var f = sim.forming();
    if (markersN !== sim.log.length) {
      markersN = sim.log.length; markers = [];
      sim.log.forEach(function (x) { if (x.close) return; var k = Math.min(sim.path.N - 1, Math.floor(x.t / sim.candleMs)); markers.push({ index: sim.path.H + k, type: x.type === 'sell' ? 'sell' : 'buy', note: x.type === 'sell' && !x.auto ? fmt.pct0(x.pct) : '' }); });
    }
    var pf = sim.portfolio.value(sim.price()), lines = (stage.levelsLine || []).map(function (l) { return { price: l.price * CFG.unit, label: l.label, level: true }; });
    if (pf.avgEntry) lines.push({ price: pf.avgEntry, label: fmt.mcap(pf.avgEntry) });
    return { all: sim.path.all, formingIndex: f.index, forming: f, markers: markers, lines: lines };
  }
  function arrow(v) { return v > 0.004 ? '▲ ' : v < -0.004 ? '▼ ' : ''; }
  function sign(v) { return v > 0.004 ? 'up' : v < -0.004 ? 'down' : 'flat'; }
  function pnlText(v, pct) { return arrow(v) + fmt.signedUsd(v) + (pct == null ? '' : ' (' + fmt.pct(pct) + ')'); }

  function renderTop(price) {
    var ph = meta.phase(), hl = stage.headline, ref = hl && hl.mcap ? hl.mcap * CFG.unit : sim.path.first, chg = ref > 0 ? price / ref - 1 : 0;
    setText(E['tt-mcap'], fmt.mcap(price)); setText(E['tt-change'], arrow(chg) + fmt.pct(chg) + ' ' + (hl ? hl.label : 'since start'));
    setCls(E['tt-change'], 'up', chg > 0.0005); setCls(E['tt-change'], 'down', chg < -0.0005); setCls(E['tt-change'], 'flat', Math.abs(chg) <= 0.0005);
    setText(E['tt-unit'], 'PRICE ' + fmt.price(price / CFG.supply)); setText(E['tt-timer'], fmt.clock(sim.elapsed) + ' / ' + fmt.clock(sim.duration));
    E['tt-progress'].style.width = (sim.progress() * 100).toFixed(2) + '%';
    var label = ph === 'brief' ? 'READY' : ph === 'reflect' ? 'COMPLETE' : ph === 'stage' ? 'STAGE COMPLETE' : player.paused ? 'PAUSED' : 'LIVE SIMULATION';
    setText(E['tt-status'], label); setCls(E['tt-live'], 'is-idle', ph !== 'play'); setCls(E['tt-live'], 'is-paused', ph === 'play' && player.paused);
    E['paused-badge'].hidden = !(ph === 'play' && player.paused && !player.gate);
  }
  function renderMarket(t) {
    if (t - lastMetricsT > 90 || t < lastMetricsT) { lastMetricsT = t; cachedMetrics = sim.metrics(t); }
    var m = cachedMetrics; Object.keys(rows).forEach(function (id) { if (!m[id] || !rows[id].v) return; var r = rows[id];
      if (id === 'momentum') { setText(r.v, m.momentum.text); r.v.className = 'v mom' + (m.momentum.tone ? ' ' + MOM[m.momentum.tone] : ''); }
      else if (id === 'wallets') { setText(r.v, m.wallets.text); r.v.className = 'v' + (m.wallets.tone === 'good' ? ' up' : m.wallets.tone === 'cold' ? ' down' : ''); }
      else if (id === 'fromAth') { setText(r.v, m.fromAth.text); r.v.className = 'v' + (m.raw.fromAth < -0.005 ? ' down' : ''); }
      else setText(r.v, m[id].text); });
    if (rows.bar) { rows.bar.firstChild.style.width = m.raw.buys.toFixed(1) + '%'; rows.bar.lastChild.style.width = (100 - m.raw.buys).toFixed(1) + '%'; }
  }
  function renderPortfolio() {
    var pf = sim.portfolio, v = pf.value(sim.price()), open = v.shares > 1e-12 && v.positionValue >= 0.005;
    setText(E['pf-cash'], fmt.usd(v.cash)); setText(E['pf-pos'], fmt.usd(open ? v.positionValue : 0));
    setText(E['pf-unreal'], open ? pnlText(v.unrealized, v.unrealizedPct) : fmt.signedUsd(0)); var gained = v.realized - pf.initial.realized; setText(E['pf-real'], pnlText(v.realized));
    setText(E['pf-total'], fmt.usd(v.total)); var un = open ? v.unrealized : 0;
    ['up', 'down', 'flat'].forEach(function (c) { setCls(E['pf-unreal'], c, sign(un) === c); setCls(E['pf-real'], c, sign(v.realized) === c); });
    setText(E['pf-detail'], open ? Math.round(v.shares * CFG.supply).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' ' + stage.token.ticker + '  |  avg entry ' + fmt.mcap(v.avgEntry) : 'No open position');
    setText(E['am-mcap'], fmt.mcap(sim.price())); setText(E['am-pnl'], fmt.signedUsd(v.total - sim.startValue));
    if (rows.tracker) {
      var t = sim.elapsed; if (t - lastTrackerT > 250 || t < lastTrackerT) { lastTrackerT = t; cachedAnalysis = sim.analyze(t); }
      var cs = pf.capitalState(sim.price()), R = rows.tracker;
      setText(R[0], cs.recovered ? 'Recovered' : 'At risk'); R[0].className = 'v' + (cs.recovered ? ' ok' : ''); setText(R[1], fmt.signedUsd(v.realized)); setText(R[2], fmt.usd(open ? v.positionValue : 0));
      setText(R[3], fmt.usd(Math.max(cachedAnalysis.peakPositionValue, open ? v.positionValue : 0))); setText(R[4], fmt.usd(v.total));
    }
    if (rows.session) { var show = run.stageIndex >= 1 && run.carry.previousTrade; E['pf-session'].hidden = !show; if (show) { setText(rows.session[0], fmt.signedUsd(run.carry.previousTrade.pnl)); setText(rows.session[1], (run.carry.sessionPct >= 0 ? '+' : '') + Math.round(run.carry.sessionPct * 100) + '%'); } }
    return v;
  }
  function baseCard(v) {
    var ph = meta.phase(), open = v.shares > 1e-12 && v.positionValue >= 0.005, c = fbCtx(null), userBuys = sim.log.some(function (x) { return x.type === 'buy' && !x.auto; }), sold = sim.log.some(function (x) { return x.type === 'sell' && !x.auto; }), q = (stage.brief && stage.brief.question) || def.brief.question;
    function card(tone, key) { var cp = fbCopy(key); return { tone: tone, title: fbFill(cp.title, c), sub: fbFill(cp.sub, c) }; }
    if (ph === 'brief') return { tone: '', title: q || '', sub: 'Start to begin the market clock.' };
    if (sim.auto) return { tone: 'sell', title: 'PREVIOUS TRADE', sub: ((stage.brief && stage.brief.lines) || []).join(' ') };
    if (sim.done()) return { tone: '', title: 'Complete.', sub: '' };
    if (open && sold) return card('sell', 'partial');
    if (!open && sold) return card('sell', 'closed');
    if (open && userBuys) return card('buy', 'open');
    if (sim.decision === 'pass') return card('pass', 'pass');
    if (!sim.locked && c.waits > 0 && !holding()) return { tone: 'wait', title: q, sub: fbFill(fbCopy('watching').sub, c) };
    return { tone: '', title: q, sub: '' };
  }
  function renderActions(v) {
    var ph = meta.phase(), now = performance.now(), busy = now < cooldownUntil, blocked = player.gate || ph !== 'play', vis = 0, waits = sim.log.filter(function (x) { return x.type === 'wait'; }).length;
    actionBtns.forEach(function (a) {
      var show = visible(a.def); a.b.hidden = !show; if (!show) return; vis++;
      var st = sim.actionState(a.def, {}), sub = '';
      if (a.def.id === 'buy') { var amt = amountOf(a.def); sub = amt == null ? 'enter amount' : (a.def.usd ? '' : fmt.usd0(amt)); }
      else if (a.def.id === 'sell' && v.positionValue >= 0.005) sub = '≈ ' + fmt.usd(v.positionValue * a.def.pct);
      else if (a.def.id === 'wait' && waits > 0) sub = 'x' + waits;
      setText(a.s, sub); a.b.disabled = (!st.enabled && !(a.def.custom && st.reason === 'invalid-amount')) || blocked; a.b.setAttribute('aria-disabled', busy && !a.b.disabled ? 'true' : 'false');
    });
    E['act-grid'].hidden = vis === 0; E['act-grid'].style.setProperty('--cols', Math.min(Math.max(vis, 1), vis > 5 ? 4 : vis > 4 ? 3 : vis));
    var card = (notice && now < notice.until && ph === 'play' && !sim.done()) ? notice : baseCard(v); if (notice && now >= notice.until) notice = null;
    setText(E['act-question'], card.title || ''); var sub = card.sub || ''; setText(E['act-status'], sub); E['act-status'].hidden = !sub;
    if (E['act-card']._tone !== card.tone) { E['act-card']._tone = card.tone; E['act-card'].setAttribute('data-tone', card.tone || ''); }
    var canFF = ph === 'play' && player.canFastForward(); E['ff-wrap'].hidden = !canFF;
    if (canFF) { E['btn-ff'].setAttribute('aria-pressed', player.ff > 1 ? 'true' : 'false'); setText(E['ff-sub'], player.ff > 1 ? 'x' + CFG.fastForward + ' on' : 'x' + CFG.fastForward); }
  }
  function logRow(s, tr) {
    var d = TYS.describeLogLine(s.stage, tr), li = el('li'), span = el('span');
    span.appendChild(el('span', d.kind, d.name)); if (d.detail) span.appendChild(document.createTextNode(' ' + d.detail)); li.appendChild(el('time', '', d.clock)); li.appendChild(span); return li;
  }
  function renderList() {
    var user = sim.log.filter(function (x) { return !x.auto; });
    if (user.length !== lastLogN) {
      var grew = user.length > lastLogN && lastLogN >= 0; lastLogN = user.length; var tl = E['trades-list']; tl.textContent = '';
      if (!user.length) { var e0 = el('li'); e0.appendChild(el('span', 'empty', 'No decisions yet.')); e0.style.gridTemplateColumns = '1fr'; tl.appendChild(e0); }
      user.forEach(function (tr) { tl.appendChild(logRow(sim, tr)); }); if (grew) tl.scrollTop = tl.scrollHeight;
    }
  }
  T.render = function (dt) {
    if (!run) return; sim = run.sim(); stage = run.stage();
    var m = chartModel(), price = m.forming.c; chart.render(m, dt);
    renderTop(price); renderMarket(sim.elapsed); var v = renderPortfolio(); renderActions(v); renderList();
  };
  T.redraw = function () { if (chart) chart.redraw(); };

  /* ------------------------------------------------------------ overlays and panels */
  T.applyPhase = function (ph, focus) {
    E['brief-overlay'].hidden = ph !== 'brief'; E['stage-overlay'].hidden = ph !== 'stage'; E['resume-overlay'].hidden = !(ph === 'play' && player.gate);
    E['panel-reflect'].hidden = ph !== 'reflect'; E['panel-stats'].hidden = ph === 'reflect'; E['panel-actions'].hidden = ph === 'reflect';
    if (ph === 'brief') fillBrief(focus); if (ph === 'stage') fillStage(focus); if (ph === 'reflect') fillReflect(focus);
  };
  function chipsFor(s) {
    var out = [], st = s.start || {}, cash = s.carry ? sim.portfolio.cash : st.cash;
    out.push(fmt.usd0(cash) + ' simulated cash'); out.push(st.position ? 'Open position: ' + fmt.usd0(st.position.costUsd) + ' at cost' : 'No open position');
    if (def.capitalTracker && st.capital) out.push('Original capital: ' + fmt.usd0(st.capital));
    return out;
  }
  function fillBrief(focus) {
    var b = stage.brief || def.brief;
    E['brief-eyebrow'].textContent = 'SCENARIO ' + (meta.index + 1) + (run.stageCount > 1 ? '  |  ' + (stage.tag || 'PART ' + (run.stageIndex + 1)) : '');
    E['brief-title'].textContent = def.title; E['brief-lines'].textContent = ''; (b.lines || []).forEach(function (t) { E['brief-lines'].appendChild(el('p', '', t)); });
    var ctxLine = mod.context && def.educationalContext && run.stageIndex === 0 ? def.educationalContext : (mod.label === 'ADVANCED' && run.stageIndex === 0 ? 'You know the definitions. Now make the decision.' : '');
    E['brief-context'].hidden = !ctxLine; E['brief-context'].textContent = ctxLine;
    E['brief-setup'].textContent = ''; chipsFor(stage).forEach(function (t) { E['brief-setup'].appendChild(el('span', '', t)); });
    var extra = def.thesis && run.stageIndex === 0 ? 'Thesis: ' + def.thesis.text : ''; if (extra) E['brief-setup'].appendChild(el('span', '', extra));
    E['brief-question'].textContent = b.question || ''; E['brief-question'].hidden = !b.question; E['btn-begin'].textContent = sim.auto ? 'Watch' : 'Start';
    if (focus) UI.focus(E['brief-title']);
  }
  function fillStage(focus) {
    var s = sim.summary(), next = run.instance.stages[run.stageIndex + 1], big = E['stage-big'], lines = E['stage-lines'], chips = E['stage-chips'];
    lines.textContent = ''; chips.textContent = ''; big.className = 'big';
    if (sim.auto) {
      var ep = sim.portfolio.episodes[0], loss = s.realized - (sim.portfolio.initial.realized || 0);
      E['stage-eyebrow'].textContent = 'Previous trade'; big.textContent = loss < 0 ? 'STOPPED OUT' : 'CLOSED'; if (loss < 0) big.classList.add('loss');
      lines.appendChild(el('p', '', 'You bought ' + fmt.usd0(ep ? ep.invested : 0) + ' of ' + stage.token.ticker + '. It closed at ' + fmt.signedUsd(loss) + '.'));
      [['Previous trade', fmt.signedUsd(loss)], ['Portfolio', fmt.usd(s.total)]].forEach(function (p) { chips.appendChild(el('span', '', p[0] + ' ' + p[1])); });
    } else {
      E['stage-eyebrow'].textContent = stage.tag || 'Stage complete'; big.textContent = (stage.tag || 'STAGE') + ' COMPLETE';
      lines.appendChild(el('p', '', 'Stage result: ' + fmt.pnl(s.pnl, s.pnlPct) + '.'));
      [['Portfolio', fmt.usd(s.total)]].forEach(function (p) { chips.appendChild(el('span', '', p[0] + ' ' + p[1])); });
    }
    if (next && next.brief) (next.brief.lines || []).forEach(function (t) { lines.appendChild(el('p', '', t)); });
    E['btn-stage'].textContent = (next && next.tag) ? 'Continue: ' + next.tag : 'Continue';
    if (focus) UI.focus(big);
  }
  function fillReflect(focus) {
    var facts = TYS.Behavior.scenarioFacts(run), rowsData = UI.factRows(facts, run);
    E['rf-label'].textContent = 'SCENARIO ' + (meta.index + 1) + ' reflection'; E['rf-none'].hidden = true; E['rf-fields'].textContent = '';
    rowsData.forEach(function (r) { var row = el('div', 'kv'); row.appendChild(el('dt', '', r[0])); row.appendChild(el('dd', '', r[1])); E['rf-fields'].appendChild(row); });
    E['rf-question'].textContent = def.reflection.question; E['rf-input'].placeholder = def.reflection.placeholder || ''; E['rf-input'].value = record.note || '';
    E['btn-continue'].textContent = meta.index < meta.total - 1 ? 'Continue' : 'See your decisions'; E['btn-continue'].disabled = false;
    if (focus) { UI.focus(E['rf-title']); E['panel-reflect'].scrollIntoView({ block: 'nearest', behavior: UI.reduceMotion ? 'auto' : 'smooth' }); }
  }
  T.focusTitle = function () { UI.focus(E['tt-title']); };
  T.notice = function (n) { notice = n; };
})(typeof window !== 'undefined' ? window : globalThis);
