/* Two-tier tour system.
 *
 * OVERVIEW tour: auto-fires on first login. High-level — explains what each
 * tab is for. ~8 steps. Walks through the sidebar.
 *
 * Per-tab tours: triggered by a `?` button inside each tab. Deeper — walks
 * through the specific features within that tab.
 *
 * Role filtering: a step with `roles: [...]` shows only for matching roles.
 * Steps without a `roles` field show for everyone.
 *
 * Each step targets a real UI element via `data-tour="..."`. The TourOverlay
 * highlights the target with a glow ring and floats a tooltip beside it.
 * Steps without a target render as a centred modal (welcome / closing cards).
 *
 * Roles match `src/data/constants.js` ROLES: director, board, hop, pm, coord, comms.
 */

// ─── OVERVIEW TOUR — what each tab is for ───
const OVERVIEW_STEPS = [
  {
    id: "welcome",
    title: "Welcome to Grants Engine",
    body: "This 60-second tour shows you what each part of the app is for. Once you know your way around, click the help button in the bottom-right corner of any tab for a deeper walkthrough of that tab.",
  },
  {
    id: "ov-dashboard",
    target: '[data-tour="nav-dashboard"]',
    view: "dashboard",
    title: "Dashboard",
    body: "Your daily landing pad. Outstanding actions, urgent deadlines, pipeline health, and team workload — everything you need to see first thing.",
    placement: "right",
  },
  {
    id: "ov-pipeline",
    target: '[data-tour="nav-pipeline"]',
    view: "dashboard",
    title: "Pipeline",
    body: "Every live grant in one view. Stages, deadlines, owners, fit scores. This is where most of your work happens — and where Scout lives.",
    placement: "right",
  },
  {
    id: "ov-vetting",
    target: '[data-tour="nav-vetting"]',
    title: "Vetting",
    body: "Grants flagged for board-level review. Board members confirm whether each opportunity is worth pursuing before the team commits writing time.",
    placement: "right",
    roles: ["director", "board"],
  },
  {
    id: "ov-calendar",
    target: '[data-tour="nav-calendar"]',
    title: "Calendar",
    body: "Every grant deadline auto-syncs to whichever team member owns the relationship. If the owner changes, the calendar event moves with them.",
    placement: "right",
  },
  {
    id: "ov-docs",
    target: '[data-tour="nav-docs"]',
    title: "Documents",
    body: "Two sections: compliance docs (PBO, NPO, audited financials, B-BBEE) and the proposal library (past proposals the AI learns from). Status badges show what's valid, expiring, or missing.",
    placement: "right",
  },
  {
    id: "ov-funders",
    target: '[data-tour="nav-funders"]',
    title: "Funders",
    body: "Relationship intelligence per funder — what you've asked for, what they've granted, who owns the relationship, and history across cycles.",
    placement: "right",
  },
  {
    id: "ov-archive",
    target: '[data-tour="nav-archive"]',
    title: "Archive",
    body: "Every closed proposal — Won, Lost, Deferred, Not Relevant. Search past funder feedback, mine wins for reusable language, and see your win rate at a glance.",
    placement: "right",
  },
  {
    id: "ov-resources",
    target: '[data-tour="nav-resources"]',
    title: "Resources",
    body: "Curated nonprofit freebies and discounts — Canva, Google Ad Grants, AI credits, cloud hosting, Slack, Figma. Apply directly from the links provided.",
    placement: "right",
  },
  {
    id: "ov-settings",
    target: '[data-tour="nav-settings"]',
    title: "Settings",
    body: "Org profile, team, AI tuning. Your org profile is what the AI uses as context for every proposal — keep it sharp.",
    placement: "right",
  },
  {
    id: "ov-help-button",
    target: '[data-tour="help-button"]',
    title: "Need a refresher?",
    body: "The help button in the bottom-right corner is context-aware. Click it from any tab and it'll launch a deeper walkthrough of that specific tab's features.",
    placement: "left",
  },
];

// ─── PIPELINE TAB TOUR ───
const PIPELINE_STEPS = [
  {
    id: "pl-intro",
    title: "Pipeline — every grant in one view",
    body: "Let me show you how to find new opportunities, filter what matters, and open a grant.",
  },
  {
    id: "pl-scout",
    target: '[data-tour="scout-button"]',
    title: "Scout — AI funder search",
    body: "Scout searches across South African and global funders matched to your org profile. Results come with fit scores, link verification, and access type (open vs relationship-only vs invitation).",
    placement: "bottom",
  },
  {
    id: "pl-filters",
    target: '[data-tour="pipeline-filters"]',
    title: "Filter pills",
    body: "Quick filters surface what needs attention now. Open / due-this-week / missed deadlines / no-draft-yet / unassigned. Click any pill to focus the view.",
    placement: "bottom",
  },
  {
    id: "pl-archive-all",
    target: '[data-tour="pipeline-filters"]',
    title: "Bulk archive missed grants",
    body: "When the Missed pill shows results, you'll see an 'Archive all' button next to it. One click moves every overdue grant in early stages to Not Relevant — keeps the pipeline clean.",
    placement: "bottom",
  },
  {
    id: "pl-card",
    target: '[data-tour="grant-card"]',
    title: "Grant cards",
    body: "Each card shows the funder, stage, deadline, owner, and ask. Click into one to see full detail — research, budget, draft, activity log.",
    placement: "top",
  },
];

