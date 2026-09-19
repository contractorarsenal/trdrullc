/*
 * REPLAY ENGINE.
 * Read-only playback of a finished session: the chart, the student's entries and exits, their position size and
 * the moments that mattered (scripted events, the peak, the low, their own orders). Nothing here can change a result.
 */
(function (root) {
  'use strict';
  var TYS = root.TYS = root.TYS || {}, fmt = TYS.fmt;

  var Replay = TYS.Replay = {};

  // One replay item per stage of every scenario in the session.
  Replay.build = function (runs) {
    var items = [];
    runs.forEach(function (run, ri) {
      run.sims.forEach(function (sim, si) {
        var stage = run.instance.stages[si], marks = [], anchors = [];
        sim.log.forEach(function (x, i) {
          if (x.auto && !x.close) { marks.push({ t: x.t, type: 'sell', auto: true, label: 'STOPPED OUT', mcap: x.mcap }); return; }
          if (x.close) return;
          var label = x.type === 'buy' ? 'BUY ' + fmt.usd0(x.usd) + (x.sizePct != null ? ' (' + fmt.pct0(x.sizePct) + ' of portfolio)' : '') : x.type === 'sell' ? 'SELL ' + fmt.pct0(x.pct) : x.type.toUpperCase();
          marks.push({ t: x.t, type: x.type, label: label, mcap: x.mcap, usd: x.usd, pct: x.pct, sizePct: x.sizePct, index: i });
        });
        sim.events.forEach(function (e) { anchors.push({ t: e.t, kind: e.kind, label: e.label, source: 'event' }); });
        var pk = sim.path.extremes(0, sim.duration);
        anchors.push({ t: pk.highT, kind: 'peak', label: 'Highest price ' + fmt.mcap(pk.high), source: 'peak' });
        anchors.push({ t: pk.lowT, kind: 'low', label: 'Lowest price ' + fmt.mcap(pk.low), source: 'low' });
        var sum = sim.summary(), em = sum.episodeMetrics;
        Object.keys(em).forEach(function (n) { var e = em[n]; if (e && e.trough != null && e.trough <= -0.1) anchors.push({ t: e.troughT, kind: 'drawdown', label: 'Your position was down ' + fmt.pctAbs(e.trough), source: 'drawdown' }); });
        marks.forEach(function (m) { anchors.push({ t: m.t, kind: 'decision', label: m.label + ' at ' + fmt.mcap(m.mcap), source: 'decision' }); });
        anchors.sort(function (a, b) { return a.t - b.t; });
        items.push({ run: ri, stage: si, id: run.def.id, title: run.def.title + (run.stageCount > 1 ? ' (' + (stage.token ? stage.token.ticker : 'stage ' + (si + 1)) + ')' : ''), level: run.level,
          token: stage.token, sim: sim, stageDef: stage, duration: sim.duration, marks: marks, anchors: anchors, levelsLine: stage.levelsLine || [], headline: stage.headline || null });
      });
    });
    return items;
  };

  // Everything the replay screen shows at time t.
  Replay.stateAt = function (item, t) {
    var sim = item.sim, m = sim.analyze(t), pf = m.portfolio, price = sim.path.priceAt(t), v = pf.value(price);
    return { t: t, price: price, value: v, holding: pf.hasPosition(price), marks: item.marks.filter(function (x) { return x.t <= t + 1e-6; }),
      anchorsSoFar: item.anchors.filter(function (a) { return a.t <= t + 1e-6; }) };
  };
  Replay.nextAnchor = function (item, t) { for (var i = 0; i < item.anchors.length; i++) if (item.anchors[i].t > t + 1) return item.anchors[i]; return null; };
  Replay.prevAnchor = function (item, t) { var r = null; for (var i = 0; i < item.anchors.length; i++) if (item.anchors[i].t < t - 1) r = item.anchors[i]; return r; };
  // model for chart.render(): the whole path up to time t, plus this student's markers and the scenario's level lines
  Replay.chartModel = function (item, t) {
    var sim = item.sim, f = sim.path.forming(t), unit = sim.path.unit, markers = [];
    item.marks.forEach(function (x) { if (x.t > t + 1e-6) return; var k = Math.min(sim.path.N - 1, Math.floor(x.t / sim.candleMs)); markers.push({ index: sim.path.H + k, type: x.type === 'sell' ? 'sell' : 'buy', note: x.type === 'sell' && !x.auto ? fmt.pct0(x.pct) : '' }); });
    var lines = (item.levelsLine || []).map(function (l) { return { price: l.price * unit, label: l.label, level: true }; });
    return { all: sim.path.all, formingIndex: f.index, forming: f, markers: markers, lines: lines };
  };
})(typeof window !== 'undefined' ? window : globalThis);
