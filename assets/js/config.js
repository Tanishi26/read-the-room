// Study configuration — edit these values before launch.
window.STUDY_CONFIG = {
  // Google Apps Script web-app URL (see README). Leave empty for LOCAL TEST MODE:
  // responses are then stored only in this browser and shown in admin.html.
  API_URL: "",

  STUDY_ID: "read-the-room-v2.1",
  TARGET_TOTAL: 240,
  TARGET_PER_CELL: 40,
  MIN_VIGNETTE_SECONDS: 20,

  // Only used in local test mode. In live mode the admin key lives in the Apps Script.
  LOCAL_ADMIN_KEY: "team19-local",

  CONTACT: "Tanishi Tyagi & Laveena — [add emails]",
  APPROVAL: "[instructor / IEC reference]",

  // Random incentive system (Part 7 of the study materials). Keep false unless approved.
  INCENTIVES: false,
  INCENTIVE_FORM_URL: "", // separate, unlinked Google Form for UPI IDs
};
