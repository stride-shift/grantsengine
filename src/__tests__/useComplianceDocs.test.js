// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/api", () => ({
  getCompliance: vi.fn(),
  updateComplianceDoc: vi.fn(),
  createComplianceDoc: vi.fn(),
}));
import { getCompliance, updateComplianceDoc, createComplianceDoc } from "@/api";
import useComplianceDocs from "@/hooks/useComplianceDocs";

describe("useComplianceDocs", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("updates an existing doc, refetches, and toasts success", async () => {
    updateComplianceDoc.mockResolvedValue({});
    getCompliance.mockResolvedValue([{ id: "d1", name: "PBO" }]);
    const toast = vi.fn();
    const { result } = renderHook(() => useComplianceDocs(toast));

    await act(async () => { await result.current.upsertCompDoc({ id: "d1", name: "PBO" }); });

    expect(updateComplianceDoc).toHaveBeenCalledWith("d1", { id: "d1", name: "PBO" });
    expect(createComplianceDoc).not.toHaveBeenCalled();
    expect(result.current.complianceDocs).toEqual([{ id: "d1", name: "PBO" }]);
    expect(toast).toHaveBeenCalledWith("PBO updated", { type: "success", duration: 2000 });
  });

  it("creates a new doc (no id) then refetches", async () => {
    createComplianceDoc.mockResolvedValue({ id: "new-1" });
    getCompliance.mockResolvedValue([{ id: "new-1", name: "Tax" }]);
    const { result } = renderHook(() => useComplianceDocs(vi.fn()));

    await act(async () => { await result.current.upsertCompDoc({ name: "Tax" }); });

    expect(createComplianceDoc).toHaveBeenCalledWith({ name: "Tax" });
    expect(result.current.complianceDocs).toEqual([{ id: "new-1", name: "Tax" }]);
  });

  it("toasts an error and leaves the list untouched on failure", async () => {
    updateComplianceDoc.mockRejectedValue(new Error("nope"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const toast = vi.fn();
    const { result } = renderHook(() => useComplianceDocs(toast));

    await act(async () => { await result.current.upsertCompDoc({ id: "d1", name: "PBO" }); });

    expect(toast).toHaveBeenCalledWith("Failed to update PBO", { type: "error" });
    expect(result.current.complianceDocs).toEqual([]);
  });

  it("setComplianceDocs seeds the list (used by the batched initial load)", async () => {
    const { result } = renderHook(() => useComplianceDocs(vi.fn()));
    act(() => { result.current.setComplianceDocs([{ id: "a" }, { id: "b" }]); });
    await waitFor(() => expect(result.current.complianceDocs).toHaveLength(2));
  });
});
