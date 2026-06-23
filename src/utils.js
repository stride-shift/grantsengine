import { C } from "./theme";
import { DOCS, DOC_MAP, GATES } from "./data/constants";
import { applyGlossary } from "./data/glossary";

// ── Parse structured research JSON from AI response ──
// Accepts the AI output in three formats, in order of preference:
//   1. Pure JSON
//   2. JSON fenced in ```json ... ```
//   3. JSON-with-prose (extract first { … last })
// Returns the parsed object even when `rawText` is missing — earlier versions
// required it, which caused JSON without rawText to fall back to raw display
// (showing key-value syntax to the user).
const RESEARCH_FIELDS = ["budgetRange", "recentGrants", "contacts", "priorities", "applicationProcess", "strategy", "doorOpener", "relationshipLeverage", "rawText"];
const looksLikeResearch = (o) => o && typeof o === "object" && RESEARCH_FIELDS.some(f => typeof o[f] === "string");
const synthesizeRawText = (o) => {
  if (!o || typeof o !== "object") return "";
  if (typeof o.rawText === "string" && o.rawText.trim()) return o.rawText;
  return RESEARCH_FIELDS
    .filter(f => f !== "rawText" && typeof o[f] === "string" && o[f].trim())
    .map(f => `${o[f]}`)
    .join("\n\n");
};

export const parseStructuredResearch = (raw) => {
  if (!raw || typeof raw !== "string") return null;
  const tryParse = (str) => {
    try { return JSON.parse(str.trim()); } catch { return null; }
  };
  let parsed = tryParse(raw);
  if (!looksLikeResearch(parsed)) {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) parsed = tryParse(fenced[1]);
  }
  if (!looksLikeResearch(parsed)) {
    const first = raw.indexOf("{"), last = raw.lastIndexOf("}");
    if (first >= 0 && last > first) parsed = tryParse(raw.slice(first, last + 1));
  }
  if (!looksLikeResearch(parsed)) return null;
  // Ensure rawText is always present so downstream code can rely on it
  if (!parsed.rawText || !parsed.rawText.trim()) parsed.rawText = synthesizeRawText(parsed);
  return parsed;
};

// ── Post-processing filter for banned phrases that the AI ignores ──
// The AI model sometimes uses these despite explicit prompt-level bans.
// This is the last line of defence — it removes entire sentences containing banned patterns.

