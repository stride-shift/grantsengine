import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

/*
 * CHARACTERIZATION / RENDER NET for Pipeline.jsx (Phase 4.5 fan-out, 2nd component).
 *
 * Pipeline is heavier than Dashboard: it imports `uploadFile` from ../api and renders
 * <ScoutPanel/> (which itself calls the AI proxy). NONE of that runs at mount — uploadFile
 * (handleDrop), onRunAI (fit-score / url-extract), and api (ScoutPanel) are all user-action
 * paths. So to net the mount surface we only:
 *   - mock ../api so the import resolves without touching the network, and
 *   - stub ./ScoutPanel to a marker, so `api`/`orgContext` are never exercised and the
 *     snapshot stays stable regardless of ScoutPanel internals.
 * The clock is pinned because deadline math (`dL`) and the kanban "NEW" badge (`Date.now()`)
 * render relative to "now" and would otherwise rot the golden master daily.
 *
 * Recorded against UN-split Pipeline. The split target is the two pure module-level leaf
 * components ReadinessChips + GateIndicator, which render ONLY in the kanban (Board) view —
 * hence the Board snapshot below is the guard that proves their lift is behaviour-neutral.
 */

// Mock the api module (uploadFile import) — not called at mount, but keeps the import inert.
vi.mock("../api", () => ({ uploadFile: vi.fn(() => Promise.resolve({})) }));
// Stub ScoutPanel — it owns the AI `api` prop; rendering the real one would couple the net
// to ScoutPanel's tree. A marker keeps Pipeline's own DOM the thing under test.
vi.mock("../components/ScoutPanel", () => ({ default: () => <div data-testid="scout-stub" /> }));

import Pipeline from "../components/Pipeline";

const STAGES = [
  { id: "scouted", label: "Scouted", c: "#3B82F6", bg: "#EFF6FF" },
  { id: "vetting", label: "Vetting", c: "#6366F1", bg: "#EEF2FF" },
  { id: "qualifying", label: "Qualifying", c: "#3B82F6", bg: "#EFF6FF" },
  { id: "drafting", label: "Drafting", c: "#F59E0B", bg: "#FFFBEB" },
  { id: "review", label: "Review", c: "#EC4899", bg: "#FCE7F3" },
  { id: "submitted", label: "Submitted", c: "#8B5CF6", bg: "#F3E8FF" },
  { id: "awaiting", label: "Awaiting", c: "#0891B2", bg: "#ECFEFF" },
  { id: "won", label: "Won", c: "#10B981", bg: "#ECFDF5" },
  { id: "lost", label: "Lost", c: "#EF4444", bg: "#FEE2E2" },
];

const TEAM = [
  { id: "team", name: "Unassigned", initials: "—" },
  { id: "ali", name: "Alison Jacobson", initials: "AJ", role: "pm" },
  { id: "dir", name: "David Kramer", initials: "DK", role: "director" },
];

const FUNDER_TYPES = ["Foundation", "Corporate CSI"];

// Sparse grants (no aiFitscore/aiResearch/aiDraft) → grantReadiness reports missing items,
// so ReadinessChips renders. GateIndicator branches exercised across the fixtures:
//   - g1 scouted, owner pm → "Communications needed" (the gate's `need` role "comms" is
//     level 0, and the code's `?.level || 99` treats 0 as falsy → always approval-needed;
//     pre-existing behaviour, characterized here, NOT fixed — logic work is parked).
//   - g2 drafting, owner pm (level 1) < hop (level 2) → "Head of Programmes needed".
//   - g4 drafting, owner director (level 3) ≥ hop (level 2) → "Can advance".
const grant = (over) => ({
  id: "g0", name: "Grant", funder: "Funder", type: "Foundation", stage: "scouted",
  ask: 100000, deadline: null, owner: "ali", market: "sa", rel: "Cold", pri: 3,
  hrs: 0, focus: [], geo: [], on: "", of: [], notes: "", source: "scout",
  log: [{ d: "2026-01-01", t: "created" }], fups: [], docs: {},
  ...over,
});

const GRANTS = [
  grant({ id: "g1", name: "Youth Skills 2026", funder: "GIDF", stage: "scouted", ask: 4970000, deadline: "2026-09-30" }),
  grant({ id: "g2", name: "Corporate Accelerator", funder: "CCBA", stage: "drafting", ask: 651000, deadline: "2026-08-15", owner: "ali" }),
  grant({ id: "g4", name: "Board Initiative", funder: "RMB", stage: "drafting", ask: 516000, deadline: "2026-10-01", owner: "dir" }),
  grant({ id: "g3", name: "FET Programme", funder: "DGMT", stage: "won", ask: 1080000, deadline: null, owner: "ali" }),
];

const handlers = () => ({
  onSelectGrant: vi.fn(), onUpdateGrant: vi.fn(), onAddGrant: vi.fn(),
  onRunAI: vi.fn(), api: vi.fn(), onToast: vi.fn(), onLaunchTour: vi.fn(),
});

const renderPipeline = (grants, h) =>
  render(
    <Pipeline
      grants={grants} team={TEAM} stages={STAGES} funderTypes={FUNDER_TYPES}
      complianceDocs={[]} orgContext="" {...h}
    />
  );

// Switch the pipeline view via its <select> (the one currently showing "list").
const switchView = (value) => {
  const viewSelect = screen.getAllByRole("combobox").find((s) => s.value === "list" || s.value === value);
  fireEvent.change(viewSelect, { target: { value } });
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-18T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("Pipeline — no grants", () => {
  it("renders the toolbar + Scout panel and no kanban/list when there are zero grants", () => {
    const h = handlers();
    renderPipeline([], h);
    // With zero grants the onboarding is owned by ScoutPanel (here a stub). Pipeline's own
    // "No matching grants" block is the FILTERED-empty state (grants.length > 0) — so it
    // must NOT appear here. This characterizes the zero-grants branch faithfully.
    expect(screen.getByTestId("scout-stub")).toBeInTheDocument();
    expect(screen.queryByText("No matching grants")).toBeNull();
  });

  it("DOM snapshot — no grants (golden master)", () => {
    const h = handlers();
    const { container } = renderPipeline([], h);
    expect(container).toMatchSnapshot();
  });
});

describe("Pipeline — populated, list view (default)", () => {
  it("renders grant rows in the default list view", () => {
    const h = handlers();
    renderPipeline(GRANTS, h);
    expect(screen.getByText("Youth Skills 2026")).toBeInTheDocument();
    expect(screen.getByText("Corporate Accelerator")).toBeInTheDocument();
  });

  it("DOM snapshot — list view (golden master)", () => {
    const h = handlers();
    const { container } = renderPipeline(GRANTS, h);
    expect(container).toMatchSnapshot();
  });
});

describe("Pipeline — kanban (Board) view — guards ReadinessChips + GateIndicator", () => {
  it("DOM snapshot — Board view (golden master)", () => {
    const h = handlers();
    const { container } = renderPipeline(GRANTS, h);
    switchView("kanban");
    // ReadinessChips ("No fit score" etc.) and GateIndicator only render here — this
    // snapshot is the split's guard. "Can advance" comes from g4 (director-owned drafting),
    // the only fixture that satisfies the gate; its presence proves the canSelf branch rendered.
    expect(screen.getByText("Can advance")).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it("clicking a kanban card selects that grant", () => {
    const h = handlers();
    renderPipeline(GRANTS, h);
    switchView("kanban");
    fireEvent.click(screen.getByText("Youth Skills 2026"));
    expect(h.onSelectGrant).toHaveBeenCalledWith("g1");
  });
});
