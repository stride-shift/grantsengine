import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

/*
 * CHARACTERIZATION / RENDER NET for GrantDetail.jsx (Phase 4.5 fan-out, 3rd component — the big one).
 *
 * GrantDetail (3092 lines) is the most coupled god component: it fires several effects AT MOUNT
 * (none behind a user action) and renders heavy stateful children. The net only needs to pin the
 * *mount surface*, so we neutralise everything that would touch the network or couple the snapshot
 * to a child's internals:
 *   - mock ../api  — getUploads/kvGet/kvSet run in mount effects (load uploads, load AI-ref ids);
 *     resolved to empty so they're inert.
 *   - mock the onRunAI / onUpdate callbacks — the auto-fetch-brief effect (3s setTimeout) and the
 *     _pendingAI effect call onRunAI; both are vi.fn(). The 3s timer never fires in a sync test
 *     (we fake ONLY Date, not setTimeout), and _pendingAI is left unset in the fixtures.
 *   - stub the heavy children ProposalWorkspace / BudgetBuilder / AutoFillPanel / UploadZone to
 *     markers — they own their own trees (and their own I/O); rendering the real ones would couple
 *     this net to code that isn't the split target.
 * Clock is pinned because deadline math (dL / Date diffs) and activity timestamps render relative
 * to "now" and would otherwise rot the golden master daily.
 *
 * Recorded against UN-split GrantDetail. The split target is the pure module-level leaf components
 * Card / Hd / Field / ActivityRow (used throughout GrantDetail's OWN body + activity log, not inside
 * the stubbed children) — so the populated snapshots below are the guard that proves their lift is
 * behaviour-neutral. SectionWrap is deliberately NOT a target: it must stay module-scoped (a stable
 * identity, or React remounts its children and wipes their local state — see the comment in the file).
 */

// Mock the api module — getUploads/kvGet/kvSet fire in mount effects; keep them inert.
vi.mock("../api", () => ({
  getUploads: vi.fn(() => Promise.resolve([])),
  kvGet: vi.fn(() => Promise.resolve([])),
  kvSet: vi.fn(() => Promise.resolve()),
}));
// Stub the heavy stateful children — they own their own trees/I/O and are not the split target.
vi.mock("../components/ProposalWorkspace", () => ({ default: () => <div data-testid="proposal-workspace-stub" /> }));
vi.mock("../components/BudgetBuilder", () => ({ default: () => <div data-testid="budget-builder-stub" /> }));
vi.mock("../components/AutoFillPanel", () => ({ default: () => <div data-testid="autofill-stub" /> }));
vi.mock("../components/UploadZone", () => ({ default: () => <div data-testid="uploadzone-stub" /> }));

import GrantDetail from "../components/GrantDetail";

const STAGES = [
  { id: "scouted", label: "Scouted", c: "#3B82F6" },
  { id: "vetting", label: "Vetting", c: "#6366F1" },
  { id: "qualifying", label: "Qualifying", c: "#3B82F6" },
  { id: "drafting", label: "Drafting", c: "#F59E0B" },
  { id: "review", label: "Review", c: "#EC4899" },
  { id: "submitted", label: "Submitted", c: "#8B5CF6" },
  { id: "awaiting", label: "Awaiting", c: "#0891B2" },
  { id: "won", label: "Won", c: "#10B981" },
  { id: "lost", label: "Lost", c: "#EF4444" },
];

const TEAM = [
  { id: "team", name: "Unassigned", initials: "—", ini: "—" },
  { id: "ali", name: "Alison Jacobson", initials: "AJ", ini: "AJ", c: "#3B82F6", role: "pm" },
  { id: "dir", name: "David Kramer", initials: "DK", ini: "DK", c: "#10B981", role: "director" },
];

const FUNDER_TYPES = ["Foundation", "Corporate CSI"];

const CURRENT_MEMBER = { id: "ali", name: "Alison Jacobson", role: "pm", ini: "AJ" };

// A grant with the fields GrantDetail reads at mount. Sparse AI fields so the early-stage CTAs
// (not the proposal workspace) render; log entries so ActivityRow renders and is guarded.
const grant = (over) => ({
  id: "g0", name: "Grant", funder: "Funder", type: "Foundation", stage: "scouted",
  ask: 1000000, deadline: "2026-09-30", owner: "ali", market: "sa", rel: "Cold", pri: 3,
  hrs: 0, focus: [], geo: [], on: "", of: [], notes: "", source: "scout",
  log: [{ d: "2026-01-15", t: "Grant created", by: "ali" }, { d: "2026-02-01", t: "Moved to vetting", by: "dir" }],
  fups: [], docs: {},
  ...over,
});

