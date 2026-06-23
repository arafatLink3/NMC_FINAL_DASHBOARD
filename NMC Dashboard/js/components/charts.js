// components/charts.js — tiny pure-SVG chart helpers (no libs)
(function (global) {
  function el(tag, attrs) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function clear(host) { while (host.firstChild) host.removeChild(host.firstChild); }

  // Read a CSS variable from :root, with a fallback for safety
  function cssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function themeColors() {
    return {
      axis:    cssVar('--border', '#1f2a44'),
      label:   cssVar('--muted',  '#9bb1d6'),
      text:    cssVar('--text',   '#cdd6e3'),
      bg:      cssVar('--bg',     '#0b1220'),
      series1: cssVar('--primary',  '#4f8cff'),
      series2: cssVar('--success',  '#6ad29c'),
      series3: cssVar('--warning',  '#ffb454'),
      series4: cssVar('--danger',   '#ff6b6b'),
      series5: cssVar('--info',     '#7ad7f0'),
      series6: cssVar('--tag-blue', '#9bb1d6'),
      series7: cssVar('--tag-yellow', '#ffd166'),
      series8: cssVar('--tag-cyan',   '#90dbf4')
    };
  }

  function lineChart(host, series, opts) {
    opts = opts || {};
    clear(host);
    const c = themeColors();
    const colors = [c.series1, c.series2, c.series3, c.series4, c.series5];
    const w = host.clientWidth || 600, h = host.clientHeight || 220;
    const pad = { l: 40, r: 16, t: 14, b: 28 };
    const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
    const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h });
    host.appendChild(svg);

    // axis
    svg.appendChild(el('line', { x1: pad.l, y1: pad.t + innerH, x2: pad.l + innerW, y2: pad.t + innerH, stroke: c.axis }));
    svg.appendChild(el('line', { x1: pad.l, y1: pad.t, x2: pad.l, y2: pad.t + innerH, stroke: c.axis }));

    const all = series.flatMap(s => s.values);
    const max = Math.max(1, ...all);
    const min = Math.min(0, ...all);
    const span = Math.max(1, max - min);

    // grid + labels
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (innerH * i / 4);
      svg.appendChild(el('line', { x1: pad.l, y1: y, x2: pad.l + innerW, y2: y, stroke: c.axis, 'stroke-dasharray': '2,3' }));
      const v = (max - (span * i / 4)).toFixed(0);
      const t = el('text', { x: pad.l - 6, y: y + 4, 'text-anchor': 'end', fill: c.label, 'font-size': 10 });
      t.textContent = v; svg.appendChild(t);
    }

    // x labels (assume same length)
    const len = (series[0] && series[0].values.length) || 0;
    for (let i = 0; i < len; i++) {
      const x = pad.l + (innerW * i / Math.max(1, len - 1));
      const t = el('text', { x, y: pad.t + innerH + 16, 'text-anchor': 'middle', fill: c.label, 'font-size': 10 });
      t.textContent = (series[0].labels && series[0].labels[i]) || (i + 1);
      svg.appendChild(t);
    }

    // lines
    series.forEach((s, idx) => {
      const color = colors[idx % colors.length];
      const pts = s.values.map((v, i) => {
        const x = pad.l + (innerW * i / Math.max(1, s.values.length - 1));
        const y = pad.t + innerH - ((v - min) / span) * innerH;
        return [x, y];
      });
      const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');
      svg.appendChild(el('path', { d, fill: 'none', stroke: color, 'stroke-width': 2 }));
      // dots
      pts.forEach(p => svg.appendChild(el('circle', { cx: p[0], cy: p[1], r: 2.5, fill: color })));
    });

    // legend
    let lx = pad.l + 4, ly = pad.t + 4;
    series.forEach((s, idx) => {
      const color = colors[idx % colors.length];
      const g = el('g', { transform: `translate(${lx},${ly})` });
      g.appendChild(el('rect', { width: 10, height: 10, fill: color, rx: 2 }));
      const t = el('text', { x: 14, y: 9, fill: c.text, 'font-size': 11 });
      t.textContent = s.label;
      g.appendChild(t);
      svg.appendChild(g);
      lx += 16 + (s.label.length * 6.4);
    });
  }

  function pieChart(host, data, opts) {
    opts = opts || {};
    clear(host);
    const c = themeColors();
    const colors = [c.series1, c.series2, c.series3, c.series4, c.series5, c.series6, c.series7, c.series8];
    const w = host.clientWidth || 360, h = host.clientHeight || 220;
    const cx = w / 2, cy = h / 2, r = Math.min(cx, cy) - 16, rIn = r - 28;
    const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h });
    host.appendChild(svg);
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    let a0 = -Math.PI / 2;
    data.forEach((d, i) => {
      const a1 = a0 + (d.value / total) * Math.PI * 2;
      const large = (a1 - a0) > Math.PI ? 1 : 0;
      const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
      const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
      const xi0 = cx + rIn * Math.cos(a0), yi0 = cy + rIn * Math.sin(a0);
      const xi1 = cx + rIn * Math.cos(a1), yi1 = cy + rIn * Math.sin(a1);
      const dStr = `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${xi1} ${yi1} A ${rIn} ${rIn} 0 ${large} 0 ${xi0} ${yi0} Z`;
      svg.appendChild(el('path', { d: dStr, fill: colors[i % colors.length], stroke: c.bg, 'stroke-width': 1 }));
      a0 = a1;
    });
    // legend
    let ly = 10;
    data.forEach((d, i) => {
      const color = colors[i % colors.length];
      const g = el('g', { transform: `translate(${r + 28},${ly})` });
      g.appendChild(el('rect', { width: 10, height: 10, fill: color, rx: 2 }));
      const t = el('text', { x: 14, y: 9, fill: c.text, 'font-size': 11 });
      t.textContent = `${d.label} (${d.value})`;
      g.appendChild(t);
      svg.appendChild(g);
      ly += 16;
    });
  }

  function barChart(host, data, opts) {
    opts = opts || {};
    clear(host);
    const c = themeColors();
    const w = host.clientWidth || 600, h = host.clientHeight || 220;
    const pad = { l: 50, r: 16, t: 14, b: 28 };
    const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
    const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, width: w, height: h });
    host.appendChild(svg);
    const max = Math.max(1, ...data.map(d => d.value));
    const bw = innerW / data.length;
    data.forEach((d, i) => {
      const bh = (d.value / max) * innerH;
      const x = pad.l + i * bw + 4, y = pad.t + innerH - bh, wd = bw - 8;
      svg.appendChild(el('rect', { x, y, width: wd, height: bh, fill: 'url(#g1)', rx: 4 }));
      const t = el('text', { x: x + wd / 2, y: y - 4, 'text-anchor': 'middle', fill: c.text, 'font-size': 11 });
      t.textContent = d.value;
      svg.appendChild(t);
      const lbl = el('text', { x: x + wd / 2, y: pad.t + innerH + 16, 'text-anchor': 'middle', fill: c.label, 'font-size': 10 });
      lbl.textContent = d.label;
      svg.appendChild(lbl);
    });
    // gradient (pulled from theme so it matches current palette)
    const defs = el('defs');
    const grad = el('linearGradient', { id: 'g1', x1: 0, y1: 0, x2: 0, y2: 1 });
    grad.appendChild(el('stop', { offset: '0%', 'stop-color': c.series1 }));
    grad.appendChild(el('stop', { offset: '100%', 'stop-color': c.series2 }));
    defs.appendChild(grad);
    svg.appendChild(defs);
  }

  global.NMCCharts = { line: lineChart, pie: pieChart, bar: barChart };
})(window);