// ─── GRANT DETAIL TOUR ───
const GRANT_DETAIL_STEPS = [
  {
    id: "gd-intro",
    title: "Inside a grant",
    body: "This is where you'll spend most of your time. Funder brief, AI draft, budget, activity. Let me walk you through it.",
  },
  {
    id: "gd-funder-brief",
    target: '[data-tour="funder-brief"]',
    title: "Funder brief — source of truth",
    body: "Paste the funder's exact brief here before generating anything. The AI uses it as the primary source — preventing hallucinated dates, themes, or eligibility claims. The more verbatim, the better.",
    placement: "left",
  },
  {
    id: "gd-apply-url",
    target: '[data-tour="apply-url"]',
    title: "Application URL",
    body: "Save the funder's actual application page here. If you don't know it, click '🔍 Find URL with AI' — it'll search the funder's own domain and save the URL automatically.",
    placement: "left",
  },
  {
    id: "gd-funder-feedback",
    target: '[data-tour="funder-feedback"]',
    title: "Funder feedback",
    body: "Once a grant reaches Submitted or later (or Resubmit), this panel appears. Paste any rejection notes, meeting outcomes, or requested revisions here — the AI uses it as a primary input on the next draft and the Win/Loss analysis. There's also a '✉ Paste email' button that auto-extracts structured feedback from a pasted funder email.",
    placement: "left",
    showWhen: (grant) => ["submitted", "awaiting", "won", "lost", "resubmit", "deferred"].includes(grant?.stage),
  },
  {
    id: "gd-magic",
    target: '[data-tour="make-magic"]',
    title: "Make the Magic Happen",
    body: "Runs the full sequence — funder research, fit score, budget, and proposal draft — in one click. Each step is anchored on your organisation's real outcomes and matched to this funder's priorities.",
    placement: "left",
  },
  {
    id: "gd-concept",
    target: '[data-tour="concept-note"]',
    title: "Concept Note",
    body: "Some funders want a short pre-proposal pitch first. This button drafts a 1-2 page concept note in 30 seconds — send it to test interest before committing to a full proposal.",
    placement: "left",
  },
  {
    id: "gd-budget",
    target: '[data-tour="budget-section"]',
    title: "Budget Builder",
    body: "Build the budget here — pick a programme template, set scope and duration, lock the total. The proposal generator uses these figures as the source of truth so the AI never guesses numbers.",
    placement: "top",
    roles: ["hop", "pm", "director", "board"],
  },
  {
    id: "gd-outstanding",
    target: '[data-tour="outstanding-actions"]',
    title: "Outstanding actions",
    body: "Auto-detected next steps: missing docs, no deadline set, draft not generated. Tick them off as you go — the dashboard rolls these up across your whole pipeline.",
    placement: "top",
  },
  {
    id: "gd-activity",
    target: '[data-tour="activity-log"]',
    title: "Activity log",
    body: "Every action gets logged with the person who took it — useful when you need to know who edited a proposal, who approved a stage change, or who added a note.",
    placement: "top",
  },
  {
    id: "gd-stage",
    target: '[data-tour="stage-button"]',
    title: "Stage approval gates",
    body: "Moving a grant past Review to Submitted needs director sign-off. Same for confirming Won or Lost. Approval gates prevent accidental status changes.",
    placement: "bottom",
    roles: ["director", "board", "hop"],
  },
  {
    id: "gd-engagement-mode",
    target: '[data-tour="workflow-cell"]',
    title: "Manual engagement mode",
    body: "Some funders don't accept unsolicited proposals — they need a relationship-first approach. Click 'Switch to manual' here to flip the grant into manual-engagement mode. Proposal AI buttons hide and the next action becomes 'Log next funder touchpoint'.",
    placement: "top",
  },
  {
    id: "gd-clone",
    title: "Clone for next cycle",
    body: "Once a grant is Won, Lost, or Deferred, a blue 'Clone for next cycle' banner appears. One click creates a fresh grant for next year — deadline +1y, last-cycle outcome + feedback carried into notes. Use this on every annual funder (GIDF, DGMT, TK Foundation).",
  },
  {
    id: "gd-ai-reference",
    title: "Mark winning proposals as AI references",
    body: "On Won/Lost/Submitted grants with a draft, a star toggle appears: 'Use as AI reference'. Mark your best proposals — the AI studies their tone, structure, and framing on future drafts. Won = 'do this'. Lost = 'avoid this'.",
  },
];

