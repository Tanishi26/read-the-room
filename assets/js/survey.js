// Participant survey engine. Lean version: only items that feed the study's objectives (O1–O4).
(function () {
  const CFG = window.STUDY_CONFIG;
  const S = window.STUDY;
  const app = document.getElementById("screen");
  const nextBtn = document.getElementById("next");
  const nextHint = document.getElementById("next-hint");
  const bar = document.getElementById("progress-fill");
  const stepLabel = document.getElementById("step-label");
  const peekBtn = document.getElementById("peek");
  const PROGRESS_KEY = "rtr_progress_v3";
  const DONE_KEY = "rtr_done_v3";

  // ---------- helpers ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
    }
    return el;
  }
  const uid = () => "R" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  function fill(t) {
    const n = state.name || "Kiran";
    return t.replace(/\{name\}/g, n).replace(/\{was\}/g, S.NAMES[n].was).replace(/\{them\}/g, S.NAMES[n].them);
  }
  function toast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), 2600);
  }

  // ---------- state ----------
  const params = new URLSearchParams(location.search);
  if (params.has("reset")) { store.del(PROGRESS_KEY); store.del(DONE_KEY); }

  // ?test=1 tags the run as TEST-… so it can be filtered or purged from the sheet.
  let state = store.get(PROGRESS_KEY) || {
    id: (params.has("test") ? "TEST-" : "") + uid(),
    study: CFG.STUDY_ID,
    started_at: new Date().toISOString(),
    screen: 0,
    answers: {},
    timings: {},
    peeks: 0,
    meta: { viewport: innerWidth + "x" + innerHeight, mode: window.API.LOCAL ? "local" : "live", source: params.get("src") || "" },
  };
  const A = state.answers;
  const save = () => store.set(PROGRESS_KEY, state);

  // ---------- screens ----------
  const SCREENS = [
    { id: "welcome", kind: "welcome", next: "Start" },
    {
      id: "consent", title: "Before we start",
      fields: [
        { type: "html", html: consentHTML() },
        { type: "choice", id: "Q1_1", q: "I am 18 years of age or older.", options: [{ v: "yes", label: "Yes" }, { v: "no", label: "No" }], inline: true },
        { type: "choice", id: "Q1_2", q: "I have read the information above and agree to take part.", options: [{ v: "agree", label: "I agree" }, { v: "disagree", label: "I do not agree" }], inline: true },
        {
          type: "choice", id: "Q1_3", optional: true,
          q: "To make the conversation feel realistic, who would you be interested in matching with on a dating app?",
          options: [{ v: "men", label: "Men" }, { v: "women", label: "Women" }, { v: "either", label: "Either" }, { v: "none", label: "Prefer not to say" }],
          inline: true, note: "Optional. This only changes the name shown in the chat.",
        },
      ],
      onNext: async () => (A.Q1_1 !== "yes" || A.Q1_2 !== "agree" ? end("ineligible") : doAssign()),
    },
    { id: "instructions", kind: "instructions", next: "Show the chat" },
    { id: "vignette", kind: "vignette", next: "I've read it" },
    {
      id: "impressions", title: "First impressions", lead: "How much do you agree with each statement?", peek: true,
      fields: [{
        type: "likert", scale: S.AGREE7, items: [
          { id: "Q4_1", t: "The conversation felt realistic." },
          { id: "Q4_2", t: "{name} came across as friendly." },
          { id: "Q4_4", t: "{name} seems trustworthy." },
          { id: "Q4_6", t: "{name} seems honest." },
        ],
      }],
    },
    {
      id: "reply", title: "Your reply", peek: true,
      fields: [
        { type: "quote" },
        { type: "scale", id: "F2", q: "How likely would you be to move this chat to WhatsApp right now?", scale: S.LIKELY7 },
      ],
    },
    {
      id: "ladder", title: "What happens next",
      lead: "Imagine this conversation continues over the next couple of weeks. How likely would you be to do each of the following?", peek: true,
      fields: [{ type: "likert", scale: S.LIKELY7, items: S.LADDER }],
    },
    {
      id: "money", title: "What happens next", lead: "Still imagining the next couple of weeks.", peek: true,
      fields: [
        { type: "likert", scale: S.LIKELY7, items: [S.L8] },
        { type: "number", id: "L8a", min: 0, max: 5000, prefix: "₹", q: "If {name} asked to borrow money for an emergency and promised to pay it back within a week, what is the most you would send?", note: "Any amount from ₹0 to ₹5,000. Enter 0 if you would not send anything." },
        { type: "slider", id: "L8b", min: 0, max: 100, suffix: "%", q: "If you sent money, how likely is it that {name} would pay you back within a week?", left: "0%", right: "100%" },
      ],
    },
    {
      id: "about", title: "About you",
      fields: [
        { type: "number", id: "Q7_1", q: "Age", min: 18, max: 99 },
        { type: "choice", id: "Q7_2", q: "Gender", options: [{ v: "woman", label: "Woman" }, { v: "man", label: "Man" }, { v: "nonbinary", label: "Non-binary" }, { v: "na", label: "Prefer not to say" }], inline: true },
        { type: "choice", id: "Q7_3", q: "Current status", options: [{ v: "ug", label: "Undergraduate" }, { v: "pg", label: "Postgraduate" }, { v: "phd", label: "PhD" }, { v: "working", label: "Working" }, { v: "other", label: "Other" }], inline: true },
        { type: "choice", id: "Q7_4", q: "Relationship status", options: [{ v: "single", label: "Single" }, { v: "relationship", label: "In a relationship" }, { v: "married", label: "Married" }, { v: "na", label: "Prefer not to say" }], inline: true },
        { type: "choice", id: "Q7_5", q: "Have you ever used a dating app (e.g., Tinder, Bumble, Hinge, Aisle)?", options: [{ v: "never", label: "Never" }, { v: "past", label: "Yes, in the past" }, { v: "current", label: "Yes, currently" }], inline: true },
        { type: "choice", id: "Q7_6", q: "Roughly how many people have you chatted with on dating apps?", options: [{ v: "1-5", label: "1–5" }, { v: "6-20", label: "6–20" }, { v: "20+", label: "More than 20" }], inline: true, showIf: () => A.Q7_5 && A.Q7_5 !== "never" },
        { type: "choice", id: "Q7_7", q: "While reading, what gender did you imagine {name} to be?", options: [{ v: "woman", label: "Woman" }, { v: "man", label: "Man" }, { v: "didnt", label: "Didn't think about it" }], inline: true, showIf: () => state.name === "Kiran" },
        { type: "likert", scale: { n: 3, labels: ["Hardly ever", "Some of the time", "Often"] }, items: [
          { id: "Q7_12", t: "How often do you feel that you lack companionship?" },
          { id: "Q7_13", t: "How often do you feel left out?" },
          { id: "Q7_14", t: "How often do you feel isolated from others?" },
        ] },
        { type: "number", id: "LA1", min: 0, max: 50000, prefix: "₹", q: "Imagine a coin flip. If it lands tails, you lose ₹500. What is the smallest amount you would need to win on heads to accept the flip?", note: "There is no right answer. Enter the amount that would make the flip worth it to you." },
      ],
    },
    {
      id: "probe", title: "Your take",
      fields: [{ type: "text", id: "Q8_1", q: "In your own words, what do you think this study is investigating?", minLen: 3 }],
    },
    {
      id: "checks", title: "About the messages", lead: "Thinking back to the conversation, how much do you agree?", peek: true,
      fields: [
        { type: "likert", scale: S.AGREE7, items: [
          { id: "Q10_1", t: "{name}'s messages felt emotionally personal." },
          { id: "Q10_3", t: "{name}'s messages made it feel like a decision had to be made quickly." },
          { id: "Q10_4", t: "{name} focused on what we would gain by moving off the app." },
          { id: "Q10_5", t: "{name} focused on what we would lose by staying on the app." },
          { id: "Q10_9", t: "Moving the chat to WhatsApp with {name} would be risky." },
          { id: "Q10_6", t: "To show you are reading carefully, please select \"Somewhat disagree\" for this statement." },
        ] },
        { type: "choice", id: "Q10_8", q: "Which app did {name} suggest moving to?", options: ["WhatsApp", "Telegram", "Instagram", "Snapchat", "Don't remember"].map((x) => ({ v: x, label: x })), inline: true },
      ],
    },
    { id: "reveal", kind: "reveal" },
    {
      id: "post", title: "Last questions",
      lead: "Knowing this study is about online dating scams, think about the same conversation again. How likely would you be to:",
      fields: [
        { type: "likert", scale: S.LIKELY7, items: S.POST_LADDER.map((x) => ({ id: x.id + "r", t: x.t })) },
        { type: "choice", id: "Q12_2", q: "Have you ever been contacted online by someone you later suspected was a scammer?", options: [{ v: "yes", label: "Yes" }, { v: "no", label: "No" }, { v: "unsure", label: "Not sure" }], inline: true },
        { type: "choice", id: "Q12_3", q: "Have you, or someone close to you, ever lost money or personal information to an online scam?", options: [{ v: "me", label: "Yes, me" }, { v: "close", label: "Yes, someone close" }, { v: "no", label: "No" }, { v: "na", label: "Prefer not to say" }], inline: true },
      ],
      next: "Submit",
    },
    { id: "end", kind: "end" },
  ];
  const QUESTION_SCREENS = SCREENS.filter((s) => s.fields).map((s) => s.id);

  function consentHTML() {
    return `<p><strong>Read the Room</strong> is a study on <em>tone and getting to know people online</em> by students at IIIT Hyderabad. You'll read a short chat and answer questions about it, about what you might do next, and about yourself. It takes about <strong>6–8 minutes</strong>.</p>
      <p>Taking part is voluntary and you can stop at any time. We don't collect your name or contact details, and responses are used only for research in anonymised form. <strong>Some details about the study's aims will be explained at the end.</strong></p>`;
  }

  // ---------- flow ----------
  let current = null;
  let screenStart = 0;

  function render() {
    const i = state.screen;
    current = SCREENS[i];
    screenStart = Date.now();
    save();
    history.pushState({ s: i }, "");

    app.innerHTML = "";
    app.classList.remove("enter");
    void app.offsetWidth;
    app.classList.add("enter");
    window.scrollTo({ top: 0 });

    const qi = QUESTION_SCREENS.indexOf(current.id);
    const done = current.kind === "end" ? QUESTION_SCREENS.length : Math.max(0, qi === -1 ? QUESTION_SCREENS.filter((id) => SCREENS.findIndex((s) => s.id === id) < i).length : qi);
    bar.style.width = Math.round((done / QUESTION_SCREENS.length) * 100) + "%";
    stepLabel.textContent = current.kind === "welcome" || current.kind === "end" ? "" : `${Math.min(done + 1, QUESTION_SCREENS.length)} of ${QUESTION_SCREENS.length}`;
    peekBtn.hidden = !current.peek;
    nextBtn.hidden = false;
    nextBtn.disabled = false;
    nextBtn.textContent = current.next || "Continue";
    nextHint.textContent = "";
    document.body.dataset.kind = current.kind || "form";

    const kinds = { welcome: renderWelcome, instructions: renderInstructions, vignette: renderVignette, reveal: renderReveal, end: renderEnd };
    (kinds[current.kind] || renderForm)(current);
  }

  async function advance() {
    if (current.fields) {
      const missing = firstMissing(current);
      if (missing) {
        missing.classList.add("missing");
        missing.scrollIntoView({ behavior: "smooth", block: "center" });
        nextHint.textContent = "Please answer the highlighted question.";
        return;
      }
    }
    nextBtn.disabled = true;
    state.timings[current.id] = (state.timings[current.id] || 0) + (Date.now() - screenStart);
    let ok = true;
    if (current.onNext) ok = await current.onNext();
    nextBtn.disabled = false;
    if (ok === false || ok === "ended") return;
    state.screen += 1;
    render();
  }
  nextBtn.addEventListener("click", advance);

  window.addEventListener("popstate", () => {
    history.pushState({ s: state.screen }, "");
    toast("You can't go back in this survey.");
  });

  async function doAssign() {
    if (state.cond) return true;
    nextBtn.textContent = "Setting up…";
    try {
      const a = await window.API.assign(state.id, A.Q1_3 || "none");
      state.cond = a.cond;
      state.name = a.name;
      state.frame = S.CONDITIONS[a.cond].frame;
      state.affect = S.CONDITIONS[a.cond].affect;
      save();
      return true;
    } catch (e) {
      nextHint.textContent = "Couldn't connect. Check your internet and tap Continue again.";
      nextBtn.textContent = "Continue";
      return false;
    }
  }

  function record(stage) {
    return {
      id: state.id, study: state.study, stage, cond: state.cond, frame: state.frame, affect: state.affect,
      name: state.name, pref: A.Q1_3 || "none", started_at: state.started_at,
      duration_s: Math.round((Date.now() - new Date(state.started_at).getTime()) / 1000),
      answers: A, timings: state.timings, peeks: state.peeks, meta: state.meta,
    };
  }

  async function safeSubmit(rec) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await window.API.submit(rec); return true; } catch (e) { await sleep(1200); }
    }
    nextHint.textContent = "Your answers couldn't be saved. Check your connection and tap the button again.";
    return false;
  }

  function end(kind) {
    store.del(PROGRESS_KEY);
    const msgs = {
      ineligible: ["Thanks for stopping by", "This study is only for adults who agree to take part, so it ends here. No answers were saved."],
      done: ["You've already taken part", "Thank you. Each person can take part only once."],
    };
    const [t, l] = msgs[kind];
    app.innerHTML = "";
    app.appendChild(h("div", { class: "center" }, h("h1", {}, t), h("p", { class: "lead" }, l)));
    document.querySelector(".actionbar").hidden = true;
    stepLabel.textContent = "";
    bar.style.width = "100%";
    return "ended";
  }

  // ---------- validation ----------
  function requiredIds(f) {
    if (f.showIf && !f.showIf()) return [];
    if (f.optional) return [];
    if (f.type === "likert") return f.items.map((x) => x.id);
    if (f.type === "html" || f.type === "quote") return [];
    return [f.id];
  }
  function isAnswered(id, f) {
    const v = A[id];
    if (v === undefined || v === null || v === "") return false;
    if (f.type === "text" && f.minLen && String(v).trim().length < f.minLen) return false;
    if (f.type === "number" && (isNaN(v) || v < f.min || v > f.max)) return false;
    return true;
  }
  function firstMissing(screen) {
    for (const f of screen.fields) {
      for (const id of requiredIds(f)) {
        if (!isAnswered(id, f)) return app.querySelector(`[data-q="${id}"]`) || app;
      }
    }
    return null;
  }
  function setAnswer(id, v, el) {
    A[id] = v;
    save();
    const q = el && el.closest("[data-q]");
    if (q) q.classList.remove("missing");
    if (!firstMissing(current)) nextHint.textContent = "";
  }

  // ---------- form renderer ----------
  function renderForm(screen) {
    if (screen.title) app.appendChild(h("h1", {}, fill(screen.title)));
    if (screen.lead) app.appendChild(h("p", { class: "lead" }, fill(screen.lead)));
    const wrap = h("div", { class: "fields" });
    app.appendChild(wrap);
    const draw = () => {
      wrap.innerHTML = "";
      screen.fields.forEach((f) => {
        if (f.showIf && !f.showIf()) return;
        wrap.appendChild(FIELD[f.type](f, draw));
      });
    };
    draw();
  }

  function qBlock(id, q, ...kids) {
    return h("div", { class: "q", "data-q": id }, q ? h("p", { class: "q-text" }, fill(q)) : null, ...kids);
  }

  // Numbered buttons; the caption names the hovered/selected point (needed for the attention check).
  function scaleRow(id, scale) {
    const row = h("div", { class: "scale", role: "radiogroup", style: `--n:${scale.n}` });
    const caption = h("span", { class: "scale-caption" });
    const nameOf = (v) => (scale.names ? scale.names[v - 1] : "");
    const showCaption = (v, hover) => {
      caption.textContent = v ? nameOf(v) : "";
      caption.classList.toggle("hover", !!hover);
    };
    for (let v = 1; v <= scale.n; v++) {
      const lab = scale.labels ? scale.labels[v - 1] : String(v);
      const b = h("button", { type: "button", class: "pip" + (scale.labels ? " wide" : "") + (A[id] === v ? " on" : ""), role: "radio", "aria-checked": A[id] === v ? "true" : "false", "aria-label": scale.names ? `${v}, ${nameOf(v)}` : lab, onclick: () => {
        row.querySelectorAll(".pip").forEach((p) => { p.classList.remove("on"); p.setAttribute("aria-checked", "false"); });
        b.classList.add("on");
        b.setAttribute("aria-checked", "true");
        setAnswer(id, v, b);
        if (scale.names) showCaption(v);
      } }, lab);
      if (scale.names) {
        b.addEventListener("mouseenter", () => showCaption(v, true));
        b.addEventListener("focus", () => showCaption(v, true));
        b.addEventListener("mouseleave", () => showCaption(A[id]));
        b.addEventListener("blur", () => showCaption(A[id]));
      }
      row.appendChild(b);
    }
    const out = h("div", { class: "scale-wrap" }, row);
    if (!scale.labels) out.appendChild(h("div", { class: "anchors" }, h("span", {}, scale.left), scale.names ? caption : null, h("span", {}, scale.right)));
    if (scale.names && A[id]) showCaption(A[id]);
    return out;
  }

  const FIELD = {
    html: (f) => h("div", { class: "q consent", html: f.html }),

    quote: () => {
      const last = S.conversation(state.cond || "C1").slice(-1)[0];
      return h("div", { class: "quote" }, h("div", { class: "avatar sm" }, S.NAMES[state.name || "Kiran"].initial), h("div", { class: "bubble them" }, last.t));
    },

    choice: (f, redraw) => {
      const list = h("div", { class: "options" + (f.inline ? " inline" : "") });
      f.options.forEach((o) => {
        const b = h("button", { type: "button", class: "opt" + (A[f.id] === o.v ? " on" : ""), onclick: () => {
          list.querySelectorAll(".opt").forEach((x) => x.classList.remove("on"));
          b.classList.add("on");
          setAnswer(f.id, o.v, b);
          if (redraw && current.fields.some((x) => x.showIf)) redraw();
        } }, o.label);
        list.appendChild(b);
      });
      return qBlock(f.id, f.q, list, f.note ? h("p", { class: "note" }, f.note) : null);
    },

    scale: (f) => qBlock(f.id, f.q, scaleRow(f.id, f.scale)),

    likert: (f) => h("div", { class: "likert" }, f.items.map((it) => qBlock(it.id, it.t, scaleRow(it.id, f.scale)))),

    number: (f) => {
      const input = h("input", { type: "number", id: "in-" + f.id, inputmode: "numeric", min: f.min, max: f.max, value: A[f.id] ?? "", "aria-label": fill(f.q), oninput: (e) => {
        setAnswer(f.id, e.target.value === "" ? "" : Number(e.target.value), e.target);
      } });
      return qBlock(f.id, f.q, h("div", { class: "num" + (f.prefix ? " has-prefix" : "") }, f.prefix ? h("span", { class: "prefix" }, f.prefix) : null, input), f.note ? h("p", { class: "note" }, f.note) : null);
    },

    slider: (f) => {
      const touched = A[f.id] !== undefined;
      const out = h("output", { class: "slider-val" + (touched ? "" : " untouched") }, touched ? A[f.id] + f.suffix : "Drag the slider to answer");
      const input = h("input", { type: "range", id: "in-" + f.id, min: f.min, max: f.max, step: 1, value: touched ? A[f.id] : 50, class: touched ? "" : "untouched", "aria-label": fill(f.q), oninput: (e) => {
        e.target.classList.remove("untouched");
        out.classList.remove("untouched");
        out.textContent = e.target.value + f.suffix;
        setAnswer(f.id, Number(e.target.value), e.target);
      } });
      return qBlock(f.id, f.q, out, input, h("div", { class: "anchors" }, h("span", {}, f.left), h("span", {}, f.right)));
    },

    text: (f) => {
      const ta = h("textarea", { id: "in-" + f.id, rows: 3, placeholder: "Type your answer", "aria-label": fill(f.q), oninput: (e) => setAnswer(f.id, e.target.value, e.target) });
      ta.value = A[f.id] || "";
      return qBlock(f.id, f.q, ta);
    },
  };

  // ---------- special screens ----------
  function renderWelcome() {
    if (store.get(DONE_KEY)) return end("done");
    app.appendChild(h("div", { class: "welcome" },
      h("div", { class: "preview", "aria-hidden": "true" },
        h("div", { class: "bubble them pop", style: "--d:.15s" }, "Hey! How was your day?"),
        h("div", { class: "bubble you pop", style: "--d:.7s" }, "Pretty good actually 🙂"),
        h("div", { class: "typing pop", style: "--d:1.2s" }, h("i"), h("i"), h("i"))),
      h("h1", { class: "title" }, "Read the Room"),
      h("p", { class: "lead" }, "A short study on how the tone of online chats shapes the way we get to know people. You'll read one dating-app conversation and tell us what you would do next."),
      h("ul", { class: "facts" }, h("li", {}, h("b", {}, "6–8 min")), h("li", {}, h("b", {}, "Anonymous")))));
  }

  function renderInstructions() {
    const n = state.name;
    app.appendChild(h("h1", {}, "Your match"));
    app.appendChild(h("p", { class: "lead" }, "On the next page you'll see a conversation from a dating app. Read it carefully and ", h("strong", {}, "imagine you are the person chatting with " + n + "."), " If you're not single or don't use dating apps, imagine that you are."));
    app.appendChild(h("div", { class: "profile" },
      h("div", { class: "avatar lg" }, S.NAMES[n].initial),
      h("div", {}, h("div", { class: "profile-name" }, n), h("div", { class: "profile-bio" }, S.PROFILE), h("div", { class: "profile-meta" }, "Matched 5 days ago · chatting most evenings"))));
  }

  function phone(msgs) {
    const n = state.name;
    const body = h("div", { class: "phone-body" });
    const el = h("div", { class: "phone" },
      h("div", { class: "phone-head" }, h("div", { class: "avatar sm" }, S.NAMES[n].initial), h("div", {}, h("div", { class: "ph-name" }, n), h("div", { class: "ph-sub" }, "online"))),
      body,
      h("div", { class: "phone-input" }, "Message"));
    (msgs || []).forEach((m) => body.appendChild(msgEl(m)));
    return { el, body };
  }
  function msgEl(m) {
    return h("div", { class: "msg " + m.who }, h("div", { class: "bubble " + m.who }, m.t, h("span", { class: "stamp" }, m.time)));
  }

  async function renderVignette() {
    const msgs = S.conversation(state.cond);
    const ph = phone([]);
    app.appendChild(ph.el);
    nextBtn.disabled = true;
    nextHint.textContent = "The button unlocks once you've had time to read.";
    const t0 = Date.now();
    const myScreen = current;
    for (const m of msgs) {
      if (current !== myScreen) return;
      if (m.who === "them") {
        const typing = h("div", { class: "msg them" }, h("div", { class: "typing" }, h("i"), h("i"), h("i")));
        ph.body.appendChild(typing);
        ph.body.scrollTop = ph.body.scrollHeight;
        await sleep(Math.min(700 + m.t.length * 22, 2600));
        typing.remove();
      } else {
        await sleep(900);
      }
      ph.body.appendChild(msgEl(m));
      ph.body.scrollTop = ph.body.scrollHeight;
      await sleep(350);
    }
    const remaining = CFG.MIN_VIGNETTE_SECONDS * 1000 - (Date.now() - t0);
    if (remaining > 0) await sleep(remaining);
    if (current !== myScreen) return;
    nextBtn.disabled = false;
    nextHint.textContent = "";
  }

  function renderReveal() {
    app.appendChild(h("h1", {}, "What this study is actually about"));
    app.appendChild(h("div", { class: "q reveal" },
      h("p", {}, "This study looks at how the ", h("em", {}, "wording"), " of messages from an online match affects people's willingness to share personal information or take risks, which matters for understanding ", h("strong", {}, "online dating scams"), ". We described it as a study on tone because knowing the real aim in advance can change how people answer."),
      h("p", {}, state.name + " is fictional. Different participants saw different versions of the conversation: some more emotional, some describing what would be gained or lost, and some with time pressure."),
      h("p", {}, h("strong", {}, "There are no right or wrong answers."), " Many people respond to these messages exactly as you did, which is why this research matters.")));
  }

  // Debrief: the warning signs in this participant's own version of the chat.
  function warningSigns() {
    const c = S.CONDITIONS[state.cond];
    const conv = S.conversation(state.cond);
    const get = (p) => conv.find((m) => m.part === p).t;
    const out = [];
    if (c.affect === "high") out.push([get("M1"), "Very warm, intimate language early on builds closeness fast."]);
    out.push([get("M2a"), c.frame === "gain" ? "The switch was framed as a gain. This is subtle persuasion." : "Staying on the app was framed as a loss. Losses feel stronger than equal gains, so this nudges harder."]);
    if (c.frame === "urgency") out.push([get("M2b"), "An artificial deadline pushes you to decide before you think."]);
    out.push([get("M3"), "Moving off the app takes you away from its safety and reporting tools."]);
    return out;
  }

  async function renderEnd() {
    nextBtn.hidden = true;
    peekBtn.hidden = true;
    document.querySelector(".actionbar").hidden = true;
    app.appendChild(h("div", { class: "center" }, h("div", { class: "spinner" }), h("p", { class: "lead" }, "Saving your answers…")));
    const ok = await safeSubmit(record("final"));
    app.innerHTML = "";
    if (!ok) {
      app.appendChild(h("div", { class: "center" }, h("h1", {}, "Almost done"), h("p", { class: "lead" }, "Your answers couldn't be saved. Check your connection and try again."), h("button", { class: "btn", onclick: () => render() }, "Try again")));
      return;
    }
    store.del(PROGRESS_KEY);
    store.set(DONE_KEY, true);
    bar.style.width = "100%";
    stepLabel.textContent = "";

    app.appendChild(h("h1", {}, "Thank you!"));
    app.appendChild(h("p", { class: "lead" }, "Your answers have been saved. Here are the persuasion techniques used in the version of the chat you saw."));
    app.appendChild(h("div", { class: "signs" }, warningSigns().map(([msg, why]) => h("div", { class: "sign" }, h("div", { class: "bubble them" }, msg), h("p", {}, why)))));
    app.appendChild(h("div", { class: "q safety" },
      h("h2", {}, "Staying safe"),
      h("p", {}, "Warning signs include pressure to move off the app quickly, strong emotional language early on, sudden emergencies, and any request for money. In India you can report cyber fraud at ", h("a", { href: "https://cybercrime.gov.in", target: "_blank", rel: "noopener" }, "cybercrime.gov.in"), " or call the ", h("strong", {}, "1930"), " helpline."),
      h("p", {}, h("strong", {}, "Please don't discuss this study with anyone who might take part."), " It would affect their answers.")));
  }

  // ---------- re-read the chat ----------
  peekBtn.addEventListener("click", () => {
    state.peeks++;
    save();
    const dlg = document.getElementById("peek-dialog");
    const box = dlg.querySelector(".peek-body");
    box.innerHTML = "";
    box.appendChild(phone(S.conversation(state.cond)).el);
    dlg.showModal();
  });
  document.getElementById("peek-close").addEventListener("click", () => document.getElementById("peek-dialog").close());

  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !nextBtn.hidden && !nextBtn.disabled && !["TEXTAREA", "BUTTON"].includes(document.activeElement.tagName)) advance();
  });

  if (window.API.LOCAL) document.getElementById("mode-badge").hidden = false;
  render();
})();
