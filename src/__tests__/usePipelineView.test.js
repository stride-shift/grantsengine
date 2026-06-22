// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/api", () => ({ uploadFile: vi.fn() }));

import usePipelineView from "@/hooks/usePipelineView";

const STAGES = [
  { id: "scouted", label: "Scouted", c: "#000", bg: "#eee" },
  { id: "vetting", label: "Vetting", c: "#000", bg: "#eee" },
  { id: "won", label: "Won", c: "#000", bg: "#eee" },
];
const TEAM = [
  { id: "team", name: "Unassigned", initials: "—" },
  { id: "u1", name: "Alison", initials: "AJ" },
  { id: "u2", name: "Nolan", initials: "NB" },
];

// A small but representative grant set
const grants = [
  { id: "a", name: "Alpha Fund", funder: "Foundation X", type: "Foundation", stage: "scouted", ask: 500000, deadline: "2026-12-01", owner: "u1", market: "sa", focus: ["Youth"], log: [{ d: "2026-06-20" }] },
  { id: "b", name: "Beta Grant", funder: "Corp Y", type: "Corporate", stage: "vetting", ask: 1000000, deadline: "2026-07-01", owner: "u2", market: "global", focus: ["AI"], log: [{ d: "2026-01-01" }] },
  { id: "c", name: "Gamma", funder: "Foundation Z", type: "Foundation", stage: "won", ask: 250000, deadline: null, owner: "team", market: "sa", focus: [], log: [{ d: "2026-06-21" }] },
  { id: "d", name: "Delta", funder: "Archived Co", type: "Foundation", stage: "archived", ask: 100000, deadline: null, owner: "u1", market: "sa", focus: [], log: [{ d: "2026-06-01" }] },
];

const render = (extra = {}) =>
  renderHook(() => usePipelineView(grants, TEAM, STAGES, { onUpdateGrant: vi.fn(), onAddGrant: vi.fn(), onRunAI: vi.fn(), onToast: vi.fn(), ...extra }));

describe("usePipelineView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hides archived grants by default, shows them when toggled", () => {
    const { result } = render();
    expect(result.current.filtered.map(g => g.id)).not.toContain("d");
    expect(result.current.archivedCount).toBe(1);
    act(() => result.current.setShowArchived(true));
    expect(result.current.filtered.map(g => g.id)).toContain("d");
  });

  it("filters by market", () => {
    const { result } = render();
    act(() => result.current.setMarket("global"));
    expect(result.current.filtered.map(g => g.id)).toEqual(["b"]);
    act(() => result.current.setMarket("sa"));
    expect(result.current.filtered.map(g => g.id).sort()).toEqual(["a", "c"]);
  });

  it("filters by funder type", () => {
    const { result } = render();
    act(() => result.current.setSf("Corporate"));
    expect(result.current.filtered.map(g => g.id)).toEqual(["b"]);
  });

  it("debounced search matches name/funder/owner-name, settling after the delay", async () => {
    const { result } = render();
    act(() => result.current.handleSearchChange("alison")); // owner-name lookup
    // debouncedQ has not settled yet
    expect(result.current.q).toBe("alison");
    await waitFor(() => expect(result.current.debouncedQ).toBe("alison"));
    expect(result.current.filtered.map(g => g.id)).toEqual(["a"]);

    act(() => result.current.handleSearchChange("beta"));
    await waitFor(() => expect(result.current.filtered.map(g => g.id)).toEqual(["b"]));
  });

  it("sorts by ask descending and by deadline (default)", () => {
    const { result } = render();
    // default = deadline ascending ("9999" pushes null deadlines last)
    expect(result.current.sorted.map(g => g.id)).toEqual(["b", "a", "c"]);
    act(() => result.current.setPSort("ask"));
    expect(result.current.sorted.map(g => g.id)).toEqual(["b", "a", "c"]);
  });

  it("groups by owner with the unassigned 'team' bucket last", () => {
    const { result } = render();
    const ids = result.current.personEntries.map(([owner]) => owner);
    expect(ids[ids.length - 1]).toBe("team");
    expect(ids).toContain("u1");
    expect(ids).toContain("u2");
  });

  it("computes market counts before filtering", () => {
    const { result } = render();
    expect(result.current.marketCounts.global.count).toBe(1);
    // sa counts every sa grant incl. archived (counts are pre-filter)
    expect(result.current.marketCounts.sa.count).toBe(3);
  });

  it("exposes owner names and funder suggestions", () => {
    const { result } = render();
    expect(result.current.ownerNames.sort()).toEqual(["u1", "u2"]);
    expect(result.current.funderSuggestions).toContain("Foundation X");
  });

  it("scoreAllGrants scores active grants and persists each result", async () => {
    const onRunAI = vi.fn().mockResolvedValue("SCORE: 80\nGreat fit");
    const onUpdateGrant = vi.fn();
    const onToast = vi.fn();
    const { result } = render({ onRunAI, onUpdateGrant, onToast });
    await act(async () => { await result.current.scoreAllGrants(); });
    // active grants = scouted + vetting (won + archived are closed)
    expect(onRunAI).toHaveBeenCalledTimes(2);
    expect(onUpdateGrant).toHaveBeenCalledTimes(2);
    const [, changes] = onUpdateGrant.mock.calls[0];
    expect(changes.aiFitscore).toBe("SCORE: 80\nGreat fit");
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining("Scored 2 of 2"), expect.any(Object));
  });

  it("extractFromUrl parses AI JSON into a new grant via onAddGrant", async () => {
    const onRunAI = vi.fn().mockResolvedValue(JSON.stringify({ name: "From URL", funder: "Web Funder", type: "International", ask: 2000000, deadline: "2026-09-09", focus: ["STEM"], applyUrl: "https://x" }));
    const onAddGrant = vi.fn();
    const onToast = vi.fn();
    const { result } = render({ onRunAI, onAddGrant, onToast });
    let ok;
    await act(async () => { ok = await result.current.extractFromUrl("https://grant.example"); });
    expect(ok).toBe(true);
    expect(onAddGrant).toHaveBeenCalledTimes(1);
    const g = onAddGrant.mock.calls[0][0];
    expect(g.name).toBe("From URL");
    expect(g.funderBudget).toBe(2000000);
    expect(g.ask).toBe(0); // ask is always TBD on URL import
    expect(g.market).toBe("global"); // International → global
    expect(g.source).toBe("website");
  });

  it("extractFromUrl returns false and toasts on malformed AI output", async () => {
    const onRunAI = vi.fn().mockResolvedValue("not json");
    const onAddGrant = vi.fn();
    const onToast = vi.fn();
    const { result } = render({ onRunAI, onAddGrant, onToast });
    let ok;
    await act(async () => { ok = await result.current.extractFromUrl("https://grant.example"); });
    expect(ok).toBe(false);
    expect(onAddGrant).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining("Could not parse"), expect.any(Object));
  });
});
