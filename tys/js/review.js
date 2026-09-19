/*
 * UI: the final review (results) and the session replay. Presentation only: every number and sentence comes
 * from behavior.js / replay.js, which read the same recorded decisions the simulator used.
 */
(function (root) {
  'use strict';
  var TYS = root.TYS = root.TYS || {}, UI = TYS.UI, fmt = TYS.fmt, Session = TYS.Session;
  var $ = UI.$, el = UI.el;

  /* ------------------------------------------------------------ per-scenario facts (label/value rows) */
  UI.factRows = function (f) {
    var r = [], K = f.kind;
    function entryRow() { r.push(['Your entry', f.entry ? fmt.mcap(f.entry.mcap) + ' at ' + fmt.clock(f.entry.t) : 'No entry']); }
    if (K === 'entry' || K === 'fomo' || K === 'breakout') {
      entryRow(); r.push(['Waits', String(f.waits)]); r.push(['Lowest / highest', fmt.mcap(f.lowMcap) + ' / ' + fmt.mcap(f.peakMcap)]); r.push(['Final market cap', fmt.mcap(f.finalMcap)]);
      if (f.entry) r.push(['Net result', fmt.pnl(f.pnl, f.pnlPct)]); else if (f.pass) r.push(['Passed at', fmt.mcap(f.pass.mcap) + ' at ' + fmt.clock(f.pass.t)]);
    } else if (K === 'manage' || K === 'moonbag') {
      var moon = K === 'moonbag', nm = moon ? 'Moon bag' : 'Position';
      r.push(['Initial capital', f.capitalAtStart || (f.capital && f.capital.recovered) ? 'Recovered' : 'At risk']); r.push([nm + ' at start', fmt.usd(f.startPositionValue)]); r.push(['Peak ' + nm.toLowerCase() + ' value', fmt.usd(f.peakPositionValue)]);
      r.push(['Final ' + nm.toLowerCase() + ' value', fmt.usd(f.finalPositionValue)]); r.push(['Realized P&L', fmt.signedUsd(f.realized)]); r.push(['Unrealized P&L', fmt.signedUsd(f.unrealized)]); r.push(['Portfolio', fmt.usd(f.total)]);
      r.push(['Below peak at end', f.stillHolding ? fmt.pct0(f.drawdownFromPeakPct) : 'Exited']);
      if (f.exitAllT != null) r.push(['After your exit', 'High ' + fmt.mcap(f.afterExitHigh) + ', final ' + fmt.mcap(f.afterExitFinal)]);
    } else if (K === 'revenge') {
      r.push(['Previous trade', fmt.signedUsd(f.previousTrade.pnl) + ' on ' + fmt.usd0(f.previousTrade.size)]);
      r.push(['Next position', f.second ? fmt.usd0(f.second.size) + (f.second.ratio != null ? ' (' + fmt.ratio(f.second.ratio) + ' the previous)' : '') : (f.passed ? 'Passed' : 'None')]);
      r.push(['Second trade', f.second ? fmt.signedUsd(f.secondPnl) : 'No trade']); r.push(['Session P&L', fmt.signedUsd(f.sessionPnl) + ' (' + fmt.pct0(f.sessionPct) + ')']); r.push(['That coin later peaked', fmt.pct0(f.runAfter) + ' above its start']);
    } else if (K === 'cut') {
      f.warnings.forEach(function (w, i) { r.push(['At warning ' + (i + 1), w.pct != null ? fmt.pct(w.pct) : 'Already out']); }); r.push(['Maximum drawdown', f.maxDrawdown != null ? fmt.pct(f.maxDrawdown) : '-']); r.push(['Added while losing', String(f.addedWhileLosing)]);
      r.push(['Exit', f.exitT != null ? fmt.clock(f.exitT) : 'Still holding']); r.push(['Final result', fmt.pnl(f.finalLoss, f.finalPct)]);
    } else if (K === 'size') {
      f.setups.forEach(function (x, i) { r.push(['Setup ' + (i + 1), x.entered ? 'You risked ' + fmt.pct0(x.sizePct) + ' (' + fmt.usd0(x.usd) + '), ' + fmt.signedUsd(x.net) : x.passed ? 'Passed' : 'No position']); });
      r.push(['Largest position', fmt.pct0(f.maxPct) + ' of portfolio']); r.push(['Portfolio', fmt.usd(f.total)]);
    } else if (K === 'volume') {
      entryRow(); r.push(['At your entry', f.entryText ? 'Volume ' + f.entryText.volume + ', liquidity ' + f.entryText.liquidity + ', holders ' + f.entryText.holders : 'No entry']); r.push(['Wallet activity', f.entryText ? f.entryText.wallets : '-']);
      r.push(['Price from start', fmt.pct(f.movePct)]); if (f.entry) r.push(['Net result', fmt.pnl(f.pnl, f.pnlPct)]);
    } else if (K === 'coin-timing') {
      r.push(['GOOD COIN', 'Rose ' + fmt.pct0(f.coinReturn) + ' from the start']); r.push(['GOOD ENTRY', f.entry ? fmt.pct0(f.entryVsLow) + ' above the correction low' : 'No entry']); entryRow();
      if (f.entry) { r.push(['Worst drawdown', fmt.pct(f.troughAfter)]); r.push(['Net result', fmt.pnl(f.pnl, f.pnlPct)]); }
    } else r.push(['Net result', fmt.pnl(f.pnl, f.pnlPct)]);
    return r;
  };

  /* ------------------------------------------------------------ results */
  function block(title, sentences) { var b = el('section', 'rv-block'); b.appendChild(el('h2', '', title)); sentences.forEach(function (t) { b.appendChild(el('p', '', t)); }); return b; }
  UI.renderResults = function (state, runs) {
    var host = $('res-body'); host.textContent = ''; var rep = TYS.Behavior.report(runs, state.profile);
    var lead = el('p', 'res-lead'); [['Profile', Session.levelLabel(state.profile.level)], ['Scenarios', String(runs.length)]].forEach(function (p) { var s = el('span'); s.appendChild(document.createTextNode(p[0] + '  ')); s.appendChild(el('b', '', p[1])); lead.appendChild(s); }); host.appendChild(lead);
    host.appendChild(block('ENTRIES', rep.sections.entries)); host.appendChild(block('POSITION MANAGEMENT', rep.sections.management.length ? rep.sections.management : ['No positions were managed in this session.']));
    host.appendChild(block('RISK', rep.sections.risk.length ? rep.sections.risk : ['No positions were opened, so no position size was recorded.'])); host.appendChild(block('AFTER A LOSS', rep.sections.afterLoss)); host.appendChild(block('FOMO', rep.sections.fomo));
    host.appendChild(el('h2', 'sec-h', 'Skill areas'));
    var grid = el('div', 'skill-grid'); [['ENTRY DECISIONS', rep.skills.entry], ['PROFIT MANAGEMENT', rep.skills.profit], ['RISK', rep.skills.risk], ['DISCIPLINE', rep.skills.discipline], ['MARKET READING', rep.skills.reading]].forEach(function (s) {
      var d = el('article', 'skill'); d.appendChild(el('h3', '', s[0])); s[1].forEach(function (t) { d.appendChild(el('p', '', t)); }); grid.appendChild(d); }); host.appendChild(grid);
    host.appendChild(el('h2', 'sec-h', 'Scenario by scenario'));
    runs.forEach(function (run, i) {
      var f = rep.facts[i], art = el('article', 'res-round'); art.appendChild(el('h2', '', run.def.title)); art.appendChild(el('p', 'res-tag', 'Scenario ' + (i + 1) + '  |  ' + Session.levelLabel(run.level)));
      var dl = el('dl', 'res-stats'); UI.factRows(f).forEach(function (p) { var d = el('div'); d.appendChild(el('dt', '', p[0])); d.appendChild(el('dd', '', p[1])); dl.appendChild(d); }); art.appendChild(dl);
      var log = el('div', 'res-log'); log.appendChild(el('h3', '', 'Your activity')); var ul = el('ul'); ul.style.cssText = 'list-style:none;margin:0;padding:0'; var any = false;
      run.sims.forEach(function (sim, si) { sim.log.forEach(function (tr) { if (tr.auto) return; any = true; var d = TYS.describeLogLine(sim.stage, tr), li = el('li'), sp = el('span'); sp.appendChild(el('span', d.kind, d.name)); if (d.detail) sp.appendChild(document.createTextNode(' ' + d.detail)); li.appendChild(el('time', '', d.clock)); li.appendChild(sp); ul.appendChild(li); }); });
      if (!any) { var e0 = el('li'); e0.style.gridTemplateColumns = '1fr'; e0.appendChild(el('span', 'dim', 'No decisions recorded.')); ul.appendChild(e0); }
      log.appendChild(ul); art.appendChild(log);
      var rec = state.records[i], note = el('div', 'res-note'); note.appendChild(el('span', 'k', run.def.reflection.question)); note.appendChild(el('p', rec.note ? '' : 'none', rec.note || 'No response entered.')); art.appendChild(note); host.appendChild(art);
    });
    $('res-close-big').textContent = runs.length + ' scenarios. ' + runs.length + ' situations traders deal with every day.';
    return rep;
  };

  /* ------------------------------------------------------------ replay */
  var RP = { items: [], i: 0, t: 0, playing: false, chart: null, raf: 0, last: 0, E: {} };
  function bindReplay() {
    if (RP.bound) return; RP.bound = true;
    ['rp-title', 'rp-sub', 'rp-prev-sc', 'rp-next-sc', 'rp-back', 'rp-legend', 'rp-chart-host', 'rp-state', 'rp-anchors', 'rp-play', 'rp-prev-ev', 'rp-next-ev', 'rp-range', 'rp-clock'].forEach(function (id) { RP.E[id] = $(id); });
    var E = RP.E, legendEls = {}; ['o', 'h', 'l', 'c', 'v'].forEach(function (k) { var s = el('span'), b = el('b'); s.appendChild(document.createTextNode(k.toUpperCase() + ' ')); s.appendChild(b); E['rp-legend'].appendChild(s); legendEls[k] = b; });
    RP.chart = TYS.createChart(E['rp-chart-host'], { onLegend: function (c) { UI.setText(legendEls.o, fmt.mcap(c.o)); UI.setText(legendEls.h, fmt.mcap(c.h)); UI.setText(legendEls.l, fmt.mcap(c.l)); UI.setText(legendEls.c, fmt.mcap(c.c)); UI.setText(legendEls.v, fmt.volume(c.v)); } });
    E['rp-prev-sc'].addEventListener('click', function () { RP.go(RP.i - 1); }); E['rp-next-sc'].addEventListener('click', function () { RP.go(RP.i + 1); });
    E['rp-play'].addEventListener('click', function () { RP.playing ? RP.stop() : RP.play(); });
    E['rp-next-ev'].addEventListener('click', function () { RP.next(); }); E['rp-prev-ev'].addEventListener('click', function () { RP.prev(); });
    E['rp-range'].addEventListener('input', function () { RP.stop(); RP.seek(+E['rp-range'].value / 1000 * cur().duration); });
    E['rp-back'].addEventListener('click', function () { RP.stop(); RP.onBack && RP.onBack(); });
  }
  function cur() { return RP.items[RP.i]; }
  RP.open = function (runs, onBack, startAtPresenter) {
    bindReplay(); RP.items = TYS.Replay.build(runs); RP.onBack = onBack; RP.i = 0; RP.chart.reset(); UI.showView('replay'); RP.go(0); UI.focus(RP.E['rp-title']);
  };
  RP.go = function (i) {
    if (i < 0 || i >= RP.items.length) return; RP.stop(); RP.i = i; RP.chart.reset(); var it = cur(); var E = RP.E;
    E['rp-title'].firstChild.nodeValue = it.title; E['rp-sub'].textContent = 'Scenario ' + (it.run + 1) + '  |  ' + Session.levelLabel(it.level) + '  |  ' + (it.token ? it.token.ticker : '');
    E['rp-prev-sc'].disabled = i === 0; E['rp-next-sc'].disabled = i === RP.items.length - 1;
    var ul = E['rp-anchors']; ul.textContent = ''; it.anchors.forEach(function (a) { var li = el('li'), b = el('button'); b.type = 'button'; b.appendChild(el('time', '', fmt.clock(a.t))); b.appendChild(el('span', a.kind === 'decision' ? 'decision' : '', a.label)); b.addEventListener('click', function () { RP.stop(); RP.seek(a.t); }); li.appendChild(b); ul.appendChild(li); });
    RP.seek(0);
  };
  RP.seek = function (t) {
    var it = cur(); if (!it) return; RP.t = Math.max(0, Math.min(it.duration, t)); var E = RP.E, st = TYS.Replay.stateAt(it, RP.t);
    RP.chart.render(TYS.Replay.chartModel(it, RP.t), 0);
    E['rp-range'].value = Math.round(RP.t / it.duration * 1000); E['rp-clock'].textContent = fmt.clock(RP.t) + ' / ' + fmt.clock(it.duration);
    var s = E['rp-state']; s.textContent = '';
    [['Market cap', fmt.mcap(st.price)], ['Cash', fmt.usd(st.value.cash)], ['Position', st.holding ? fmt.usd(st.value.positionValue) + '  (cost ' + fmt.usd(st.value.cost) + ')' : 'None'], ['Unrealized', st.holding ? fmt.pnl(st.value.unrealized, st.value.unrealizedPct) : '+$0.00'], ['Realized', fmt.signedUsd(st.value.realized)], ['Total', fmt.usd(st.value.total)]].forEach(function (p) { var d = el('div', 'kv'); d.appendChild(el('span', 'k', p[0])); d.appendChild(el('span', 'v', p[1])); s.appendChild(d); });
    var last = null; it.anchors.forEach(function (a) { if (a.t <= RP.t + 1e-6) last = a; });
    Array.prototype.forEach.call(E['rp-anchors'].querySelectorAll('button'), function (b, k) { b.classList.toggle('now', it.anchors[k] === last); });
    E['rp-play'].textContent = RP.playing ? 'Pause' : (RP.t >= it.duration - 1 ? 'Replay' : 'Play');
  };
  RP.next = function () { var it = cur(), a = TYS.Replay.nextAnchor(it, RP.t); RP.stop(); RP.seek(a ? a.t : it.duration); };
  RP.prev = function () { var it = cur(), a = TYS.Replay.prevAnchor(it, RP.t); RP.stop(); RP.seek(a ? a.t : 0); };
  RP.play = function () { var it = cur(); if (RP.t >= it.duration - 1) RP.seek(0); RP.playing = true; RP.last = 0; RP.raf = requestAnimationFrame(RP.frame); RP.seek(RP.t); };
  RP.stop = function () { RP.playing = false; cancelAnimationFrame(RP.raf); };
  RP.frame = function (ts) { if (!RP.playing) return; if (!RP.last) RP.last = ts; var dt = Math.min(100, ts - RP.last); RP.last = ts; var it = cur(); RP.seek(RP.t + dt * 4); if (RP.t >= it.duration - 1) { RP.stop(); RP.seek(it.duration); return; } RP.raf = requestAnimationFrame(RP.frame); };
  RP.active = function () { return !$('view-replay').hidden; };
  UI.replay = RP;
})(typeof window !== 'undefined' ? window : globalThis);
