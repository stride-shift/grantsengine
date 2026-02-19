import { C } from "./theme";

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

