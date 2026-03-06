import { C } from "./theme";
import { DOCS, DOC_MAP, GATES } from "./data/constants";

// ── Parse structured research JSON from AI response ──
export const parseStructuredResearch = (raw) => {
  if (!raw || typeof raw !== "string") return null;
  try {
    const parsed = JSON.parse(raw.trim());
    if (parsed && typeof parsed === "object" && parsed.rawText) return parsed;
  } catch { /* fall through */ }
  try {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) {
      const parsed = JSON.parse(fenced[1].trim());
      if (parsed && typeof parsed === "object" && parsed.rawText) return parsed;
    }
  } catch { /* fall through */ }
  try {
    const first = raw.indexOf("{"), last = raw.lastIndexOf("}");
    if (first >= 0 && last > first) {
      const parsed = JSON.parse(raw.slice(first, last + 1));
      if (parsed && typeof parsed === "object" && parsed.rawText) return parsed;
    }
  } catch { /* fall through */ }
  return null;
};

// ── Post-processing filter for banned phrases that the AI ignores ──
// Gemini sometimes uses these despite explicit prompt-level bans.
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
  return cleaned;
};

export const fmt = n => n ? `R${(n / 1e6).toFixed(1)}M` : "—";
export const fmtK = n => n ? (n >= 1e6 ? `R${(n / 1e6).toFixed(1)}M` : `R${(n / 1e3).toFixed(0)}K`) : "—";
export const dL = d => d ? Math.ceil((new Date(d) - new Date()) / 864e5) : null;
export const uid = () => "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const urgC = d => d === null ? C.t3 : d < 0 ? C.red : d <= 14 ? C.red : d < 30 ? C.amber : C.ok;
export const urgLabel = d => d === null ? null : d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "Due today" : d <= 3 ? `${d}d left!` : d <= 14 ? `⚠ ${d}d` : `${d}d`;

// ── Stage-aware deadline intelligence ──
// In grant funding, "deadline" = submission deadline.
// Post-submission stages (submitted, awaiting, won) have ALREADY met the deadline — it's not overdue.
// Pre-submission stages with past deadlines = missed the window, need attention but not panic.
const POST_SUBMISSION = ["submitted", "awaiting", "won", "lost", "deferred"];
const PRE_DRAFT = ["scouted", "qualifying"];

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
    nextAction = !g.aiDraft ? "Generate a draft proposal" : missing.includes(`${required?.length || 0} docs missing`) ? "Upload missing compliance documents" : "Submit draft for review";
  } else if (stage === "review") {
    const gate = GATES["review->submitted"];
    nextAction = gate ? `${gate.label}` : "Awaiting review approval";
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
