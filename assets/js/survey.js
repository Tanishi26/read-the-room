// Participant survey engine. Screen order follows Part 3 of study_materials_v2.md.
(function () {
  const CFG = window.STUDY_CONFIG;
  const S = window.STUDY;
  const app = document.getElementById("screen");
  const nextBtn = document.getElementById("next");
  const nextHint = document.getElementById("next-hint");
  const bar = document.getElementById("progress-fill");
  const sectionLabel = document.getElementById("section-label");
  const peekBtn = document.getElementById("peek");
  const PROGRESS_KEY = "rtr_progress";
  const DONE_KEY = "rtr_done";

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

  let state = store.get(PROGRESS_KEY) || {
    id: uid(),
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
  const SECTIONS = {
    start: "Welcome", chat: "The chat", impressions: "First impressions", move: "Your move",
    you: "About you", take: "Your take", decisions: "Quick decisions", wrap: "Wrap-up",
  };

  const SCREENS = [
    { id: "welcome", section: "start", kind: "welcome", next: "Let's go" },
    {
      id: "consent", section: "start", title: "Before we start",
      fields: [
        { type: "html", html: consentHTML() },
        { type: "choice", id: "Q1_1", q: "I am 18 years of age or older.", options: [{ v: "yes", label: "Yes" }, { v: "no", label: "No" }], inline: true },
        { type: "choice", id: "Q1_2", q: "I have read the information above and agree to take part.", options: [{ v: "agree", label: "I agree" }, { v: "disagree", label: "I do not agree" }], inline: true },
      ],
      onNext: () => (A.Q1_1 !== "yes" || A.Q1_2 !== "agree" ? end("ineligible") : true),
    },
    {
      id: "pref", section: "start", title: "One quick thing",
      lead: "To make the conversation feel realistic, who would you be interested in matching with on a dating app?",
      fields: [{
        type: "choice", id: "Q1_3", optional: true,
        options: [{ v: "men", label: "Men" }, { v: "women", label: "Women" }, { v: "either", label: "Either" }, { v: "none", label: "Prefer not to say" }],
        note: "Optional. This only changes the name shown in the chat.",
      }],
      onNext: doAssign,
    },
    { id: "instructions", section: "chat", kind: "instructions", next: "Show me the chat" },
    { id: "vignette", section: "chat", kind: "vignette", next: "I've read it" },
    {
      id: "sam", section: "impressions", title: "How did reading this conversation make you feel?", peek: true,
      fields: [
        { type: "sam", id: "S1", dim: "valence", q: "Unpleasant ↔ Pleasant", left: "Very unpleasant", right: "Very pleasant" },
        { type: "sam", id: "S2", dim: "arousal", q: "Calm ↔ Worked-up", left: "Very calm", right: "Very excited / worked-up" },
      ],
    },
    {
      id: "impressions", section: "impressions", title: "First impressions", lead: "How much do you agree with each statement?", peek: true,
      fields: [{
        type: "likert", scale: S.AGREE7, items: [
          { id: "Q4_1", t: "The conversation felt realistic." },
          { id: "Q4_2", t: "{name} came across as friendly." },
          { id: "Q4_3", t: "{name}'s messages were well written." },
          { id: "Q4_4", t: "{name} seems trustworthy." },
          { id: "Q4_5", t: "{name} seems genuinely interested in getting to know me." },
          { id: "Q4_6", t: "{name} seems honest." },
          { id: "Q4_7", t: "The tone of the conversation was easy to read." },
          { id: "Q4_8", t: "I would feel comfortable relying on what {name} tells me." },
        ],
      }],
    },
    {
      id: "reply", section: "move", title: "Your reply", peek: true,
      fields: [
        { type: "quote" },
        {
          type: "choice", id: "F1", q: "If this were your real chat, how would you most likely reply to {name}'s last message?",
          options: [
            { v: "sure", label: "Sure!", sub: "and share my number" },
            { v: "later", label: "Maybe in a bit", sub: "let's keep chatting here for now" },
            { v: "instagram", label: "Let's connect on Instagram instead" },
            { v: "noreply", label: "I wouldn't reply" },
            { v: "unmatch", label: "I would unmatch" },
          ],
        },
        { type: "scale", id: "F2", q: "How likely would you be to move this chat to WhatsApp right now?", scale: S.LIKELY7 },
      ],
    },
    {
      id: "ladder", section: "move", title: "What happens next",
      lead: "Imagine this conversation continues over the next couple of weeks. How likely would you be to do each of the following?", peek: true,
      fields: [{ type: "likert", scale: S.LIKELY7, items: S.LADDER }],
    },
    {
      id: "money", section: "move", title: "What happens next", lead: "Still imagining the next couple of weeks…", peek: true,
      fields: [
        { type: "likert", scale: S.LIKELY7, items: [S.L8] },
        { type: "number", id: "L8a", min: 0, max: 5000, prefix: "₹", q: "Suppose {name} did message you about an emergency and asked to borrow money, promising to pay it back the next day. What is the most you would be willing to send?", note: "Enter any amount from ₹0 to ₹5,000. Enter 0 if you would not send anything." },
        { type: "slider", id: "L8b", min: 0, max: 100, suffix: "%", q: "If you sent money, how likely do you think it is that {name} would pay you back the next day?", left: "0% — definitely not", right: "100% — definitely" },
      ],
    },
    {
      id: "value", section: "move", title: "One hypothetical",
      fields: [{
        type: "choice", id: "V1", grid: true,
        q: "Imagine the dating app offered you money to end your conversation with {name} right now and never contact {them} again. What is the smallest amount you would accept?",
        options: [
          { v: 0, label: "₹0", sub: "I'd end it anyway" }, { v: 100, label: "₹100" }, { v: 500, label: "₹500" }, { v: 1000, label: "₹1,000" },
          { v: 2500, label: "₹2,500" }, { v: 5000, label: "₹5,000" }, { v: 10000, label: "₹10,000+" }, { v: -1, label: "No amount", sub: "I wouldn't accept" },
        ],
      }],
    },
    { id: "you-intro", section: "you", kind: "interlude", emoji: "☕", title: "A bit about you", lead: "Halfway there! A few quick questions about yourself and how you text." },
    {
      id: "about1", section: "you", title: "About you",
      fields: [
        { type: "number", id: "Q7_1", q: "Age", min: 18, max: 99 },
        { type: "choice", id: "Q7_2", q: "Gender", options: [{ v: "woman", label: "Woman" }, { v: "man", label: "Man" }, { v: "nonbinary", label: "Non-binary" }, { v: "self", label: "Prefer to self-describe" }, { v: "na", label: "Prefer not to say" }] },
        { type: "text", id: "Q7_2_self", q: "Self-describe (optional)", optional: true, short: true, showIf: () => A.Q7_2 === "self" },
        { type: "choice", id: "Q7_3", q: "Current status", options: [{ v: "ug", label: "Undergraduate" }, { v: "pg", label: "Postgraduate" }, { v: "phd", label: "PhD" }, { v: "working", label: "Working" }, { v: "other", label: "Other" }] },
        { type: "choice", id: "Q7_4", q: "Relationship status", options: [{ v: "single", label: "Single" }, { v: "relationship", label: "In a relationship" }, { v: "married", label: "Married" }, { v: "na", label: "Prefer not to say" }] },
      ],
    },
    {
      id: "about2", section: "you", title: "Dating apps & trust",
      fields: [
        { type: "choice", id: "Q7_5", q: "Have you ever used a dating app (e.g., Tinder, Bumble, Hinge, Aisle)?", options: [{ v: "never", label: "Never" }, { v: "past", label: "Yes, in the past" }, { v: "current", label: "Yes, currently" }] },
        { type: "choice", id: "Q7_6", q: "Roughly how many people have you chatted with on dating apps?", options: [{ v: "1-5", label: "1–5" }, { v: "6-20", label: "6–20" }, { v: "20+", label: "More than 20" }], inline: true, showIf: () => A.Q7_5 && A.Q7_5 !== "never" },
        { type: "choice", id: "Q7_7", q: "While reading, what gender did you imagine {name} to be?", options: [{ v: "woman", label: "Woman" }, { v: "man", label: "Man" }, { v: "didnt", label: "Didn't think about it" }, { v: "other", label: "Other" }], showIf: () => state.name === "Kiran" },
        { type: "scale", id: "Q7_8", q: "Generally speaking, would you say most people can be trusted, or that you can't be too careful in dealing with people?", scale: { n: 7, left: "Can't be too careful", right: "Most people can be trusted" } },
      ],
    },
    {
      id: "habits", section: "you", title: "How you text",
      fields: [
        { type: "likert", scale: S.AGREE7, items: [
          { id: "Q7_9", t: "I find it easy to judge someone's tone over text." },
          { id: "Q7_10", t: "I prefer texting to phone calls." },
          { id: "Q7_11", t: "Emojis help me understand what someone means." },
        ] },
        { type: "likert", scale: { n: 3, labels: ["Hardly ever", "Some of the time", "Often"] }, items: [
          { id: "Q7_12", t: "How often do you feel that you lack companionship?" },
          { id: "Q7_13", t: "How often do you feel left out?" },
          { id: "Q7_14", t: "How often do you feel isolated from others?" },
        ] },
      ],
    },
    {
      id: "probe", section: "take", title: "Your take",
      fields: [
        { type: "text", id: "Q8_1", q: "In your own words, what do you think this study was investigating?", minLen: 3 },
        { type: "text", id: "Q8_2", q: "Did anything about the study seem unusual to you?", optional: true },
      ],
    },
    { id: "dec-intro", section: "decisions", kind: "interlude", emoji: "🪙", title: "Quick decisions", lead: "Some fast, everyday money choices. There are no right answers, just go with your gut." + (CFG.INCENTIVES ? " One decision may be paid for real, so please answer as you truly would." : "") },
    { id: "gambles", section: "decisions", title: "Flip a coin?", lead: "Imagine each coin flip is offered to you. Would you accept or reject it?", fields: [{ type: "gambles" }] },
    { id: "mplA", section: "decisions", title: "Now or later?", lead: "For each row, which would you prefer?", fields: [{ type: "mpl", list: "A" }] },
    { id: "mplB", section: "decisions", title: "Later or a bit later?", lead: "Same idea, but both options are in the future. For each row, which would you prefer?", fields: [{ type: "mpl", list: "B" }] },
    {
      id: "privacy", section: "decisions", title: "What's it worth to you?",
      lead: "Imagine a company offered to pay you to share each of the following with a randomly chosen stranger on a dating app. What is the smallest amount you would accept for each?",
      fields: [{ type: "brackets", items: [
        { id: "P2", t: "Your full name" }, { id: "P3", t: "Where you work or study" }, { id: "P4", t: "Your phone number" },
        { id: "P5", t: "Your Instagram or other social media profile" }, { id: "P6", t: "A video call with you" }, { id: "P7", t: "Your live location" },
      ] }],
    },
    {
      id: "features", section: "take", title: "About the messages", lead: "Thinking back to the conversation, how much do you agree?", peek: true,
      fields: [
        { type: "likert", scale: S.AGREE7, items: [
          { id: "Q10_1", t: "{name}'s messages felt emotionally personal." },
          { id: "Q10_2", t: "{name}'s messages were warm and affectionate." },
          { id: "Q10_3", t: "{name}'s messages made it feel like a decision had to be made quickly." },
          { id: "Q10_4", t: "{name} focused on what we would gain by moving off the app." },
          { id: "Q10_5", t: "{name} focused on what we would lose by staying on the app." },
          { id: "Q10_6", t: "To show you are reading carefully, please select \"Somewhat disagree\" for this statement." },
          { id: "Q10_7", t: "{name} used emojis appropriately." },
        ] },
        { type: "choice", id: "Q10_8", q: "Which app did {name} suggest moving to?", options: ["WhatsApp", "Telegram", "Instagram", "Snapchat", "Don't remember"].map((x) => ({ v: x, label: x })), inline: true },
      ],
    },
    {
      id: "reveal", section: "wrap", kind: "reveal", title: "Here's what this study is actually about",
      fields: [{ type: "choice", id: "Q11_1", q: "Now that you know the real purpose, are you still happy for your responses to be used?", options: [{ v: "yes", label: "Yes, use my responses" }, { v: "no", label: "No, please delete my responses" }] }],
      onNext: async () => {
        if (A.Q11_1 === "no") {
          await safeSubmit({ id: state.id, cond: state.cond, name: state.name, pref: A.Q1_3 || "none", withdrawn: true, stage: "withdrawn" });
          return end("withdrawn");
        }
        return safeSubmit(record("pre"));
      },
    },
    {
      id: "post", section: "wrap", title: "Thinking about it again",
      lead: "Knowing that this study is about online dating scams, please think about the same conversation again. How likely would you be to do each of the following?",
      fields: [{ type: "likert", scale: S.LIKELY7, items: S.LADDER.concat([S.L8]).map((x) => ({ id: x.id + "r", t: x.t })) }],
    },
    {
      id: "post2", section: "wrap", title: "Almost done",
      fields: [
        { type: "choice", id: "Q12_1", q: "While reading the conversation (before the reveal), did you suspect {name} might not be genuine?", options: [{ v: "no", label: "No" }, { v: "start", label: "Yes, from the start" }, { v: "partway", label: "Yes, partway through" }] },
        { type: "choice", id: "Q12_2", q: "Have you ever been contacted online by someone you later suspected was a scammer?", options: [{ v: "yes", label: "Yes" }, { v: "no", label: "No" }, { v: "unsure", label: "Not sure" }], inline: true },
        { type: "choice", id: "Q12_3", q: "Have you, or someone close to you, ever lost money or personal information to an online scam?", options: [{ v: "me", label: "Yes, me" }, { v: "close", label: "Yes, someone close to me" }, { v: "no", label: "No" }, { v: "na", label: "Prefer not to say" }] },
        { type: "text", id: "Q12_4", q: "Which part of {name}'s messages, if any, would make you most cautious?", optional: true },
      ],
    },
    { id: "redflags", section: "wrap", kind: "redflags", next: "Check my answers" },
    { id: "results", section: "wrap", kind: "results" },
  ];

  function consentHTML() {
    return `<div class="consent">
      <p><strong>Read the Room</strong> is a study on <em>tone and getting to know people online</em> by students at IIIT Hyderabad. You'll read a short chat, answer questions about it, about what you might do next, about some quick everyday money decisions, and about yourself. It takes about <strong>13–15 minutes</strong>.</p>
      <p>Taking part is voluntary and you can stop at any time. We don't collect your name or contact details, and responses are used only for research in anonymised form. <strong>Some details about the study's aims will be explained at the end, after you've answered.</strong>${CFG.INCENTIVES ? " One randomly chosen participant in every 50 will have one money decision paid for real." : ""}</p>
      <p class="fine">Contact: ${CFG.CONTACT} · Course: Neuroeconomics, IIIT Hyderabad · Approval: ${CFG.APPROVAL}</p>
    </div>`;
  }

  // ---------- flow ----------
  let current = null;
  let screenStart = 0;

  function visibleIndex(i) {
    while (i < SCREENS.length && SCREENS[i].skip && SCREENS[i].skip()) i++;
    return i;
  }

  function render() {
    const i = visibleIndex(state.screen);
    state.screen = i;
    current = SCREENS[i];
    screenStart = Date.now();
    save();
    history.pushState({ s: i }, "");

    app.innerHTML = "";
    app.classList.remove("enter");
    void app.offsetWidth;
    app.classList.add("enter");
    window.scrollTo({ top: 0 });

    bar.style.width = Math.round((i / (SCREENS.length - 1)) * 100) + "%";
    sectionLabel.textContent = SECTIONS[current.section];
    peekBtn.hidden = !current.peek;
    nextBtn.hidden = false;
    nextBtn.disabled = false;
    nextBtn.textContent = current.next || "Continue";
    nextHint.textContent = "";
    document.body.dataset.kind = current.kind || "form";

    const kinds = { welcome: renderWelcome, instructions: renderInstructions, vignette: renderVignette, interlude: renderInterlude, reveal: renderReveal, redflags: renderRedflags, results: renderResults };
    (kinds[current.kind] || renderForm)(current);
  }

  async function advance() {
    if (current.fields) {
      const missing = firstMissing(current);
      if (missing) {
        missing.classList.add("missing");
        missing.scrollIntoView({ behavior: "smooth", block: "center" });
        nextHint.textContent = "Please answer the highlighted question to continue.";
        return;
      }
    }
    nextBtn.disabled = true;
    state.timings[current.id] = (state.timings[current.id] || 0) + (Date.now() - screenStart);
    let ok = true;
    if (current.onNext) ok = await current.onNext();
    nextBtn.disabled = false;
    if (ok === false || ok === "ended") return;
    state.screen = state.screen + 1;
    render();
  }
  nextBtn.addEventListener("click", advance);

  window.addEventListener("popstate", () => {
    history.pushState({ s: state.screen }, "");
    toast("Going back isn't possible in this survey — that's on purpose 🙂");
  });

  async function doAssign() {
    if (state.cond) return true;
    const pref = A.Q1_3 || "none";
    nextBtn.textContent = "Setting up your chat…";
    try {
      const a = await window.API.assign(state.id, pref);
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
    nextHint.textContent = "We couldn't save your answers. Check your connection and tap the button again.";
    return false;
  }

  function end(kind) {
    store.del(PROGRESS_KEY);
    if (kind === "withdrawn") store.set(DONE_KEY, true);
    const msgs = {
      ineligible: ["Thanks for stopping by 👋", "This study is only for adults who agree to take part, so we'll end here. No answers were saved."],
      withdrawn: ["Your responses have been deleted", "Thank you for your time and honesty. Please don't discuss this study with others who might take part."],
      done: ["You've already taken part 💛", "Thanks so much! Each person can only take part once."],
    };
    const [t, l] = msgs[kind];
    app.innerHTML = "";
    app.appendChild(h("div", { class: "center-card" }, h("div", { class: "big-emoji" }, kind === "withdrawn" ? "🗑️" : "👋"), h("h1", {}, t), h("p", { class: "lead" }, l)));
    nextBtn.hidden = true;
    peekBtn.hidden = true;
    bar.style.width = "100%";
    return "ended";
  }

  // ---------- validation ----------
  function requiredIds(f) {
    if (f.showIf && !f.showIf()) return [];
    if (f.optional) return [];
    switch (f.type) {
      case "likert": case "brackets": return f.items.map((x) => x.id);
      case "gambles": return S.GAMBLES.map((g) => g.id);
      case "mpl": return (f.list === "A" ? [1, 2, 3, 4, 5, 6] : [7, 8, 9, 10, 11, 12]).map((n) => "T" + n);
      case "html": case "quote": return [];
      default: return [f.id];
    }
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

  // Numbered pips; the caption names the hovered/selected point so verbal labels
  // (needed for the attention check) are always available.
  function scaleRow(id, scale) {
    const row = h("div", { class: "scale", role: "radiogroup", style: `--n:${scale.n}` });
    const caption = h("div", { class: "scale-caption" });
    const nameOf = (v) => (scale.names ? scale.names[v - 1] : "");
    const showCaption = (v, hover) => {
      caption.textContent = v ? `${v} · ${nameOf(v)}` : "";
      caption.classList.toggle("hover", !!hover);
    };
    for (let v = 1; v <= scale.n; v++) {
      const lab = scale.labels ? scale.labels[v - 1] : String(v);
      const b = h("button", { type: "button", class: "pip" + (scale.labels ? " wide" : "") + (A[id] === v ? " on" : ""), role: "radio", "aria-checked": A[id] === v ? "true" : "false", "aria-label": scale.names ? `${v}, ${nameOf(v)}` : lab, onclick: () => {
        row.querySelectorAll(".pip").forEach((p) => { p.classList.remove("on"); p.setAttribute("aria-checked", "false"); });
        b.classList.add("on"); b.setAttribute("aria-checked", "true");
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
    html: (f) => h("div", { class: "html", html: f.html }),

    quote: () => {
      const last = S.conversation(state.cond || "C1").slice(-1)[0];
      return h("div", { class: "quote" }, h("div", { class: "avatar sm" }, S.NAMES[state.name || "Kiran"].initial), h("div", { class: "bubble them" }, last.t));
    },

    choice: (f, redraw) => {
      const list = h("div", { class: "options" + (f.inline ? " inline" : "") + (f.grid ? " grid" : "") });
      f.options.forEach((o) => {
        const b = h("button", { type: "button", class: "opt" + (A[f.id] === o.v ? " on" : ""), onclick: () => {
          list.querySelectorAll(".opt").forEach((x) => x.classList.remove("on"));
          b.classList.add("on");
          setAnswer(f.id, o.v, b);
          if (redraw && current.fields.some((x) => x.showIf)) redraw();
        } }, h("span", { class: "dot" }), h("span", { class: "opt-label" }, o.label, o.sub ? h("small", {}, o.sub) : null));
        list.appendChild(b);
      });
      return qBlock(f.id, f.q, list, f.note ? h("p", { class: "note" }, f.note) : null);
    },

    scale: (f) => qBlock(f.id, f.q, scaleRow(f.id, f.scale)),

    likert: (f) => h("div", { class: "likert" }, f.items.map((it) => qBlock(it.id, it.t, scaleRow(it.id, f.scale)))),

    number: (f) => {
      const input = h("input", { type: "number", inputmode: "numeric", min: f.min, max: f.max, value: A[f.id] ?? "", "aria-label": fill(f.q), oninput: (e) => {
        const v = e.target.value === "" ? "" : Number(e.target.value);
        setAnswer(f.id, v, e.target);
      } });
      return qBlock(f.id, f.q, h("div", { class: "num" + (f.prefix ? " has-prefix" : "") }, f.prefix ? h("span", { class: "prefix" }, f.prefix) : null, input), f.note ? h("p", { class: "note" }, f.note) : null);
    },

    slider: (f) => {
      const touched = A[f.id] !== undefined;
      const out = h("output", { class: "slider-val" + (touched ? "" : " untouched") }, touched ? A[f.id] + f.suffix : "Drag to answer");
      const input = h("input", { type: "range", min: f.min, max: f.max, step: 1, value: touched ? A[f.id] : 50, class: touched ? "" : "untouched", "aria-label": fill(f.q), oninput: (e) => {
        e.target.classList.remove("untouched");
        out.classList.remove("untouched");
        out.textContent = e.target.value + f.suffix;
        setAnswer(f.id, Number(e.target.value), e.target);
      } });
      return qBlock(f.id, f.q, out, input, h("div", { class: "anchors" }, h("span", {}, f.left), h("span", {}, f.right)));
    },

    text: (f) => {
      const ta = h(f.short ? "input" : "textarea", { rows: 3, placeholder: f.optional ? "Optional" : "Type your answer…", "aria-label": fill(f.q), oninput: (e) => setAnswer(f.id, e.target.value, e.target) });
      ta.value = A[f.id] || "";
      return qBlock(f.id, f.q, ta);
    },

    sam: (f) => {
      const row = h("div", { class: "sam", role: "radiogroup" });
      for (let v = 1; v <= 9; v++) {
        const b = h("button", { type: "button", class: "sam-btn" + (A[f.id] === v ? " on" : ""), "aria-label": `${v} of 9`, onclick: () => {
          row.querySelectorAll(".sam-btn").forEach((x) => x.classList.remove("on"));
          b.classList.add("on");
          setAnswer(f.id, v, b);
        } });
        b.innerHTML = v % 2 === 1 ? samFigure(f.dim, (v - 1) / 8) : '<span class="sam-dot"></span>';
        row.appendChild(b);
      }
      return qBlock(f.id, f.q, row, h("div", { class: "anchors" }, h("span", {}, f.left), h("span", {}, f.right)));
    },

    gambles: () => h("div", { class: "cards" }, S.GAMBLES.map((g) => {
      const choice = (v, label) => h("button", { type: "button", class: "opt mini" + (A[g.id] === v ? " on" : ""), onclick: (e) => {
        e.currentTarget.parentNode.querySelectorAll(".opt").forEach((x) => x.classList.remove("on"));
        e.currentTarget.classList.add("on");
        setAnswer(g.id, v, e.currentTarget);
      } }, label);
      return h("div", { class: "q gamble", "data-q": g.id },
        h("div", { class: "coin", "aria-hidden": "true" }, "₹"),
        h("div", { class: "gamble-text" }, h("span", { class: "win" }, "Heads: win ₹" + g.win), h("span", { class: "lose" }, "Tails: lose ₹" + g.loss)),
        h("div", { class: "pair" }, choice("accept", "Accept"), choice("reject", "Reject")));
    })),

    mpl: (f) => {
      const rows = S.MPL_AMOUNTS.map((amt, i) => {
        const id = "T" + (f.list === "A" ? i + 1 : i + 7);
        const soon = f.list === "A" ? "₹500 today" : "₹500 in 6 months";
        const late = f.list === "A" ? `₹${amt.toLocaleString("en-IN")} in 1 month` : `₹${amt.toLocaleString("en-IN")} in 7 months`;
        const btn = (v, label, icon) => h("button", { type: "button", class: "opt mpl-opt" + (A[id] === v ? " on" : ""), onclick: (e) => {
          e.currentTarget.parentNode.querySelectorAll(".opt").forEach((x) => x.classList.remove("on"));
          e.currentTarget.classList.add("on");
          setAnswer(id, v, e.currentTarget);
        } }, h("span", { class: "mpl-icon" }, icon), label);
        return h("div", { class: "q mpl-row", "data-q": id }, btn("sooner", soon, f.list === "A" ? "⚡" : "📅"), h("span", { class: "vs" }, "or"), btn("later", late, "⏳"));
      });
      return h("div", { class: "cards" }, rows);
    },

    brackets: (f) => h("div", { class: "cards" }, f.items.map((it) => {
      const row = h("div", { class: "chips" });
      S.BRACKETS.forEach((b) => {
        const c = h("button", { type: "button", class: "chip" + (A[it.id] === b.v ? " on" : ""), title: b.hint || "", onclick: () => {
          row.querySelectorAll(".chip").forEach((x) => x.classList.remove("on"));
          c.classList.add("on");
          setAnswer(it.id, b.v, c);
        } }, b.label);
        row.appendChild(c);
      });
      return qBlock(it.id, it.t, row);
    })),
  };

  // Simple SAM-style pictograms (Bradley & Lang, 1994): valence = mouth curve, arousal = burst size.
  function samFigure(dim, x) {
    const stroke = "currentColor";
    let extra = "";
    let mouth;
    if (dim === "valence") {
      const c = 14 + (x - 0.5) * 16;
      mouth = `<path d="M13 ${21 - (x - 0.5) * 2} Q20 ${c + 7} 27 ${21 - (x - 0.5) * 2}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round"/>`;
    } else {
      mouth = `<ellipse cx="20" cy="24" rx="${2 + x * 3}" ry="${1 + x * 3}" fill="none" stroke="${stroke}" stroke-width="2"/>`;
      const r = 17 + x * 4;
      const n = 8;
      for (let k = 0; k < n && x > 0; k++) {
        const a = (k / n) * Math.PI * 2;
        const len = 2 + x * 4;
        extra += `<line x1="${20 + Math.cos(a) * r}" y1="${20 + Math.sin(a) * r}" x2="${20 + Math.cos(a) * (r + len)}" y2="${20 + Math.sin(a) * (r + len)}" stroke="${stroke}" stroke-width="2" stroke-linecap="round"/>`;
      }
    }
    return `<svg viewBox="-8 -8 56 56" width="44" height="44" aria-hidden="true">${extra}<circle cx="20" cy="20" r="14" fill="none" stroke="${stroke}" stroke-width="2"/><circle cx="15" cy="16" r="1.8" fill="${stroke}"/><circle cx="25" cy="16" r="1.8" fill="${stroke}"/>${mouth}</svg>`;
  }

  // ---------- special screens ----------
  function renderWelcome() {
    if (store.get(DONE_KEY)) return end("done");
    app.appendChild(h("div", { class: "hero" },
      h("div", { class: "hero-chat", "aria-hidden": "true" },
        h("div", { class: "bubble them pop", style: "--d:0.1s" }, "hey 👋"),
        h("div", { class: "bubble you pop", style: "--d:0.7s" }, "hii! what's this?"),
        h("div", { class: "bubble them pop", style: "--d:1.3s" }, "a study on how tone shapes the way we get to know people online 💬"),
        h("div", { class: "typing pop", style: "--d:1.9s" }, h("i"), h("i"), h("i"))),
      h("h1", { class: "display" }, "Read the Room"),
      h("p", { class: "lead" }, "Can you read tone over text? Read a short dating-app chat, tell us what you'd do next, and get your own ", h("strong", {}, "Decision DNA"), " at the end."),
      h("div", { class: "chips static" }, h("span", { class: "chip" }, "⏱ 13–15 min"), h("span", { class: "chip" }, "🔒 Anonymous"), h("span", { class: "chip" }, "📱 Phone-friendly"), h("span", { class: "chip" }, "🧬 Personal results"))));
  }

  function renderInstructions() {
    const n = state.name;
    app.appendChild(h("h1", {}, "Meet your match"));
    app.appendChild(h("p", { class: "lead" }, "On the next page you'll see a conversation from a dating app. Please read it carefully and ", h("strong", {}, "imagine that you are the person chatting with " + n + "."), " If you're not single or don't use dating apps, imagine that you are single and using one."));
    app.appendChild(h("div", { class: "profile-card" },
      h("div", { class: "avatar lg" }, S.NAMES[n].initial),
      h("div", {}, h("div", { class: "profile-name" }, n), h("div", { class: "profile-bio" }, S.PROFILE)),
      h("div", { class: "match-badge" }, "✦ Matched 5 days ago")));
    app.appendChild(h("p", { class: "lead" }, "You two have been chatting most evenings. Here is your most recent conversation."));
  }

  function phone(msgs, opts) {
    const n = state.name;
    const body = h("div", { class: "phone-body" });
    const el = h("div", { class: "phone" + (opts && opts.compact ? " compact" : "") },
      h("div", { class: "phone-head" }, h("span", { class: "chev" }, "‹"), h("div", { class: "avatar sm" }, S.NAMES[n].initial), h("div", {}, h("div", { class: "ph-name" }, n), h("div", { class: "ph-sub" }, "Matched 5 days ago"))),
      body,
      h("div", { class: "phone-input" }, h("span", {}, "Message…"), h("span", { class: "send" }, "➤")));
    (msgs || []).forEach((m) => body.appendChild(msgEl(m)));
    return { el, body };
  }
  function msgEl(m) {
    return h("div", { class: "msg " + m.who }, h("div", { class: "bubble " + m.who }, m.t), h("div", { class: "stamp" }, m.time));
  }

  async function renderVignette() {
    const msgs = S.conversation(state.cond);
    const ph = phone([]);
    app.appendChild(h("p", { class: "eyebrow" }, "Imagine you are chatting with " + state.name));
    app.appendChild(ph.el);
    nextBtn.disabled = true;
    nextHint.textContent = "Take your time. The button unlocks once you've had time to read.";
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

  function renderInterlude(s) {
    app.appendChild(h("div", { class: "center-card" }, h("div", { class: "big-emoji float" }, s.emoji), h("h1", {}, s.title), h("p", { class: "lead" }, s.lead)));
  }

  function renderReveal(s) {
    app.appendChild(h("div", { class: "reveal-card" },
      h("div", { class: "big-emoji" }, "🔍"),
      h("h1", {}, "Thank you. Here's what this study is actually about"),
      h("p", {}, "This study looks at how the ", h("em", {}, "wording"), " of messages from an online match affects people's willingness to share personal information or take risks, which is relevant to understanding ", h("strong", {}, "online dating scams"), ". We told you the study was about tone because knowing the real aim in advance can change how people answer."),
      h("p", {}, state.name + " is fictional. Different participants saw different versions of the conversation: some were more emotional, some described what would be gained or lost, and some added time pressure."),
      h("p", { class: "callout" }, "There are no right or wrong answers. Many people respond to these messages exactly as you did, which is why this research matters.")));
    const wrap = h("div", { class: "fields" });
    s.fields.forEach((f) => wrap.appendChild(FIELD[f.type](f)));
    app.appendChild(wrap);
  }

  function redflagItems() {
    const c = S.CONDITIONS[state.cond];
    const conv = S.conversation(state.cond);
    const get = (p) => conv.find((m) => m.part === p).t;
    return [
      { id: "RF_M1", t: get("M1"), flag: c.affect === "high", note: c.affect === "high" ? "Intense affection very early on (\"best part of my week\") builds closeness fast — a classic first step." : "Friendly but measured. Not a warning sign on its own." },
      { id: "RF_M2a", t: get("M2a"), flag: false, subtle: true, note: c.frame === "gain" ? "Gain framing: the switch is described by what you'd gain. Subtle persuasion, not a red flag by itself." : "Loss framing: staying is described by what you'd lose. Losses feel about twice as strong as gains, so this nudges harder." },
      { id: "RF_M2b", t: get("M2b"), flag: c.frame === "urgency", note: c.frame === "urgency" ? "Artificial deadline (\"we'd have to switch today\"). Time pressure pushes you to decide before you think." : "Just small talk. Not a warning sign." },
      { id: "RF_M3", t: get("M3"), flag: true, note: "Moving off the app. Scammers prefer platforms without safety moderation or reporting tools." },
      { id: "RF_MONEY", t: "Hey, something's come up and I'm really stuck 😟 Could you send ₹1,000? I'll pay you back tomorrow, promise.", flag: true, hypothetical: true, note: "A money request with a promise to repay — the most common end-point of romance scams." },
    ];
  }

  function renderRedflags() {
    const items = redflagItems();
    app.appendChild(h("h1", {}, "🚩 Spot the red flags"));
    app.appendChild(h("p", { class: "lead" }, "Here are " + state.name + "'s messages, plus one that could have come later. Tap any you'd treat as a warning sign."));
    const list = h("div", { class: "rf-list" });
    items.forEach((it) => {
      if (A[it.id] === undefined) A[it.id] = false;
      const b = h("button", { type: "button", class: "rf" + (A[it.id] ? " on" : ""), "aria-pressed": A[it.id] ? "true" : "false", onclick: () => {
        if (current.checked) return;
        A[it.id] = !A[it.id];
        b.classList.toggle("on", A[it.id]);
        b.setAttribute("aria-pressed", A[it.id] ? "true" : "false");
        save();
      } }, it.hypothetical ? h("span", { class: "rf-tag" }, "Later message") : null, h("span", { class: "bubble them" }, it.t), h("span", { class: "rf-flag", "aria-hidden": "true" }, "🚩"));
      list.appendChild(h("div", { class: "rf-item", "data-rf": it.id }, b));
    });
    app.appendChild(list);
    current.checked = false;
    current.onNext = async () => {
      if (current.checked) return true;
      current.checked = true;
      let hits = 0;
      const total = items.filter((x) => x.flag).length;
      items.forEach((it) => {
        const box = list.querySelector(`[data-rf="${it.id}"]`);
        const right = it.flag === A[it.id];
        if (it.flag && A[it.id]) hits++;
        box.appendChild(h("p", { class: "rf-note " + (it.flag ? "is-flag" : it.subtle ? "is-subtle" : "is-ok") }, h("strong", {}, it.flag ? (A[it.id] ? "✓ Red flag spotted. " : "Missed red flag. ") : it.subtle ? "Worth noticing. " : right ? "✓ Not a red flag. " : "Not really a red flag. "), it.note));
      });
      A.RF_score = hits;
      A.RF_total = total;
      save();
      app.insertBefore(h("div", { class: "score" }, h("span", { class: "score-num" }, hits + "/" + total), h("span", {}, "warning signs spotted")), list);
      nextBtn.textContent = "See my Decision DNA";
      window.scrollTo({ top: 0, behavior: "smooth" });
      return false;
    };
  }

  // ---------- Decision DNA ----------
  function decisionProfile() {
    const acc = S.GAMBLES.map((g) => A[g.id] === "accept");
    const firstReject = acc.indexOf(false);
    const monotone = firstReject === -1 || acc.slice(firstReject).every((x) => !x);
    let lambda = null;
    if (monotone) {
      if (firstReject === -1) lambda = 0.8;
      else if (firstReject === 0) lambda = 3.5;
      else lambda = 600 / ((S.GAMBLES[firstReject - 1].loss + S.GAMBLES[firstReject].loss) / 2);
    }
    const switchRow = (ids) => { const i = ids.findIndex((id) => A[id] === "later"); return i === -1 ? 7 : i + 1; };
    const sA = switchRow(["T1", "T2", "T3", "T4", "T5", "T6"]);
    const sB = switchRow(["T7", "T8", "T9", "T10", "T11", "T12"]);
    const pct = [4, 12, 24, 40, 60, 100];
    const privacyItems = { P2: "full name", P3: "workplace or college", P4: "phone number", P5: "social media", P6: "video calls", P7: "live location" };
    const rank = (v) => (v === -1 ? 1e9 : v);
    const top = Object.keys(privacyItems).sort((a, b) => rank(A[b]) - rank(A[a]))[0];
    return { lambda, monotone, sA, sB, pct, top: privacyItems[top], topVal: A[top], presentBias: sA - sB };
  }

  async function renderResults() {
    nextBtn.hidden = true;
    peekBtn.hidden = true;
    app.appendChild(h("div", { class: "center-card" }, h("div", { class: "spinner" }), h("p", { class: "lead" }, "Saving your answers…")));
    const ok = await safeSubmit(record("final"));
    if (!ok) {
      app.innerHTML = "";
      app.appendChild(h("div", { class: "center-card" }, h("h1", {}, "Almost there"), h("p", { class: "lead" }, "We couldn't save your answers. Check your connection and try again."), h("button", { class: "btn", onclick: () => render() }, "Try again")));
      return;
    }
    store.del(PROGRESS_KEY);
    store.set(DONE_KEY, true);
    bar.style.width = "100%";

    const p = decisionProfile();
    const lossy = p.lambda == null ? "mixed" : p.lambda >= 2.5 ? "high" : p.lambda >= 1.5 ? "mid" : "low";
    const patient = p.sA <= 3;
    const archetype =
      lossy === "mid" || lossy === "mixed" ? ["The Balanced Reader", "⚖️"]
      : lossy === "high" ? (patient ? ["The Strategist", "🧠"] : ["The Cautious Sprinter", "🏃"])
      : patient ? ["The Calm Risk-Taker", "🌊"] : ["The Spontaneous Spark", "⚡"];
    const lambdaText = p.lambda == null ? "Your coin-flip choices were mixed, so we couldn't pin down a number."
      : p.lambda >= 3.5 ? "You turned down even a ₹600-vs-₹200 flip, so a loss weighs at least 3× a gain for you."
      : p.lambda <= 0.8 ? "You took every flip, even ₹600 vs ₹700. Losses barely scare you."
      : `A loss weighs about ${p.lambda.toFixed(1)}× as much as an equal gain for you.`;
    const patienceText = p.sA === 7 ? "You'd take ₹500 today over even ₹1,000 next month. Now is now!" : `You'd wait a month for about +${p.pct[p.sA - 1]}%.`;
    const pbText = p.presentBias > 0 ? "The present pulls you harder than the future: you're more patient about choices months away than about choices today. That's present bias, and most people have it." : p.presentBias < 0 ? "Interesting: you're more patient today than about the far future, the opposite of the usual present bias." : "You're equally patient now and in the future: textbook consistent!";
    const meter = (v) => h("div", { class: "meter" }, h("span", { style: `width:${Math.max(6, Math.min(100, v))}%` }));

    app.innerHTML = "";
    app.appendChild(h("p", { class: "eyebrow center" }, "Your results"));
    app.appendChild(h("div", { class: "dna" },
      h("div", { class: "dna-top" }, h("span", { class: "dna-label" }, "Decision DNA"), h("span", { class: "dna-logo" }, "Read the Room")),
      h("div", { class: "dna-emoji" }, archetype[1]),
      h("h2", { class: "dna-title" }, archetype[0]),
      h("div", { class: "trait" }, h("div", { class: "trait-head" }, h("span", {}, "Loss aversion"), h("b", {}, p.lambda == null ? "—" : "λ ≈ " + (p.lambda >= 3.5 ? "3+" : p.lambda <= 0.8 ? "<1" : p.lambda.toFixed(1)))), meter(p.lambda == null ? 50 : (p.lambda / 3.5) * 100), h("p", {}, lambdaText)),
      h("div", { class: "trait" }, h("div", { class: "trait-head" }, h("span", {}, "Patience"), h("b", {}, p.sA === 7 ? "Now-lover" : p.sA <= 2 ? "Very patient" : p.sA <= 4 ? "Patient-ish" : "Impatient")), meter(((7 - p.sA) / 6) * 100), h("p", {}, patienceText)),
      h("div", { class: "trait" }, h("div", { class: "trait-head" }, h("span", {}, "Most guarded info"), h("b", {}, p.top)), h("p", {}, p.topVal === -1 ? "You wouldn't share it at any price." : `You'd want at least ₹${Number(p.topVal).toLocaleString("en-IN")} to share it with a stranger.`)),
      h("p", { class: "dna-foot" }, pbText)));

    app.appendChild(h("div", { class: "science" },
      h("h3", {}, "🧠 The neuroeconomics behind it"),
      h("p", {}, "Most people weigh losses about twice as much as equal gains (λ ≈ 2; Kahneman & Tversky). Brain-imaging studies show the brain's valuation regions respond more strongly to potential losses than to equal gains, and a separate system makes rewards available ", h("em", {}, "right now"), " feel extra tempting. Scam messages that stress losing someone, or a deadline, press exactly these buttons.")));

    app.appendChild(h("div", { class: "safety" },
      h("h3", {}, "Staying safe"),
      h("p", {}, "Common warning signs include pressure to move off the app quickly, strong emotional language early on, sudden emergencies, and any request for money. In India you can report cyber fraud at ", h("a", { href: "https://cybercrime.gov.in", target: "_blank", rel: "noopener" }, "cybercrime.gov.in"), " or call the ", h("strong", {}, "1930"), " helpline."),
      h("p", { class: "callout" }, "🤫 Please don't discuss this study with others who might take part. It would affect their answers. Sharing your Decision DNA screenshot is totally fine!"),
      CFG.INCENTIVES && CFG.INCENTIVE_FORM_URL ? h("p", {}, h("a", { class: "btn", href: CFG.INCENTIVE_FORM_URL, target: "_blank", rel: "noopener" }, "Enter the payment draw (separate form)")) : null,
      h("p", { class: "fine" }, "Questions or concerns: " + CFG.CONTACT)));
  }

  // ---------- peek at chat ----------
  peekBtn.addEventListener("click", () => {
    state.peeks++;
    save();
    const dlg = document.getElementById("peek-dialog");
    const box = dlg.querySelector(".peek-body");
    box.innerHTML = "";
    box.appendChild(phone(S.conversation(state.cond), { compact: true }).el);
    dlg.showModal();
  });
  document.getElementById("peek-close").addEventListener("click", () => document.getElementById("peek-dialog").close());

  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !nextBtn.hidden && !nextBtn.disabled && !["TEXTAREA", "BUTTON"].includes(document.activeElement.tagName)) advance();
  });

  if (window.API.LOCAL) document.getElementById("mode-badge").hidden = false;
  render();
})();
