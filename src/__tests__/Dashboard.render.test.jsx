import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Dashboard from "../components/Dashboard";

/*
 * CHARACTERIZATION / RENDER NET for Dashboard.jsx (Phase 4.5, first proven net).
 *
 * Dashboard is a pure prop-driven view — zero ../api, ../hooks/useAI, or context
 * imports — which is why it's the cheapest first target. Nothing is mocked; we only
 * pin the clock, because the header (`new Date().toLocaleDateString`) and deadline
 * math (`dL`/`deadlineCtx`) render relative to "now" and would otherwise rot the
 * golden-master snapshot daily.
 *
 * We fake ONLY Date (not setTimeout/etc.) so @testing-library/react's async
 * machinery keeps working on real timers.
 *
 * This recording is made against UN-refactored Dashboard. When Dashboard is later
 * split (move-only), these snapshots + interactions must stay green — that is the
 * whole point of the net. If a split legitimately changes the DOM, the snapshot diff
 * is the review surface; never bless a diff without confirming it's behaviour-neutral.
 */

const STAGES = [
  { id: "scouted", label: "Scouted", c: "#3B82F6", bg: "#EFF6FF" },
  { id: "qualifying", label: "Qualifying", c: "#3B82F6", bg: "#EFF6FF" },
  { id: "drafting", label: "Drafting", c: "#F59E0B", bg: "#FFFBEB" },
  { id: "review", label: "Review", c: "#EC4899", bg: "#FCE7F3" },
  { id: "submitted", label: "Submitted", c: "#8B5CF6", bg: "#F3E8FF" },
  { id: "won", label: "Won", c: "#10B981", bg: "#ECFDF5" },
  { id: "lost", label: "Lost", c: "#EF4444", bg: "#FEE2E2" },
];

const TEAM = [
  { id: "team", name: "Unassigned", initials: "—" },
  { id: "ali", name: "Alison Jacobson", initials: "AJ" },
];

// A small but realistic pipeline. The "drafting / no deadline / owner team" grant is
// GUARANTEED to surface as an urgent card via urgentGrants case 3 ("No deadline set"),
// independent of the pinned clock — that's our interaction target.
const grant = (over) => ({
  id: "g0", name: "Grant", funder: "Funder", type: "Foundation", stage: "scouted",
  ask: 100000, deadline: null, owner: "team", market: "sa", rel: "Cold", pri: 3,
  hrs: 0, focus: [], geo: [], on: "", of: [], notes: "",
  log: [{ d: "2026-01-01", t: "created" }], fups: [], docs: {},
  ...over,
});

const GRANTS = [
  grant({ id: "g1", name: "Youth Skills 2026", funder: "GIDF", stage: "drafting", ask: 4970000, deadline: null, owner: "team" }),
  grant({ id: "g2", name: "Corporate Accelerator", funder: "CCBA", stage: "submitted", ask: 651000, deadline: "2026-09-30", owner: "ali" }),
  grant({ id: "g3", name: "FET Programme", funder: "DGMT", stage: "won", ask: 1080000, deadline: null, owner: "ali" }),
];

const handlers = () => ({
  onSelectGrant: vi.fn(), onNavigate: vi.fn(),
  onRunReport: vi.fn(), onRunInsights: vi.fn(), onRunStrategy: vi.fn(),
  onLaunchTour: vi.fn(),
});

beforeEach(() => {
  // Fake ONLY Date so deadline/header rendering is deterministic; leave timers real.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-18T09:00:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("Dashboard — empty state", () => {
  it("shows the onboarding panel when there are no grants", () => {
    const h = handlers();
    render(<Dashboard grants={[]} team={TEAM} stages={STAGES} orgName="d-lab NPC" {...h} />);
    expect(screen.getByText("Welcome to Grants Engine")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Go to Pipeline/ })).toBeInTheDocument();
  });

  it("'Go to Pipeline' navigates to the pipeline view", () => {
    const h = handlers();
    render(<Dashboard grants={[]} team={TEAM} stages={STAGES} orgName="d-lab NPC" {...h} />);
    fireEvent.click(screen.getByRole("button", { name: /Go to Pipeline/ }));
    expect(h.onNavigate).toHaveBeenCalledWith("pipeline");
  });

  it("DOM snapshot — empty state (golden master)", () => {
    const h = handlers();
    const { container } = render(<Dashboard grants={[]} team={TEAM} stages={STAGES} orgName="d-lab NPC" {...h} />);
    expect(container).toMatchSnapshot();
  });
});

