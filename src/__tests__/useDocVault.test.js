// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/api", () => ({
  getUploads: vi.fn(),
  uploadFile: vi.fn(),
  deleteUpload: vi.fn(),
  getUploadDownloadUrl: vi.fn(),
  kvGet: vi.fn(),
  kvSet: vi.fn(),
}));
import { getUploads, deleteUpload, kvGet, kvSet } from "@/api";
import useDocVault from "@/hooks/useDocVault";
import { ORG_DOCS } from "@/data/constants";

const flush = async (result) => {
  await waitFor(() => expect(result.current.loading).toBe(false));
};

describe("useDocVault", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUploads.mockResolvedValue([]);
    kvGet.mockResolvedValue(null);
    kvSet.mockResolvedValue({});
    localStorage.setItem("gt_slug", "dlab");
    localStorage.setItem("gt_token", "tok123");
    global.fetch = vi.fn();
    global.confirm = vi.fn(() => true);
  });

  it("loads the org uploads on mount", async () => {
    getUploads.mockResolvedValue([{ id: 1, category: "org" }]);
    const { result } = renderHook(() => useDocVault([]));
    await flush(result);
    expect(getUploads).toHaveBeenCalled();
    expect(result.current.uploads).toEqual([{ id: 1, category: "org" }]);
  });

  it("computes complianceStatus from ORG_DOCS total and the compliance rows", async () => {
    const sampleDocs = [{ doc_id: "pbo" }, { doc_id: "npo" }, { doc_id: "bbbee" }];
    const { result } = renderHook(() => useDocVault(sampleDocs));
    await flush(result);
    expect(result.current.complianceStatus).toEqual({
      total: ORG_DOCS.length,
      uploaded: 3,
    });
  });

  it("complianceStatus.uploaded is 0 when no compliance docs are passed", async () => {
    const { result } = renderHook(() => useDocVault(null));
    await flush(result);
    expect(result.current.complianceStatus).toEqual({
      total: ORG_DOCS.length,
      uploaded: 0,
    });
  });

  it("loads reference IDs from KV (legacy {value:[]} unwrap) into a Set", async () => {
    kvGet.mockResolvedValue({ value: ["p1", "p2"] });
    const { result } = renderHook(() => useDocVault([]));
    await waitFor(() => expect(result.current.referenceIds.size).toBe(2));
    expect(result.current.referenceIds.has("p1")).toBe(true);
    expect(kvGet).toHaveBeenCalledWith("proposal_references");
  });

  it("toggleReference adds/removes an id and persists the array via kvSet", async () => {
    const { result } = renderHook(() => useDocVault([]));
    await flush(result);

    act(() => { result.current.toggleReference("p9"); });
    expect(result.current.referenceIds.has("p9")).toBe(true);
    expect(kvSet).toHaveBeenLastCalledWith("proposal_references", ["p9"]);

    act(() => { result.current.toggleReference("p9"); });
    expect(result.current.referenceIds.has("p9")).toBe(false);
    expect(kvSet).toHaveBeenLastCalledWith("proposal_references", []);
  });

  it("changeDocCategory PUTs the new category to the upload endpoint and updates local state", async () => {
    getUploads.mockResolvedValue([{ id: "d1", category: "org" }]);
    global.fetch.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useDocVault([]));
    await waitFor(() => expect(result.current.uploads).toHaveLength(1));

    await act(async () => { await result.current.changeDocCategory("d1", "financial"); });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/org/dlab/uploads/d1/category",
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer tok123",
        }),
        body: JSON.stringify({ category: "financial" }),
      }),
    );
    expect(result.current.uploads[0].category).toBe("financial");
  });

  it("handleDelete confirms, deletes via api, and drops the row", async () => {
    getUploads.mockResolvedValue([{ id: "d1" }, { id: "d2" }]);
    deleteUpload.mockResolvedValue({});
    const { result } = renderHook(() => useDocVault([]));
    await waitFor(() => expect(result.current.uploads).toHaveLength(2));

    await act(async () => { await result.current.handleDelete("d1"); });

    expect(deleteUpload).toHaveBeenCalledWith("d1");
    expect(result.current.uploads).toEqual([{ id: "d2" }]);
  });

  it("handleDelete does nothing when not confirmed", async () => {
    global.confirm = vi.fn(() => false);
    getUploads.mockResolvedValue([{ id: "d1" }]);
    const { result } = renderHook(() => useDocVault([]));
    await waitFor(() => expect(result.current.uploads).toHaveLength(1));

    await act(async () => { await result.current.handleDelete("d1"); });

    expect(deleteUpload).not.toHaveBeenCalled();
    expect(result.current.uploads).toEqual([{ id: "d1" }]);
  });

  it("reExtract POSTs to the reextract endpoint and refreshes on success", async () => {
    getUploads
      .mockResolvedValueOnce([{ id: "d1", has_text: false }])
      .mockResolvedValue([{ id: "d1", has_text: true }]);
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ extracted: true }) });
    const { result } = renderHook(() => useDocVault([]));
    await waitFor(() => expect(result.current.uploads).toHaveLength(1));

    const btn = {};
    let ok;
    await act(async () => { ok = await result.current.reExtract("d1", btn); });

    expect(ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/org/dlab/uploads/d1/reextract",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer tok123" }),
      }),
    );
    expect(result.current.uploads[0].has_text).toBe(true);
  });
});
