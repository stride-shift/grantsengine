import { useState, useEffect, useCallback } from "react";
import { getUploads, uploadFile } from "@/api";

/**
 * Settings-scoped compliance view-model: the org-level upload list plus the two
 * mutations a compliance row triggers — uploading a file for a doc, and saving
 * just the expiry/notes metadata. The component keeps the doc-row expand state
 * and the typed expiry/notes inputs (render-only) and passes a `getEditField`
 * resolver in so this hook reads the current values at call time.
 *
 * (Distinct from the App-level `useComplianceDocs`, which owns the persisted
 * compliance records + upsert. This hook handles the Settings UI's upload list
 * and the file-upload / meta-save handlers wired to each doc row.)
 *
 * Behaviour preserved 1:1 from Settings.jsx:
 *  - loadUploads(): getUploads() with no grantId (org-level); warns on failure
 *    and is called once on mount
 *  - handleUpload(orgDoc, file): no-ops without file or onUpsertCompDoc;
 *    uploadFile(file, null, "compliance") then upserts the compliance record
 *    (carrying the existing id when replacing), pulling expiry/notes from
 *    getEditField; `uploading` guards both upload + meta-save
 *  - handleSaveMeta(orgDoc): no-ops unless an existing record + onUpsertCompDoc;
 *    re-upserts the record with refreshed expiry/notes, preserving file fields
 *
 * @param compMap          map of doc_id → existing compliance record
 * @param onUpsertCompDoc  persistence callback for a compliance record
 * @param getEditField     (docId, field) → current typed value ("expiry"/"notes")
 */
export default function useComplianceUploads(compMap, onUpsertCompDoc, getEditField) {
  const [uploads, setUploads] = useState([]);
  const [uploading, setUploading] = useState(false);

  const loadUploads = useCallback(async () => {
    try {
      const data = await getUploads(); // no grantId = org-level
      setUploads(data);
    } catch (e) { console.warn("Failed to load uploads:", e.message); }
  }, []);

  useEffect(() => {
    loadUploads();
  }, [loadUploads]);

  const handleUpload = useCallback(async (orgDoc, file) => {
    if (!file || !onUpsertCompDoc) return;
    setUploading(true);
    try {
      const result = await uploadFile(file, null, "compliance");
      const existing = compMap[orgDoc.id];
      await onUpsertCompDoc({
        ...(existing ? { id: existing.id } : {}),
        doc_id: orgDoc.id,
        name: orgDoc.name,
        status: "uploaded",
        upload_id: result.id,
        file_name: result.original_name || file.name,
        file_size: result.size || file.size,
        uploaded_date: new Date().toISOString(),
        expiry: getEditField(orgDoc.id, "expiry") || null,
        notes: getEditField(orgDoc.id, "notes") || null,
      });
    } catch (err) {
      console.error("Compliance upload failed:", err);
    } finally {
      setUploading(false);
    }
  }, [compMap, onUpsertCompDoc, getEditField]);

  const handleSaveMeta = useCallback(async (orgDoc) => {
    const existing = compMap[orgDoc.id];
    if (!existing || !onUpsertCompDoc) return;
    await onUpsertCompDoc({
      id: existing.id,
      doc_id: orgDoc.id,
      name: orgDoc.name,
      status: existing.status,
      upload_id: existing.upload_id,
      file_name: existing.file_name,
      file_size: existing.file_size,
      uploaded_date: existing.uploaded_date,
      expiry: getEditField(orgDoc.id, "expiry") || null,
      notes: getEditField(orgDoc.id, "notes") || null,
    });
  }, [compMap, onUpsertCompDoc, getEditField]);

  return { uploads, uploading, loadUploads, handleUpload, handleSaveMeta };
}
