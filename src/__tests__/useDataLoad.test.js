// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("@/api", () => ({
  getOrg: vi.fn(), getGrants: vi.fn(), getTeam: vi.fn(),
  getProfile: vi.fn(), getPipelineConfig: vi.fn(), getCompliance: vi.fn(),
}));
vi.mock("@/theme", () => ({ applyOrgTheme: vi.fn() }));
import { getOrg, getGrants, getTeam, getProfile, getPipelineConfig, getCompliance } from "@/api";
import useDataLoad from "@/hooks/useDataLoad";

const makeDeps = (over = {}) => ({
  authed: true,
  setOrg: vi.fn(), setProfile: vi.fn(), setTeam: vi.fn(), setStages: vi.fn(),
  setFunderTypes: vi.fn(), setComplianceDocs: vi.fn(), setGrants: vi.fn(),
  dSave: vi.fn(), toast: vi.fn(), ...over,
});
const resolveAll = ({ org = { id: "o" }, grants = [], team = [], profile = {}, pipe = null, comp = [] } = {}) => {
  getOrg.mockResolvedValue(org); getGrants.mockResolvedValue(grants);
  getTeam.mockResolvedValue(team); getProfile.mockResolvedValue(profile);
  getPipelineConfig.mockResolvedValue(pipe); getCompliance.mockResolvedValue(comp);
};

describe("useDataLoad", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not load when not authed", async () => {
    resolveAll();
    renderHook(() => useDataLoad(makeDeps({ authed: false })));
    await Promise.resolve();
    expect(getOrg).not.toHaveBeenCalled();
  });

  it("loads org/profile/compliance and guarantees an Unassigned team member", async () => {
    resolveAll({ org: { id: "o1" }, team: [{ id: "alison", name: "Alison" }], profile: { mission: "m" }, comp: [{ id: "c1" }] });
    const deps = makeDeps();
    renderHook(() => useDataLoad(deps));
    await waitFor(() => expect(deps.setProfile).toHaveBeenCalledWith({ mission: "m" }));
    expect(deps.setOrg).toHaveBeenCalledWith({ id: "o1" });
    expect(deps.setComplianceDocs).toHaveBeenCalledWith([{ id: "c1" }]);
    expect(deps.setTeam.mock.calls[0][0].some((m) => m.id === "team")).toBe(true);
  });

  it("migrates grants: backfills funderBudget when undefined and re-saves changed ones", async () => {
    resolveAll({ grants: [{ id: "g1", ask: 500, stage: "won" }] });
    const deps = makeDeps();
    renderHook(() => useDataLoad(deps));
    await waitFor(() => expect(deps.setGrants).toHaveBeenCalled());
    const migrated = deps.setGrants.mock.calls[0][0];
    expect(migrated[0].funderBudget).toBe(500);
    expect(migrated[0].askSource).toBe("scout-aligned");
    expect(deps.dSave).toHaveBeenCalledWith("g1", expect.objectContaining({ funderBudget: 500 }));
  });

  it("applies pipeline config stages + funder types", async () => {
    resolveAll({ pipe: { stages: [{ id: "x" }], funder_types: ["A"] } });
    const deps = makeDeps();
    renderHook(() => useDataLoad(deps));
    await waitFor(() => expect(deps.setStages).toHaveBeenCalledWith([{ id: "x" }]));
    expect(deps.setFunderTypes).toHaveBeenCalledWith(["A"]);
  });

  it("toasts on load failure", async () => {
    getOrg.mockRejectedValue(new Error("down"));
    getGrants.mockResolvedValue([]); getTeam.mockResolvedValue([]); getProfile.mockResolvedValue({});
    getPipelineConfig.mockResolvedValue(null); getCompliance.mockResolvedValue([]);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = makeDeps();
    renderHook(() => useDataLoad(deps));
    await waitFor(() => expect(deps.toast).toHaveBeenCalledWith(
      expect.stringContaining("Failed to load workspace"), expect.any(Object)));
  });
});
