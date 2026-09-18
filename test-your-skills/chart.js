/*
 * TEST YOUR SKILLS: candlestick chart.
 *
 * A small dependency-free canvas renderer for the simulator's own scripted data. It draws candles
 * with wicks, a volume strip, a price axis, the live price tag, entry/sell markers and an entry line.
 * It never sees real market data.
 *
 * chart.render(model, dtMs) where model = {
 *   all:      [{o,h,l,c,v}, ...]  every candle (history + live) in market cap dollars
 *   formingIndex: index in `all` of the candle currently forming
 *   forming:  {o,h,l,c,v}         the forming candle with its running high/low
 *   markers:  [{index, type:'buy'|'sell'|'entry', label}]
 *   lines:    [{price, label}]    e.g. the position's average entry
 * }
 */
(function (root) {
  'use strict';
  var TYS = root.TYS = root.TYS || {};

  function niceStep(range) {
    var e = Math.pow(10, Math.floor(Math.log(range) / Math.LN10)), f = range / e;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * e;
  }

  TYS.createChart = function (host, opts) {
    opts = opts || {};
    var canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Simulated candlestick price chart');
    canvas.style.cssText = 'position:absolute;inset:0;display:block;touch-action:pan-y;';
    host.appendChild(canvas);
    var ctx = canvas.getContext('2d');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    var W = 0, H = 0, dpr = 1;
    var model = null, yMin = null, yMax = null, shift = 0, lastStart = null;
    var hover = null, legendSig = '', lastDt = 0;
    var C = {};

    function readColors() {
      var cs = getComputedStyle(host);
      function v(name, d) { var x = cs.getPropertyValue(name).trim(); return x || d; }
      C = { up: v('--c-up', '#2ED3A0'), down: v('--c-down', '#EF4565'), grid: v('--c-grid', 'rgba(255,255,255,0.06)'),
        text: v('--c-text', '#9C988F'), ink: v('--c-ink', '#F6F5F2'), accent: v('--c-accent', '#FF5A36'), bg: v('--c-bg', '#0A0A0B') };
    }
    readColors();

    function resize() {
      var r = host.getBoundingClientRect();
      var w = Math.max(60, Math.floor(r.width)), h = Math.max(60, Math.floor(r.height));
      var d = Math.min(2, window.devicePixelRatio || 1);
      if (w === W && h === H && d === dpr) return;
      W = w; H = h; dpr = d;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      if (model) draw(0);
    }
    if (window.ResizeObserver) new ResizeObserver(resize).observe(host);
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });
    resize();

    canvas.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      var r = canvas.getBoundingClientRect(); hover = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (model) draw(0);
    });
    canvas.addEventListener('pointerleave', function () { hover = null; if (model) draw(0); });

    function layout() {
      var mobile = W < 560, axisW = mobile ? 62 : 68, step = mobile ? 8.5 : 10.5;
      var L = { mobile: mobile, axisW: axisW, step: step, plotL: 6, plotR: W - axisW, plotT: 12, plotB: H - 6 };
      L.volH = Math.round((L.plotB - L.plotT) * 0.15);
      L.priceB = L.plotB - L.volH - 8;
      L.n = Math.max(20, Math.floor((L.plotR - L.plotL) / step));
      L.rightPad = Math.max(3, Math.round(L.n * 0.1));
      return L;
    }

    function candleAt(i) { return i === model.formingIndex ? model.forming : model.all[i]; }

    function draw(dt) {
      if (!model || !W) return;
      var L = layout(), fi = model.formingIndex, i;
      var start = Math.max(0, fi - (L.n - L.rightPad) + 1);
      if (lastStart != null && start > lastStart && !reduce) shift += (start - lastStart) * L.step;
      lastStart = start;
      shift *= dt > 0 ? Math.exp(-dt / 85) : 1; if (Math.abs(shift) < 0.2) shift = 0;

      // visible price range
      var lo = Infinity, hi = -Infinity, maxV = 1;
      for (i = start; i <= fi; i++) { var c = candleAt(i); if (c.l < lo) lo = c.l; if (c.h > hi) hi = c.h; if (c.v > maxV) maxV = c.v; }
      var pad = (hi - lo) * 0.09 + hi * 0.004, tMin = Math.max(0, lo - pad), tMax = hi + pad;
      if (yMin == null || reduce) { yMin = tMin; yMax = tMax; }
      else if (dt > 0) { var k = 1 - Math.exp(-dt / 110); yMin += (tMin - yMin) * k; yMax += (tMax - yMax) * k; }
      yMin = Math.min(yMin, lo - (hi - lo) * 0.02); yMax = Math.max(yMax, hi + (hi - lo) * 0.02);
      var span = yMax - yMin || 1;
      function Y(p) { return L.plotT + (1 - (p - yMin) / span) * (L.priceB - L.plotT); }
      function X(idx) { return Math.round(L.plotL + (idx - start + 0.5) * L.step + shift); }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';
      ctx.textBaseline = 'middle';

      // grid + axis labels
      var step = niceStep(span / 5), g = Math.ceil(yMin / step) * step;
      ctx.lineWidth = 1;
      for (; g < yMax; g += step) {
        var gy = Math.round(Y(g)) + 0.5;
        if (gy < L.plotT || gy > L.priceB) continue;
        ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(L.plotL, gy); ctx.lineTo(L.plotR, gy); ctx.stroke();
        ctx.fillStyle = C.text; ctx.textAlign = 'left'; ctx.fillText(TYS.fmt.mcap(g), L.plotR + 8, gy);
      }
      ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(L.plotR + 0.5, L.plotT); ctx.lineTo(L.plotR + 0.5, L.plotB); ctx.stroke();

      // clip candles to the plot
      ctx.save(); ctx.beginPath(); ctx.rect(L.plotL, 0, L.plotR - L.plotL, H); ctx.clip();
      var bodyW = Math.max(2, Math.floor(L.step * 0.62));
      for (i = start; i <= fi; i++) {
        var cd = candleAt(i), x = X(i), up = cd.c >= cd.o, col = up ? C.up : C.down;
        // volume
        var vh = Math.max(1, Math.round((cd.v / maxV) * L.volH));
        ctx.globalAlpha = 0.28; ctx.fillStyle = col; ctx.fillRect(x - Math.floor(bodyW / 2), L.plotB - vh, bodyW, vh); ctx.globalAlpha = 1;
        // wick + body
        ctx.fillStyle = col;
        var yh = Math.round(Y(cd.h)), yl = Math.round(Y(cd.l));
        ctx.fillRect(x, yh, 1, Math.max(1, yl - yh));
        var yo = Math.round(Y(cd.o)), yc = Math.round(Y(cd.c)), top = Math.min(yo, yc), bh = Math.max(1, Math.abs(yo - yc));
        ctx.fillRect(x - Math.floor(bodyW / 2), top, bodyW, bh);
      }

      // horizontal lines (entry)
      (model.lines || []).forEach(function (ln) {
        if (ln.price < yMin || ln.price > yMax) return;
        var ly = Math.round(Y(ln.price)) + 0.5;
        ctx.strokeStyle = C.accent; ctx.globalAlpha = 0.85; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(L.plotL, ly); ctx.lineTo(L.plotR, ly); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      });

      // markers
      (model.markers || []).forEach(function (m) {
        if (m.index < start || m.index > fi) return;
        var cd2 = candleAt(m.index), mx = X(m.index), buy = m.type !== 'sell';
        var my = buy ? Math.round(Y(cd2.l)) + 14 : Math.round(Y(cd2.h)) - 14;
        ctx.fillStyle = m.type === 'entry' ? C.accent : (buy ? C.up : C.down);
        ctx.beginPath(); ctx.arc(mx, my, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0A0A0B'; ctx.textAlign = 'center'; ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.fillText(m.type === 'sell' ? 'S' : (m.type === 'entry' ? 'E' : 'B'), mx, my + 0.5);
        ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';
      });
      ctx.restore();

      // axis tags: entry lines and live price
      function tag(price, text, fill, ink) {
        var ty = Math.round(Y(price)), tw = L.axisW - 6;
        ty = Math.max(L.plotT + 8, Math.min(L.priceB - 2, ty));
        ctx.fillStyle = fill; ctx.fillRect(L.plotR + 2, ty - 9, tw + 2, 18);
        ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.fillText(text, L.plotR + 6, ty + 0.5);
      }
      (model.lines || []).forEach(function (ln) { if (ln.price >= yMin && ln.price <= yMax) tag(ln.price, ln.label || TYS.fmt.mcap(ln.price), C.accent, '#0A0A0B'); });
      var f = model.forming, fup = f.c >= f.o, py = Math.round(Y(f.c)) + 0.5;
      ctx.strokeStyle = fup ? C.up : C.down; ctx.globalAlpha = 0.55; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(L.plotL, py); ctx.lineTo(L.plotR, py); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      tag(f.c, TYS.fmt.mcap(f.c), fup ? C.up : C.down, '#04120D');

      // crosshair
      var legendIdx = fi, legendLive = true;
      if (hover && hover.x >= L.plotL && hover.x <= L.plotR && hover.y >= L.plotT && hover.y <= L.plotB) {
        var hi2 = Math.round((hover.x - shift - L.plotL) / L.step - 0.5) + start;
        if (hi2 >= start && hi2 <= fi) {
          legendIdx = hi2; legendLive = hi2 === fi;
          var hx = X(hi2) + 0.5;
          ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(hx, L.plotT); ctx.lineTo(hx, L.plotB); ctx.moveTo(L.plotL, hover.y + 0.5); ctx.lineTo(L.plotR, hover.y + 0.5); ctx.stroke(); ctx.setLineDash([]);
          var hp = yMax - ((hover.y - L.plotT) / (L.priceB - L.plotT)) * span;
          if (hover.y <= L.priceB) tag(hp, TYS.fmt.mcap(hp), '#2A2A2E', C.ink);
        }
      }
      if (opts.onLegend) {
        var lc = candleAt(legendIdx), sig = legendIdx + '|' + lc.o + '|' + lc.h + '|' + lc.l + '|' + lc.c;
        if (sig !== legendSig) { legendSig = sig; opts.onLegend(lc, legendIdx, legendLive); }
      }
    }

    return {
      render: function (m, dt) { model = m; lastDt = dt || 0; draw(dt || 0); },
      redraw: function () { if (model) draw(0); },
      reset: function () { yMin = null; yMax = null; shift = 0; lastStart = null; hover = null; legendSig = ''; },
      resize: resize
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