describe("Dashboard — populated", () => {
  it("renders the Today header and core sections", () => {
    const h = handlers();
    render(<Dashboard grants={GRANTS} team={TEAM} stages={STAGES} orgName="d-lab NPC" {...h} />);
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("Needs Attention")).toBeInTheDocument();
  });

  it("clicking an urgent grant card selects that grant", () => {
    const h = handlers();
    render(<Dashboard grants={GRANTS} team={TEAM} stages={STAGES} orgName="d-lab NPC" {...h} />);
    // g1 (drafting, no deadline, owner team) is an urgent card; clicking it bubbles to onSelectGrant.
    fireEvent.click(screen.getByText("Youth Skills 2026"));
    expect(h.onSelectGrant).toHaveBeenCalledWith("g1");
  });

  it("DOM snapshot — populated dashboard (golden master)", () => {
    const h = handlers();
    const { container } = render(<Dashboard grants={GRANTS} team={TEAM} stages={STAGES} orgName="d-lab NPC" {...h} />);
    expect(container).toMatchSnapshot();
  });
});

describe("Dashboard — Funder Intelligence cards (guards the props-only extraction)", () => {
  // The funder name appears in several sections (urgent / In Play / the funder card).
  // The Funder Intelligence block is LAST in source order, so the funder-card occurrence
  // is the last match — `.at(-1)` targets it without a brittle test-id. These three tests
  // pin the only behaviours the block owns (expand toggle, show-all toggle, grant-row
  // select with stopPropagation) so the Phase 4.6 lift into DashboardParts is guarded
  // beyond the static snapshot.
  const lastFunderCard = (name) => screen.getAllByText(name).at(-1);

  it("clicking a funder card expands its detail panel; clicking again collapses it", () => {
    const h = handlers();
    render(<Dashboard grants={GRANTS} team={TEAM} stages={STAGES} orgName="d-lab NPC" {...h} />);
    // GIDF (g1 Youth Skills, drafting, no research, active) — its expanded panel shows a
    // deterministic action hint that exists ONLY when the card is expanded.
    expect(screen.queryByText(/No funder research yet/)).not.toBeInTheDocument();
    fireEvent.click(lastFunderCard("GIDF"));
    expect(screen.getByText(/No funder research yet/)).toBeInTheDocument();
    fireEvent.click(lastFunderCard("GIDF"));
    expect(screen.queryByText(/No funder research yet/)).not.toBeInTheDocument();
  });

  it("'Show all N funders' toggles the funder list expansion label", () => {
    const h = handlers();
    render(<Dashboard grants={GRANTS} team={TEAM} stages={STAGES} orgName="d-lab NPC" {...h} />);
    const toggle = screen.getByText(/Show all 3 funders/);
    fireEvent.click(toggle);
    expect(screen.getByText("Collapse")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Collapse"));
    expect(screen.getByText(/Show all 3 funders/)).toBeInTheDocument();
  });

  it("clicking a grant in an expanded funder panel selects it without collapsing the card", () => {
    const h = handlers();
    render(<Dashboard grants={GRANTS} team={TEAM} stages={STAGES} orgName="d-lab NPC" {...h} />);
    fireEvent.click(lastFunderCard("GIDF"));
    expect(screen.getByText(/No funder research yet/)).toBeInTheDocument();
    // The grant row inside the expanded panel is the last "Youth Skills 2026" in the DOM;
    // its onClick stops propagation, so it selects without re-triggering the card toggle.
    fireEvent.click(screen.getAllByText("Youth Skills 2026").at(-1));
    expect(h.onSelectGrant).toHaveBeenCalledWith("g1");
    expect(screen.getByText(/No funder research yet/)).toBeInTheDocument();
  });
});
