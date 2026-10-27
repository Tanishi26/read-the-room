/**
 * Read the Room: Google Apps Script backend.
 * Paste into Extensions → Apps Script of a new Google Sheet, set ADMIN_KEY, deploy as a web app
 * (Execute as: Me · Who has access: Anyone). See README.md.
 */
const ADMIN_KEY = "CHANGE-ME-to-a-long-random-phrase";
const CONDITIONS = ["C1", "C2", "C3", "C4", "C5", "C6"];

// Run once from the editor: grants permissions and creates the data tabs.
function setup() {
  assignmentsSheet();
  responsesSheet();
  codesSheet();
  const blank = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Sheet1");
  if (blank && blank.getLastRow() === 0) SpreadsheetApp.getActiveSpreadsheet().deleteSheet(blank);
}

function doGet() {
  return json({ ok: true, message: "Read the Room backend is running." });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    switch (body.action) {
      case "assign": return json(assign(body));
      case "submit": return json(submit(body.record));
      case "admin": requireKey(body.key); return json(adminData());
      case "code": requireKey(body.key); return json(saveCode(body.code));
      case "purgeTest": requireKey(body.key); return json(purgeTest());
      default: return json({ ok: false, error: "Unknown action" });
    }
  } catch (err) {
    return json({ ok: false, error: String(err.message || err) });
  }
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function requireKey(key) {
  if (key !== ADMIN_KEY) throw new Error("Wrong admin key");
}

function sheet(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(header);
    sh.setFrozenRows(1);
  }
  return sh;
}
const assignmentsSheet = () => sheet("assignments", ["id", "ts", "pref", "cond", "name"]);
const responsesSheet = () => sheet("responses", ["id", "stage", "submitted_at", "cond", "name", "withdrawn", "json"]);
const codesSheet = () => sheet("codes", ["response_id", "coder", "suspicious", "ts"]);

function rows(sh) {
  const values = sh.getDataRange().getValues();
  const header = values.shift();
  return values.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

// Block randomisation within each preference group (mirrors pickAssignment() in api.js).
function assign(body) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = assignmentsSheet();
    const all = rows(sh);
    const existing = all.find((a) => a.id === body.id);
    if (existing) return { ok: true, cond: existing.cond, name: existing.name };
    const pref = ["men", "women", "either", "none"].indexOf(body.pref) >= 0 ? body.pref : "none";
    const group = all.filter((a) => a.pref === pref);
    const count = (c) => group.filter((a) => a.cond === c).length;
    const min = Math.min.apply(null, CONDITIONS.map(count));
    const options = CONDITIONS.filter((c) => count(c) === min);
    const cond = options[Math.floor(Math.random() * options.length)];
    let name = { men: "Arjun", women: "Ananya", none: "Kiran" }[pref];
    if (pref === "either") {
      const inCell = group.filter((a) => a.cond === cond);
      const nA = inCell.filter((a) => a.name === "Arjun").length;
      const nB = inCell.filter((a) => a.name === "Ananya").length;
      name = nA < nB ? "Arjun" : nB < nA ? "Ananya" : Math.random() < 0.5 ? "Arjun" : "Ananya";
    }
    sh.appendRow([String(body.id), new Date().toISOString(), pref, cond, name]);
    return { ok: true, cond: cond, name: name };
  } finally {
    lock.releaseLock();
  }
}

// Upsert by id: the "pre" record is replaced by "final"; "withdrawn" replaces everything.
function submit(record) {
  if (!record || !record.id) throw new Error("Missing record id");
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = responsesSheet();
    const ids = sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map((r) => String(r[0]));
    const row = [String(record.id), record.stage || "", record.submitted_at || new Date().toISOString(), record.cond || "", record.name || "", !!record.withdrawn, JSON.stringify(record)];
    const idx = ids.indexOf(String(record.id));
    if (idx > 0) sh.getRange(idx + 1, 1, 1, row.length).setValues([row]);
    else sh.appendRow(row);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function adminData() {
  const responses = rows(responsesSheet()).map((r) => {
    try { return JSON.parse(r.json); } catch (e) { return { id: r.id, stage: r.stage, parse_error: true }; }
  });
  const assignments = rows(assignmentsSheet());
  const codes = rows(codesSheet());
  return { ok: true, responses: responses, assignments: assignments, codes: codes };
}

// Deletes rows whose id starts with "TEST-" (used to verify a fresh deployment).
function purgeTest() {
  let removed = 0;
  [assignmentsSheet(), responsesSheet()].forEach((sh) => {
    const ids = sh.getRange(1, 1, sh.getLastRow(), 1).getValues();
    for (let i = ids.length - 1; i >= 1; i--) {
      if (String(ids[i][0]).indexOf("TEST-") === 0) { sh.deleteRow(i + 1); removed++; }
    }
  });
  return { ok: true, removed: removed };
}

function saveCode(code) {
  const sh = codesSheet();
  const data = sh.getDataRange().getValues();
  const row = [String(code.response_id), String(code.coder), code.suspicious === true, new Date().toISOString()];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === row[0] && String(data[i][1]) === row[1]) {
      sh.getRange(i + 1, 1, 1, row.length).setValues([row]);
      return { ok: true };
    }
  }
  sh.appendRow(row);
  return { ok: true };
}
