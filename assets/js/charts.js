// Minimal SVG charts for the admin dashboard: grouped bars (+SE), lines, 100% stacked bars, columns.
// Colours come from CSS custom properties so light/dark themes swap in one place.
window.Charts = (function () {
  const NS = "http://www.w3.org/2000/svg";
  const H = 240;
  const M = { t: 12, r: 12, b: 34, l: 40 };

  function s(tag, attrs) {
    const el = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    return el;
  }

  const tt = document.createElement("div");
  tt.className = "tt";
  tt.setAttribute("role", "tooltip");
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(tt));
  function tip(el, html) {
    const show = (e) => {
      tt.innerHTML = typeof html === "function" ? html() : html;
      tt.classList.add("show");
      const x = Math.min(e.clientX + 14, innerWidth - tt.offsetWidth - 8);
      const y = Math.min(e.clientY + 14, innerHeight - tt.offsetHeight - 8);
      tt.style.left = x + "px";
      tt.style.top = y + "px";
    };
    el.addEventListener("mousemove", show);
    el.addEventListener("mouseleave", () => tt.classList.remove("show"));
  }
  const fmt = (v, d = 2) => (v == null || isNaN(v) ? "—" : Number(v).toFixed(d));

  function niceTicks(min, max, count = 5) {
    const span = max - min || 1;
    const step0 = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((st) => span / st <= count) || 10 * mag;
    const ticks = [];
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(+v.toFixed(6));
    return ticks;
  }
  const compact = (v) => (Math.abs(v) >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + "K" : String(v));

  function axes(el, yMin, yMax, yFmt) {
    const W = Math.max(280, el.clientWidth);
    const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "chart-svg" });
    const y = (v) => M.t + (1 - (v - yMin) / (yMax - yMin)) * (H - M.t - M.b);
    const ticks = niceTicks(yMin, yMax);
    if (ticks[0] !== yMin) ticks.unshift(yMin);
    ticks.forEach((v) => {
      svg.appendChild(s("line", { x1: M.l, x2: W - M.r, y1: y(v), y2: y(v), class: v === yMin ? "baseline" : "grid" }));
      const t = s("text", { x: M.l - 8, y: y(v) + 4, class: "tick", "text-anchor": "end" });
      t.textContent = (yFmt || compact)(v);
      svg.appendChild(t);
    });
    el.innerHTML = "";
    el.appendChild(svg);
    return { svg, W, y, x0: M.l, x1: W - M.r, base: y(yMin) };
  }

  // Rounded data-end (4px), square at the baseline.
  function barPath(x, w, yTop, yBase) {
    const r = Math.min(4, w / 2, Math.abs(yBase - yTop));
    return `M${x},${yBase} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + w - r} Q${x + w},${yTop} ${x + w},${yTop + r} V${yBase} Z`;
  }

  function xLabel(svg, x, text) {
    const t = s("text", { x, y: H - 12, class: "tick", "text-anchor": "middle" });
    t.textContent = text;
    svg.appendChild(t);
  }

  // series: [{name, color, values:[{m, se, n}]}] aligned with categories
  function groupedBars(el, { categories, series, yMin = 0, yMax, yFmt, valueFmt }) {
    const ax = axes(el, yMin, yMax, yFmt);
    const band = (ax.x1 - ax.x0) / categories.length;
    const bw = Math.min(24, (band * 0.7) / series.length);
    const gap = 2;
    categories.forEach((cat, ci) => {
      const groupW = series.length * bw + (series.length - 1) * gap;
      const gx = ax.x0 + ci * band + (band - groupW) / 2;
      series.forEach((ser, si) => {
        const d = ser.values[ci];
        if (!d || d.n === 0 || d.m == null) return;
        const x = gx + si * (bw + gap);
        const yTop = ax.y(Math.max(yMin, Math.min(yMax, d.m)));
        ax.svg.appendChild(s("path", { d: barPath(x, bw, yTop, ax.base), style: `fill:${ser.color}` }));
        if (d.se) {
          const cx = x + bw / 2;
          const yHi = ax.y(Math.min(yMax, d.m + d.se));
          const yLo = ax.y(Math.max(yMin, d.m - d.se));
          ax.svg.appendChild(s("line", { x1: cx, x2: cx, y1: yHi, y2: yLo, class: "err" }));
          ax.svg.appendChild(s("line", { x1: cx - 4, x2: cx + 4, y1: yHi, y2: yHi, class: "err" }));
          ax.svg.appendChild(s("line", { x1: cx - 4, x2: cx + 4, y1: yLo, y2: yLo, class: "err" }));
        }
        const hit = s("rect", { x: x - gap, y: M.t, width: bw + gap * 2, height: ax.base - M.t, class: "hit" });
        tip(hit, `<b>${cat} · ${ser.name}</b><br>${(valueFmt || fmt)(d.m)}${d.se ? ` ± ${(valueFmt || fmt)(d.se)} SE` : ""}<br><span class="muted">n = ${d.n}</span>`);
        ax.svg.appendChild(hit);
      });
      xLabel(ax.svg, ax.x0 + ci * band + band / 2, cat);
    });
  }

  // series: [{name, color, values:[number|null]}] aligned with xLabels
  function lines(el, { xLabels, series, yMin, yMax, yFmt }) {
    const ax = axes(el, yMin, yMax, yFmt);
    const step = (ax.x1 - ax.x0) / Math.max(1, xLabels.length - 1);
    const xs = xLabels.map((_, i) => ax.x0 + 10 + i * ((ax.x1 - ax.x0 - 20) / Math.max(1, xLabels.length - 1)));
    xLabels.forEach((lab, i) => xLabel(ax.svg, xs[i], lab));
    const cross = s("line", { x1: 0, x2: 0, y1: M.t, y2: ax.base, class: "cross", visibility: "hidden" });
    ax.svg.appendChild(cross);
    series.forEach((ser) => {
      const pts = ser.values.map((v, i) => (v == null ? null : [xs[i], ax.y(v)]));
      let d = "";
      pts.forEach((p, i) => { if (p) d += (d && pts[i - 1] ? "L" : "M") + p[0] + "," + p[1]; });
      ax.svg.appendChild(s("path", { d, class: "line", style: `stroke:${ser.color}` }));
      pts.forEach((p) => { if (p) ax.svg.appendChild(s("circle", { cx: p[0], cy: p[1], r: 4, class: "dot", style: `fill:${ser.color}` })); });
    });
    xLabels.forEach((lab, i) => {
      const hit = s("rect", { x: xs[i] - step / 2, y: M.t, width: step, height: ax.base - M.t, class: "hit" });
      hit.addEventListener("mouseenter", () => { cross.setAttribute("x1", xs[i]); cross.setAttribute("x2", xs[i]); cross.setAttribute("visibility", "visible"); });
      hit.addEventListener("mouseleave", () => cross.setAttribute("visibility", "hidden"));
      tip(hit, () => `<b>${lab}</b>` + series.map((ser) => `<br><span class="key" style="background:${ser.color}"></span>${ser.name}: ${fmt(ser.values[i])}`).join(""));
      ax.svg.appendChild(hit);
    });
  }

  // Horizontal 100% stacked bars. rows: [{label, counts:[...]}], series: [{name, color}]
  function stacked100(el, { rows, series }) {
    const W = Math.max(280, el.clientWidth);
    const rowH = 34;
    const labelW = 96;
    const height = rows.length * rowH + 8;
    const svg = s("svg", { viewBox: `0 0 ${W} ${height}`, width: W, height, class: "chart-svg" });
    rows.forEach((row, ri) => {
      const total = row.counts.reduce((a, b) => a + b, 0);
      const y = 4 + ri * rowH + (rowH - 24) / 2;
      const t = s("text", { x: labelW - 8, y: y + 16, class: "tick", "text-anchor": "end" });
      t.textContent = row.label;
      svg.appendChild(t);
      if (!total) return;
      let x = labelW;
      const span = W - labelW - 8;
      row.counts.forEach((c, si) => {
        if (!c) return;
        const w = (c / total) * span;
        const seg = s("rect", { x, y, width: Math.max(0, w - 2), height: 24, rx: 3, style: `fill:${series[si].color}` });
        tip(seg, `<b>${row.label} · ${series[si].name}</b><br>${c} of ${total} (${Math.round((c / total) * 100)}%)`);
        svg.appendChild(seg);
        x += w;
      });
    });
    el.innerHTML = "";
    el.appendChild(svg);
  }

  // Single-series columns (histogram)
  function columns(el, { labels, values, color, yFmt }) {
    const max = Math.max(1, ...values);
    const ax = axes(el, 0, niceTicks(0, max).slice(-1)[0] < max ? max * 1.2 : niceTicks(0, max).slice(-1)[0], yFmt);
    const band = (ax.x1 - ax.x0) / labels.length;
    const bw = Math.min(24, band * 0.7);
    labels.forEach((lab, i) => {
      const x = ax.x0 + i * band + (band - bw) / 2;
      if (values[i]) ax.svg.appendChild(s("path", { d: barPath(x, bw, ax.y(values[i]), ax.base), style: `fill:${color}` }));
      const hit = s("rect", { x: ax.x0 + i * band, y: M.t, width: band, height: ax.base - M.t, class: "hit" });
      tip(hit, `<b>${lab}</b><br>${values[i]} participants`);
      ax.svg.appendChild(hit);
      xLabel(ax.svg, ax.x0 + i * band + band / 2, lab);
    });
  }

  return { groupedBars, lines, stacked100, columns, niceTicks };
})();
