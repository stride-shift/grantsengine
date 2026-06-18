// GOLDEN-MASTER characterization net for the runAI prompt builders in src/hooks/useAI.js.
//
// Why this exists: Phase 3 extracts ~1,100 lines of inline prompt-building out of useAI.js into
// per-concern modules under src/prompts/. Those blocks have no test coverage and close over many
// local variables — a dropped/renamed variable during the move would change a prompt INVISIBLY
// (AI output is non-deterministic, so nothing would catch it downstream). This test pins the EXACT
// (system, user, search, maxTokens) tuple runAI passes to `api()` for every prompt type. The
// snapshots are captured from the CURRENT inline code; after extraction they must reproduce
// byte-for-byte, or the move was not behaviour-preserving.
//
// Mechanics: we mock react's useRef (so the hook runs outside a renderer), mock ../api so `api`
// records its 4 args instead of calling OpenAI, mock the uploads/learnings/kv fetches to resolve
// empty (deterministic context), and pin the clock so the date-stamped prompts (brief/report/
// insights/strategy) are stable.

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

vi.mock("react", () => ({ useRef: (v) => ({ current: v }) }));

vi.mock("../api", () => ({
  // api just echoes what it was handed — that tuple IS the thing under test.
  api: (system, user, search, maxTokens) => ({ system, user, search, maxTokens }),
  getUploadsContext: async () => ({ grant_uploads: [], org_uploads: [] }),
  getUploadsByCategory: async () => ({}),
  getUploadFull: async () => null,
  kvGet: async () => null,
}));

vi.mock("../editLearner", () => ({ getWritingLearnings: async () => "" }));

import useAI from "../hooks/useAI";

// ── Fixtures ──────────────────────────────────────────────────────────────
const org = { name: "TestOrg NPC" };

const profile = {
  context_slim: "TestOrg trains unemployed youth in digital skills.",
  programmes: [
    { name: "Standard Cohort", cost: 516000, students: 20, duration: "9 months", description: "Partner-funded coaching." },
    { name: "FET Programme", cost: 1079742, students: 60, duration: "3 years" },
  ],
  impact_stats: {
    completion_rate: 0.92, sector_average_completion: 0.55,
    employment_rate: 0.85, employment_window_months: 3, learners_trained: "60+",
  },
  tone: "Warm, confident, specific.",
  anti_patterns: "No hollow phrases.",
  past_funders: "GIDF, TK Foundation",
};

const team = [
  { id: "team" },
  { id: "d1", role: "director", name: "Dir One", persona: "strategic" },
  { id: "d2", role: "director", name: "Dir Two" },
  { id: "s1", role: "coach", name: "Staff One", persona: "warm" },
];

const stages = [
  { id: "scouted", label: "Scouted" },
  { id: "qualified", label: "Qualified" },
  { id: "drafting", label: "Drafting" },
  { id: "submitted", label: "Submitted" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
];

const budgetTable = {
  years: 1, cohorts: 1, studentsPerCohort: 20, perStudent: 61800, total: 1236000,
  typeNum: 3, typeLabel: "Standard Cohort — With Stipends", duration: "9 months",
  items: [
    { label: "Base programme", amount: 516000 },
    { label: "Stipends", amount: 720000 },
  ],
  includeOrgContribution: true, totalOrgContribution: 370800, orgContribution: 370800,
  annualTotal: 1236000,
};

// One rich grant exercises the populated branches across most prompt types.
const grant = {
  id: "g1",
  name: "Skills Acceleration Grant",
  funder: "Acme Foundation",
  type: "Foundation",
  ask: 1236000,
  funderBudget: 1500000,
  rel: "Cold",
  stage: "drafting",
  deadline: "2026-07-15",
  subDate: "2026-06-01",
  geo: ["Gauteng"],
  focus: ["youth-employment", "digital-skills"],
  notes: "Team intel: warm contact via board. Pasted funder email follows — they asked for our audited financials and confirmed a R1-2M envelope for skills work this cycle.",
  funderBrief: "Acme funds youth digital-skills programmes. Deadline 15 July. Max R2M. Submit audited financials and a board resolution.",
  funderFeedback: "Last round: budget felt high; wanted more employment evidence.",
  budgetTable,
  aiResearch: "Acme gives R1-2M annually, prefers 9-month interventions, CSI lead is Jane.",
  aiFitscore: "SCORE: 78\nVERDICT: Good Fit",
};

// A pipeline of grants for the aggregate prompts (brief/report/insights/strategy).
const grants = [
  grant,
  { id: "g2", name: "Corporate Leaders", funder: "BigCorp", type: "Corporate CSI", ask: 651000, rel: "Warm Intro", stage: "submitted", deadline: "2026-06-25", owner: "d1", focus: ["entrepreneurship"] },
  { id: "g3", name: "Rural STEM", funder: "GovSETA", type: "Government/SETA", ask: 1079742, rel: "Cold", stage: "drafting", deadline: "2026-06-10", owner: "d2", focus: ["STEM", "rural-dev"], notes: "Type 4" },
  { id: "g4", name: "Won Deal", funder: "GIDF", type: "Foundation", ask: 4970000, rel: "Previous Funder", stage: "won", focus: ["youth-employment"] },
  { id: "g5", name: "Lost Bid", funder: "ColdCo", type: "Tech Company", ask: 300000, rel: "Cold", stage: "lost", focus: ["AI/4IR"] },
  { id: "g6", name: "No Deadline", funder: "Mystery", type: "Foundation", ask: 0, funderBudget: 800000, rel: "Networking", stage: "scouted", focus: [] },
];

function makeRunAI() {
  return useAI({ org, profile, team, grants, stages }).runAI;
}

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-18T08:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
});