// Sentences starting with these words get REMOVED ENTIRELY (the whole sentence, not just the word)
const BANNED_SENTENCE_STARTERS = /^(Imagine|Picture|Consider|Think of|Meet|What if|Close your eyes|Now imagine|Let'?s imagine|Envision)[^.!?\n]*[.!?]?/gim;

// Any sentence containing these phrases gets REMOVED ENTIRELY
const BANNED_SENTENCE_PHRASES = [
  /[^.!?\n]*\bimagine\b[^.!?\n]*[.!?\n]/gi,  // ANY use of "imagine" in any sentence
  /[^.!?\n]*\bpicture\s+(a|this|the|yourself)\b[^.!?\n]*[.!?\n]/gi,  // "picture a/this/yourself..."
  /[^.!?\n]*\benvision\b[^.!?\n]*[.!?\n]/gi,
];

// These phrases get stripped inline (sentence preserved, phrase removed)
const BANNED_PHRASES = [
  /\bwe believe\b/gi, /\bwe are passionate\b/gi, /\bmaking a difference\b/gi,
  /\bmaking an impact\b/gi, /\bchanging lives\b/gi, /\bbrighter future\b/gi,
  /\bbeacon of hope\b/gi, /\bwe look forward to partnering\b/gi,
  /\bwe would welcome the opportunity\b/gi, /\bwe trust this proposal\b/gi,
  /\bI hope this finds you well\b/gi, /\bI am writing to\b/gi,
  /\bwe are pleased to\b/gi, /\bcatalytic intervention\b/gi,
  /\bthat spark\b/gi, /\btransformative journey\b/gi,
  /\bholistic approach\b/gi, /\bgame.?changer\b/gi,
  /\bthis isn't just [a-z]+; it's\b/gi, /\bnot just [a-z]+ — it's\b/gi,
  /\bwe welcome the opportunity\b/gi, /\bwe are committed to\b/gi,
];

export const cleanProposalText = (text) => {
  if (!text || typeof text !== "string") return text;
  let cleaned = text;
  // 1. Remove entire sentences starting with banned openers
  cleaned = cleaned.replace(BANNED_SENTENCE_STARTERS, "");
  // 2. Remove entire sentences containing "imagine" etc anywhere
  for (const re of BANNED_SENTENCE_PHRASES) {
    cleaned = cleaned.replace(re, m => m.endsWith("\n") ? "\n" : "");
  }
  // 3. Strip banned phrases inline
  for (const re of BANNED_PHRASES) {
    cleaned = cleaned.replace(re, "");
  }
  // 4. Clean up artifacts: double spaces, blank lines, leading punctuation
  cleaned = cleaned.replace(/\n\s*[,;]\s/g, "\n").replace(/  +/g, " ").replace(/\n{3,}/g, "\n\n").replace(/\n +/g, "\n").trim();
  // 5. insert bracketed definitions for internal/sector jargon on first use
  cleaned = applyGlossary(cleaned);
  return cleaned;
};

// Phase 2 / URL hygiene: detect Gemini grounding-redirect URLs.
// These are tracking URLs Gemini returns when grounded with Google Search.
// They only resolve inside a Gemini session — useless as application links.
// Retained for backward-compatibility with data persisted before the migration
// from Gemini to OpenAI.
export const isGroundingRedirect = (url) => {
  if (!url || typeof url !== "string") return false;
  return /vertexaisearch\.cloud\.google\.com|\/grounding-api-redirect\/|google\.com\/url\?/i.test(url);
};

// Returns true if the URL is a real, usable application URL — must be http(s),
// not a grounding redirect.
export const isUsableUrl = (url) => {
  if (!url || typeof url !== "string") return false;
  if (!/^https?:\/\//i.test(url)) return false;
  if (isGroundingRedirect(url)) return false;
  return true;
};

// True if the URL points to a bare funder homepage with no specific path —
// e.g. https://www.nac.org.za/ or https://momentum.co.za. These are weak
// "apply links" and the hygiene job should re-resolve them to specific pages
// (a grants page, application form, RFP page, etc.).
export const isHomepageOnly = (url) => {
  if (!url) return false;
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, "");
    return path === "" || path === "/" || path === "/index" || path === "/home" || path === "/en";
  } catch { return false; }
};

