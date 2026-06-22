// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/api", () => ({
  getUploads: vi.fn(),
  uploadFile: vi.fn(),
  addYouTubeUrl: vi.fn(),
  deleteUpload: vi.fn(),
}));
import { getUploads, uploadFile, deleteUpload } from "@/api";
import useUploadFlow from "@/hooks/useUploadFlow";

describe("useUploadFlow", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("auto-loads the list on mount", async () => {
    getUploads.mockResolvedValue([{ id: 1 }]);
    const { result } = renderHook(() => useUploadFlow("g1", "proposal"));
    await waitFor(() => expect(result.current.uploads).toEqual([{ id: 1 }]));
    expect(getUploads).toHaveBeenCalledWith("g1");
  });

  it("upload() sends each file with scope, then refreshes", async () => {
    getUploads.mockResolvedValueOnce([]).mockResolvedValue([{ id: 9 }]);
    uploadFile.mockResolvedValue({});
    const { result } = renderHook(() => useUploadFlow("g1", "proposal", { visibility: "org" }));
    await waitFor(() => expect(result.current.uploads).toEqual([]));

    const file = { name: "a.pdf" };
    await act(async () => { await result.current.upload([file]); });

    expect(uploadFile).toHaveBeenCalledWith(file, "g1", "proposal", "org");
    expect(result.current.uploads).toEqual([{ id: 9 }]);
    expect(result.current.uploading).toBe(false);
  });

  it("remove() deletes then refreshes", async () => {
    getUploads.mockResolvedValueOnce([{ id: 5 }]).mockResolvedValue([]);
    deleteUpload.mockResolvedValue({});
    const { result } = renderHook(() => useUploadFlow("g1", "proposal"));
    await waitFor(() => expect(result.current.uploads).toEqual([{ id: 5 }]));

    await act(async () => { await result.current.remove(5); });

    expect(deleteUpload).toHaveBeenCalledWith(5);
    expect(result.current.uploads).toEqual([]);
  });
});