describe("runAI prompt builders — golden master", () => {
  it("draft", async () => {
    const runAI = makeRunAI();
    expect(await runAI("draft", grant, "Prior research blob about Acme.", "SCORE: 78\nVERDICT: Good Fit")).toMatchSnapshot();
  });

  it("sectionDraft", async () => {
    const runAI = makeRunAI();
    const sectionMeta = {
      sectionName: "Budget",
      sectionIndex: 2,
      totalSections: 6,
      allSections: ["Cover Letter", "Executive Summary", "Budget", "Our Approach", "Impact", "Appendices"],
      completedSections: {
        "Cover Letter": { text: '"For R61,800 per student we deliver." Siphumezo Adam graduated in 2024 with a 92% completion cohort.' },
      },
      customInstructions: "Emphasise the 30% org contribution.",
    };
    expect(await runAI("sectionDraft", grant, sectionMeta, { fitscore: "SCORE: 78\nVERDICT: Good Fit", research: "Acme research." })).toMatchSnapshot();
  });

  it("conceptNote", async () => {
    const runAI = makeRunAI();
    expect(await runAI("conceptNote", grant)).toMatchSnapshot();
  });

  it("research", async () => {
    const runAI = makeRunAI();
    expect(await runAI("research", grant)).toMatchSnapshot();
  });

  it("followup", async () => {
    const runAI = makeRunAI();
    expect(await runAI("followup", grant)).toMatchSnapshot();
  });

  it("extractRequiredDocs", async () => {
    const runAI = makeRunAI();
    expect(await runAI("extractRequiredDocs", grant)).toMatchSnapshot();
  });

  it("extractEmailFeedback", async () => {
    const runAI = makeRunAI();
    expect(await runAI("extractEmailFeedback", grant)).toMatchSnapshot();
  });

  it("extractNotes", async () => {
    const runAI = makeRunAI();
    expect(await runAI("extractNotes", grant)).toMatchSnapshot();
  });

  it("fitscore", async () => {
    const runAI = makeRunAI();
    expect(await runAI("fitscore", grant)).toMatchSnapshot();
  });

  it("brief", async () => {
    const runAI = makeRunAI();
    expect(await runAI("brief", grant)).toMatchSnapshot();
  });

  it("winloss (won)", async () => {
    const runAI = makeRunAI();
    expect(await runAI("winloss", grant, "won")).toMatchSnapshot();
  });

  it("winloss (lost)", async () => {
    const runAI = makeRunAI();
    expect(await runAI("winloss", grant, "lost")).toMatchSnapshot();
  });

  it("fetchFunderBrief", async () => {
    const runAI = makeRunAI();
    expect(await runAI("fetchFunderBrief", grant)).toMatchSnapshot();
  });

  it("findApplyUrl", async () => {
    const runAI = makeRunAI();
    expect(await runAI("findApplyUrl", grant)).toMatchSnapshot();
  });

  it("urlextract", async () => {
    const runAI = makeRunAI();
    expect(await runAI("urlextract", grant, "https://acme.org/grants/skills")).toMatchSnapshot();
  });

  it("report", async () => {
    const runAI = makeRunAI();
    expect(await runAI("report", grant)).toMatchSnapshot();
  });

  it("insights", async () => {
    const runAI = makeRunAI();
    expect(await runAI("insights", grant)).toMatchSnapshot();
  });

  it("strategy", async () => {
    const runAI = makeRunAI();
    expect(await runAI("strategy", grant)).toMatchSnapshot();
  });
});
