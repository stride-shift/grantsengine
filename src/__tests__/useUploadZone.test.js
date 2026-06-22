// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/api", () => ({
  uploadFile: vi.fn(),
  addYouTubeUrl: vi.fn(),
  deleteUpload: vi.fn(),
}));
import { uploadFile, addYouTubeUrl, deleteUpload } from "@/api";
import useUploadZone from "@/hooks/useUploadZone";

describe("useUploadZone", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("does not fetch a list (controlled by parent)", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useUploadZone("g1", onChange));
    // No list state is exposed; only mutations + busy/error flags.
    expect(result.current.uploads).toBeUndefined();
    expect(typeof result.current.handleFiles).toBe("function");
  });

  it("handleFiles uploads each file (grantId, null category) then notifies parent", async () => {
    uploadFile.mockResolvedValue({});
    const onChange = vi.fn();
    const { result } = renderHook(() => useUploadZone("g1", onChange));

    const files = [{ name: "a.pdf" }, { name: "b.docx" }];
    await act(async () => { await result.current.handleFiles(files); });

    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect(uploadFile).toHaveBeenNthCalledWith(1, files[0], "g1", null);
    expect(uploadFile).toHaveBeenNthCalledWith(2, files[1], "g1", null);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(result.current.uploading).toBe(false);
    expect(result.current.uploadingName).toBe("");
  });

  it("handleFiles coerces null grantId and surfaces upload errors", async () => {
    uploadFile.mockRejectedValue(new Error("boom"));
    const onChange = vi.fn();
    const { result } = renderHook(() => useUploadZone(null, onChange));

    await act(async () => { await result.current.handleFiles([{ name: "a.pdf" }]); });

    expect(uploadFile).toHaveBeenCalledWith({ name: "a.pdf" }, null, null);
    expect(result.current.error).toBe("boom");
    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.uploading).toBe(false);
  });

  it("handleYouTube trims, posts with 'youtube' category, returns true on success", async () => {
    addYouTubeUrl.mockResolvedValue({});
    const onChange = vi.fn();
    const { result } = renderHook(() => useUploadZone("g1", onChange));

    let ok;
    await act(async () => { ok = await result.current.handleYouTube("  https://yt  "); });

    expect(ok).toBe(true);
    expect(addYouTubeUrl).toHaveBeenCalledWith("https://yt", "g1", "youtube");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(result.current.ytBusy).toBe(false);
  });

  it("handleYouTube returns false for blank url without calling the api", async () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useUploadZone("g1", onChange));

    let ok;
    await act(async () => { ok = await result.current.handleYouTube("   "); });

    expect(ok).toBe(false);
    expect(addYouTubeUrl).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("handleYouTube returns false and sets error on failure", async () => {
    addYouTubeUrl.mockRejectedValue(new Error("nope"));
    const onChange = vi.fn();
    const { result } = renderHook(() => useUploadZone("g1", onChange));

    let ok;
    await act(async () => { ok = await result.current.handleYouTube("https://yt"); });

    expect(ok).toBe(false);
    expect(result.current.error).toBe("nope");
    expect(result.current.ytBusy).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("handleDelete confirms, deletes, then notifies parent", async () => {
    deleteUpload.mockResolvedValue({});
    const onChange = vi.fn();
    window.confirm = vi.fn(() => true); // happy-dom doesn't define confirm
    const { result } = renderHook(() => useUploadZone("g1", onChange));

    await act(async () => { await result.current.handleDelete(7, "x.pdf"); });

    expect(deleteUpload).toHaveBeenCalledWith(7);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("handleDelete is a no-op when confirm is declined", async () => {
    const onChange = vi.fn();
    window.confirm = vi.fn(() => false); // happy-dom doesn't define confirm
    const { result } = renderHook(() => useUploadZone("g1", onChange));

    await act(async () => { await result.current.handleDelete(7, "x.pdf"); });

    expect(deleteUpload).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
    window.confirm.mockRestore();
  });
});
