// Admin dashboard: data processing, exclusions, preview statistics, charts, suspicion coding, export.
(function () {
  const CFG = window.STUDY_CONFIG;
  const S = window.STUDY;
  const $ = (q) => document.querySelector(q);
  const FRAMES = ["gain", "loss", "urgency"];
  const AFFECTS = ["low", "high"];
  const CAP = { gain: "Gain", loss: "Loss", urgency: "Urgency", low: "Low affect", high: "High affect" };
  const LADDER = ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"];
  const POST_STEPS = ["L1", "L4", "L7", "L8"];
  const POST_SCREENS = ["reveal", "post", "end"];
  const css = (v) => `var(${v})`;

  const ui = {
    key: sessionGet("rtr_admin_key"),
    applyExcl: true,
    exclSusp: false,
    match: "all",
    coder: localGet("rtr_coder") || "A",
    onlyUncoded: false,
    query: "",
  };
  let RAW = null;
  let DATA = null;

  function sessionGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function sessionSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function localGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function localSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.appendChild(typeof kid === "string" || typeof kid === "number" ? document.createTextNode(String(kid)) : kid);
    return el;
  }
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // ---------- statistics ----------
  const nums = (arr) => arr.filter((v) => v != null && !isNaN(v));
  const mean = (arr) => { const v = nums(arr); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const sd = (arr) => { const v = nums(arr); if (v.length < 2) return null; const m = mean(v); return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)); };
  const median = (arr) => { const v = nums(arr).sort((a, b) => a - b); if (!v.length) return null; const i = Math.floor(v.length / 2); return v.length % 2 ? v[i] : (v[i - 1] + v[i]) / 2; };
  const stat = (arr) => { const v = nums(arr); const s = sd(v); return { m: mean(v), se: s != null ? s / Math.sqrt(v.length) : null, n: v.length }; };

  function lgamma(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, t = x + 5.5;
    t -= (x + 0.5) * Math.log(t);
    let ser = 1.000000000190015;
    for (const ci of c) ser += ci / ++y;
    return -t + Math.log((2.5066282746310005 * ser) / x);
  }
  function betacf(a, b, x) {
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - (qab * x) / qap;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    let hh = d;
    for (let m = 1; m <= 200; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
      c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d; hh *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
      c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
      d = 1 / d;
      const del = d * c;
      hh *= del;
      if (Math.abs(del - 1) < 3e-7) break;
    }
    return hh;
  }
  function ibeta(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
  }
  const pF = (F, d1, d2) => (F <= 0 ? 1 : ibeta(d2 / (d2 + d1 * F), d2 / 2, d1 / 2));
  const pT = (t, df) => ibeta(df / (df + t * t), df / 2, 0.5);

  function solve(A, b) {
    const n = b.length;
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      if (Math.abs(M[c][c]) < 1e-12) return null;
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c] / M[c][c];
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map((row, i) => row[n] / row[i]);
  }
  function sse(X, y) {
    const p = X[0].length;
    const XtX = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => X.reduce((s, r) => s + r[i] * r[j], 0)));
    const Xty = Array.from({ length: p }, (_, i) => X.reduce((s, r, k) => s + r[i] * y[k], 0));
    const beta = solve(XtX, Xty);
    if (!beta) return null;
    return y.reduce((s, yi, k) => s + (yi - X[k].reduce((a, xv, j) => a + xv * beta[j], 0)) ** 2, 0);
  }
  // Two-way ANOVA with effect coding and Type III sums of squares (unbalanced-safe).
  function anova2(rows) {
    if (rows.length < 8) return null;
    for (const f of FRAMES) for (const a of AFFECTS) if (!rows.some((r) => r.frame === f && r.affect === a)) return null;
    const fc = { gain: [1, 0], loss: [0, 1], urgency: [-1, -1] };
    const ac = { low: 1, high: -1 };
    const X = rows.map((r) => { const [f1, f2] = fc[r.frame]; const a = ac[r.affect]; return [1, f1, f2, a, f1 * a, f2 * a]; });
    const y = rows.map((r) => r.y);
    const full = sse(X, y);
    if (full == null) return null;
    const dfE = rows.length - 6;
    const terms = { "Frame": [1, 2], "Affect": [3], "Frame × Affect": [4, 5] };
    return {
      dfE,
      rows: Object.entries(terms).map(([name, cols]) => {
        const red = sse(X.map((r) => r.filter((_, j) => !cols.includes(j))), y);
        const SS = red - full;
        const df = cols.length;
        const F = SS / df / (full / dfE);
        return { name, df, F, p: pF(F, df, dfE), eta: SS / (SS + full) };
      }),
    };
  }
  function welch(a, b) {
    const x = nums(a), y = nums(b);
    if (x.length < 2 || y.length < 2) return null;
    const va = sd(x) ** 2 / x.length, vb = sd(y) ** 2 / y.length;
    const t = (mean(y) - mean(x)) / Math.sqrt(va + vb);
    const df = (va + vb) ** 2 / (va ** 2 / (x.length - 1) + vb ** 2 / (y.length - 1));
    const pooled = Math.sqrt(((x.length - 1) * sd(x) ** 2 + (y.length - 1) * sd(y) ** 2) / (x.length + y.length - 2));
    return { diff: mean(y) - mean(x), t, df, p: pT(t, df), d: (mean(y) - mean(x)) / pooled };
  }
  function kappa(pairs) {
    if (!pairs.length) return null;
    const n = pairs.length;
    const po = pairs.filter(([a, b]) => a === b).length / n;
    const pa = pairs.filter(([a]) => a).length / n, pb = pairs.filter(([, b]) => b).length / n;
    const pe = pa * pb + (1 - pa) * (1 - pb);
    return { k: pe === 1 ? 1 : (po - pe) / (1 - pe), po, n };
  }
  const pfmt = (p) => (p == null ? "—" : p < 0.001 ? "< .001" : p.toFixed(3).replace(/^0/, ""));

  // ---------- derive variables ----------
  function derive(r) {
    const a = r.answers || {};
    const num = (id) => (a[id] === "" || a[id] == null || isNaN(a[id]) ? null : Number(a[id]));
    const avg = (ids) => mean(ids.map(num));
    const d = {};
    d.f2 = num("F2");
    d.trust = avg(["Q4_4", "Q4_6"]);
    d.realism = num("Q4_1");
    d.ladder = avg(LADDER);
    d.ladder_pre4 = avg(POST_STEPS);
    d.ladder_post = avg(POST_STEPS.map((x) => x + "r"));
    d.reveal_change = d.ladder_post != null && d.ladder_pre4 != null ? d.ladder_post - d.ladder_pre4 : null;
    const stopIdx = LADDER.findIndex((id) => num(id) != null && num(id) <= 3);
    d.stop = stopIdx === -1 ? 9 : stopIdx + 1;
    const lon = ["Q7_12", "Q7_13", "Q7_14"].map(num);
    d.lonely = lon.every((v) => v != null) ? lon.reduce((x, y) => x + y, 0) : null;
    d.mc_affect = num("Q10_1");
    d.mc_urgency = num("Q10_3");
    d.mc_gain = num("Q10_4");
    d.mc_loss = num("Q10_5");
    d.risk = num("Q10_9");
    // Loss aversion from one mixed gamble: required win / ₹500 loss (λ ≈ 2 is typical).
    d.lambda = num("LA1") != null ? num("LA1") / 500 : null;
    d.money = num("L8a");
    d.belief = num("L8b");
    d.exp_loss = d.money != null && d.belief != null ? d.money * (1 - d.belief / 100) : null;
    const pre = Object.entries(r.timings || {}).filter(([k]) => !POST_SCREENS.includes(k)).reduce((s, [, v]) => s + v, 0);
    d.pre_reveal_s = pre ? Math.round(pre / 1000) : null;
    d.vignette_s = r.timings && r.timings.vignette ? Math.round(r.timings.vignette / 1000) : null;
    const text = (a.Q8_1 || "").toLowerCase();
    d.susp_words = S.SUSPICION_WORDS.filter((w) => text.includes(w));
    d.susp_auto = d.susp_words.length > 0;
    d.flag_attention = a.Q10_6 !== 3;
    d.flag_comprehension = a.Q10_8 !== "WhatsApp";
    d.flag_vignette = d.vignette_s != null && d.vignette_s < CFG.MIN_VIGNETTE_SECONDS;
    return d;
  }

  function process() {
    const codes = {};
    (RAW.codes || []).forEach((c) => { (codes[c.response_id] = codes[c.response_id] || {})[c.coder] = c.suspicious === true || c.suspicious === "true"; });
    const all = (RAW.responses || []).map((r) => ({ ...r, d: r.withdrawn || r.stage === "withdrawn" ? {} : derive(r), code: codes[r.id] || {} }));
    const valid = all.filter((r) => !(r.withdrawn || r.stage === "withdrawn"));
    const med = median(valid.map((r) => r.d.pre_reveal_s));
    valid.forEach((r) => {
      r.d.flag_speeder = med != null && r.d.pre_reveal_s != null && r.d.pre_reveal_s < med / 3;
      r.d.flag_test = String(r.id).indexOf("TEST-") === 0;
      r.d.flags = ["test", "attention", "comprehension", "vignette", "speeder"].filter((f) => r.d["flag_" + f]);
      const A = r.code.A, B = r.code.B;
      r.d.susp_final = A != null && B != null ? A || B : A != null ? A : B != null ? B : r.d.susp_auto;
      r.d.susp_source = A != null || B != null ? "coded" : "auto";
    });
    DATA = { all, valid, withdrawn: all.filter((r) => r.withdrawn || r.stage === "withdrawn"), median: med, codes };
  }

  function filtered() {
    return DATA.valid.filter((r) => (!ui.applyExcl || !r.d.flags.length) && (!ui.exclSusp || !r.d.susp_final) && (ui.match === "all" || r.name === ui.match));
  }
  const cell = (rows, f, a) => rows.filter((r) => r.frame === f && (a == null || r.affect === a));

  // ---------- rendering ----------
  async function load() {
    $("#status").textContent = "Loading…";
    try {
      RAW = await window.API.adminFetch(ui.key);
      process();
      $("#login").hidden = true;
      $("#dash").hidden = false;
      renderAll();
      $("#status").textContent = "Updated " + new Date().toLocaleTimeString();
    } catch (e) {
      $("#login").hidden = false;
      $("#dash").hidden = true;
      $("#login-error").textContent = e.message || "Could not load data";
      $("#status").textContent = "";
    }
  }

  function renderAll() {
    const rows = filtered();
    renderKPIs(rows);
    renderBalance(rows);
    renderStats(rows);
    renderCharts(rows);
    renderCoding();
    renderTable();
  }

  function tile(label, value, sub, extra) {
    return h("div", { class: "tile" + (extra ? " " + extra : "") }, h("div", { class: "tile-label" }, label), h("div", { class: "tile-value" }, value), sub ? h("div", { class: "tile-sub" }, sub) : null);
  }

  function renderKPIs(rows) {
    const el = $("#kpis");
    el.innerHTML = "";
    const pct = Math.min(100, Math.round((rows.length / CFG.TARGET_TOTAL) * 100));
    el.appendChild(h("div", { class: "tile hero" },
      h("div", { class: "tile-label" }, "Analysable responses"),
      h("div", { class: "hero-value" }, rows.length, h("span", {}, " / " + CFG.TARGET_TOTAL)),
      h("div", { class: "meter", role: "img", "aria-label": pct + "% of target" }, h("span", { style: `width:${pct}%` })),
      h("div", { class: "tile-sub" }, `${pct}% of target · minimum 180`)));
    const excluded = DATA.valid.filter((r) => r.d.flags.length).length;
    const susp = DATA.valid.filter((r) => r.d.susp_final).length;
    el.appendChild(tile("Started", (RAW.assignments || []).length, "assigned to a condition"));
    const started = (RAW.assignments || []).length;
    el.appendChild(tile("Submitted", DATA.valid.length, "completed the survey"));
    el.appendChild(tile("Dropped out", Math.max(0, started - DATA.valid.length), started ? Math.round((Math.max(0, started - DATA.valid.length) / started) * 100) + "% of those who started" : "started but didn't submit"));
    el.appendChild(tile("Flagged for exclusion", excluded, "attention, comprehension, speed"));
    el.appendChild(tile("Suspicious", susp, "auto keyword or coded"));
    el.appendChild(tile("Median time", DATA.median ? Math.round(DATA.median / 60) + " min" : "—", "before the reveal"));
  }

  function renderBalance(rows) {
    const el = $("#balance");
    el.innerHTML = "";
    const table = h("table", { class: "grid-table" },
      h("thead", {}, h("tr", {}, h("th", {}, ""), FRAMES.map((f) => h("th", {}, CAP[f])))),
      h("tbody", {}, AFFECTS.map((a) => h("tr", {}, h("th", {}, CAP[a]), FRAMES.map((f) => {
        const n = cell(rows, f, a).length;
        const p = Math.min(100, (n / CFG.TARGET_PER_CELL) * 100);
        return h("td", {}, h("div", { class: "cell-n" }, n, h("span", {}, " / " + CFG.TARGET_PER_CELL)), h("div", { class: "meter sm" }, h("span", { style: `width:${p}%` })));
      })))));
    el.appendChild(table);
    const byName = ["Arjun", "Ananya", "Kiran"].map((n) => `${n}: ${rows.filter((r) => r.name === n).length}`).join(" · ");
    el.appendChild(h("p", { class: "muted small" }, "Match version · " + byName));
  }

  function renderStats(rows) {
    const el = $("#stats");
    el.innerHTML = "";
    const dvs = [["F2", "f2", "Focal: move to WhatsApp (F2)"], ["Ladder", "ladder", "Ladder mean L1–L8"], ["₹ sent", "money", "Money sent (L8a)"]];
    const pick = $("#stat-dv").value;
    const [, key, label] = dvs.find((x) => x[1] === pick) || dvs[0];
    const data = rows.filter((r) => r.d[key] != null).map((r) => ({ frame: r.frame, affect: r.affect, y: r.d[key] }));
    const res = anova2(data);
    const means = h("table", { class: "data-table compact" },
      h("thead", {}, h("tr", {}, h("th", {}, label), FRAMES.map((f) => h("th", { class: "num" }, CAP[f])))),
      h("tbody", {}, AFFECTS.map((a) => h("tr", {}, h("th", {}, CAP[a]), FRAMES.map((f) => {
        const s = stat(cell(data, f, a).map((r) => r.y));
        return h("td", { class: "num" }, s.n ? `${s.m.toFixed(2)} (${s.n})` : "—");
      })))));
    el.appendChild(means);
    if (!res) {
      el.appendChild(h("p", { class: "muted small" }, "Needs at least one response in every cell (and 8+ in total) to run the ANOVA."));
      return;
    }
    el.appendChild(h("table", { class: "data-table compact" },
      h("thead", {}, h("tr", {}, ["Effect", "df", "F", "p", "partial η²"].map((x, i) => h("th", { class: i ? "num" : "" }, x)))),
      h("tbody", {}, res.rows.map((r) => h("tr", { class: r.p < 0.05 ? "sig" : "" }, h("td", {}, r.name), h("td", { class: "num" }, `${r.df}, ${res.dfE}`), h("td", { class: "num" }, r.F.toFixed(2)), h("td", { class: "num" }, pfmt(r.p)), h("td", { class: "num" }, r.eta.toFixed(3)))))));
    const c1 = welch(cell(data, "gain").map((r) => r.y), cell(data, "loss").map((r) => r.y));
    const c2 = welch(cell(data, "loss").map((r) => r.y), cell(data, "urgency").map((r) => r.y));
    const line = (name, c) => (c ? `${name}: Δ = ${c.diff.toFixed(2)}, t(${c.df.toFixed(1)}) = ${c.t.toFixed(2)}, p ${pfmt(c.p).startsWith("<") ? pfmt(c.p) : "= " + pfmt(c.p)}, d = ${c.d.toFixed(2)}` : `${name}: not enough data`);
    el.appendChild(h("p", { class: "small" }, h("b", {}, "Planned contrasts (Welch, pooled over affect)"), h("br"), line("H1 Loss − Gain", c1), h("br"), line("H2 Urgency − Loss", c2)));
    el.appendChild(h("p", { class: "muted small" }, "Preview only: Type III ANOVA with effect coding. Run the pre-registered models in R for the report."));
  }

  // ---------- charts ----------
  const drawers = [];
  function chartCard({ title, sub, legend, draw, table, wide }) {
    const body = h("div", { class: "chart-body" });
    const tableBox = h("div", { class: "chart-table", hidden: true });
    const toggle = h("button", { class: "linkish", type: "button", onclick: () => {
      const showTable = tableBox.hidden;
      tableBox.hidden = !showTable;
      body.hidden = showTable;
      toggle.textContent = showTable ? "Chart" : "Table";
    } }, "Table");
    tableBox.appendChild(h("table", { class: "data-table compact" }, h("thead", {}, h("tr", {}, table.head.map((x, i) => h("th", { class: i ? "num" : "" }, x)))), h("tbody", {}, table.rows.map((r) => h("tr", {}, r.map((x, i) => h(i ? "td" : "th", { class: i ? "num" : "" }, x)))))));
    const card = h("section", { class: "card" + (wide ? " wide" : "") },
      h("div", { class: "card-head" }, h("div", {}, h("h3", {}, title), sub ? h("p", { class: "muted small" }, sub) : null), toggle),
      legend && legend.length > 1 ? h("div", { class: "legend" }, legend.map((l) => h("span", {}, h("i", { class: l.line ? "key line" : "key", style: `background:${l.color}` }), l.name))) : null,
      body, tableBox);
    $("#charts").appendChild(card);
    drawers.push(() => draw(body));
    requestAnimationFrame(() => draw(body));
  }
  const affectSeries = (rows, key) => AFFECTS.map((a, i) => ({ name: CAP[a], color: css(i ? "--aff-high" : "--aff-low"), values: FRAMES.map((f) => stat(cell(rows, f, a).map((r) => r.d[key]))) }));
  const affectLegend = [{ name: CAP.low, color: css("--aff-low") }, { name: CAP.high, color: css("--aff-high") }];
  const frameColors = { gain: css("--s1"), loss: css("--s2"), urgency: css("--s3") };
  const frameLegend = FRAMES.map((f) => ({ name: CAP[f], color: frameColors[f], line: true }));
  const statTable = (rows, key, d = 2) => ({
    head: ["Condition", "Mean", "SE", "n"],
    rows: FRAMES.flatMap((f) => AFFECTS.map((a) => { const s = stat(cell(rows, f, a).map((r) => r.d[key])); return [`${CAP[f]} · ${CAP[a]}`, s.m == null ? "—" : s.m.toFixed(d), s.se == null ? "—" : s.se.toFixed(d), s.n]; })),
  });

  function renderCharts(rows) {
    $("#charts").innerHTML = "";
    drawers.length = 0;

    chartCard({
      title: "Focal compliance by condition", sub: "F2 · likelihood of moving to WhatsApp now (1–7), mean ± SE", legend: affectLegend,
      draw: (el) => Charts.groupedBars(el, { categories: FRAMES.map((f) => CAP[f]), series: affectSeries(rows, "f2"), yMin: 1, yMax: 7 }),
      table: statTable(rows, "f2"),
    });

    const ladderLines = (a) => FRAMES.map((f) => ({ name: CAP[f], color: frameColors[f], values: LADDER.map((id) => mean(cell(rows, f, a).map((r) => Number(r.answers[id]) || null))) }));
    AFFECTS.forEach((a) => chartCard({
      title: `Compliance ladder · ${CAP[a]}`, sub: "Mean likelihood at each step (1–7). L1 continue → L8 money", legend: frameLegend,
      draw: (el) => Charts.lines(el, { xLabels: LADDER, series: ladderLines(a), yMin: 1, yMax: 7 }),
      table: { head: ["Step"].concat(FRAMES.map((f) => CAP[f])), rows: LADDER.map((id, i) => [id].concat(ladderLines(a).map((s) => (s.values[i] == null ? "—" : s.values[i].toFixed(2))))) },
    }));

    const surv = FRAMES.map((f) => ({ name: CAP[f], color: frameColors[f], values: LADDER.map((_, i) => { const c = cell(rows, f); return c.length ? (c.filter((r) => r.d.stop > i + 1).length / c.length) * 100 : null; }) }));
    chartCard({
      title: "Still complying", sub: "% of participants who haven't yet rated a step ≤ 3 (stop point)", legend: frameLegend,
      draw: (el) => Charts.lines(el, { xLabels: LADDER, series: surv, yMin: 0, yMax: 100, yFmt: (v) => v + "%" }),
      table: { head: ["Step"].concat(FRAMES.map((f) => CAP[f])), rows: LADDER.map((id, i) => [id].concat(surv.map((s) => (s.values[i] == null ? "—" : s.values[i].toFixed(0) + "%")))) },
    });

    chartCard({
      title: "Money sent (L8a)", sub: "₹ the participant would send in an emergency, mean ± SE", legend: affectLegend,
      draw: (el) => { const ser = affectSeries(rows, "money"); const max = Math.max(500, ...ser.flatMap((s) => s.values.map((v) => (v.m || 0) + (v.se || 0)))); Charts.groupedBars(el, { categories: FRAMES.map((f) => CAP[f]), series: ser, yMin: 0, yMax: Charts.niceTicks(0, max * 1.1).slice(-1)[0], valueFmt: (v) => "₹" + Math.round(v) }); },
      table: statTable(rows, "money", 0),
    });

    chartCard({
      title: "Believed chance of repayment (L8b)", sub: "Subjective probability (%) that the match repays, mean ± SE", legend: affectLegend,
      draw: (el) => Charts.groupedBars(el, { categories: FRAMES.map((f) => CAP[f]), series: affectSeries(rows, "belief"), yMin: 0, yMax: 100, yFmt: (v) => v + "%", valueFmt: (v) => v.toFixed(1) + "%" }),
      table: statTable(rows, "belief", 1),
    });

    const finals = rows.filter((r) => r.d.ladder_post != null);
    const prePost = [
      { name: "Before reveal", color: css("--muted-series"), values: POST_STEPS.map((id) => mean(finals.map((r) => Number(r.answers[id]) || null))) },
      { name: "After reveal", color: css("--s1"), values: POST_STEPS.map((id) => mean(finals.map((r) => Number(r.answers[id + "r"]) || null))) },
    ];
    chartCard({
      title: "Before vs after the reveal (O4)", sub: `Same 4 ladder steps rated again after the debrief (n = ${finals.length})`, legend: prePost.map((s) => ({ name: s.name, color: s.color, line: true })),
      draw: (el) => Charts.lines(el, { xLabels: POST_STEPS, series: prePost, yMin: 1, yMax: 7 }),
      table: { head: ["Step", "Before", "After"], rows: POST_STEPS.map((id, i) => [id, prePost[0].values[i] == null ? "—" : prePost[0].values[i].toFixed(2), prePost[1].values[i] == null ? "—" : prePost[1].values[i].toFixed(2)]) },
    });

    chartCard({
      title: "Trust in the match", sub: "Mean of trustworthy + honest (Q4.4, Q4.6), 1–7, ± SE", legend: affectLegend,
      draw: (el) => Charts.groupedBars(el, { categories: FRAMES.map((f) => CAP[f]), series: affectSeries(rows, "trust"), yMin: 1, yMax: 7 }),
      table: statTable(rows, "trust"),
    });

    chartCard({
      title: "Perceived risk", sub: "\"Moving to WhatsApp would be risky\" (Q10.9), 1–7, ± SE. Affect heuristic predicts lower risk under high affect", legend: affectLegend,
      draw: (el) => Charts.groupedBars(el, { categories: FRAMES.map((f) => CAP[f]), series: affectSeries(rows, "risk"), yMin: 1, yMax: 7 }),
      table: statTable(rows, "risk"),
    });

    const lamBins = [["< 1", 0, 1], ["1–1.5", 1, 1.5], ["1.5–2", 1.5, 2], ["2–2.5", 2, 2.5], ["2.5–3", 2.5, 3], ["3+", 3, Infinity]];
    const lamCounts = lamBins.map(([, lo, hi]) => rows.filter((r) => r.d.lambda != null && r.d.lambda >= lo && r.d.lambda < hi).length);
    const lamMed = median(rows.map((r) => r.d.lambda));
    const lossGap = (pick) => {
      const hiL = rows.filter(pick);
      const g = mean(cell(hiL, "loss").map((r) => r.d.f2)), gn = mean(cell(hiL, "gain").map((r) => r.d.f2));
      return g != null && gn != null ? (g - gn).toFixed(2) : "—";
    };
    chartCard({
      title: "Loss aversion (λ)",
      sub: `Required win ÷ ₹500 loss. Median λ = ${lamMed == null ? "—" : lamMed.toFixed(2)}. Loss − Gain gap on F2: ${lossGap((r) => lamMed != null && r.d.lambda > lamMed)} above median λ vs ${lossGap((r) => lamMed != null && r.d.lambda != null && r.d.lambda <= lamMed)} at or below`,
      draw: (el) => Charts.columns(el, { labels: lamBins.map((b) => b[0]), values: lamCounts, color: css("--s1") }),
      table: { head: ["λ range", "Participants"], rows: lamBins.map((b, i) => [b[0], lamCounts[i]]) },
    });

    // Manipulation checks: mean per condition, as a table (exact values matter more than shape here).
    const mcs = [["Affect (Q10.1)", "mc_affect"], ["Urgency (Q10.3)", "mc_urgency"], ["Gain focus (Q10.4)", "mc_gain"], ["Loss focus (Q10.5)", "mc_loss"], ["Perceived risk (Q10.9)", "risk"], ["Realism (Q4.1)", "realism"]];
    const condCols = FRAMES.flatMap((f) => AFFECTS.map((a) => [f, a]));
    const mcCard = h("section", { class: "card wide" },
      h("div", { class: "card-head" }, h("div", {}, h("h3", {}, "Manipulation & mechanism checks"), h("p", { class: "muted small" }, "Cell means (1–7 unless noted). Expect: affect higher in High columns, urgency highest in Urgency, gain > loss focus in Gain."))),
      h("div", { class: "scroll-x" }, h("table", { class: "data-table compact" },
        h("thead", {}, h("tr", {}, h("th", {}, "Measure"), condCols.map(([f, a]) => h("th", { class: "num" }, `${CAP[f]} ${a === "low" ? "Low" : "High"}`)))),
        h("tbody", {}, mcs.map(([label, key]) => h("tr", {}, h("th", {}, label), condCols.map(([f, a]) => {
          const v = mean(cell(rows, f, a).map((r) => r.d[key]));
          return h("td", { class: "num" }, v == null ? "—" : v.toFixed(2));
        })))))));
    $("#charts").appendChild(mcCard);
  }

  // ---------- suspicion coding ----------
  function renderCoding() {
    const el = $("#coding");
    el.innerHTML = "";
    const pairs = DATA.valid.filter((r) => r.code.A != null && r.code.B != null).map((r) => [r.code.A, r.code.B]);
    const k = kappa(pairs);
    $("#kappa").textContent = k ? `Cohen's κ = ${k.k.toFixed(2)} · agreement ${(k.po * 100).toFixed(0)}% · ${k.n} double-coded` : "κ appears once both coders have coded the same responses";
    const mine = (r) => r.code[ui.coder];
    const list = DATA.valid.filter((r) => !ui.onlyUncoded || mine(r) == null).slice().reverse();
    if (!list.length) { el.appendChild(h("p", { class: "muted" }, "Nothing to code.")); return; }
    list.slice(0, 60).forEach((r) => {
      let txt = esc(r.answers.Q8_1 || "—");
      let txt2 = esc(r.answers.Q8_2 || "");
      S.SUSPICION_WORDS.forEach((w) => { const re = new RegExp("(" + w + "\\w*)", "gi"); txt = txt.replace(re, "<mark>$1</mark>"); txt2 = txt2.replace(re, "<mark>$1</mark>"); });
      const state = mine(r);
      const btn = (val, label) => h("button", { type: "button", class: "seg" + (state === val ? " on" : ""), onclick: async (e) => {
        e.currentTarget.parentNode.querySelectorAll(".seg").forEach((b) => b.classList.remove("on"));
        e.currentTarget.classList.add("on");
        r.code[ui.coder] = val;
        try {
          await window.API.saveCode(ui.key, { response_id: r.id, coder: ui.coder, suspicious: val });
          RAW.codes = (RAW.codes || []).filter((c) => !(c.response_id === r.id && c.coder === ui.coder)).concat([{ response_id: r.id, coder: ui.coder, suspicious: val }]);
          process();
          renderKPIs(filtered());
          const pr = DATA.valid.filter((x) => x.code.A != null && x.code.B != null).map((x) => [x.code.A, x.code.B]);
          const kk = kappa(pr);
          $("#kappa").textContent = kk ? `Cohen's κ = ${kk.k.toFixed(2)} · agreement ${(kk.po * 100).toFixed(0)}% · ${kk.n} double-coded` : "κ appears once both coders have coded the same responses";
        } catch (err) { alert("Could not save code: " + err.message); }
      } }, label);
      el.appendChild(h("div", { class: "code-row" },
        h("div", { class: "code-text" }, h("div", { class: "muted small" }, r.id + (r.d.susp_auto ? " · keyword match" : "")), h("p", { html: txt }), txt2 ? h("p", { class: "muted", html: "Unusual: " + txt2 }) : null),
        h("div", { class: "segs" }, btn(true, "Suspicious"), btn(false, "Not suspicious"))));
    });
  }

  // ---------- table + detail ----------
  function renderTable() {
    const tb = $("#resp-body");
    tb.innerHTML = "";
    const q = ui.query.toLowerCase();
    DATA.all.slice().reverse().filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q)).slice(0, 300).forEach((r) => {
      const w = r.withdrawn || r.stage === "withdrawn";
      const flags = w ? [h("span", { class: "pill" }, "withdrawn")] : r.d.flags.map((f) => h("span", { class: "pill warn" }, f)).concat(r.d.susp_final ? [h("span", { class: "pill" }, "suspicious")] : []);
      tb.appendChild(h("tr", { class: "clickable", tabindex: 0, onclick: () => detail(r), onkeydown: (e) => { if (e.key === "Enter") detail(r); } },
        h("td", { class: "mono" }, r.id), h("td", {}, r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "—"), h("td", {}, r.stage || "—"),
        h("td", {}, r.cond ? `${r.cond} ${CAP[S.CONDITIONS[r.cond].frame]}·${S.CONDITIONS[r.cond].affect}` : "—"), h("td", {}, r.name || "—"),
        h("td", { class: "num" }, w || r.d.pre_reveal_s == null ? "—" : (r.d.pre_reveal_s / 60).toFixed(1)), h("td", {}, flags),
        h("td", { class: "num" }, w ? "—" : r.d.f2 ?? "—"), h("td", { class: "num" }, w || r.d.ladder == null ? "—" : r.d.ladder.toFixed(2)), h("td", { class: "num" }, w || r.d.money == null ? "—" : "₹" + r.d.money)));
    });
  }
  function detail(r) {
    const dlg = $("#detail");
    $("#detail-title").textContent = r.id;
    $("#detail-body").textContent = JSON.stringify({ derived: r.d, ...r, d: undefined }, null, 2);
    dlg.showModal();
  }

  // ---------- export ----------
  function flatRows() {
    const answerKeys = [];
    DATA.all.forEach((r) => Object.keys(r.answers || {}).forEach((k) => { if (!answerKeys.includes(k)) answerKeys.push(k); }));
    const timingKeys = [];
    DATA.all.forEach((r) => Object.keys(r.timings || {}).forEach((k) => { if (!timingKeys.includes(k)) timingKeys.push(k); }));
    const derivedKeys = ["f2", "trust", "realism", "ladder", "ladder_pre4", "ladder_post", "reveal_change", "stop", "lonely", "mc_affect", "mc_urgency", "mc_gain", "mc_loss", "risk", "lambda", "money", "belief", "exp_loss", "pre_reveal_s", "vignette_s", "flag_attention", "flag_comprehension", "flag_vignette", "flag_speeder", "susp_auto", "susp_final"];
    const head = ["id", "stage", "withdrawn", "cond", "frame", "affect", "name", "pref", "started_at", "submitted_at", "duration_s", "peeks", "source", "demo"]
      .concat(answerKeys, timingKeys.map((k) => "t_" + k), derivedKeys.map((k) => "d_" + k), ["code_A", "code_B"]);
    const rows = DATA.all.map((r) => {
      const base = [r.id, r.stage, !!r.withdrawn, r.cond, r.frame || S.CONDITIONS[r.cond]?.frame, r.affect || S.CONDITIONS[r.cond]?.affect, r.name, r.pref, r.started_at, r.submitted_at, r.duration_s, r.peeks, r.meta?.source, !!r.meta?.demo];
      return base.concat(answerKeys.map((k) => r.answers?.[k]), timingKeys.map((k) => r.timings?.[k]), derivedKeys.map((k) => r.d?.[k]), [r.code.A, r.code.B]);
    });
    return [head].concat(rows);
  }
  function download(name, text, type) {
    const a = h("a", { href: URL.createObjectURL(new Blob([text], { type })), download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  const csvCell = (v) => { if (v == null) return ""; const s = String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };

  // ---------- demo data (local mode only) ----------
  function demo(n) {
    const rnd = (a, b) => a + Math.random() * (b - a);
    const norm = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const clamp = (x, lo = 1, hi = 7) => Math.max(lo, Math.min(hi, Math.round(x)));
    const probes = ["how tone affects first impressions", "communication styles in dating apps", "whether emojis change how warm a message feels", "trust between strangers online", "if people can spot scams or fake profiles", "online dating behaviour", "how people respond to pressure to share info", "texting habits and personality"];
    const resp = JSON.parse(localStorage.getItem("rtr_responses") || "[]");
    const asg = JSON.parse(localStorage.getItem("rtr_assignments") || "[]");
    const conds = Object.keys(S.CONDITIONS);
    for (let i = 0; i < n; i++) {
      const cond = conds[i % 6];
      const { frame, affect } = S.CONDITIONS[cond];
      const pref = ["men", "women", "either", "none"][Math.floor(Math.random() * 4)];
      const name = pref === "men" ? "Arjun" : pref === "women" ? "Ananya" : pref === "none" ? "Kiran" : Math.random() < 0.5 ? "Arjun" : "Ananya";
      const id = "DEMO" + Date.now().toString(36).toUpperCase() + i;
      asg.push({ id, ts: new Date().toISOString(), pref, cond, name });
      if (Math.random() < 0.06) continue; // started but never submitted
      const fe = { gain: 0, loss: 0.45, urgency: 0.85 }[frame] + (affect === "high" ? 0.6 : 0) + (frame === "urgency" && affect === "high" ? 0.4 : 0);
      const person = norm() * 0.9;
      const base = 3.4 + fe + person;
      const a = { Q1_1: "yes", Q1_2: "agree", Q1_3: pref };
      ["Q4_1", "Q4_2"].forEach((k) => (a[k] = clamp(5 + norm())));
      ["Q4_4", "Q4_6"].forEach((k) => (a[k] = clamp(4 + (affect === "high" ? 0.7 : 0) + person * 0.6 + norm() * 0.8)));
      a.F2 = clamp(base + norm() * 0.8);
      LADDER.forEach((k, j) => (a[k] = clamp(base + 1.6 - j * 0.62 + norm() * 0.7)));
      a.L8 = clamp(base - 2.6 + norm() * 0.7);
      a.L8a = Math.random() < 0.45 ? 0 : Math.round(rnd(100, 600 + fe * 600) / 50) * 50;
      a.L8b = Math.round(Math.max(0, Math.min(100, 45 + fe * 10 + norm() * 20)));
      a.Q7_1 = Math.round(rnd(18, 26)); a.Q7_2 = Math.random() < 0.5 ? "woman" : "man"; a.Q7_3 = "ug"; a.Q7_4 = Math.random() < 0.7 ? "single" : "relationship";
      a.Q7_5 = ["never", "past", "current"][Math.floor(Math.random() * 3)]; if (a.Q7_5 !== "never") a.Q7_6 = "1-5";
      if (name === "Kiran") a.Q7_7 = "didnt";
      ["Q7_12", "Q7_13", "Q7_14"].forEach((k) => (a[k] = clamp(1.8 + norm() * 0.7, 1, 3)));
      a.Q8_1 = probes[Math.floor(Math.random() * probes.length)];
      a.Q10_1 = clamp(3.5 + (affect === "high" ? 2 : 0) + norm());
      a.Q10_3 = clamp(2.8 + (frame === "urgency" ? 2.5 : 0) + norm()); a.Q10_4 = clamp(3 + (frame === "gain" ? 2 : 0) + norm()); a.Q10_5 = clamp(3 + (frame !== "gain" ? 2 : 0) + norm());
      a.LA1 = Math.round((500 * Math.exp(Math.log(2) + norm() * 0.35)) / 50) * 50;
      a.Q10_9 = clamp(4.6 - (affect === "high" ? 0.9 : 0) - person * 0.4 + norm());
      a.Q10_6 = Math.random() < 0.93 ? 3 : 5; a.Q10_8 = Math.random() < 0.96 ? "WhatsApp" : "Telegram";
      POST_STEPS.forEach((k) => (a[k + "r"] = clamp(a[k] - 1.3 + norm() * 0.6)));
      a.Q12_2 = "unsure"; a.Q12_3 = "no";
      const timings = { welcome: 6000, consent: 30000, instructions: 12000, vignette: rnd(21000, 60000), impressions: 18000, reply: 8000, ladder: 25000, money: 25000, about: 40000, probe: 25000, checks: 25000, reveal: 15000, post: 25000 };
      if (Math.random() < 0.04) Object.keys(timings).forEach((k) => (timings[k] *= 0.2));
      resp.push({ id, study: CFG.STUDY_ID, stage: "final", cond, frame, affect, name, pref, started_at: new Date().toISOString(), submitted_at: new Date().toISOString(), duration_s: 600, answers: a, timings, peeks: 0, meta: { demo: true, mode: "local" } });
    }
    localStorage.setItem("rtr_responses", JSON.stringify(resp));
    localStorage.setItem("rtr_assignments", JSON.stringify(asg));
  }

  // ---------- wiring ----------
  $("#login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    ui.key = $("#key").value.trim();
    sessionSet("rtr_admin_key", ui.key);
    $("#login-error").textContent = "";
    load();
  });
  $("#refresh").addEventListener("click", load);
  $("#logout").addEventListener("click", () => { sessionSet("rtr_admin_key", ""); location.reload(); });
  $("#f-excl").addEventListener("change", (e) => { ui.applyExcl = e.target.checked; renderAll(); });
  $("#f-susp").addEventListener("change", (e) => { ui.exclSusp = e.target.checked; renderAll(); });
  $("#f-match").addEventListener("change", (e) => { ui.match = e.target.value; renderAll(); });
  $("#stat-dv").addEventListener("change", () => renderStats(filtered()));
  $("#coder").value = ui.coder;
  $("#coder").addEventListener("change", (e) => { ui.coder = e.target.value; localSet("rtr_coder", ui.coder); renderCoding(); });
  $("#only-uncoded").addEventListener("change", (e) => { ui.onlyUncoded = e.target.checked; renderCoding(); });
  $("#search").addEventListener("input", (e) => { ui.query = e.target.value; renderTable(); });
  $("#export-csv").addEventListener("click", () => download(`read-the-room_${new Date().toISOString().slice(0, 10)}.csv`, flatRows().map((r) => r.map(csvCell).join(",")).join("\n"), "text/csv"));
  $("#export-json").addEventListener("click", () => download(`read-the-room_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(RAW, null, 2), "application/json"));
  $("#detail-close").addEventListener("click", () => $("#detail").close());
  $("#theme").addEventListener("click", () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    localSet("rtr_admin_theme", root.dataset.theme);
    drawers.forEach((d) => d());
  });
  const savedTheme = localGet("rtr_admin_theme");
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;

  if (window.API.LOCAL) {
    $("#mode").textContent = "Local test mode";
    $("#mode").classList.add("local");
    $("#local-tools").hidden = false;
    $("#login-hint").textContent = `Local test mode: the key is "${CFG.LOCAL_ADMIN_KEY}" (set in config.js). Data lives only in this browser.`;
    $("#demo").addEventListener("click", () => { demo(120); load(); });
    $("#clear").addEventListener("click", () => { if (confirm("Delete ALL local test responses, assignments and codes in this browser?")) { window.API.clearLocal(); load(); } });
  } else {
    $("#mode").textContent = "Live";
  }

  let rt;
  addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => drawers.forEach((d) => d()), 150); });

  if (ui.key) load(); else $("#login").hidden = false;
})();
