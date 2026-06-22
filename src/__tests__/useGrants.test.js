// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/api", () => ({ addGrant: vi.fn(), removeGrant: vi.fn() }));
import { addGrant as apiAddGrant, removeGrant } from "@/api";
import useGrants from "@/hooks/useGrants";

const STAGES = [{ id: "qualifying", label: "Qualifying" }, { id: "submitted", label: "Submitted" }];
const TEAM = [{ id: "alison", name: "Alison" }];

const setup = (over = {}) => {
  const dSave = vi.fn();
  const toast = vi.fn();
  const h = renderHook(() => useGrants({ stages: STAGES, team: TEAM, dSave, toast, ...over }));
  return { ...h, dSave, toast };
};

describe("useGrants", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updateGrant merges, auto-logs a stage change, and persists via dSave", () => {
    const { result, dSave } = setup();
    act(() => result.current.setGrants([{ id: "g1", stage: "qualifying", log: [] }]));
    act(() => result.current.updateGrant("g1", { stage: "submitted" }));
    const g = result.current.grants[0];
    expect(g.stage).toBe("submitted");
    expect(g.log.some((e) => e.t.includes("Stage moved: Qualifying → Submitted"))).toBe(true);
    expect(dSave).toHaveBeenCalledWith("g1", expect.objectContaining({ stage: "submitted" }));
  });

  it("updateGrant auto-schedules follow-ups when entering submitted", () => {
    const { result } = setup();
    act(() => result.current.setGrants([{ id: "g1", stage: "qualifying", type: "Foundation", log: [] }]));
    act(() => result.current.updateGrant("g1", { stage: "submitted" }));
    expect(Array.isArray(result.current.grants[0].fups)).toBe(true);
    expect(result.current.grants[0].fups.length).toBeGreaterThan(0);
  });

  it("updateGrant does not auto-log field changes when the caller supplies log directly", () => {
    // Use a non-stage change so the (unguarded) follow-up scheduler doesn't fire
    // and override the caller's log.
    const { result } = setup();
    act(() => result.current.setGrants([{ id: "g1", stage: "qualifying", owner: "team", log: [] }]));
    act(() => result.current.updateGrant("g1", { owner: "alison", log: [{ d: "x", t: "manual" }] }));
    expect(result.current.grants[0].owner).toBe("alison");
    expect(result.current.grants[0].log).toEqual([{ d: "x", t: "manual" }]);
  });

  it("addGrant optimistically adds, persists, and toasts success", async () => {
    apiAddGrant.mockResolvedValue({});
    const { result, toast } = setup();
    await act(async () => { await result.current.addGrant({ id: "g9", name: "New" }); });
    expect(result.current.grants.find((g) => g.id === "g9")).toBeTruthy();
    expect(apiAddGrant).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("New added to pipeline", expect.any(Object));
  });

  it("addGrant rolls back and toasts an error on failure", async () => {
    apiAddGrant.mockRejectedValue(new Error("x"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { result, toast } = setup();
    await act(async () => { await result.current.addGrant({ id: "g9", name: "New" }); });
    expect(result.current.grants.find((g) => g.id === "g9")).toBeFalsy();
    expect(toast).toHaveBeenCalledWith(expect.stringContaining("Failed to add"), expect.any(Object));
  });

  it("deleteGrant removes optimistically, offers undo, and deletes after 6s", async () => {
    vi.useFakeTimers();
    removeGrant.mockResolvedValue({});
    const { result, toast } = setup();
    act(() => result.current.setGrants([{ id: "g1", name: "Old" }]));
    act(() => result.current.deleteGrant("g1"));
    expect(result.current.grants.find((g) => g.id === "g1")).toBeFalsy();
    expect(toast).toHaveBeenCalledWith("Old deleted", expect.objectContaining({ type: "undo" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(removeGrant).toHaveBeenCalledWith("g1");
    vi.useRealTimers();
  });
});