// ─── DASHBOARD TAB TOUR ───
const DASHBOARD_STEPS = [
  {
    id: "db-intro",
    title: "Dashboard — your daily landing pad",
    body: "This is what you'll see every morning. Let me show you the sections that matter most.",
  },
  {
    id: "db-pipeline",
    target: '[data-tour="dash-pipeline"]',
    title: "Pipeline summary",
    body: "Active grants grouped by stage — drafting, review, submitted, awaiting. Click 'View Pipeline' on the right to jump into the full Pipeline tab.",
    placement: "top",
  },
  {
    id: "db-timeline",
    target: '[data-tour="dash-timeline"]',
    title: "Submission timeline",
    body: "A visual sweep of upcoming deadlines across all grants. Red = overdue. Amber = within 14 days. Click any grant to open it.",
    placement: "top",
  },
  {
    id: "db-ai-tools",
    target: '[data-tour="dash-ai-tools"]',
    title: "AI Tools",
    body: "One-click reports — pipeline health, strategic insights, and a 'what should we focus on this week' brief. Generated from your live data, not generic templates.",
    placement: "top",
  },
];

// ─── DOCS / VAULT TAB TOUR ───
const DOCS_STEPS = [
  {
    id: "docs-intro",
    title: "Document Vault",
    body: "Your library of compliance docs, past proposals, and supporting files. The AI uses these as reference when generating new proposals — so the more you upload, the sharper the drafts get.",
  },
  {
    id: "docs-categories",
    target: '[data-tour="docs-categories"]',
    title: "Filter by category",
    body: "Tabs let you focus on one category at a time — compliance, financial, governance, proposals, programmes. Each shows a live count so you know what's stocked.",
    placement: "bottom",
  },
  {
    id: "docs-upload",
    target: '[data-tour="docs-upload"]',
    title: "Upload anything",
    body: "Drop in PDFs, Word docs, or Excel files. PBO certificates, audited financials, B-BBEE, past proposals, MOUs. The system extracts text from each upload so the AI can reference its contents.",
    placement: "top",
  },
];

// ─── CALENDAR TAB TOUR ───
const CALENDAR_STEPS = [
  {
    id: "cal-intro",
    title: "Calendar",
    body: "Every grant deadline lives here, colour-coded by stage. The view switches between month, week, and list — and you can export anything to your phone or Outlook.",
  },
  {
    id: "cal-views",
    target: '[data-tour="cal-views"]',
    title: "Switch the view",
    body: "Month for a quarterly sweep, week for the next seven days, list for a chronological feed. The same data — your preference.",
    placement: "bottom",
  },
  {
    id: "cal-owner-sync",
    title: "Owner-based sync",
    body: "Each deadline auto-pushes to the calendar of whichever team member owns the grant. Reassign the grant in the Pipeline and the calendar event moves with the new owner — no manual handoff.",
  },
];

// ─── VETTING TAB TOUR ───
const VETTING_STEPS = [
  {
    id: "vet-intro",
    title: "Vetting queue",
    body: "Grants in early stages waiting for board sign-off. Board members confirm whether each opportunity is worth pursuing before the team commits proposal-writing time.",
    roles: ["director", "board"],
  },
  {
    id: "vet-list",
    target: '[data-tour="vetting-list"]',
    title: "Vetting checklist",
    body: "Each grant card has a checklist — eligibility, fit, capacity, deadline, budget alignment. Tick each item as you review. Once all checks pass, the grant clears for the team to start drafting.",
    placement: "top",
    roles: ["director", "board"],
  },
];

// ─── FUNDERS TAB TOUR ───
const FUNDERS_STEPS = [
  {
    id: "fund-intro",
    title: "Funder relationships",
    body: "All funders you've engaged with, grouped by organisation. See history across cycles, total asked vs total granted, momentum (hot / warm / cold), and the team member who owns each relationship.",
  },
  {
    id: "fund-grid",
    target: '[data-tour="funders-grid"]',
    title: "Funder cards",
    body: "Each card summarises one funder: applications, wins, losses, total relationship value, last activity. Click to expand and see every grant from that funder side by side.",
    placement: "top",
  },
];

