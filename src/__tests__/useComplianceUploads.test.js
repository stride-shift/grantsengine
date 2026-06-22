// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/api", () => ({
  getUploads: vi.fn(),
  uploadFile: vi.fn(),
}));
import { getUploads, uploadFile } from "@/api";
import useComplianceUploads from "@/hooks/useComplianceUploads";

const ORG_DOC = { id: "npo_cert", name: "NPO Certificate" };

describe("useComplianceUploads", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("loads org-level uploads on mount (no grantId)", async () => {
    getUploads.mockResolvedValue([{ id: 1 }]);
    const { result } = renderHook(() => useComplianceUploads({}, vi.fn(), () => ""));
    await waitFor(() => expect(result.current.uploads).toEqual([{ id: 1 }]));
    expect(getUploads).toHaveBeenCalledWith();
  });

  it("handleUpload uploads to the compliance category, then upserts a new record", async () => {
    getUploads.mockResolvedValue([]);
    uploadFile.mockResolvedValue({ id: "up1", original_name: "cert.pdf", size: 2048 });
    const onUpsert = vi.fn().mockResolvedValue({});
    const getEditField = (docId, field) => (field === "expiry" ? "2027-01-01" : "renewed via SARS");

    const { result } = renderHook(() => useComplianceUploads({}, onUpsert, getEditField));
    await waitFor(() => expect(getUploads).toHaveBeenCalled());

    const file = { name: "local.pdf", size: 999 };
    await act(async () => { await result.current.handleUpload(ORG_DOC, file); });

    expect(uploadFile).toHaveBeenCalledWith(file, null, "compliance");
    const [payload] = onUpsert.mock.calls[0];
    expect(payload).toMatchObject({
      doc_id: "npo_cert",
      name: "NPO Certificate",
      status: "uploaded",
      upload_id: "up1",
      file_name: "cert.pdf",
      file_size: 2048,
      expiry: "2027-01-01",
      notes: "renewed via SARS",
    });
    expect(payload.id).toBeUndefined(); // no existing record → no id carried
    expect(payload.uploaded_date).toBeTruthy();
    expect(result.current.uploading).toBe(false);
  });

  it("handleUpload carries the existing id when replacing, and falls back to file name/size", async () => {
    getUploads.mockResolvedValue([]);
    uploadFile.mockResolvedValue({ id: "up2" }); // no original_name / size
    const onUpsert = vi.fn().mockResolvedValue({});
    const compMap = { npo_cert: { id: "rec9" } };

    const { result } = renderHook(() => useComplianceUploads(compMap, onUpsert, () => ""));
    await waitFor(() => expect(getUploads).toHaveBeenCalled());

    const file = { name: "fallback.pdf", size: 555 };
    await act(async () => { await result.current.handleUpload(ORG_DOC, file); });

    const [payload] = onUpsert.mock.calls[0];
    expect(payload.id).toBe("rec9");
    expect(payload.file_name).toBe("fallback.pdf");
    expect(payload.file_size).toBe(555);
    expect(payload.expiry).toBe(null);
    expect(payload.notes).toBe(null);
  });

  it("handleUpload no-ops without a file or without onUpsertCompDoc", async () => {
    getUploads.mockResolvedValue([]);
    const onUpsert = vi.fn();
    const { result } = renderHook(() => useComplianceUploads({}, onUpsert, () => ""));
    await waitFor(() => expect(getUploads).toHaveBeenCalled());

    await act(async () => { await result.current.handleUpload(ORG_DOC, null); });
    expect(uploadFile).not.toHaveBeenCalled();

    const { result: r2 } = renderHook(() => useComplianceUploads({}, null, () => ""));
    await act(async () => { await r2.current.handleUpload(ORG_DOC, { name: "x" }); });
    expect(uploadFile).not.toHaveBeenCalled();
  });

  it("handleSaveMeta re-upserts an existing record with refreshed expiry/notes", async () => {
    getUploads.mockResolvedValue([]);
    const onUpsert = vi.fn().mockResolvedValue({});
    const compMap = {
      npo_cert: {
        id: "rec9", status: "uploaded", upload_id: "up2",
        file_name: "cert.pdf", file_size: 2048, uploaded_date: "2026-01-01T00:00:00Z",
      },
    };
    const getEditField = (docId, field) => (field === "expiry" ? "2028-06-01" : "new note");

    const { result } = renderHook(() => useComplianceUploads(compMap, onUpsert, getEditField));
    await waitFor(() => expect(getUploads).toHaveBeenCalled());

    await act(async () => { await result.current.handleSaveMeta(ORG_DOC); });

    expect(onUpsert).toHaveBeenCalledWith({
      id: "rec9",
      doc_id: "npo_cert",
      name: "NPO Certificate",
      status: "uploaded",
      upload_id: "up2",
      file_name: "cert.pdf",
      file_size: 2048,
      uploaded_date: "2026-01-01T00:00:00Z",
      expiry: "2028-06-01",
      notes: "new note",
    });
  });

  it("handleSaveMeta no-ops when there is no existing record", async () => {
    getUploads.mockResolvedValue([]);
    const onUpsert = vi.fn();
    const { result } = renderHook(() => useComplianceUploads({}, onUpsert, () => ""));
    await waitFor(() => expect(getUploads).toHaveBeenCalled());
    await act(async () => { await result.current.handleSaveMeta(ORG_DOC); });
    expect(onUpsert).not.toHaveBeenCalled();
  });
});
