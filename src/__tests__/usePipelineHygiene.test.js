// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// verifyUrls is the only @/api dep; resolve every URL as healthy so the
// AI-driven URL/brief passes never run (keeping the test deterministic & fast).
vi.mock("@/api", () => ({
  verifyUrls: vi.fn(async (urls) => (urls || []).map((u) => ({ url: u, ok: true }))),
}));
import usePipelineHygiene from "@/hooks/usePipelineHygiene";

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const run = (grants, over = {}) => {
  const deps = {
    grants,
    runAI: vi.fn(),
    currentMember: { id: "m1" },
    setGrants: vi.fn(),
    dSave: vi.fn(),
    toast: vi.fn(),
    ...over,
  };
  renderHook(() => usePipelineHygiene(deps));
  return deps;
};

describe("usePipelineHygiene", () => {
  beforeEach(() => vi.clearAllMocks());

  it("no-ops when there are no grants", async () => {
    const deps = run([]);
    await Promise.resolve();
    expect(deps.dSave).not.toHaveBeenCalled();
    expect(deps.toast).not.toHaveBeenCalled();
  });

  it("dedupes by funder: archives the less-complete duplicate and toasts", async () => {
    const deps = run([
      { id: "g1", funder: "Dup Co", type: "Corporate CSI", stage: "qualifying", applyUrl: "https://dup.org/apply", notes: "rich", aiDraft: "x", aiResearch: "y" },
      { id: "g2", funder: "Dup Co", type: "Corporate CSI", stage: "qualifying", applyUrl: "https://dup.org/apply", notes: "" },
    ]);
    await waitFor(() => expect(deps.toast).toHaveBeenCalled());
    // g2 (less complete) archived via the silent background save
    expect(deps.dSave).toHaveBeenCalledWith(
      "g2",
      expect.objectContaining({ stage: "archived", _archivedFrom: "qualifying" }),
      { silent: true },
    );
    expect(deps.toast.mock.calls[0][0]).toContain("duplicate");
    expect(deps.runAI).not.toHaveBeenCalled(); // healthy URLs ⇒ no AI URL pass
  });

  it("auto-archives an active grant whose deadline is 90+ days past", async () => {
    const deps = run([
      { id: "g3", funder: "Solo", type: "Corporate CSI", stage: "qualifying", applyUrl: "https://solo.org/apply", deadline: daysAgo(200), log: [] },
    ]);
    await waitFor(() => expect(deps.dSave).toHaveBeenCalled());
    const call = deps.dSave.mock.calls.find((c) => c[0] === "g3");
    expect(call[1].stage).toBe("archived");
    expect(call[1].log.some((e) => e.t.includes("Auto-archived"))).toBe(true);
    expect(deps.runAI).not.toHaveBeenCalled();
  });
});
