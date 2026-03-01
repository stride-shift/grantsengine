import { C } from "./theme";
import { DOCS, DOC_MAP, GATES } from "./data/constants";

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