// Normalise a funder name for deduplication: lowercase, strip common decorators,
// collapse whitespace. "The Vodacom Foundation Trust" → "vodacom"
export const normaliseFunder = (raw) => {
  if (!raw) return "";
  return raw
    .toLowerCase()
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/\b(foundation|trust|fund|programme|program|grant|grants|initiative|charity|charities|organisation|organization|inc|ltd|llc|nv|sa|pty|group|company|corporation|corp)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

// Score a grant by how "complete" it is — used for dedupe to pick which
// duplicate to keep. Higher = more data filled in = keep this one.
export const grantCompleteness = (g) => {
  if (!g) return 0;
  let s = 0;
  if (isUsableUrl(g.applyUrl)) s += 10;
  if (g.deadline) s += 4;
  if (g.ask && g.ask > 0) s += 4;
  if (g.funderBudget && g.funderBudget > 0) s += 2;
  if (g.budgetTable) s += 8;
  if (g.aiDraft && g.aiDraft.length > 200) s += 12;
  if (g.aiSections && Object.keys(g.aiSections).length > 0) s += 12;
  if (g.aiResearch && g.aiResearch.length > 200) s += 6;
  if (g.aiFitscore) s += 3;
  if (g.funderBrief && g.funderBrief.length > 50) s += 8;
  if (g.notes && g.notes.length > 20) s += 2;
  if (Array.isArray(g.log)) s += Math.min(g.log.length, 10);
  if (g.owner && g.owner !== "team") s += 4;
  // Penalise scouted stage (oldest unworked) vs anything further along
  const stageBoost = { scouted: 0, vetting: 2, qualifying: 4, drafting: 8, review: 12, submitted: 14, awaiting: 14, won: 20, lost: 6, resubmit: 10, deferred: 2, archived: -10 };
  s += (stageBoost[g.stage] || 0);
  return s;
};

// Strip internal jargon from grant notes — sentences that reference internal
// programme-type classifications ("Type 1 cohort", "Type 4 FET programme", etc.)
// are planning shorthand. They mean nothing to a reader outside the org and
// derail AI searches. We drop the entire sentence containing the reference.
//
// Matches the patterns we've seen in real data:
//   "1 x Type 3 cohort with stipends."
//   "Type 4 FET programme. 3-year, 425-hour journey."
//   "2 x Type 2 cohort"
//   "Type 3 programme"
//   "Type 6 — Cyborg Habits"
const INTERNAL_TYPE_RE = /\bType\s*\d+\b/i;
// Also strip sentences that are purely "N x cohort" planning shorthand
const N_X_COHORT_RE = /^\s*\d+\s*x\s+/i;

export const sanitizeNotes = (notes) => {
  if (!notes || typeof notes !== "string") return notes;
  // Split on sentence-end punctuation OR newlines. Keep "Apply:" lines etc.
  // by checking only for the internal-jargon pattern.
  const parts = notes.split(/(?<=[.!?])\s+|\n/);
  const kept = parts.filter(s => {
    const t = (s || "").trim();
    if (!t) return false;
    if (INTERNAL_TYPE_RE.test(t)) return false;          // "Type N ..." anywhere
    if (N_X_COHORT_RE.test(t) && /cohort/i.test(t)) return false; // "1 x cohort..."
    return true;
  });
  return kept.join(" ").replace(/\s+/g, " ").replace(/\s+([.!?,;:])/g, "$1").trim();
};

export const fmt = n => n ? `R${(n / 1e6).toFixed(1)}M` : "—";
export const fmtK = n => n ? (n >= 1e6 ? `R${(n / 1e6).toFixed(1)}M` : `R${(n / 1e3).toFixed(0)}K`) : "—";
export const dL = d => d ? Math.ceil((new Date(d) - new Date()) / 864e5) : null;
export const uid = () => "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const urgC = d => d === null ? C.t3 : d < 0 ? C.red : d <= 14 ? C.red : d < 30 ? C.amber : C.ok;
export const urgLabel = d => d === null ? null : d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "Due today" : d <= 3 ? `${d}d left!` : d <= 14 ? `⚠ ${d}d` : `${d}d`;

// ── Visual-breaks quality check ──
// Verifies that a generated proposal (or one section of it) isn't a wall of text.
// Funders skim — proposals without tables, callouts, headers, or short paragraphs
// don't get read. This checker flags sections that need visual relief.
//
// Returns { issues: [...], score: 0..100 } where score reflects how break-friendly
// the document is. Issues are human-readable strings.
const SOFT_PARA_LIMIT_WORDS = 120; // a paragraph longer than this is a wall
const MAX_RUN_WORDS_WITHOUT_BREAK = 400; // sections longer than this need a header/table/callout

export const validateProposalBreaks = (text) => {
  const issues = [];
  if (!text || typeof text !== "string") return { issues: [], score: 100 };

  const doc = text;
  const hasTable = /\|.*\|.*\|/m.test(doc); // any markdown table at all
  const hasStat = /\[STAT:\s*[^|\]]+\|[^\]]+\]/i.test(doc); // any stat callout
  const hasHeaders = /^#{1,6}\s+\S/m.test(doc); // markdown headers
  const wordCount = doc.split(/\s+/).filter(Boolean).length;

  if (wordCount < 200) return { issues: [], score: 100 }; // too short to need breaks

  if (!hasTable && wordCount >= 300) {
    issues.push("No tables found — costing or quantitative breakdowns should use markdown tables.");
  }
  if (!hasStat && wordCount >= 600) {
    issues.push("No stat callouts found — surface 2-3 key impact numbers as [STAT: value | label] for visual emphasis.");
  }
  if (!hasHeaders && wordCount >= 400) {
    issues.push("No section headers found — break the document with ## headings every major topic.");
  }

  // Paragraph-by-paragraph check
  const paras = doc.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  let longParaCount = 0;
  for (const p of paras) {
    if (/^[#|]/.test(p)) continue; // skip headers and tables
    const w = p.split(/\s+/).filter(Boolean).length;
    if (w > SOFT_PARA_LIMIT_WORDS) longParaCount++;
  }
  if (longParaCount >= 3) {
    issues.push(`${longParaCount} paragraphs over ${SOFT_PARA_LIMIT_WORDS} words — break them up for readability.`);
  }

  // Run-without-break check: longest stretch of plain prose without ANY visual relief
  let longestRun = 0, currentRun = 0;
  for (const line of doc.split(/\n+/)) {
    const t = line.trim();
    if (!t) continue;
    const isBreak = /^#{1,6}\s/.test(t) || /^\|.*\|/.test(t) || /^\[STAT:/.test(t) || /^[-*]\s/.test(t);
    if (isBreak) { longestRun = Math.max(longestRun, currentRun); currentRun = 0; }
    else { currentRun += t.split(/\s+/).filter(Boolean).length; }
  }
  longestRun = Math.max(longestRun, currentRun);
  if (longestRun > MAX_RUN_WORDS_WITHOUT_BREAK) {
    issues.push(`${longestRun} words of unbroken prose detected — insert a header, table, or callout to break the flow.`);
  }

  // Score: 100 minus 15 per issue, floor at 0
  const score = Math.max(0, 100 - issues.length * 15);
  return { issues, score };
};

// ── Stage-aware deadline intelligence ──
// In grant funding, "deadline" = submission deadline.
// Post-submission stages (submitted, awaiting, won) have ALREADY met the deadline — it's not overdue.
// Pre-submission stages with past deadlines = missed the window, need attention but not panic.
const POST_SUBMISSION = ["submitted", "awaiting", "won", "lost", "deferred", "archived"];
const PRE_DRAFT = ["scouted", "vetting", "qualifying"];

export const deadlineCtx = (daysLeft, stage) => {
  if (daysLeft === null) return { label: null, color: C.t3, bg: C.warm200, severity: "none", icon: "" };

  // Post-submission: deadline is irrelevant — they made it
  if (POST_SUBMISSION.includes(stage)) {
    return { label: "Submitted", color: C.ok, bg: C.okSoft, severity: "ok", icon: "✓" };
  }

  // Pre-submission with past deadline
  if (daysLeft < 0) {
    const abs = Math.abs(daysLeft);
    if (PRE_DRAFT.includes(stage)) {
      // Scouted/Qualifying — window closed, it's an expired opportunity
      return { label: `Closed ${abs}d ago`, color: C.t3, bg: C.warm200, severity: "expired", icon: "○" };
    }
    // Drafting/Review — they were working on it and missed submission
    return { label: `Missed by ${abs}d`, color: C.amber, bg: C.amberSoft, severity: "missed", icon: "!" };
  }

  // Future deadline — genuine urgency
  if (daysLeft === 0) return { label: "Due today", color: C.red, bg: C.redSoft, severity: "critical", icon: "⚠" };
  if (daysLeft <= 3) return { label: `${daysLeft}d left!`, color: C.red, bg: C.redSoft, severity: "critical", icon: "⚠" };
  if (daysLeft <= 14) return { label: `${daysLeft}d left`, color: C.amber, bg: C.amberSoft, severity: "urgent", icon: "⏰" };
  if (daysLeft <= 30) return { label: `${daysLeft}d`, color: C.amber, bg: C.amberSoft, severity: "soon", icon: "" };
  return { label: `${daysLeft}d`, color: C.ok, bg: C.warm200, severity: "ok", icon: "" };
};
// ── Ask helpers ──
// effectiveAsk: returns the best available amount for display/totals (ask if set, otherwise funderBudget)
export const effectiveAsk = (g) => g.ask || g.funderBudget || 0;

export const td = () => new Date().toISOString().slice(0, 10);
export const addD = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
export const cp = t => {
  try { navigator.clipboard.writeText(t); }
  catch { const a = document.createElement("textarea"); a.value = t; document.body.appendChild(a); a.select(); document.execCommand("copy"); document.body.removeChild(a); }
};

// Classify the funder's submission channel so the UI can pick the right action.
// Returns an object: { method, recipient, label, desc } where method is one of:
//   "invitation" — by invitation only / closed call (no public channel)
//   "email"      — email submission (recipient is the parsed email if found)
//   "form"       — online form / portal
//   "loi"        — letter of inquiry first
//   "physical"   — physical / postal delivery
//   "relationship" — relationship-first (no public submission channel)
//   "unknown"    — no clear signal
export const detectSubmissionMethod = (grant) => {
  const blob = `${grant?.notes || ""} ${grant?.aiResearch || ""} ${grant?.funderBrief || ""}`.toLowerCase();
  const emailMatch = `${grant?.notes || ""}\n${grant?.funderBrief || ""}`.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  const recipient = emailMatch ? emailMatch[0] : null;

  if (/\b(by invitation|invitation only|invited only|not accepting unsolicited|closed call)\b/.test(blob)) {
    return { method: "invitation", recipient: null, label: "By invitation only", desc: "This funder doesn't accept unsolicited applications." };
  }
  if (/\b(online portal|online form|application form|submission portal|apply online|web form|e-form|form online)\b/.test(blob)) {
    return { method: "form", recipient: null, label: "Online application form", desc: "Fill the funder's form on their site." };
  }
  if (/\b(letter of inquiry|loi)\b/.test(blob)) {
    return { method: "loi", recipient, label: "Letter of inquiry first", desc: "Send a short pitch first; full proposal only on invitation." };
  }
  if (recipient || /\b(email|e-mail|enquiry|inquiry)\b/.test(blob)) {
    return { method: "email", recipient, label: "Email submission", desc: `Email the proposal directly${recipient ? ` to ${recipient}` : " to the funder's contact"}.` };
  }
  if (/\b(post(ed)?|postal|courier|in person|hand-?deliver|physical)\b/.test(blob)) {
    return { method: "physical", recipient: null, label: "Paper / posted submission", desc: "This funder needs a physical copy delivered or posted." };
  }
  if (/\b(relationship first|warm intro|approach via|approach through|contact us first)\b/.test(blob)) {
    return { method: "relationship", recipient: null, label: "Relationship-first", desc: "Make contact before sending anything formal." };
  }
  return { method: "unknown", recipient: null, label: null, desc: null };
};

// Detect whether a funder accepts unsolicited proposals based on the grant's
// notes blob (which often quotes the funder's site). Returns:
//   "yes"     — accepts open applications
//   "no"      — by-invitation-only / closed call / not accepting
//   "unknown" — no clear signal
// Conservative — only returns yes/no on strong evidence.
export const detectUnsolicited = (grant) => {
  const blob = `${grant?.notes || ""} ${grant?.aiResearch || ""} ${grant?.funderBrief || ""}`.toLowerCase();
  if (!blob.trim()) return "unknown";
  const negPatterns = [
    /by\s+invitation\s+only/,
    /invitation[-\s]?only/,
    /\bunsolicited[^.\n]{0,40}(not\s+accept|declined|rejected|will\s+not\s+be\s+considered)/,
    /\b(does\s+not|do\s+not|don'?t)\s+accept[^.\n]{0,40}unsolicited/,
    /closed\s+call/,
    /by\s+nomination\s+only/,
    /by\s+referral\s+only/,
    /\bnot\s+accepting\s+applications/,
  ];
  for (const re of negPatterns) if (re.test(blob)) return "no";
  const posPatterns = [
    /\bunsolicited\s+(proposals?|applications?)\s+(welcome|accepted|considered|encouraged)/,
    /\b(open|rolling)\s+(call|application|submission)/,
    /\bapply\s+(online|here|via\s+our\s+portal)/,
    /\baccept\s+applications\s+(year[-\s]?round|on\s+a\s+rolling\s+basis)/,
  ];
  for (const re of posPatterns) if (re.test(blob)) return "yes";
  return "unknown";
};

// ── Readability scoring ──
// Flesch Reading Ease: 0 (very hard, post-grad) → 100 (very easy, 5th grade).
// Donor-facing proposals should land 50-70 (plain English, "fairly difficult"-ish).
// Below 30 = bureaucratic grant-speak. Above 80 = too simple for a sophisticated funder.
const countSyllables = (word) => {
  word = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!word) return 0;
  if (word.length <= 3) return 1;
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const m = word.match(/[aeiouy]{1,2}/g);
  return m ? m.length : 1;
};
export const readabilityScore = (text) => {
  if (!text || typeof text !== "string") return null;
  // Strip markdown, code fences, tables — they skew the score
  const clean = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\|[^\n]*\|/g, " ")
    .replace(/[#*_>`~\[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length < 100) return null;
  const sentences = clean.split(/[.!?]+\s/).filter(s => s.trim().length > 0);
  const words = clean.split(/\s+/).filter(w => /[a-zA-Z]/.test(w));
  if (sentences.length === 0 || words.length === 0) return null;
  let syllables = 0;
  for (const w of words) syllables += countSyllables(w);
  const wordsPerSentence = words.length / sentences.length;
  const syllablesPerWord = syllables / words.length;
  // Flesch Reading Ease formula
  const score = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
  return Math.round(Math.max(0, Math.min(100, score)));
};
export const readabilityLabel = (score) => {
  if (score === null || score === undefined) return null;
  if (score >= 80) return { label: "Very easy", note: "May read as too casual for sophisticated funders", tone: "amber" };
  if (score >= 60) return { label: "Plain English", note: "Clear and accessible — funder-friendly", tone: "ok" };
  if (score >= 45) return { label: "Fairly difficult", note: "Standard donor-facing register", tone: "ok" };
  if (score >= 30) return { label: "Difficult", note: "Bureaucratic — consider simplifying", tone: "amber" };
  return { label: "Very difficult", note: "Reads as grant-speak — needs editing", tone: "red" };
};

// Per-sentence Flesch score (treats the input as a single sentence). Used to find
// the sentences dragging a section's readability down. Returns null for fragments
// too short to judge.
export const scoreSentence = (sentence) => {
  if (!sentence || typeof sentence !== "string") return null;
  const clean = sentence.replace(/[#*_>`~\[\]()]/g, " ").replace(/\s+/g, " ").trim();
  const words = clean.split(/\s+/).filter(w => /[a-zA-Z]/.test(w));
  if (words.length < 4) return null;
  let syllables = 0;
  for (const w of words) syllables += countSyllables(w);
  const score = 206.835 - 1.015 * words.length - 84.6 * (syllables / words.length);
  return Math.round(Math.max(0, Math.min(100, score)));
};

// Split prose into sentences with character offsets into the ORIGINAL text, so a
// caller can replace specific sentences losslessly. Skips markdown table rows,
// [STAT:] callout lines and headings so only prose is considered.
export const splitProseSentences = (text) => {
  if (!text || typeof text !== "string") return [];
  const out = [];
  const lines = text.split("\n");
  let offset = 0;
  for (const line of lines) {
    const lineStart = offset;
    offset += line.length + 1; // +1 for the consumed "\n"
    const t = line.trim();
    if (!t || /^\|.*\|$/.test(t) || /^(\[STAT:[^\]]+\]\s*)+$/.test(t) || /^#{1,6}\s/.test(t)) continue;
    const re = /[^.!?]+[.!?]+|[^.!?]+$/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      const chunk = m[0];
      const lead = chunk.length - chunk.trimStart().length;
      const core = chunk.trim();
      if (!core) continue;
      const start = lineStart + m.index + lead;
      out.push({ text: core, start, end: start + core.length });
    }
  }
  return out;
};

// The worst `cap` prose sentences scoring below `target`, lowest first.
export const worstSentences = (text, target = 50, cap = 6) => {
  const scored = [];
  for (const s of splitProseSentences(text)) {
    const sc = scoreSentence(s.text);
    if (sc !== null && sc < target) scored.push({ ...s, score: sc });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, cap);
};

// Replace sentences at given offsets with new text — offset-based, so there are
// no substring collisions. `replacements`: [{ start, end, after }] into `text`.
export const spliceSentences = (text, replacements) => {
  const sorted = [...replacements].sort((a, b) => b.start - a.start);
  let out = text;
  for (const r of sorted) out = out.slice(0, r.start) + r.after + out.slice(r.end);
  return out;
};

// ── Grant Readiness Score ──
// Returns { score: 0-100, missing: string[], nextAction: string }
// Weighted: docs 40%, AI coverage 30%, metadata 30%
export const grantReadiness = (g, complianceDocs = []) => {
  const missing = [];

  // 1. Doc readiness (40%)
  let docScore = 1; // default full if no doc requirements for this type
  const required = DOCS[g.type];
  if (required && required.length > 0) {
    const compMap = {};
    for (const c of complianceDocs) compMap[c.doc_id] = c;
    let ready = 0;
    for (const docName of required) {
      const orgDocId = DOC_MAP[docName];
      if (orgDocId) {
        const cd = compMap[orgDocId];
        if (cd && (cd.status === "valid" || cd.status === "uploaded")) ready++;
      }
    }
    docScore = ready / required.length;
    const gap = required.length - ready;
    if (gap > 0) missing.push(`${gap} docs missing`);
  }

  // 2. AI coverage (30%) — fit score, research, draft/sections
  let aiScore = 0;
  const hasSections = g.aiSections && Object.values(g.aiSections).some(s => s?.text);
  const aiChecks = [
    { key: "aiFitscore", label: "No fit score" },
    { key: "aiResearch", label: "No research" },
    { key: "aiDraft", label: "No draft", altCheck: hasSections },
  ];
  let aiDone = 0;
  for (const ck of aiChecks) {
    if (g[ck.key] || ck.altCheck) aiDone++;
    else missing.push(ck.label);
  }
  aiScore = aiDone / aiChecks.length;

  // 3. Metadata completeness (30%) — deadline, owner, ask/budget
  let metaScore = 0;
  const hasBudget = g.budgetTable && g.budgetTable.total > 0;
  const metaChecks = [
    { test: g.deadline, label: "No deadline" },
    { test: g.owner && g.owner !== "team", label: "Unassigned" },
    { test: hasBudget || g.ask > 0 || g.funderBudget > 0, label: hasBudget ? null : "No budget" },
  ];
  let metaDone = 0;
  for (const ck of metaChecks) {
    if (ck.test) metaDone++;
    else missing.push(ck.label);
  }
  metaScore = metaDone / metaChecks.length;

  const score = Math.round(docScore * 40 + aiScore * 30 + metaScore * 30);

  // Next action suggestion based on stage + missing items
  let nextAction = "";
  const stage = g.stage || "scouted";
  if (stage === "scouted") {
    nextAction = !g.owner || g.owner === "team" ? "Assign an owner to start qualifying" : "Run Fit Score to evaluate this opportunity";
  } else if (stage === "qualifying") {
    nextAction = !g.aiFitscore ? "Run Fit Score to evaluate fit" : !g.aiResearch ? "Run Funder Research before drafting" : "Ready to move to Drafting";
  } else if (stage === "drafting") {
    nextAction = !g.aiDraft ? "Generate a draft proposal" : missing.some(m => m.endsWith("docs missing")) ? "Upload missing compliance documents" : "Submit draft for review";
  } else if (stage === "review") {
    const gate = GATES["review->submitted"];
    nextAction = gate ? `${gate.label}` : "Awaiting review approval";
  } else if (stage === "resubmit") {
    nextAction = !g.aiResearch ? "Run updated Funder Research" : "Revise draft with funder feedback and resubmit";
  } else if (stage === "submitted" || stage === "awaiting") {
    nextAction = "Track follow-ups with the funder";
  } else if (stage === "won") {
    nextAction = "Grant secured";
  } else if (stage === "lost") {
    nextAction = "Review loss analysis for learnings";
  }

  return { score, missing, nextAction };
};

// ── AI error detection (shared across components) ──
export const isAIError = (r) => !r || r.startsWith("Error") || r.startsWith("Rate limit") || r.startsWith("Connection") || r.startsWith("Request failed") || r.startsWith("No response") || r.startsWith("The AI service");

// ── Assemble sections into a single text (for backward compat + export) ──
export const assembleText = (sections, order) =>
  order.filter(n => sections[n]?.text)
    .map(n => `${n.toUpperCase()}\n\n${sections[n].text}`)
    .join("\n\n" + "=".repeat(60) + "\n\n");
