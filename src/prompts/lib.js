// Shared prompt-building primitives, extracted from useAI.js (Phase 3, move-only).
// Pure: no React, no state, no I/O. Imported by useAI.js (and, later, the per-concern
// prompt modules). FACT_GUARD is the static anti-hallucination block injected into every
// prompt; the two getResearchFor* helpers shape parsed funder research for a prompt.

// ── Anti-hallucination instruction — added to every prompt type ──
export const FACT_GUARD = `\n\nCRITICAL ACCURACY RULES — ZERO TOLERANCE FOR FABRICATION:

SOURCE-OF-TRUTH HIERARCHY (in order):
1. The grant data passed in the user message (funder, ask, deadline, notes, focus, funderFeedback)
2. The funder brief and any uploaded documents in the context
3. The organisation context (programmes, impact stats, alumni)
ANYTHING NOT IN THESE SOURCES IS NOT A FACT. Do not invent.

NEVER FABRICATE:
- Deadlines or submission dates not in the grant data — if no deadline is provided, write "[Deadline: TBC]" or omit the date entirely. NEVER guess "by end of Q2" or "before 30 June" or similar plausible-sounding dates.
- Funder priorities, preferences, or strategic focus areas — if you don't have the funder's own words from research or uploaded docs, write generically (e.g. "aligns with their stated focus on skills development") rather than inventing specifics.
- Monetary amounts beyond the confirmed ask and programme costs. Sub-budgets, sub-totals, and percentage allocations must add up to the SAME total ask. If a number isn't derivable from the budget block, mark it "[TBC]".
- Programme details, cohort sizes, durations, or accreditation claims not in the org context.
- Statistics, completion rates, or employment rates other than the exact verified numbers in the context.
- Names of individuals beyond those explicitly listed in the context.

WHEN A FACT IS UNAVAILABLE, USE THESE LABELS:
- Date: "[Deadline: TBC]"  /  Amount: "[Amount: TBC]"  /  Programme detail: "[To be confirmed with funder]"
- It is BETTER to write "[TBC]" than to write a plausible-sounding fabrication. A reviewer can fix TBCs. They cannot un-trust an invented number.

DERIVED VS PROVIDED:
- "Provided" data (from context/grant/budget) must appear exactly as given — no rephrasing of numbers, no rounding, no shifting decimals.
- "Derived" data (calculated from provided data) must be mathematically consistent across the document. Per-student cost = total ÷ students. If you can't show the math, don't write the number.

TEAM/STAFF:
- Do NOT name directors individually — refer to "the directors", "programme management and ops team", or "the leadership team".

WHAT YOU MAY DO:
- Creatively design programme structures, propose new combinations of the organisation's components, and scale up delivery models — but ground everything in the organisation's real capabilities and cost structures.
- Programme costs should be realistic and derived from the provided cost-per-student figures, scaled appropriately for the proposed scope.`;

// ── Select research fields relevant to a specific proposal section ──
export const getResearchForSection = (structured, sectionName, budget) => {
  if (!structured) return "";
  const sn = (sectionName || "").toLowerCase();
  const isCover = sn.includes("cover");
  const isExecSummary = sn.includes("summary") || sn.includes("executive");
  const isBudget = sn.includes("budget");
  const isImpact = sn.includes("impact") || sn.includes("outcome") || sn.includes("evidence");
  const isProgramme = sn.includes("programme") || sn.includes("program") || sn.includes("approach") || sn.includes("design");
  const isScale = sn.includes("scale") || sn.includes("sustainability");

  const parts = [];
  const add = (label, key) => { if (structured[key]) parts.push(`${label}: ${structured[key]}`); };

  // Universal: every section gets funder priorities as baseline
  add("Funder priorities", "priorities");

  if (isCover) {
    add("Key contacts", "contacts");
    add("Strategy", "strategy");
    add("Application process", "applicationProcess");
    add("Recent grants", "recentGrants");
    add("Relationship", "relationshipLeverage"); add("Door opener", "doorOpener");
  } else if (isExecSummary) {
    add("Strategy", "strategy");
    add("Budget range", "budgetRange");
    add("Relationship", "relationshipLeverage"); add("Door opener", "doorOpener");
  } else if (isBudget) {
    add("Budget range", "budgetRange");
    add("Recent grants", "recentGrants");
  } else if (isImpact) {
    add("Recent grants", "recentGrants");
    add("Strategy", "strategy");
  } else if (isProgramme) {
    add("Strategy", "strategy");
    add("Recent grants", "recentGrants");
  } else if (isScale) {
    add("Strategy", "strategy");
    add("Budget range", "budgetRange");
  } else {
    // Default: all fields except rawText
    for (const [k, v] of Object.entries(structured)) {
      if (k !== "rawText" && v) add(k.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()), k);
    }
  }
  const result = parts.join("\n");
  return budget ? result.slice(0, budget) : result;
};

// ── Get full research for draft prompt (all fields, structured) ──
export const getResearchForDraft = (structured, budget = 2500) => {
  if (!structured) return "";
  const parts = [];
  const add = (label, key) => { if (structured[key]) parts.push(`${label}: ${structured[key]}`); };
  add("Budget & scale", "budgetRange");
  add("Recent grants", "recentGrants");
  add("Key contacts", "contacts");
  add("Funder priorities", "priorities");
  add("Application process", "applicationProcess");
  add("Strategy", "strategy");
  add("Relationship leverage", "relationshipLeverage");
  add("Door opener", "doorOpener");
  return parts.join("\n").slice(0, budget);
};
