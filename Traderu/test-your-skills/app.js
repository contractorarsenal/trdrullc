/*
 * TEST YOUR SKILLS: UI controller.
 *
 * Wires the DOM to the engine. It contains no scenario numbers or copy: everything comes from
 * scenarios.js. Phases: intro -> brief -> play -> reflect (x3 rounds) -> results.
 *
 * Query parameters (none are visible in the normal UI):
 *   ?presenter=true   presenter controls (pause / resume / restart scenario) and the slower presenter speed
 *   ?speed=dev        fast playback for testing (or ?speed=normal|presenter|<number>)
 */
(function () {
  'use strict';
  var TYS = window.TYS, CFG = TYS.CONFIG, SCEN = TYS.SCENARIOS, fmt = TYS.fmt;

  /* ------------------------------------------------------------ config from URL */
  var params = new URLSearchParams(window.location.search);
  var presenter = /^(true|1|yes)$/i.test(params.get('presenter') || '');
  var BASE_SPEED = (function () {
    var s = CFG.speeds || {}, key = params.get('speed');
    if (key) { if (s[key] != null) return s[key]; var n = parseFloat(key); if (isFinite(n) && n > 0) return Math.min(n, 60); }
    return presenter ? (s.presenter || 1) : (s.normal || 1);
  })();
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------ dom */
  function $(id) { return document.getElementById(id); }
  var E = {};
  ['view-intro', 'view-terminal', 'view-results', 'btn-start', 'tt-round', 'tt-title', 'tt-ticker', 'tt-name', 'tt-mcap', 'tt-change', 'tt-unit',
    'tt-live', 'tt-status', 'tt-timer', 'tt-progress', 'chart-legend', 'chart-host', 'paused-badge', 'brief-overlay', 'brief-eyebrow', 'brief-title',
    'brief-lines', 'brief-setup', 'brief-question', 'btn-begin', 'resume-overlay', 'btn-resume', 'panel-stats', 'st-mcap', 'st-vol', 'st-liq', 'st-bs',
    'st-bar', 'st-bar2', 'st-mom', 'st-social', 'panel-port', 'pf-cash', 'pf-pos', 'pf-unreal', 'pf-real', 'pf-total', 'pf-detail', 'panel-actions',
    'am-mcap', 'am-pnl', 'act-question', 'act-grid', 'act-status', 'ff-wrap', 'btn-ff', 'ff-sub', 'panel-reflect', 'rf-label', 'rf-title', 'rf-none',
    'rf-fields', 'rf-question', 'rf-input', 'btn-continue', 'feed-list', 'trades-list', 'res-rounds', 'res-title', 'btn-restart', 'presenter-bar',
    'btn-pause', 'btn-prestart', 'presenter-state', 'sr-live', 'intro-title'
  ].forEach(function (id) { E[id] = $(id); });

  function setText(el, s) { if (el._t !== s) { el._t = s; el.textContent = s; } }
  function setCls(el, name, on) { if (el._c === undefined) el._c = {}; if (el._c[name] !== on) { el._c[name] = on; el.classList.toggle(name, on); } }
  function announce(msg) { E['sr-live'].textContent = ''; setTimeout(function () { E['sr-live'].textContent = msg; }, 30); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function sign(v) { return v > 0.004 ? 'up' : v < -0.004 ? 'down' : 'flat'; }
  function arrow(v) { return v > 0.004 ? '▲ ' : v < -0.004 ? '▼ ' : ''; }
  function tokensText(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

  /* ------------------------------------------------------------ state */
  var state = { phase: 'intro', round: 0, records: [], paused: false, gate: false, ff: 1 };
  var sim = null, chart = null, actionBtns = [], legendEls = null;
  var lastTs = 0, lastSave = 0, cooldownUntil = 0, lastFeedN = -1, lastLogN = -1, markers = [], markersN = -1, noteTimer = 0;

  function newRecord() { return { started: false, elapsed: 0, actions: [], note: '' }; }
  function rec() { return state.records[state.round]; }
  function scen() { return SCEN[state.round]; }

  /* ------------------------------------------------------------ persistence */
  function sanitize(r) {
    if (!r || typeof r !== 'object') return newRecord();
    var out = newRecord();
    out.started = !!r.started; out.elapsed = isFinite(+r.elapsed) ? Math.max(0, +r.elapsed) : 0;
    out.note = typeof r.note === 'string' ? r.note.slice(0, 500) : '';
    out.actions = (Array.isArray(r.actions) ? r.actions : []).filter(function (a) { return a && typeof a.type === 'string' && isFinite(+a.t); })
      .map(function (a) { return { type: a.type, pct: a.pct == null ? undefined : +a.pct, t: +a.t }; });
    return out;
  }
  function save() {
    try { sessionStorage.setItem(CFG.storageKey, JSON.stringify({ v: CFG.version, phase: state.phase, round: state.round, records: state.records })); } catch (e) { /* storage unavailable */ }
  }
  function clearSaved() { try { sessionStorage.removeItem(CFG.storageKey); } catch (e) { /* ignore */ } }
  function loadSaved() {
    try {
      var raw = sessionStorage.getItem(CFG.storageKey); if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || d.v !== CFG.version || !Array.isArray(d.records) || d.records.length !== SCEN.length) return null;
      d.records = d.records.map(sanitize);
      if (!(d.round >= 0 && d.round < SCEN.length)) return null;
      return d;
    } catch (e) { return null; }
  }

  /* ------------------------------------------------------------ views */
  function showView(name) {
    E['view-intro'].hidden = name !== 'intro'; E['view-terminal'].hidden = name !== 'terminal'; E['view-results'].hidden = name !== 'results';
    window.scrollTo(0, 0);
  }
  function focusEl(node) { try { node.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }

  function ensureChart() {
    if (chart) return;
    legendEls = {};
    ['o', 'h', 'l', 'c', 'v'].forEach(function (k) {
      var s = el('span'), b = el('b'); s.appendChild(document.createTextNode(k.toUpperCase() + ' ')); s.appendChild(b); E['chart-legend'].appendChild(s); legendEls[k] = b;
    });
    chart = TYS.createChart(E['chart-host'], { onLegend: function (c) {
      setText(legendEls.o, fmt.mcap(c.o)); setText(legendEls.h, fmt.mcap(c.h)); setText(legendEls.l, fmt.mcap(c.l)); setText(legendEls.c, fmt.mcap(c.c)); setText(legendEls.v, fmt.volume(c.v));
    } });
  }

  /* ------------------------------------------------------------ rounds */
  function buildActions(sc) {
    E['act-grid'].textContent = ''; actionBtns = [];
    E['act-grid'].setAttribute('data-layout', sc.actions.some(function (a) { return a.id === 'sell'; }) ? 'manage' : 'entry');
    sc.actions.forEach(function (def) {
      var b = el('button', 'tbtn ' + (def.id === 'buy' ? 'tbtn-buy' : def.id === 'sell' ? 'tbtn-sell' : 'tbtn-ghost'));
      b.type = 'button';
      var l = el('span', 'tb-l', def.label), s = el('span', 'tb-s', '');
      b.appendChild(l); b.appendChild(s);
      b.addEventListener('click', function () { onAction(def); });
      E['act-grid'].appendChild(b); actionBtns.push({ def: def, b: b, s: s });
    });
  }

  function loadRound(i, opts) {
    opts = opts || {};
    ensureChart();
    state.round = i; if (!state.records[i]) state.records[i] = newRecord();
    var sc = SCEN[i], r = state.records[i];
    sim = TYS.restoreSim(sc, CFG, r);
    state.paused = false; state.gate = false; state.ff = 1; cooldownUntil = 0;
    lastFeedN = -1; lastLogN = -1; markersN = -1;
    E['tt-round'].textContent = 'ROUND ' + (i + 1) + ' / ' + SCEN.length;
    E['tt-title'].textContent = sc.title;
    E['tt-ticker'].textContent = sc.token.ticker; E['tt-name'].textContent = sc.token.name;
    E['act-question'].textContent = sc.brief.question;
    buildActions(sc); chart.reset();
    E['feed-list']._t = undefined; E['trades-list']._t = undefined;
    if (!r.started) state.phase = 'brief';
    else if (sim.done()) state.phase = 'reflect';
    else { state.phase = 'play'; if (opts.restored) { state.paused = true; state.gate = true; } }
    showView('terminal');
    applyPhase(true);
    save();
  }

  function applyPhase(focusHeading) {
    var ph = state.phase, sc = scen();
    E['brief-overlay'].hidden = ph !== 'brief';
    E['resume-overlay'].hidden = !(ph === 'play' && state.gate);
    E['panel-reflect'].hidden = ph !== 'reflect';
    E['panel-stats'].hidden = ph === 'reflect';
    E['panel-actions'].hidden = ph === 'reflect';
    if (ph === 'brief') {
      E['brief-eyebrow'].textContent = sc.eyebrow; E['brief-title'].textContent = sc.title;
      E['brief-lines'].textContent = ''; sc.brief.lines.forEach(function (t) { E['brief-lines'].appendChild(el('p', '', t)); });
      E['brief-setup'].textContent = ''; (sc.brief.setup || []).forEach(function (t) { E['brief-setup'].appendChild(el('span', '', t)); });
      E['brief-question'].textContent = sc.brief.question;
      E['btn-begin'].textContent = 'Start ' + sc.eyebrow.toLowerCase();
      if (focusHeading) focusEl(E['brief-title']);
    }
    if (ph === 'reflect') buildReflect(focusHeading);
    updatePresenterUi();
  }

  function beginRound() {
    if (state.phase !== 'brief') return;
    sim.start(); rec().started = true; state.phase = 'play'; lastTs = 0;
    applyPhase(false); save();
    announce(scen().eyebrow + ' started. ' + scen().brief.question);
  }

  function resume() {
    if (state.phase !== 'play') return;
    state.paused = false; state.gate = false; lastTs = 0;
    E['resume-overlay'].hidden = true; updatePresenterUi();
  }
  function togglePause() {
    if (state.phase !== 'play') return;
    if (state.gate) { resume(); return; }
    state.paused = !state.paused; lastTs = 0; updatePresenterUi();
    announce(state.paused ? 'Simulation paused.' : 'Simulation resumed.');
  }
  function restartScenario() {
    if (E['view-terminal'].hidden) return;
    state.records[state.round] = newRecord(); loadRound(state.round);
    announce(scen().eyebrow + ' restarted.');
  }
  function updatePresenterUi() {
    if (!presenter) return;
    var inRound = !E['view-terminal'].hidden;
    E['btn-pause'].disabled = state.phase !== 'play';
    E['btn-pause'].textContent = state.paused ? 'Resume' : 'Pause';
    E['btn-prestart'].disabled = !inRound;
    E['presenter-state'].textContent = !inRound ? '' : state.phase === 'play' ? (state.paused ? 'Paused' : 'Running') : state.phase;
  }

  function onRoundEnd() {
    state.phase = 'reflect'; state.ff = 1; state.paused = false;
    rec().elapsed = sim.elapsed; save();
    applyPhase(true);
    announce(scen().eyebrow + ' complete.');
  }

  /* ------------------------------------------------------------ actions */
  function labelFor(id) { var a = scen().actions.filter(function (x) { return x.id === id; })[0]; return a ? a.label : id.toUpperCase(); }

  function onAction(def) {
    if (state.phase !== 'play' || state.gate || !sim) return;
    var now = performance.now(); if (now < cooldownUntil) return;
    var res = sim.act(def.id, { pct: def.pct });
    if (!res.ok) return;
    cooldownUntil = now + CFG.actionCooldownMs;
    var r = rec(); r.actions = sim.snapshot().actions; r.elapsed = sim.elapsed; save();
    var t = res.trade, msg;
    if (t.type === 'buy') msg = 'Bought ' + fmt.usd(t.usd) + ' at ' + fmt.mcap(t.mcap) + ' market cap.';
    else if (t.type === 'sell') msg = 'Sold ' + fmt.pct0(t.pct) + ' of the position for ' + fmt.usd(t.usd) + '.';
    else msg = labelFor(t.type) + ' at ' + fmt.mcap(t.mcap) + '.';
    announce(sim.locked && !sim.done() ? msg + ' Decision locked.' : msg);
  }

  E['btn-ff'].addEventListener('click', function () {
    state.ff = state.ff === 1 ? CFG.fastForward : 1;
  });

  /* ------------------------------------------------------------ rendering */
  function chartModel() {
    var sc = scen(), f = sim.forming();
    if (markersN !== sim.trades.length) {
      markersN = sim.trades.length; markers = [];
      if (sc.startingPosition && sc.startingPosition.markerCandle != null) markers.push({ index: sc.startingPosition.markerCandle, type: 'entry' });
      sim.trades.forEach(function (tr) {
        var k = Math.min(sim.N - 1, Math.floor(tr.t / sim.candleMs));
        markers.push({ index: sim.H + k, type: tr.type === 'sell' ? 'sell' : 'buy' });
      });
    }
    var pf = sim.portfolio(), lines = [];
    if (pf.avgEntry) lines.push({ price: pf.avgEntry, label: fmt.mcap(pf.avgEntry) });
    return { all: sim.all, formingIndex: f.index, forming: f, markers: markers, lines: lines };
  }

  function renderTop(price) {
    var sc = scen(), first = sim.all[sim.H].o, chg = first > 0 ? price / first - 1 : 0, ph = state.phase;
    setText(E['tt-mcap'], fmt.mcap(price));
    setText(E['tt-change'], arrow(chg) + fmt.pct(chg) + ' since start');
    setCls(E['tt-change'], 'up', chg > 0.0005); setCls(E['tt-change'], 'down', chg < -0.0005); setCls(E['tt-change'], 'flat', Math.abs(chg) <= 0.0005);
    setText(E['tt-unit'], 'PRICE ' + fmt.price(price / CFG.supply));
    setText(E['tt-timer'], fmt.clock(sim.elapsed) + ' / ' + fmt.clock(sim.duration));
    E['tt-progress'].style.width = (sim.progress() * 100).toFixed(2) + '%';
    var label = ph === 'brief' ? 'READY' : ph === 'reflect' ? 'ROUND COMPLETE' : state.paused ? 'PAUSED' : 'LIVE SIMULATION';
    setText(E['tt-status'], label);
    setCls(E['tt-live'], 'is-idle', ph === 'brief' || ph === 'reflect'); setCls(E['tt-live'], 'is-paused', ph === 'play' && state.paused);
    E['paused-badge'].hidden = !(ph === 'play' && state.paused && !state.gate);
  }

  var MOM = { HIGH: 'good', EXTREME: 'hot', FADING: 'cold', WEAKENING: 'cold' };
  function renderStats(price) {
    var s = sim.stats(); setText(E['st-mcap'], fmt.mcap(price));
    if (!s) return;
    setText(E['st-vol'], fmt.volume(s.volume)); setText(E['st-liq'], fmt.mcap(s.liquidity));
    setText(E['st-bs'], Math.round(s.buys) + ' / ' + Math.round(s.sells));
    E['st-bar'].style.width = s.buys.toFixed(1) + '%'; E['st-bar2'].style.width = s.sells.toFixed(1) + '%';
    setText(E['st-mom'], s.momentum);
    var cls = MOM[s.momentum] || ''; E['st-mom'].className = 'mom' + (cls ? ' ' + cls : '');
    setText(E['st-social'], (s.social >= 0 ? '+' : '') + Math.round(s.social) + '%');
  }

  function pnlText(v, pct) { return arrow(v) + fmt.signedUsd(v) + (pct == null ? '' : ' (' + fmt.pct(pct) + ')'); }
  function renderPortfolio() {
    var pf = sim.portfolio(), open = pf.shares > 1e-12 && pf.positionValue >= 0.005;
    setText(E['pf-cash'], fmt.usd(pf.cash)); setText(E['pf-pos'], fmt.usd(open ? pf.positionValue : 0));
    setText(E['pf-unreal'], open ? pnlText(pf.unrealized, pf.unrealizedPct) : fmt.signedUsd(0));
    setText(E['pf-real'], pnlText(pf.realized));
    setText(E['pf-total'], fmt.usd(pf.total));
    var un = open ? pf.unrealized : 0;
    ['up', 'down', 'flat'].forEach(function (c) { setCls(E['pf-unreal'], c, sign(un) === c); setCls(E['pf-real'], c, sign(pf.realized) === c); });
    setText(E['pf-detail'], open ? tokensText(pf.tokens) + ' ' + scen().token.ticker + '  |  avg entry ' + fmt.mcap(pf.avgEntry) : 'No open position');
    var pnl = pf.realized + un;
    setText(E['am-mcap'], fmt.mcap(sim.price())); setText(E['am-pnl'], fmt.signedUsd(pnl));
    return pf;
  }

  function renderActions(pf) {
    var locked = sim.locked, done = sim.done(), ph = state.phase;
    var busy = performance.now() < cooldownUntil, blocked = state.gate || ph !== 'play';
    actionBtns.forEach(function (a) {
      var st = sim.actionState(a.def.id, a.def.pct), sub = '';
      if (a.def.id === 'buy') sub = fmt.usd(pf.cash);
      else if (a.def.id === 'sell' && pf.positionValue >= 0.005) sub = '≈ ' + fmt.usd(pf.positionValue * a.def.pct);
      setText(a.s, sub);
      a.b.disabled = !st.enabled || blocked;
      a.b.setAttribute('aria-disabled', busy && !a.b.disabled ? 'true' : 'false');
    });
    var msg = '', msgHtmlBold = '';
    if (ph === 'brief') msg = 'Start the round to begin the market clock.';
    else if (done) msg = 'Round complete.';
    else if (locked) { var m = scen().messages || {}; msg = m[sim.decision === 'exited' ? 'flat' : sim.decision] || 'Decision locked.'; msgHtmlBold = 'Decision locked. '; }
    var show = !!msg;
    if (E['act-status']._show !== show || E['act-status']._t !== msgHtmlBold + msg) {
      E['act-status']._show = show; E['act-status']._t = msgHtmlBold + msg; E['act-status'].hidden = !show; E['act-status'].textContent = '';
      if (msgHtmlBold) E['act-status'].appendChild(el('b', '', msgHtmlBold)); E['act-status'].appendChild(document.createTextNode(msg));
    }
    var ffShow = ph === 'play' && locked && !done;
    E['ff-wrap'].hidden = !ffShow;
    if (ffShow) { E['btn-ff'].setAttribute('aria-pressed', state.ff > 1 ? 'true' : 'false'); setText(E['ff-sub'], state.ff > 1 ? 'x' + CFG.fastForward + ' on' : 'x' + CFG.fastForward); }
  }

  function renderLists() {
    var feed = sim.feed();
    if (feed.length !== lastFeedN) {
      lastFeedN = feed.length; var ul = E['feed-list']; ul.textContent = '';
      if (!feed.length) ul.appendChild(el('li', '', 'Waiting for the market to open.'));
      feed.slice().reverse().slice(0, 12).forEach(function (f) {
        var li = el('li', f.tone), t = el('time', '', fmt.clock(f.t)); li.appendChild(t); li.appendChild(el('span', '', f.text)); ul.appendChild(li);
      });
    }
    if (sim.log.length !== lastLogN) {
      lastLogN = sim.log.length; var tl = E['trades-list']; tl.textContent = '';
      if (!sim.log.length) { var e0 = el('li'); e0.appendChild(el('span', 'empty', 'No actions yet.')); e0.style.gridTemplateColumns = '1fr'; tl.appendChild(e0); }
      sim.log.slice().reverse().slice(0, 40).forEach(function (tr) {
        var li = el('li'), t = el('time', '', fmt.clock(tr.t)), span = el('span');
        var name = tr.type === 'buy' ? 'BUY' : tr.type === 'sell' ? 'SELL' : labelFor(tr.type);
        var tag = el('span', tr.type === 'buy' ? 'buy' : tr.type === 'sell' ? 'sell' : '', name);
        span.appendChild(tag);
        var txt = ' ';
        if (tr.type === 'buy') txt += fmt.usd(tr.usd) + ' @ ' + fmt.mcap(tr.mcap);
        else if (tr.type === 'sell') txt += fmt.pct0(tr.pct) + ' for ' + fmt.usd(tr.usd) + ' @ ' + fmt.mcap(tr.mcap) + ' (' + fmt.signedUsd(tr.realizedDelta) + ')';
        else txt += '@ ' + fmt.mcap(tr.mcap);
        span.appendChild(document.createTextNode(txt)); li.appendChild(t); li.appendChild(span); tl.appendChild(li);
      });
    }
  }

  function render(dt) {
    var m = chartModel(), price = m.forming.c;
    chart.render(m, dt);
    renderTop(price); renderStats(price);
    var pf = renderPortfolio(); renderActions(pf); renderLists();
  }

  /* ------------------------------------------------------------ reflection */
  function buildReflect(focusHeading) {
    var sc = scen(), r = rec(), sum = sim.summary(), rf = TYS.buildReflection(sc, sum), last = state.round === SCEN.length - 1;
    E['rf-label'].textContent = sc.eyebrow + ' reflection';
    E['rf-none'].hidden = !rf.noEntry; E['rf-none'].textContent = rf.noEntry ? (rf.noEntryTitle || 'No position entered.') : '';
    E['rf-fields'].textContent = '';
    rf.fields.forEach(function (f) {
      var row = el('div', 'kv'); row.appendChild(el('dt', '', f.label)); row.appendChild(el('dd', '', f.value)); E['rf-fields'].appendChild(row);
    });
    E['rf-question'].textContent = sc.reflection.question;
    E['rf-input'].placeholder = sc.reflection.placeholder || '';
    E['rf-input'].value = r.note || '';
    E['btn-continue'].textContent = sc.reflection.continueLabel || (last ? 'See your decisions' : 'Continue');
    E['btn-continue'].disabled = false;
    if (focusHeading) { focusEl(E['rf-title']); E['panel-reflect'].scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' }); }
  }

  E['rf-input'].addEventListener('input', function () {
    if (state.phase !== 'reflect') return;
    rec().note = E['rf-input'].value.slice(0, 500);
    clearTimeout(noteTimer); noteTimer = setTimeout(save, 350);
  });
  E['btn-continue'].addEventListener('click', function () {
    if (state.phase !== 'reflect') return;
    E['btn-continue'].disabled = true;
    rec().note = E['rf-input'].value.trim().slice(0, 500);
    if (state.round < SCEN.length - 1) loadRound(state.round + 1);
    else showResults();
    save();
  });

  /* ------------------------------------------------------------ results */
  function showResults() {
    state.phase = 'results'; sim = null;
    var host = E['res-rounds']; host.textContent = '';
    SCEN.forEach(function (sc, i) {
      var r = state.records[i] || newRecord(), s = TYS.restoreSim(sc, CFG, r);
      s.start(); s.elapsed = s.duration;
      var sum = s.summary(), recap = TYS.buildRecap(sc, sum);
      var art = el('article', 'res-round');
      art.appendChild(el('h2', '', recap.heading));
      art.appendChild(el('p', 'res-tag', sc.eyebrow + '  |  ' + sc.title));
      recap.sentences.forEach(function (t) { art.appendChild(el('p', 's', t)); });
      var dl = el('dl', 'res-stats');
      recap.fields.forEach(function (f) { var d = el('div'); d.appendChild(el('dt', '', f.label)); d.appendChild(el('dd', '', f.value)); dl.appendChild(d); });
      art.appendChild(dl);
      var note = el('div', 'res-note'); note.appendChild(el('span', 'k', sc.reflection.question));
      note.appendChild(el('p', r.note ? '' : 'none', r.note || 'No response entered.')); art.appendChild(note);
      host.appendChild(art);
    });
    showView('results'); focusEl(E['res-title']); updatePresenterUi(); save();
    announce('Simulation complete. Your decisions are listed on the page.');
  }

  function restartAll() {
    clearSaved(); state.records = SCEN.map(newRecord); state.round = 0; state.phase = 'intro'; state.paused = false; state.gate = false; state.ff = 1; sim = null;
    showView('intro'); focusEl(E['intro-title']); updatePresenterUi();
  }

  function startAll() {
    state.records = SCEN.map(newRecord); loadRound(0);
    announce('Round 1 loaded. Read the situation, then start the round.');
  }

  /* ------------------------------------------------------------ loop */
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!lastTs) lastTs = ts;
    var dt = Math.min(100, Math.max(0, ts - lastTs)); lastTs = ts;
    if (!sim || state.phase === 'intro' || state.phase === 'results') return;
    var playing = state.phase === 'play' && !state.paused;
    if (playing) {
      sim.advance(dt * BASE_SPEED * state.ff);
      if (sim.done()) { onRoundEnd(); }
      else if (ts - lastSave > 1000) { lastSave = ts; rec().elapsed = sim.elapsed; save(); }
    }
    render(playing || state.phase === 'brief' ? dt : 0);
  }

  /* ------------------------------------------------------------ wiring */
  E['btn-start'].addEventListener('click', startAll);
  E['btn-begin'].addEventListener('click', beginRound);
  E['btn-resume'].addEventListener('click', resume);
  E['btn-restart'].addEventListener('click', restartAll);
  if (presenter) {
    E['presenter-bar'].hidden = false;
    E['btn-pause'].addEventListener('click', togglePause);
    E['btn-prestart'].addEventListener('click', restartScenario);
    document.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'p' || e.key === 'P') togglePause();
    });
    updatePresenterUi();
  }
  window.addEventListener('pagehide', function () { if (sim && state.phase === 'play') { rec().elapsed = sim.elapsed; } save(); });
  document.addEventListener('visibilitychange', function () { lastTs = 0; if (document.hidden && sim && state.phase === 'play') { rec().elapsed = sim.elapsed; save(); } });

  // restore an interrupted session (e.g. an accidental refresh)
  var saved = loadSaved();
  if (saved && saved.phase !== 'intro') {
    state.records = saved.records;
    if (saved.phase === 'results') { showResults(); }
    else { loadRound(saved.round, { restored: true }); }
  } else { state.records = SCEN.map(newRecord); }
  requestAnimationFrame(frame);
})();
