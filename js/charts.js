(function (FF) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const C = FF.charts = {};
  const observers = [];
  let uid = 0;
  const esc = FF.esc;

  /* ---------- infrastructure ---------- */
  C.dispose = function () { observers.forEach(o => o.disconnect()); observers.length = 0; };

  // Calls draw(width) now and whenever the host width changes.
  C.mount = function (host, draw) {
    let last = -1;
    const run = () => { const w = Math.floor(host.clientWidth); if (w < 10) return; last = w; draw(w); };
    run();
    const ro = new ResizeObserver(() => { if (Math.abs(Math.floor(host.clientWidth) - last) > 1) run(); });
    ro.observe(host);
    observers.push(ro);
  };

  function S(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  FF.svg = S;

  FF.tip = {
    el: () => document.getElementById('tooltip'),
    show(html, ev) { const t = FF.tip.el(); t.innerHTML = html; t.classList.add('show'); FF.tip.move(ev); },
    move(ev) {
      const t = FF.tip.el(), pad = 14, r = t.getBoundingClientRect();
      let x = ev.clientX + pad, y = ev.clientY + pad;
      if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - pad;
      if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - pad;
      t.style.transform = 'translate(' + Math.max(8, x) + 'px,' + Math.max(8, y) + 'px)';
    },
    hide() { FF.tip.el().classList.remove('show'); }
  };
  const tipRow = (color, name, value, bold) =>
    '<div class="tt-row' + (bold ? ' tt-bold' : '') + '"><span>' + (color ? '<i style="background:' + color + '"></i>' : '') + esc(name) + '</span><b>' + esc(value) + '</b></div>';
  C.tipRow = tipRow;

  function niceNum(range, round) {
    const exp = Math.floor(Math.log10(range)), f = range / Math.pow(10, exp);
    const nf = round ? (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) : (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10);
    return nf * Math.pow(10, exp);
  }
  function ticks(min, max, n) {
    if (min === max) { if (min === 0) max = 1; else { min -= Math.abs(min) * 0.1; max += Math.abs(max) * 0.1; } }
    const step = niceNum(niceNum(max - min, false) / (n - 1), true);
    const lo = Math.floor(min / step + 1e-9) * step, hi = Math.ceil(max / step - 1e-9) * step;
    const t = [];
    for (let v = lo; v <= hi + step / 2; v += step) t.push(+v.toFixed(10));
    return { ticks: t, min: lo, max: hi };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function yAxis(svg, T, sy, m, W, yFmt) {
    T.ticks.forEach(v => {
      const y = sy(v);
      S('line', { x1: m.l, x2: W - m.r, y1: y, y2: y, class: v === 0 ? 'zero-line' : 'grid-line' }, svg);
      const t = S('text', { x: m.l - 8, y: y + 3.5, 'text-anchor': 'end', class: 'ax' }, svg);
      t.textContent = yFmt(v);
    });
  }

  /* ---------- time series (line / area / stacked area) ---------- */
  C.timeSeries = function (host, o) {
    C.mount(host, W => {
      host.innerHTML = '';
      const H = o.height || 260, xs = o.xs, n = xs.length, series = o.series;
      const yFmt = o.yFmt || String, xTick = o.xTick || String, xFull = o.xFull || String;
      let lo = Infinity, hi = -Infinity, layers = null;
      if (o.stacked) {
        layers = series.map(() => ({ lo: new Array(n), hi: new Array(n) }));
        for (let i = 0; i < n; i++) {
          let pos = 0;
          series.forEach((s, k) => {
            const v = Math.max(0, s.values[i] || 0);
            layers[k].lo[i] = pos; pos += v; layers[k].hi[i] = pos;
          });
          if (pos > hi) hi = pos;
        }
        lo = 0;
      } else {
        for (const s of series) for (const v of s.values) if (v != null) { if (v < lo) lo = v; if (v > hi) hi = v; }
        if (o.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
        else if (isFinite(lo)) { const pad = (hi - lo) * 0.1 || Math.abs(hi) * 0.05 || 1; lo -= pad; hi += pad; }
      }
      if (!isFinite(lo)) { lo = 0; hi = 1; }
      const T = ticks(lo, hi, 5);
      const lblW = Math.max.apply(null, T.ticks.map(t => yFmt(t).length)) * 6.6 + 16;
      const m = { t: 10, r: 14, b: 26, l: Math.max(40, lblW) };
      const pw = W - m.l - m.r, ph = H - m.t - m.b;
      const x0 = xs[0], x1 = xs[n - 1];
      const sx = v => n === 1 ? m.l + pw / 2 : m.l + (v - x0) / (x1 - x0) * pw;
      const sy = v => m.t + (1 - (v - T.min) / (T.max - T.min)) * ph;
      const svg = S('svg', { width: W, height: H, class: 'chart' }, host);
      const defs = S('defs', null, svg);
      yAxis(svg, T, sy, m, W, yFmt);

      const nt = Math.max(2, Math.floor(pw / 90));
      for (let k = 0; k < nt; k++) {
        const i = n === 1 ? 0 : Math.round(k * (n - 1) / (nt - 1));
        const t = S('text', { x: clamp(sx(xs[i]), m.l + 14, W - m.r - 14), y: H - 8, 'text-anchor': 'middle', class: 'ax' }, svg);
        t.textContent = xTick(xs[i]);
      }

      const baseY = sy(clamp(0, T.min, T.max));
      series.forEach((s, k) => {
        const gid = 'g' + (++uid);
        if (o.stacked) {
          let d = '';
          for (let i = 0; i < n; i++) d += (i ? 'L' : 'M') + sx(xs[i]).toFixed(1) + ',' + sy(layers[k].hi[i]).toFixed(1);
          for (let i = n - 1; i >= 0; i--) d += 'L' + sx(xs[i]).toFixed(1) + ',' + sy(layers[k].lo[i]).toFixed(1);
          S('path', { d: d + 'Z', fill: s.color, 'fill-opacity': 0.78, stroke: s.color, 'stroke-width': 1, class: 'area' }, svg);
        } else {
          let d = '', pen = false, gaps = false;
          for (let i = 0; i < n; i++) {
            const v = s.values[i];
            if (v == null) { pen = false; gaps = true; continue; }
            d += (pen ? 'L' : 'M') + sx(xs[i]).toFixed(1) + ',' + sy(v).toFixed(1); pen = true;
          }
          if ((s.area !== undefined ? s.area : o.area) && !gaps && n > 1) {
            const g = S('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
            S('stop', { offset: '0%', 'stop-color': s.color, 'stop-opacity': 0.32 }, g);
            S('stop', { offset: '100%', 'stop-color': s.color, 'stop-opacity': 0.02 }, g);
            S('path', { d: d + 'L' + sx(x1).toFixed(1) + ',' + baseY + 'L' + sx(x0).toFixed(1) + ',' + baseY + 'Z', fill: 'url(#' + gid + ')' }, svg);
          }
          S('path', { d, fill: 'none', stroke: s.color, 'stroke-width': s.width || 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': s.dash || '' }, svg);
        }
      });

      const vline = S('line', { y1: m.t, y2: m.t + ph, class: 'xhair', visibility: 'hidden' }, svg);
      const dots = o.stacked ? [] : series.map(s => S('circle', { r: 4, fill: s.color, class: 'xdot', visibility: 'hidden' }, svg));
      const brush = S('rect', { y: m.t, height: ph, class: 'brush', visibility: 'hidden' }, svg);
      const ov = S('rect', { x: m.l, y: m.t, width: pw, height: ph, fill: 'transparent' }, svg);
      if (o.onBrush) ov.style.cursor = 'crosshair';
      const px = ev => clamp(ev.clientX - svg.getBoundingClientRect().left, m.l, m.l + pw);
      const idxAt = p => n === 1 ? 0 : clamp(Math.round((p - m.l) / pw * (n - 1)), 0, n - 1);
      let drag = null;

      function hover(ev) {
        const i = idxAt(px(ev)), x = sx(xs[i]);
        vline.setAttribute('x1', x); vline.setAttribute('x2', x); vline.setAttribute('visibility', 'visible');
        let html = '<div class="tt-h">' + esc(xFull(xs[i])) + '</div>';
        let rows = [];
        series.forEach((s, k) => {
          const v = s.values[i];
          if (!o.stacked) {
            if (v == null) { dots[k].setAttribute('visibility', 'hidden'); return; }
            dots[k].setAttribute('cx', x); dots[k].setAttribute('cy', sy(v)); dots[k].setAttribute('visibility', 'visible');
          }
          rows.push({ s, v: v || 0 });
        });
        if (o.stacked) { rows = rows.filter(r => Math.abs(r.v) > 0.004).sort((a, b) => b.v - a.v); }
        const total = rows.reduce((a, r) => a + r.v, 0);
        rows.slice(0, 12).forEach(r => { html += tipRow(r.s.color, r.s.name, yFmt(r.v, true)); });
        if (rows.length > 12) html += '<div class="tt-more">+' + (rows.length - 12) + ' more</div>';
        if (o.stacked && rows.length > 1) html += tipRow(null, 'Total', yFmt(total, true), true);
        FF.tip.show(html, ev);
      }
      function leave() {
        vline.setAttribute('visibility', 'hidden'); dots.forEach(d => d.setAttribute('visibility', 'hidden')); FF.tip.hide();
      }
      ov.addEventListener('pointermove', ev => {
        if (drag) {
          const a = Math.min(drag, px(ev)), b = Math.max(drag, px(ev));
          brush.setAttribute('x', a); brush.setAttribute('width', b - a); brush.setAttribute('visibility', 'visible');
          FF.tip.hide(); return;
        }
        hover(ev);
      });
      ov.addEventListener('pointerleave', () => { if (!drag) leave(); });
      if (o.onBrush) {
        ov.addEventListener('pointerdown', ev => { ov.setPointerCapture(ev.pointerId); drag = px(ev); });
        ov.addEventListener('pointerup', ev => {
          if (drag == null) return;
          const a = drag, b = px(ev); drag = null;
          brush.setAttribute('visibility', 'hidden');
          if (Math.abs(a - b) > 6) { const i0 = idxAt(Math.min(a, b)), i1 = idxAt(Math.max(a, b)); leave(); o.onBrush(xs[i0], xs[i1]); }
        });
      }
    });
  };

  /* ---------- bars (grouped / stacked) with optional line overlay ---------- */
  C.bars = function (host, o) {
    C.mount(host, W => {
      host.innerHTML = '';
      const H = o.height || 260, cats = o.cats, n = cats.length, series = o.series, line = o.line;
      const yFmt = o.yFmt || String;
      let lo = 0, hi = 0;
      for (let i = 0; i < n; i++) {
        if (o.stacked) {
          let pos = 0, neg = 0; series.forEach(s => { const v = s.values[i] || 0; if (v >= 0) pos += v; else neg += v; });
          hi = Math.max(hi, pos); lo = Math.min(lo, neg);
        } else series.forEach(s => { const v = s.values[i] || 0; hi = Math.max(hi, v); lo = Math.min(lo, v); });
        if (line) { const v = line.values[i] || 0; hi = Math.max(hi, v); lo = Math.min(lo, v); }
      }
      const T = ticks(lo, hi, 5);
      const lblW = Math.max.apply(null, T.ticks.map(t => yFmt(t).length)) * 6.6 + 16;
      const m = { t: 10, r: 10, b: 26, l: Math.max(40, lblW) };
      const pw = W - m.l - m.r, ph = H - m.t - m.b;
      const sy = v => m.t + (1 - (v - T.min) / (T.max - T.min)) * ph;
      const svg = S('svg', { width: W, height: H, class: 'chart' }, host);
      yAxis(svg, T, sy, m, W, yFmt);
      const band = pw / n;
      const groupW = Math.min(band * 0.8, (o.stacked ? 46 : 30 * series.length));
      const bw = o.stacked ? groupW : groupW / series.length;
      const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(pw / (o.labelW || 56)))));
      const hovers = [];
      for (let i = 0; i < n; i++) {
        const cx = m.l + band * (i + 0.5);
        if (i % every === 0) { const t = S('text', { x: cx, y: H - 8, 'text-anchor': 'middle', class: 'ax' }, svg); t.textContent = cats[i].label; }
        const hb = S('rect', { x: m.l + band * i, y: m.t, width: band, height: ph, class: 'hoverband', visibility: 'hidden' }, svg);
        hovers.push(hb);
      }
      const zeroY = sy(0);
      for (let i = 0; i < n; i++) {
        const cx = m.l + band * (i + 0.5);
        let pos = 0, neg = 0;
        series.forEach((s, k) => {
          const v = s.values[i] || 0; if (!v) return;
          let y, h, x;
          if (o.stacked) {
            x = cx - bw / 2;
            if (v >= 0) { y = sy(pos + v); h = sy(pos) - y; pos += v; } else { y = sy(neg); h = sy(neg + v) - y; neg += v; }
          } else { x = cx - groupW / 2 + k * bw; y = v >= 0 ? sy(v) : zeroY; h = Math.abs(sy(v) - zeroY); }
          const r = S('rect', { x: x + (o.stacked ? 0 : 1), y, width: Math.max(1, bw - (o.stacked ? 0 : 2)), height: Math.max(0.5, h), rx: Math.min(3, bw / 3), fill: s.color, class: 'bar' }, svg);
          r.style.animationDelay = Math.min(i * 8, 240) + 'ms';
        });
      }
      if (line) {
        let d = '';
        for (let i = 0; i < n; i++) d += (i ? 'L' : 'M') + (m.l + band * (i + 0.5)).toFixed(1) + ',' + sy(line.values[i] || 0).toFixed(1);
        S('path', { d, fill: 'none', stroke: line.color, 'stroke-width': 2, 'stroke-linejoin': 'round' }, svg);
        if (n <= 40) for (let i = 0; i < n; i++) S('circle', { cx: m.l + band * (i + 0.5), cy: sy(line.values[i] || 0), r: 2.6, fill: line.color }, svg);
      }
      for (let i = 0; i < n; i++) {
        const ov = S('rect', { x: m.l + band * i, y: m.t, width: band, height: ph, fill: 'transparent' }, svg);
        if (o.onClick) ov.style.cursor = 'pointer';
        ov.addEventListener('pointermove', ev => {
          hovers.forEach((h, j) => h.setAttribute('visibility', j === i ? 'visible' : 'hidden'));
          let html = '<div class="tt-h">' + esc(cats[i].full || cats[i].label) + '</div>';
          series.forEach(s => { if (s.values[i]) html += tipRow(s.color, s.name, yFmt(s.values[i], true)); });
          if (line) html += tipRow(line.color, line.name, yFmt(line.values[i] || 0, true), true);
          if (o.stacked) html += tipRow(null, 'Total', yFmt(series.reduce((a, s) => a + (s.values[i] || 0), 0), true), true);
          if (o.onClick) html += '<div class="tt-more">Click to zoom in</div>';
          FF.tip.show(html, ev);
        });
        ov.addEventListener('pointerleave', () => { hovers[i].setAttribute('visibility', 'hidden'); FF.tip.hide(); });
        if (o.onClick) ov.addEventListener('click', () => { FF.tip.hide(); o.onClick(i); });
      }
    });
  };

  /* ---------- donut ---------- */
  C.donut = function (host, o) {
    C.mount(host, W => {
      host.innerHTML = '';
      const size = Math.min(W, o.size || 220), r = size / 2 - 3, ri = r * 0.64, cx = size / 2, cy = size / 2;
      const items = o.items.filter(i => i.value > 0), total = items.reduce((a, i) => a + i.value, 0);
      const svg = S('svg', { width: size, height: size, viewBox: '0 0 ' + size + ' ' + size, class: 'chart donut' }, host);
      const t1 = S('text', { x: cx, y: cy - 4, 'text-anchor': 'middle', class: 'dn-top' }, svg);
      const t2 = S('text', { x: cx, y: cy + 17, 'text-anchor': 'middle', class: 'dn-val' }, svg);
      const setCenter = (a, b) => { t1.textContent = a; t2.textContent = b; };
      const dflt = () => setCenter(o.centerTop || 'Total', o.centerValue || '');
      dflt();
      if (!items.length) { S('circle', { cx, cy, r: (r + ri) / 2, fill: 'none', stroke: 'var(--grid)', 'stroke-width': r - ri }, svg); return; }
      const hasSel = o.selected && o.selected.size > 0;
      let a = -Math.PI / 2;
      const pt = (rad, ang) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)];
      items.forEach(it => {
        const ang = Math.min(it.value / total * Math.PI * 2, Math.PI * 2 - 0.0001), a0 = a, a1 = a + ang; a = a1;
        const big = ang > Math.PI ? 1 : 0, p0 = pt(r, a0), p1 = pt(r, a1), p2 = pt(ri, a1), p3 = pt(ri, a0);
        const d = 'M' + p0 + 'A' + r + ',' + r + ' 0 ' + big + ' 1 ' + p1 + 'L' + p2 + 'A' + ri + ',' + ri + ' 0 ' + big + ' 0 ' + p3 + 'Z';
        const sel = !hasSel || o.selected.has(it.key);
        const path = S('path', { d, fill: it.color, class: 'slice', opacity: sel ? 1 : 0.28, stroke: 'var(--panel)', 'stroke-width': 1.5 }, svg);
        path.addEventListener('pointermove', ev => {
          setCenter(it.name.length > 16 ? it.name.slice(0, 15) + '…' : it.name, o.fmt(it.value));
          FF.tip.show('<div class="tt-h">' + esc(it.name) + '</div>' + tipRow(it.color, o.fmt(it.value, true), FF.pct(it.value / total, 1)) + (it.count ? '<div class="tt-more">' + it.count + ' transaction' + (it.count === 1 ? '' : 's') + '</div>' : ''), ev);
        });
        path.addEventListener('pointerleave', () => { dflt(); FF.tip.hide(); });
        if (o.onClick && !it.other) { path.style.cursor = 'pointer'; path.addEventListener('click', () => { FF.tip.hide(); o.onClick(it); }); }
      });
    });
  };

  /* ---------- treemap (HTML) ---------- */
  function squarify(items, x, y, w, h) {
    const total = items.reduce((s, i) => s + i.value, 0);
    if (!total) return [];
    const k = w * h / total, nodes = items.map(i => ({ item: i, area: i.value * k })), out = [];
    const worst = (areas, s) => { const sum = areas.reduce((a, b) => a + b, 0), mx = Math.max.apply(null, areas), mn = Math.min.apply(null, areas); return Math.max(s * s * mx / (sum * sum), sum * sum / (s * s * mn)); };
    let rest = nodes, cx = x, cy = y, cw = w, ch = h;
    while (rest.length) {
      const short = Math.min(cw, ch);
      let row = [rest[0]], rowArea = rest[0].area, best = worst([rest[0].area], short), i = 1;
      while (i < rest.length) {
        const cand = row.concat(rest[i]), wst = worst(cand.map(n => n.area), short);
        if (wst <= best) { row = cand; rowArea += rest[i].area; best = wst; i++; } else break;
      }
      const thick = rowArea / short;
      if (cw >= ch) { let yy = cy; for (const n of row) { const hh = n.area / thick; out.push({ item: n.item, x: cx, y: yy, w: thick, h: hh }); yy += hh; } cx += thick; cw -= thick; }
      else { let xx = cx; for (const n of row) { const ww = n.area / thick; out.push({ item: n.item, x: xx, y: cy, w: ww, h: thick }); xx += ww; } cy += thick; ch -= thick; }
      rest = rest.slice(row.length);
    }
    return out;
  }
  C.treemap = function (host, o) {
    C.mount(host, W => {
      host.innerHTML = '';
      const H = o.height || 320; host.style.height = H + 'px';
      const items = o.items.filter(i => i.value > 0), total = items.reduce((a, i) => a + i.value, 0);
      if (!items.length) { host.innerHTML = '<div class="empty">Nothing to show</div>'; return; }
      const hasSel = o.selected && o.selected.size > 0;
      squarify(items, 0, 0, W, H).forEach(r => {
        const it = r.item, d = document.createElement('div');
        d.className = 'tm-tile' + (hasSel && !o.selected.has(it.key) ? ' dim' : '') + (hasSel && o.selected.has(it.key) ? ' sel' : '');
        d.style.cssText = 'left:' + (r.x + 1.5) + 'px;top:' + (r.y + 1.5) + 'px;width:' + Math.max(0, r.w - 3) + 'px;height:' + Math.max(0, r.h - 3) + 'px;background:' + it.color;
        if (r.w > 54 && r.h > 34) {
          d.innerHTML = '<span class="tm-n">' + esc(it.name) + '</span>' + (r.h > 52 ? '<span class="tm-v">' + esc(o.fmt(it.value)) + (r.w > 110 ? ' · ' + FF.pct(it.value / total, 0) : '') + '</span>' : '');
        }
        d.addEventListener('pointermove', ev => FF.tip.show('<div class="tt-h">' + esc(it.name) + '</div>' + tipRow(it.color, o.fmt(it.value, true), FF.pct(it.value / total, 1)) + '<div class="tt-more">' + it.count + ' transaction' + (it.count === 1 ? '' : 's') + '</div>', ev));
        d.addEventListener('pointerleave', FF.tip.hide);
        if (o.onClick && !it.other) { d.style.cursor = 'pointer'; d.addEventListener('click', () => { FF.tip.hide(); o.onClick(it); }); }
        host.appendChild(d);
      });
    });
  };

  /* ---------- sankey (3 fixed layers) ---------- */
  C.sankey = function (host, o) {
    C.mount(host, W => {
      host.innerHTML = '';
      const nodes = o.nodes.map(n => Object.assign({}, n, { in: 0, out: 0, sIn: [], sOut: [] }));
      const byId = new Map(nodes.map(n => [n.id, n]));
      const links = o.links.filter(l => l.value > 0.004 && byId.has(l.source) && byId.has(l.target)).map(l => Object.assign({}, l, { s: byId.get(l.source), t: byId.get(l.target) }));
      if (!links.length) { host.innerHTML = '<div class="empty">No flows in this selection</div>'; return; }
      links.forEach(l => { l.s.out += l.value; l.t.in += l.value; l.s.sOut.push(l); l.t.sIn.push(l); });
      const live = nodes.filter(n => n.in || n.out);
      live.forEach(n => { n.v = Math.max(n.in, n.out); });
      const layers = [[], [], []]; live.forEach(n => layers[n.layer].push(n));
      const narrow = W < 640, labelW = narrow ? 86 : Math.min(190, W * 0.21), gap = narrow ? 7 : 11, nodeW = 12;
      const H = o.height || Math.max(380, Math.max.apply(null, layers.map(l => l.length)) * 30);
      const mt = 8, ph = H - 16;
      let scale = Infinity;
      layers.forEach(l => { if (!l.length) return; const sum = l.reduce((a, n) => a + n.v, 0), avail = Math.max(ph - gap * (l.length - 1), 60); if (sum > 0) scale = Math.min(scale, avail / sum); });
      if (!isFinite(scale)) scale = 1;
      layers[1].sort((a, b) => b.v - a.v).forEach((n, i) => { n.ord = i; });
      [0, 2].forEach(L => {
        layers[L].forEach(n => {
          let w = 0, s = 0; (L === 0 ? n.sOut : n.sIn).forEach(l => { s += (L === 0 ? l.t : l.s).ord * l.value; w += l.value; });
          n.bary = w ? s / w : 99;
        });
        layers[L].sort((a, b) => (a.special ? 1 : 0) - (b.special ? 1 : 0) || a.bary - b.bary || b.v - a.v);
      });
      layers.forEach(l => {
        const tot = l.reduce((a, n) => a + Math.max(n.v * scale, 2), 0) + gap * Math.max(0, l.length - 1);
        let y = mt + Math.max(0, (ph - tot) / 2);
        l.forEach(n => { n.y = y; n.h = Math.max(n.v * scale, 2); y += n.h + gap; });
      });
      const xs = [labelW, (labelW + W - labelW - nodeW) / 2, W - labelW - nodeW];
      layers.forEach((l, i) => l.forEach(n => { n.x = xs[i]; }));
      links.forEach(l => { l.w = l.value * scale; });
      live.forEach(n => {
        n.sOut.sort((a, b) => a.t.y - b.t.y); let y = n.y; n.sOut.forEach(l => { l.y0 = y + l.w / 2; y += l.w; });
        n.sIn.sort((a, b) => a.s.y - b.s.y); y = n.y; n.sIn.forEach(l => { l.y1 = y + l.w / 2; y += l.w; });
      });
      const svg = S('svg', { width: W, height: H, class: 'chart sankey' }, host);
      const gl = S('g', null, svg), gn = S('g', null, svg);
      links.forEach(l => {
        const x0 = l.s.x + nodeW, x1 = l.t.x, xm = (x0 + x1) / 2;
        l.el = S('path', { d: 'M' + x0 + ',' + l.y0 + 'C' + xm + ',' + l.y0 + ' ' + xm + ',' + l.y1 + ' ' + x1 + ',' + l.y1, fill: 'none', stroke: l.color || (l.s.layer === 0 ? l.s.color : l.t.color), 'stroke-width': Math.max(1, l.w), class: 'sk-link' }, gl);
        l.el.addEventListener('pointermove', ev => { mark([l], [l.s, l.t]); FF.tip.show('<div class="tt-h">' + esc(l.s.name) + ' → ' + esc(l.t.name) + '</div>' + tipRow(null, o.fmt(l.value, true), ''), ev); });
        l.el.addEventListener('pointerleave', clear);
      });
      function mark(ls, ns) { svg.classList.add('hl'); ls.forEach(l => l.el.classList.add('on')); ns.forEach(n => n.el.classList.add('on')); }
      function clear() { svg.classList.remove('hl'); svg.querySelectorAll('.on').forEach(e => e.classList.remove('on')); FF.tip.hide(); }
      live.forEach(n => {
        n.el = S('g', { class: 'sk-node' }, gn);
        S('rect', { x: n.x, y: n.y, width: nodeW, height: n.h, rx: 3, fill: n.color }, n.el);
        const left = n.layer === 0;
        const label = n.name.length > (narrow ? 12 : 24) ? n.name.slice(0, narrow ? 11 : 23) + '…' : n.name;
        const t = S('text', { x: left ? n.x - 7 : n.x + nodeW + 7, y: n.y + n.h / 2 + 4, 'text-anchor': left ? 'end' : 'start', class: 'sk-label' }, n.el);
        t.textContent = label;
        if (n.h > 24 && !narrow) {
          const t2 = S('text', { x: left ? n.x - 7 : n.x + nodeW + 7, y: n.y + n.h / 2 + 17, 'text-anchor': left ? 'end' : 'start', class: 'sk-sub' }, n.el);
          t2.textContent = o.fmt(n.v);
        }
        const hit = S('rect', { x: left ? n.x - labelW + 4 : n.x, y: n.y - 2, width: left ? labelW - 4 + nodeW : (n.layer === 2 ? labelW + nodeW : nodeW), height: n.h + 4, fill: 'transparent' }, n.el);
        if (n.dim) hit.style.cursor = 'pointer';
        hit.addEventListener('pointermove', ev => {
          clear(); mark(n.sIn.concat(n.sOut), [n]);
          let html = '<div class="tt-h">' + esc(n.name) + '</div>' + tipRow(null, 'Total', o.fmt(n.v, true), true);
          if (n.in && n.out && Math.abs(n.in - n.out) > 0.005) html += tipRow(null, 'In / out', o.fmt(n.in, true) + ' / ' + o.fmt(n.out, true));
          n.sIn.concat(n.sOut).sort((a, b) => b.value - a.value).slice(0, 6).forEach(l => { const other = l.s === n ? l.t : l.s; html += tipRow(other.color, (l.s === n ? '→ ' : '← ') + other.name, o.fmt(l.value, true)); });
          if (n.dim && o.onNode) html += '<div class="tt-more">Click to filter</div>';
          FF.tip.show(html, ev);
        });
        hit.addEventListener('pointerleave', clear);
        if (n.dim && o.onNode) hit.addEventListener('click', () => { clear(); o.onNode(n); });
      });
    });
  };

  /* ---------- calendar heat map ---------- */
  C.calendar = function (host, o) {
    C.mount(host, W => {
      host.innerHTML = '';
      const first = o.from - FF.weekday(o.from), weeks = Math.ceil((o.to - first + 1) / 7);
      const left = 30, top = 20;
      const cell = clamp(Math.floor((W - left - 4) / weeks) - 3, 10, 30), step = cell + 3;
      const w = left + weeks * step + 4, h = top + 7 * step;
      const svg = S('svg', { width: w, height: h, class: 'chart' }, host);
      ['Mon', 'Wed', 'Fri'].forEach((d, i) => { const t = S('text', { x: left - 6, y: top + i * 2 * step + cell - 2, 'text-anchor': 'end', class: 'ax' }, svg); t.textContent = d; });
      let lastM = -1, max = 0;
      o.values.forEach(v => { if (v > max) max = v; });
      for (let wk = 0; wk < weeks; wk++) {
        const mon = new Date((first + wk * 7) * FF.DAY).getUTCMonth();
        if (mon !== lastM) { lastM = mon; const t = S('text', { x: left + wk * step, y: 11, class: 'ax' }, svg); t.textContent = FF.fmtDate(first + wk * 7, 'my').split(' ')[0]; }
      }
      for (let day = o.from; day <= o.to; day++) {
        const wk = Math.floor((day - first) / 7), r = FF.weekday(day), v = o.values.get(day) || 0;
        const rect = S('rect', { x: left + wk * step, y: top + r * step, width: cell, height: cell, rx: 3, class: 'cal-cell' }, svg);
        if (v > 0) { rect.setAttribute('fill', o.color); rect.setAttribute('fill-opacity', (0.18 + 0.82 * Math.sqrt(v / max)).toFixed(3)); } else rect.setAttribute('fill', 'var(--cell-empty)');
        rect.addEventListener('pointermove', ev => FF.tip.show('<div class="tt-h">' + esc(FF.fmtDate(day, 'long')) + '</div>' + tipRow(null, v ? o.fmt(v, true) : 'Nothing', ''), ev));
        rect.addEventListener('pointerleave', FF.tip.hide);
        if (o.onClick) { rect.style.cursor = 'pointer'; rect.addEventListener('click', () => { FF.tip.hide(); o.onClick(day); }); }
      }
    });
  };

  /* ---------- sparkline (inline svg string) ---------- */
  C.spark = function (vals, color) {
    if (!vals || !vals.length) return '';
    if (vals.length === 1) vals = [vals[0], vals[0]];
    const w = 100, h = 30;
    let lo = Infinity, hi = -Infinity; for (const v of vals) { if (v < lo) lo = v; if (v > hi) hi = v; }
    if (lo === hi) { lo -= 1; hi += 1; }
    const d = 'M' + vals.map((v, i) => (i / (vals.length - 1) * w).toFixed(1) + ',' + (h - 2 - (v - lo) / (hi - lo) * (h - 4)).toFixed(1)).join('L');
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><path d="' + d + 'L' + w + ',' + h + 'L0,' + h + 'Z" fill="' + color + '" opacity=".14"/><path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="1.7" vector-effect="non-scaling-stroke"/></svg>';
  };
  C.sample = (arr, max) => { if (arr.length <= max) return arr; const out = []; for (let i = 0; i < max; i++) out.push(arr[Math.round(i * (arr.length - 1) / (max - 1))]); return out; };
})(globalThis.FF = globalThis.FF || {});
