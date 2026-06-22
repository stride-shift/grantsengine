// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// Mock the KV API that useKvState (used for funder owners) talks to.
const kvGet = vi.fn(async () => ({}));
const kvSet = vi.fn(async () => ({}));
vi.mock("@/api", () => ({
  kvGet: (...a) => kvGet(...a),
  kvSet: (...a) => kvSet(...a),
}));

import useFunders from "@/hooks/useFunders";

// Sample grants: two funders, one returning ("Get It Done Foundation"), one not.
// The returning funder has the smaller total ask, so returning-first must win
// over ask-descending.
const GRANTS = [
  { id: "a1", funder: "Acme Corp", type: "Corporate CSI", stage: "live", ask: 5000000, name: "Acme Skills", notes: "youth" },
  { id: "a2", funder: "Acme Corp", type: "Foundation", stage: "won", ask: 1000000, name: "Acme Pilot", notes: "" },
  { id: "g1", funder: "Get It Done Foundation", type: "Foundation", stage: "live", ask: 2000000, name: "GIDF Continuity", notes: "core ops" },
  { id: "l1", funder: "Lost Trust", type: "Foundation", stage: "lost", ask: 300000, name: "Lost Bid", notes: "" },
];

beforeEach(() => {
  kvGet.mockClear();
  kvSet.mockClear();
  kvGet.mockResolvedValue({});
  kvSet.mockResolvedValue({});
});

describe("useFunders", () => {
  it("groups grants by funder, infers primary type by frequency, sorts returning-first then ask desc", () => {
    const { result } = renderHook(() => useFunders(GRANTS));
    const fd = result.current.funderData;

    expect(fd.map(f => f.funder)).toEqual(["Get It Done Foundation", "Acme Corp", "Lost Trust"]);

    const gidf = fd.find(f => f.funder === "Get It Done Foundation");
    expect(gidf.returning).toBe(true);
    expect(gidf.grants).toHaveLength(1);

    // Acme Corp: type tie (1 Corporate CSI + 1 Foundation) → first-seen wins (Corporate CSI)
    const acme = fd.find(f => f.funder === "Acme Corp");
    expect(acme.returning).toBe(false);
    expect(acme.type).toBe("Corporate CSI");
    expect(acme.grants).toHaveLength(2);
  });

  it("primary type follows the most common grant type for a funder", () => {
    const grants = [
      { id: "x1", funder: "Multi", type: "Foundation", stage: "live", ask: 100 },
      { id: "x2", funder: "Multi", type: "Foundation", stage: "live", ask: 100 },
      { id: "x3", funder: "Multi", type: "Corporate CSI", stage: "live", ask: 100 },
    ];
    const { result } = renderHook(() => useFunders(grants));
    expect(result.current.funderData[0].type).toBe("Foundation");
  });

  it("filters by type", () => {
    const { result } = renderHook(() => useFunders(GRANTS));
    act(() => { result.current.setFilterType("Foundation"); });
    expect(result.current.filtered.map(f => f.funder)).toEqual(["Get It Done Foundation", "Lost Trust"]);
  });

  it("filters by search query across funder name and grant fields", () => {
    const { result } = renderHook(() => useFunders(GRANTS));
    act(() => { result.current.setQ("acme"); });
    expect(result.current.filtered.map(f => f.funder)).toEqual(["Acme Corp"]);

    // Search hits a grant note, not the funder name
    act(() => { result.current.setQ("continuity"); });
    expect(result.current.filtered.map(f => f.funder)).toEqual(["Get It Done Foundation"]);

    act(() => { result.current.clearFilters(); });
    expect(result.current.filtered).toHaveLength(3);
    expect(result.current.filterType).toBe("all");
  });

  it("aggregates stats: totals, returning count, type histogram, pipeline, won/lost", () => {
    const { result } = renderHook(() => useFunders(GRANTS));
    const s = result.current.stats;
    expect(s.total).toBe(3);
    expect(s.returning).toBe(1);
    expect(s.types).toEqual({ "Corporate CSI": 1, "Foundation": 2 });
    // Active pipeline = a1 (5M) + g1 (2M); won/lost excluded
    expect(s.totalPipeline).toBe(7000000);
    expect(s.wonCount).toBe(1);
    expect(s.lostCount).toBe(1);
    expect(s.wonVal).toBe(1000000);
  });

  it("loads owners from the KV store on mount", async () => {
    kvGet.mockResolvedValue({ "Acme Corp": "barbara" });
    const { result } = renderHook(() => useFunders(GRANTS));
    expect(kvGet).toHaveBeenCalledWith("funder_owners");
    await waitFor(() => expect(result.current.owners).toEqual({ "Acme Corp": "barbara" }));
  });

  it("assignOwner persists the merged owner payload to KV", async () => {
    const { result } = renderHook(() => useFunders(GRANTS));
    await waitFor(() => expect(kvGet).toHaveBeenCalled());

    await act(async () => { result.current.assignOwner("Acme Corp", "barbara"); });
    expect(kvSet).toHaveBeenLastCalledWith("funder_owners", { "Acme Corp": "barbara" });
    expect(result.current.owners).toEqual({ "Acme Corp": "barbara" });

    await act(async () => { result.current.assignOwner("Get It Done Foundation", "nolan"); });
    expect(kvSet).toHaveBeenLastCalledWith("funder_owners", { "Acme Corp": "barbara", "Get It Done Foundation": "nolan" });
  });

  it("assignOwner with a falsy ownerId removes the funder from the payload", async () => {
    kvGet.mockResolvedValue({ "Acme Corp": "barbara", "Lost Trust": "alison" });
    const { result } = renderHook(() => useFunders(GRANTS));
    await waitFor(() => expect(result.current.owners).toEqual({ "Acme Corp": "barbara", "Lost Trust": "alison" }));

    await act(async () => { result.current.assignOwner("Acme Corp", null); });
    expect(kvSet).toHaveBeenLastCalledWith("funder_owners", { "Lost Trust": "alison" });
    expect(result.current.owners).toEqual({ "Lost Trust": "alison" });
  });
});
