# Read the Room: survey website

The participant site (`index.html`) and admin dashboard (`admin.html`) for Team 19's Neuroeconomics study, *How Choice Framing and Affective Cues Shape Trust and Compliance in Digital Dating Scams*.

**Live:** https://tanishi26.github.io/read-the-room/ · dashboard: `/admin.html`

**Lean survey (v3, about 6–8 minutes, 10 question screens).** Only items that feed the objectives are included:
- consent + match preference
- the chat
- realism / friendly / trustworthy / honest
- F2 (move to WhatsApp now)
- ladder L1–L8 + ₹ sent + believed repayment
- demographics, dating-app use, 3-item loneliness
- suspicion probe
- 4 manipulation checks + perceived risk + attention + comprehension
- reveal + re-consent
- post-reveal ladder (L1, L4, L7, L8) + 2 scam-exposure items

The extra economic measures from study_materials v2.1 are **not** in the survey: SAM, loss-aversion gambles, time preferences, privacy prices and value of the connection.

```
survey-site/
├── index.html            participant survey
├── admin.html            admin dashboard (password protected)
├── assets/js/config.js   ← the only file you normally edit
├── assets/js/content.js  all vignettes and questions (edit wording here)
├── assets/js/survey.js   survey flow
├── assets/js/admin.js    dashboard, statistics, export
├── assets/js/api.js      backend + local test mode
├── assets/js/charts.js   dashboard charts
└── backend/Code.gs       Google Apps Script backend
```

## 1. Try it locally (no setup)

1. Double-click `index.html` and take the survey. With `API_URL` empty, the site runs in **test mode**: responses are saved only in your browser.
2. Open `admin.html`. The key is `team19-local`.
3. Click **+ 120 demo responses** to preview the dashboard with fake data. Click **Clear local data** to delete it.
4. To take the survey again in the same browser, open `index.html?reset=1`.

## 2. Connect the Google Sheet backend (about 10 minutes)

1. Create a new Google Sheet in a team account (e.g., "Read the Room data").
2. **Extensions → Apps Script**. Delete the sample code and paste all of `backend/Code.gs`.
3. Change `ADMIN_KEY` at the top to a long private phrase. Share it only with your teammate. It never appears in the website code.
4. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Authorise it when Google asks, then copy the **Web app URL**.
6. Paste it into `assets/js/config.js` → `API_URL: "https://script.google.com/macros/s/…/exec"`.
7. Open `index.html` again. The "test mode" badge should be gone. Do one test run, then check that rows appear in the `assignments` and `responses` tabs of the sheet.

If you edit `Code.gs` later: **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. The URL stays the same.

## 3. Put it online

Either option is free:

- **Netlify Drop** (easiest): go to app.netlify.com/drop and drag the `survey-site` folder in. You get a link like `read-the-room.netlify.app`.
- **GitHub Pages**: push `survey-site` to a repository, then go to Settings → Pages → deploy from branch.

Share only the participant link (`…/index.html`). Add `?src=whatsapp` or `?src=insta` to track where people came from; it's stored in `meta.source`.

## 4. Before launch checklist

- [ ] `config.js`: keep `INCENTIVES: false` unless it's approved.
- [ ] Get instructor / IEC sign-off on the consent text, the deception and the debrief.
- [ ] Run the **pilot (n ≈ 10–15)** using `?src=pilot`, then delete those rows from the sheet (or filter by source) before the main study.
- [ ] Check the pilot's manipulation checks and completion time on the dashboard.
- [ ] Pre-register on OSF or AsPredicted **before** the main launch.
- [ ] Test on Android, iPhone and desktop.

## How the study logic works

- **Randomisation:** block randomisation within each dating-preference group. Each new participant gets the least-filled condition, so all 6 cells fill evenly. "Either" participants are also balanced between Arjun and Ananya. This happens on the server under a lock, so simultaneous participants can't break the balance.
- **Design safeguards:**
  - The Back button is disabled.
  - L8 (money) is on its own page.
  - The vignette can't be skipped (Continue unlocks after the chat finishes and 20 s have passed).
  - No item before the suspicion probe mentions scams.
  - Scale buttons show their verbal label (needed for the attention check).
- **Saving:** data is saved only **after re-consent at the reveal** (stage `pre`), then updated at the end (stage `final`). If someone chooses "delete my responses", only a `withdrawn` marker is kept, for attrition counts.
- **Refresh-safe:** progress is kept if the page reloads, so participants aren't re-randomised. Each browser can take part once.

## Dashboard

- **Key numbers and cell balance:** progress against the target of 240 (40 per cell).
- **Quick stats:** a Type III 2 × 3 ANOVA plus the two planned contrasts (H1 Loss − Gain, H2 Urgency − Loss), on F2, the ladder mean, or money sent. **This is a preview only.** Run the pre-registered models in R for the report.
- **Charts** (each has a Table view):
  - focal compliance
  - ladder by step, separately for each affect level
  - "still complying" curve
  - money sent and believed repayment chance
  - before vs after the reveal (4 steps)
  - trust
  - manipulation-check table
- **Exclusions** (toggle): failed attention check, wrong app in the comprehension check, vignette under 20 s, or total time under one-third of the median.
- **Suspicion coding:** one teammate codes as A and the other as B, each blind to the other's codes. Cohen's κ updates live. Keyword matches are highlighted.
- **Export CSV:** one row per participant, with every answer, screen timings, derived variables (`d_` prefix: trust, ladder mean, stop point, reveal change, expected loss, flags…) and both coders' codes. It's ready for R.

## Known limitations (mention in the report)

- "One response per person" is enforced per browser only. Someone could retake the survey on another device.
- Anyone with the link can submit. Watch the dashboard for odd patterns.
- All money questions are hypothetical.