const handlers = () => ({
  onUpdate: vi.fn(), onDelete: vi.fn(), onAddGrant: vi.fn(), onSelectGrant: vi.fn(),
  onBack: vi.fn(), onRunAI: vi.fn(() => Promise.resolve("")), onUploadsChanged: vi.fn(),
  onLaunchTour: vi.fn(),
});

const renderDetail = (g, h) =>
  render(
    <GrantDetail
      grant={g} team={TEAM} stages={STAGES} funderTypes={FUNDER_TYPES}
      complianceDocs={[]} currentMember={CURRENT_MEMBER} orgName="d-lab NPC" {...h}
    />
  );

// jsdom has no layout, so Element.prototype.scrollIntoView is undefined. The context
// sidebar's "Jump to" anchors and the status strip's readiness button both call it on a
// resolved data-tour target. Stub it per-test so we can assert the scroll wiring fires —
// this is the behaviour-survival guard for the Phase 4.6 extraction of those two bodies into
// props-only sub-components (the snapshot proves output-per-prop; this proves the handler).
let scrollSpy;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-06-18T09:00:00Z"));
  scrollSpy = vi.fn();
  Element.prototype.scrollIntoView = scrollSpy;
});
afterEach(() => vi.useRealTimers());

describe("GrantDetail — early stage (scouted)", () => {
  it("renders the grant name, stage, and back-to-pipeline control", () => {
    const h = handlers();
    renderDetail(grant({ id: "g1", name: "Youth Skills 2026", funder: "GIDF", stage: "scouted" }), h);
    expect(screen.getAllByText("Youth Skills 2026").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Scouted").length).toBeGreaterThan(0);
  });

  it("clicking the breadcrumb back-control calls onBack", () => {
    const h = handlers();
    renderDetail(grant({ id: "g1", name: "Youth Skills 2026", stage: "scouted" }), h);
    fireEvent.click(screen.getByText(/Pipeline/));
    expect(h.onBack).toHaveBeenCalled();
  });

  it("DOM snapshot — early stage (golden master)", () => {
    const h = handlers();
    const { container } = renderDetail(
      grant({ id: "g1", name: "Youth Skills 2026", funder: "GIDF", stage: "scouted", ask: 4970000, deadline: "2026-09-30" }),
      h
    );
    expect(container).toMatchSnapshot();
  });
});

describe("GrantDetail — scroll-anchor handlers (guard the sidebar + status-strip extraction)", () => {
  it("context sidebar 'Jump to' anchor scrolls its target into view", () => {
    const h = handlers();
    renderDetail(grant({ id: "g1", name: "Youth Skills 2026", stage: "drafting" }), h);
    expect(scrollSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("→ About this grant"));
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  });

  it("status strip readiness button scrolls to outstanding actions", () => {
    const h = handlers();
    renderDetail(grant({ id: "g1", name: "Youth Skills 2026", stage: "drafting" }), h);
    expect(scrollSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("Jump to outstanding actions"));
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  });
});

describe("GrantDetail — middle stage (drafting), guards Card/Field/Hd + child stubs", () => {
  it("DOM snapshot — drafting (golden master)", () => {
    const h = handlers();
    const { container } = renderDetail(
      grant({ id: "g2", name: "Corporate Accelerator", funder: "CCBA", stage: "drafting", ask: 651000, deadline: "2026-08-15" }),
      h
    );
    expect(container).toMatchSnapshot();
  });
});

describe("GrantDetail — closed stage (won), guards ActivityRow + closed branches", () => {
  it("DOM snapshot — won (golden master)", () => {
    const h = handlers();
    const { container } = renderDetail(
      grant({ id: "g3", name: "FET Programme", funder: "DGMT", stage: "won", ask: 1080000, deadline: null,
        log: [{ d: "2026-01-15", t: "Grant created", by: "ali" }, { d: "2026-03-01", t: "Marked won", by: "dir" }] }),
      h
    );
    expect(container).toMatchSnapshot();
  });
});