// ─── SETTINGS TAB TOUR ───
const SETTINGS_STEPS = [
  {
    id: "set-intro",
    title: "Settings",
    body: "Your org profile, team, and compliance docs in one place. Keep these sharp — they directly shape what the AI knows about you and what it can claim in proposals.",
  },
  {
    id: "set-compliance",
    target: '[data-tour="settings-compliance"]',
    title: "Compliance documents",
    body: "Every cert and registration: PBO, NPO, B-BBEE, tax clearance, audited financials, ICITP. Status badges flag what's valid, expiring, or missing. Funders see this readiness score on every application.",
    placement: "top",
  },
  {
    id: "set-team",
    target: '[data-tour="settings-team"]',
    title: "Team & roles",
    body: "Add or remove team members and set their roles — director, board, head of programmes, programme manager, coordinator, comms. Each role unlocks different approvals and visibility.",
    placement: "top",
    roles: ["director"],
  },
];

// ─── ARCHIVE TAB TOUR ───
const ARCHIVE_STEPS = [
  {
    id: "ar-intro",
    title: "Proposal archive",
    body: "Every closed proposal in one place — Won, Lost, Deferred, and Not Relevant. The Pipeline shows active work; this tab is where you mine the past for what worked.",
  },
  {
    id: "ar-stats",
    title: "Top tiles",
    body: "Quick stats: total closed, won/lost counts, win rate, and total raised in ZAR. These update live as you close grants.",
  },
  {
    id: "ar-filters",
    title: "Filter chips",
    body: "Switch between All / Won / Lost / Deferred / Not Relevant. The search bar finds across funder name, grant name, notes, and funder feedback — useful when you want to find 'that one rejection from DGMT last year'.",
  },
  {
    id: "ar-draft-badge",
    title: "Reusable drafts",
    body: "Rows tagged with a 'DRAFT' pill have proposal text you can mine for reuse. Open one and click '★ Use as AI reference' on Won/Lost grants — the AI then studies it when drafting new proposals.",
  },
];

// ─── RESOURCES TAB TOUR ───
const RESOURCES_STEPS = [
  {
    id: "res-intro",
    title: "Nonprofit resources",
    body: "Curated freebies, discounts, and ad grants for verified nonprofits. Apply where eligible — most just need proof of NPO/PBO registration.",
  },
  {
    id: "res-categories",
    title: "Category filters",
    body: "Filter by AI credits, design tools (Canva, Adobe, Figma), advertising (Google Ad Grants, Microsoft Ads), productivity (Workspace, M365, Slack), cloud (AWS, GCP, Azure), and training. Each chip shows a live count.",
  },
  {
    id: "res-cards",
    title: "Apply directly",
    body: "Each card shows what the offer is, who's eligible, and any caveats. Click 'Apply / learn more →' to open the provider's nonprofit page. Most providers verify NPO status via Percent (formerly Goodstack) or TechSoup.",
  },
];

/* The tour registry. Each entry: { name, steps }. */
export const TOURS = {
  overview: { name: "Overview tour", steps: OVERVIEW_STEPS },
  pipeline: { name: "Pipeline features", steps: PIPELINE_STEPS },
  grantDetail: { name: "Grant detail features", steps: GRANT_DETAIL_STEPS },
  dashboard: { name: "Dashboard", steps: DASHBOARD_STEPS },
  docs: { name: "Documents", steps: DOCS_STEPS },
  calendar: { name: "Calendar", steps: CALENDAR_STEPS },
  vetting: { name: "Vetting", steps: VETTING_STEPS },
  funders: { name: "Funders", steps: FUNDERS_STEPS },
  archive: { name: "Archive", steps: ARCHIVE_STEPS },
  resources: { name: "Resources", steps: RESOURCES_STEPS },
  settings: { name: "Settings", steps: SETTINGS_STEPS },
};

/* Build the role-filtered step list for a tour.
 * `context` (optional) is passed to each step's `showWhen(context)` predicate,
 * letting steps skip themselves when their target UI isn't visible
 * (e.g. funder-feedback only shows on submitted+ grants). */
export const stepsForTour = (tourId, role, context = null) => {
  const tour = TOURS[tourId];
  if (!tour) return [];
  return tour.steps.filter(s => {
    if (s.roles && !s.roles.includes(role)) return false;
    if (typeof s.showWhen === "function" && !s.showWhen(context)) return false;
    return true;
  });
};

// ─── Persistence — track which tours each user has seen ───
const VERSION = "v3";
const overviewKey = (memberId, role) => `ge_tour_${VERSION}_overview_${memberId || "anon"}_${role || "guest"}`;

export const hasSeenOverview = (memberId, role) => {
  try { return localStorage.getItem(overviewKey(memberId, role)) === "true"; }
  catch { return true; } // fail closed — never auto-show if storage is broken
};

export const markOverviewSeen = (memberId, role) => {
  try { localStorage.setItem(overviewKey(memberId, role), "true"); } catch {}
};

export const resetOverview = (memberId, role) => {
  try { localStorage.removeItem(overviewKey(memberId, role)); } catch {}
};
