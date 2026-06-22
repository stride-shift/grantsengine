import { useState, useEffect, useMemo, useCallback } from "react";
import { getUploads, uploadFile, deleteUpload, getUploadDownloadUrl, kvGet, kvSet } from "@/api";
import { ORG_DOCS } from "@/data/constants";

/**
 * Document Vault view-model. Owns the org-wide upload list and its load/upload/
 * delete/category/re-extract mutations, the reference-proposals KV store, and the
 * derived compliance status. The component renders from this and keeps only its
 * own presentational state (active category, sub-tab, upload-form toggles).
 *
 * Behaviour is preserved 1:1 from the previous inline DocVault implementation:
 *  - upload uses a mutable `uploadVisibility` and a per-call category (falling back
 *    to the active category, then "org"); failures alert().
 *  - changeDocCategory / reExtract hit the raw upload endpoints with the slug+token
 *    read straight from localStorage (no api-layer helper exists for them).
 *  - reference IDs are a Set persisted as an array, with the legacy {value:[]} unwrap.
 *
 * @param complianceDocs server compliance rows (drives complianceStatus.uploaded)
 */
export default function useDocVault(complianceDocs) {
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadVisibility, setUploadVisibility] = useState("public");
  const [referenceIds, setReferenceIds] = useState(new Set()); // proposal IDs marked as AI reference

  // Load reference IDs from KV store
  useEffect(() => {
    kvGet("proposal_references").then(data => {
      if (data) {
        const ids = Array.isArray(data) ? data : (data.value || []);
        setReferenceIds(new Set(ids));
      }
    }).catch(() => {});
  }, []);

  const toggleReference = useCallback((id) => {
    setReferenceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      const arr = [...next];
      kvSet("proposal_references", arr).catch(() => {});
      return next;
    });
  }, []);

  // Load all org uploads
  const refresh = useCallback(async () => {
    const data = await getUploads();
    setUploads(data || []);
    return data;
  }, []);

  useEffect(() => {
    setLoading(true);
    getUploads().then(data => {
      setUploads(data || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Compliance doc status — which required docs are uploaded
  const complianceStatus = useMemo(() => {
    return {
      total: ORG_DOCS.length,
      uploaded: complianceDocs?.length || 0,
    };
  }, [uploads, complianceDocs]);

  // Upload a single picked file under `category` (caller decides the resolved category).
  const handleUpload = useCallback(async (e, category) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const cat = category || "org";
      await uploadFile(file, null, cat, uploadVisibility);
      const data = await getUploads();
      setUploads(data || []);
    } catch (err) {
      alert("Upload failed: " + err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }, [uploadVisibility]);

  // Open a hidden file picker and upload the chosen file into `cat`.
  const triggerUpload = useCallback((cat) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.doc,.docx,.xlsx,.xls,.csv,.txt,.md,.jpg,.jpeg,.png";
    input.onchange = (e) => handleUpload(e, cat);
    input.click();
  }, [handleUpload]);

  const changeDocCategory = useCallback(async (docId, newCategory) => {
    // Update category via a PUT to the upload — there is no api-layer helper for
    // this endpoint, so we hit it directly with the stored slug + token.
    try {
      const res = await fetch(`/api/org/${localStorage.getItem("gt_slug")}/uploads/${docId}/category`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${localStorage.getItem("gt_token")}` },
        body: JSON.stringify({ category: newCategory }),
      });
      if (res.ok) {
        setUploads(prev => prev.map(u => u.id === docId ? { ...u, category: newCategory } : u));
      }
    } catch (err) {
      console.error("Category update failed:", err);
    }
  }, []);

  // Re-run text extraction for a doc. Reports progress/result through the supplied
  // button element (preserving the original inline DOM-mutating behaviour) and
  // refreshes the list on success.
  const reExtract = useCallback(async (docId, btn) => {
    btn.textContent = "Extracting...";
    btn.disabled = true;
    try {
      const res = await fetch(`/api/org/${localStorage.getItem("gt_slug")}/uploads/${docId}/reextract`, {
        method: "POST", headers: { "Authorization": `Bearer ${localStorage.getItem("gt_token")}` },
      });
      const data = await res.json();
      if (data.extracted) {
        const fresh = await getUploads();
        setUploads(fresh || []);
        return true;
      }
      return false;
    } catch {
      return null;
    }
  }, []);

  const handleDelete = useCallback(async (id) => {
    if (!confirm("Delete this document?")) return;
    try {
      await deleteUpload(id);
      setUploads(prev => prev.filter(u => u.id !== id));
    } catch (err) {
      alert("Delete failed: " + err.message);
    }
  }, []);

  const handleView = useCallback(async (doc) => {
    try {
      const { url } = await getUploadDownloadUrl(doc.id);
      if (url) window.open(url, "_blank");
    } catch (err) {
      alert("Could not open file: " + err.message);
    }
  }, []);

  return {
    uploads, loading, uploading,
    uploadVisibility, setUploadVisibility,
    referenceIds, toggleReference,
    complianceStatus,
    refresh, handleUpload, triggerUpload,
    changeDocCategory, reExtract, handleDelete, handleView,
  };
}
