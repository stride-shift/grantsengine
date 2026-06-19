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

describe("Pipeline — Add Grant wizard (guards the AddGrantWizard extraction)", () => {
  // The wizard is closed at mount (showAdd=false), so the existing snapshots don't
  // cover it. Before lifting it into its own module-scope component, these tests pin
  // every behaviour it owns: open/close, 3-step navigation, the create-grant payload
  // (onAddGrant), the auto-AI select path (onSelectGrant), Cancel-resets-the-form, and
  // — critically — that the half-filled form PERSISTS across a +Add toggle-close (the
  // form state currently lives in Pipeline, not in a conditionally-mounted child). That
  // last test locks the extraction SHAPE: the lifted component must stay mounted with an
  // `open` prop, not be conditionally rendered (which would wipe the form on every toggle).
  const openWizard = () => fireEvent.click(screen.getByRole("button", { name: "+ Add" }));
  const isOpen = () => screen.queryByPlaceholderText("Grant name") !== null;
  // Drive step 1 → step 3 with a given name/funder, leaving the override-ask set so the
  // created grant's `ask` is deterministic (no programme-grid clicks needed).
  const fillToStep3 = ({ name, funder, ask }) => {
    fireEvent.change(screen.getByPlaceholderText("Grant name"), { target: { value: name } });
    fireEvent.change(screen.getByPlaceholderText("Funder name"), { target: { value: funder } });
    fireEvent.click(screen.getByRole("button", { name: "Next" })); // step 1 → 2
    if (ask != null) fireEvent.change(screen.getByPlaceholderText("R amount"), { target: { value: String(ask) } });
    fireEvent.click(screen.getByRole("button", { name: "Next" })); // step 2 → 3
  };

  it("'+ Add' opens the wizard at step 1; the Next button is disabled until name + funder are set", () => {
    const h = handlers();
    renderPipeline(GRANTS, h);
    expect(isOpen()).toBe(false);
    openWizard();
    expect(isOpen()).toBe(true);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText("Grant name"), { target: { value: "X" } });
    fireEvent.change(screen.getByPlaceholderText("Funder name"), { target: { value: "Y" } });
    expect(screen.getByRole("button", { name: "Next" })).not.toBeDisabled();
  });

  it("navigates step 1 → 2 → 3 (override-ask field then the auto-run summary)", () => {
    const h = handlers();
    renderPipeline(GRANTS, h);
    openWizard();
    fireEvent.change(screen.getByPlaceholderText("Grant name"), { target: { value: "Test Grant" } });
    fireEvent.change(screen.getByPlaceholderText("Funder name"), { target: { value: "Test Funder" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByPlaceholderText("R amount")).toBeInTheDocument(); // step 2 marker
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Auto-run after creation")).toBeInTheDocument(); // step 3 marker
  });

  it("'Just Add' creates the grant with the entered fields and closes the wizard", () => {
    const h = handlers();
    renderPipeline(GRANTS, h);
    openWizard();
    fillToStep3({ name: "Test Grant", funder: "Test Funder", ask: 750000 });
    fireEvent.click(screen.getByRole("button", { name: "Just Add" }));
    expect(h.onAddGrant).toHaveBeenCalledTimes(1);
    expect(h.onAddGrant).toHaveBeenCalledWith(expect.objectContaining({
      name: "Test Grant", funder: "Test Funder", type: "Foundation",
      stage: "scouted", ask: 750000, market: "sa", source: "scout",
      rel: "Cold", owner: "team",
    }));
    expect(isOpen()).toBe(false); // resetWizard closed it
  });

  it("'Add & Run AI' creates the grant AND selects it (auto-AI default → _pendingAI)", () => {
    const h = handlers();
    renderPipeline(GRANTS, h);
    openWizard();
    fillToStep3({ name: "AI Grant", funder: "AI Funder", ask: 100000 });
    fireEvent.click(screen.getByRole("button", { name: "Add & Run AI" }));
    expect(h.onAddGrant).toHaveBeenCalledTimes(1);
    const created = h.onAddGrant.mock.calls[0][0];
    expect(h.onSelectGrant).toHaveBeenCalledWith(created.id);
  });

  it("Cancel closes + resets the wizard to step 1 (name/funder PERSIST — pre-existing quirk, characterized not fixed)", () => {
    // resetWizard() resets wizStep + the step-2/3 fields, but deliberately does NOT clear
    // newName/newFunder. We record that real behaviour rather than the intuitive "all
    // fields clear" — the extraction must preserve it byte-for-byte.
    const h = handlers();
    renderPipeline(GRANTS, h);
    openWizard();
    fireEvent.change(screen.getByPlaceholderText("Grant name"), { target: { value: "Keep Me" } });
    fireEvent.change(screen.getByPlaceholderText("Funder name"), { target: { value: "Keep Funder" } });
    fireEvent.click(screen.getByRole("button", { name: "Next" })); // advance to step 2
    expect(screen.getByPlaceholderText("R amount")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(isOpen()).toBe(false);
    openWizard();
    // Back at step 1 (step-2's "R amount" gone), and name/funder retained.
    expect(screen.queryByPlaceholderText("R amount")).toBeNull();
    expect(screen.getByPlaceholderText("Grant name")).toHaveValue("Keep Me");
    expect(screen.getByPlaceholderText("Funder name")).toHaveValue("Keep Funder");
  });

  it("a half-filled form PERSISTS across a +Add toggle-close/reopen (locks the lifted-component shape)", () => {
    const h = handlers();
    renderPipeline(GRANTS, h);
    openWizard();
    fireEvent.change(screen.getByPlaceholderText("Grant name"), { target: { value: "Persisted" } });
    openWizard(); // +Add is a toggle → closes WITHOUT resetWizard
    expect(isOpen()).toBe(false);
    openWizard(); // reopen
    expect(screen.getByPlaceholderText("Grant name")).toHaveValue("Persisted");
  });

  it("DOM snapshot — add wizard open at step 1 (golden master)", () => {
    const h = handlers();
    const { container } = renderPipeline(GRANTS, h);
    openWizard();
    expect(container).toMatchSnapshot();
  });
});
