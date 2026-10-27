// Data layer: Google Apps Script backend in live mode, localStorage in local test mode.
window.API = (function () {
  const CFG = window.STUDY_CONFIG;
  const LOCAL = !CFG.API_URL;
  const K = { responses: "rtr_responses", assignments: "rtr_assignments", codes: "rtr_codes" };

  function readLS(key) {
    try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) { return []; }
  }
  function writeLS(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* storage blocked */ }
  }

  // text/plain avoids a CORS preflight, which Apps Script cannot answer.
  async function post(body) {
    const res = await fetch(CFG.API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  // Block randomisation within each preference group: pick the least-filled condition,
  // ties broken at random. "Either" also balances Arjun/Ananya within each condition.
  // Mirrors assignCondition() in backend/Code.gs.
  function pickAssignment(pref, assignments) {
    const conds = Object.keys(window.STUDY.CONDITIONS);
    const inGroup = assignments.filter((a) => a.pref === pref);
    const count = (c) => inGroup.filter((a) => a.cond === c).length;
    const min = Math.min(...conds.map(count));
    const options = conds.filter((c) => count(c) === min);
    const cond = options[Math.floor(Math.random() * options.length)];
    let name = { men: "Arjun", women: "Ananya", none: "Kiran" }[pref];
    if (pref === "either") {
      const inCell = inGroup.filter((a) => a.cond === cond);
      const nA = inCell.filter((a) => a.name === "Arjun").length;
      const nB = inCell.filter((a) => a.name === "Ananya").length;
      name = nA < nB ? "Arjun" : nB < nA ? "Ananya" : Math.random() < 0.5 ? "Arjun" : "Ananya";
    }
    return { cond, name };
  }

  async function assign(id, pref) {
    if (LOCAL) {
      const all = readLS(K.assignments);
      const a = pickAssignment(pref, all);
      all.push({ id, ts: new Date().toISOString(), pref, cond: a.cond, name: a.name });
      writeLS(K.assignments, all);
      return a;
    }
    const d = await post({ action: "assign", id, pref });
    return { cond: d.cond, name: d.name };
  }

  // Upsert by id (stage "pre" after re-consent, then "final").
  async function submit(record) {
    record.submitted_at = new Date().toISOString();
    if (LOCAL) {
      const all = readLS(K.responses).filter((r) => r.id !== record.id);
      all.push(record);
      writeLS(K.responses, all);
      return;
    }
    await post({ action: "submit", record });
  }

  async function adminFetch(key) {
    if (LOCAL) {
      if (key !== CFG.LOCAL_ADMIN_KEY) throw new Error("Wrong admin key");
      return { responses: readLS(K.responses), assignments: readLS(K.assignments), codes: readLS(K.codes) };
    }
    const d = await post({ action: "admin", key });
    return { responses: d.responses, assignments: d.assignments, codes: d.codes };
  }

  async function saveCode(key, code) {
    if (LOCAL) {
      const all = readLS(K.codes).filter((c) => !(c.response_id === code.response_id && c.coder === code.coder));
      all.push({ ...code, ts: new Date().toISOString() });
      writeLS(K.codes, all);
      return;
    }
    await post({ action: "code", key, code });
  }

  function clearLocal() {
    Object.values(K).forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
  }

  return { LOCAL, assign, submit, adminFetch, saveCode, clearLocal };
})();
