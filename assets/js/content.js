// All study materials (study_materials_v2.md, v2.1). Item IDs match the document.
// "{name}" is replaced with the assigned match name; "{was}" with he was / she was / they were.

window.STUDY = (function () {
  const CONDITIONS = {
    C1: { frame: "gain", affect: "low" },
    C2: { frame: "gain", affect: "high" },
    C3: { frame: "loss", affect: "low" },
    C4: { frame: "loss", affect: "high" },
    C5: { frame: "urgency", affect: "low" },
    C6: { frame: "urgency", affect: "high" },
  };

  const NAMES = {
    Arjun: { initial: "A", was: "he was", them: "him" },
    Ananya: { initial: "A", was: "she was", them: "her" },
    Kiran: { initial: "K", was: "they were", them: "them" },
  };

  const PROFILE = "24 · Works in product design · Loves trekking and old Hindi film songs";

  // Shared opening, identical in all conditions. who: "them" | "you"
  const OPENING = [
    { who: "them", t: "Hey! How did the presentation go today?", time: "9:12 PM" },
    { who: "you", t: "It went okay actually, better than I expected.", time: "9:13 PM" },
    { who: "them", t: "See, I told you you'd be fine. Sorry if I replied late earlier, this app has been glitchy and some of my messages aren't sending.", time: "9:14 PM" },
    { who: "you", t: "Haha no worries. I just got dinner and came home. You?", time: "9:15 PM" },
    { who: "them", t: "Same. I finally tried that biryani place you mentioned. You were right about it.", time: "9:17 PM" },
  ];

  const M1 = {
    low: "Honestly, this has been a nice change from the usual small talk on here. It's been good chatting these past few days.",
    high: "Honestly, talking to you has been the best part of my week. I feel like I can be myself with you 🙂",
  };

  const M2 = {
    gain: [
      "If we switch to WhatsApp, our messages will always go through and we'll be able to send voice notes and photos.",
      "Anyway, I was thinking about this on my way back home today.",
    ],
    loss: [
      "If we stay on here, our messages won't always go through and we won't be able to send voice notes or photos.",
      "Anyway, I was thinking about this on my way back home today.",
    ],
    urgency: [
      "If we stay on here, our messages won't always go through and we won't be able to send voice notes or photos.",
      "Also, I'm deleting this app tonight, so we'd have to switch today.",
    ],
  };

  const M3_REQUEST = "Would you be okay moving our chat to WhatsApp?";
  const M3_CLOSE = { low: "Let me know what you think.", high: "I would really like that, honestly." };

  function conversation(cond) {
    const c = CONDITIONS[cond];
    return OPENING.concat([
      { who: "them", t: M1[c.affect], time: "9:18 PM", part: "M1" },
      { who: "them", t: M2[c.frame][0], time: "9:19 PM", part: "M2a" },
      { who: "them", t: M2[c.frame][1], time: "9:19 PM", part: "M2b" },
      { who: "them", t: M3_REQUEST + " " + M3_CLOSE[c.affect], time: "9:20 PM", part: "M3" },
    ]);
  }

  const AGREE7 = { n: 7, left: "Strongly disagree", right: "Strongly agree",
    names: ["Strongly disagree", "Disagree", "Somewhat disagree", "Neither agree nor disagree", "Somewhat agree", "Agree", "Strongly agree"] };
  const LIKELY7 = { n: 7, left: "Definitely would not", right: "Definitely would",
    names: ["Definitely would not", "Very unlikely", "Somewhat unlikely", "Not sure", "Somewhat likely", "Very likely", "Definitely would"] };

  const LADDER = [
    { id: "L1", t: "Reply and keep chatting with {name}" },
    { id: "L2", t: "Tell {name} your full name" },
    { id: "L3", t: "Tell {name} where you work or study" },
    { id: "L4", t: "Share your phone number" },
    { id: "L5", t: "Share your Instagram or other social media profile" },
    { id: "L6", t: "Agree to a video call with {name}" },
    { id: "L7", t: "Share your live location with {name}" },
  ];
  const L8 = { id: "L8", t: "Send {name} ₹1,000 if {name} said {was} stuck in an emergency and would pay you back within a week" };

  // Post-reveal ladder: one step per sensitivity tier (low, medium, high, money) for O4.
  const POST_LADDER = [LADDER[0], LADDER[3], LADDER[6], L8];

  const SUSPICION_WORDS = ["scam", "fraud", "catfish", "fake", "decept", "deceiv", "safety", "safe", "manipulat", "pressur", "trick", "persua", "romance scam", "phish"];

  return {
    CONDITIONS, NAMES, PROFILE, conversation, M1, M2, M3_REQUEST, M3_CLOSE,
    AGREE7, LIKELY7, LADDER, L8, POST_LADDER, SUSPICION_WORDS,
  };
})();
