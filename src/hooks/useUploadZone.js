import { useState, useCallback } from "react";
import { uploadFile, addYouTubeUrl, deleteUpload } from "@/api";

/**
 * Mutations for the *controlled* UploadZone: the upload list itself is owned by
 * the parent (passed in as `uploads` and refreshed via `onUploadsChange`), so —
 * unlike useUploadFlow — this hook holds NO list state and never fetches. It
 * only wraps the file-upload / YouTube-link / delete side effects, surfacing the
 * two independent busy flags the UI needs (file `uploading` vs YouTube `ytBusy`)
 * plus an error string, and calls `onUploadsChange()` after each mutation so the
 * parent refetches.
 *
 * @param grantId          optional grant scope (null = org-level)
 * @param onUploadsChange  parent refresh callback, fired after each mutation
 * @returns { uploading, uploadingName, ytBusy, error, setError,
 *            handleFiles, handleYouTube, handleDelete }
 */
export default function useUploadZone(grantId, onUploadsChange) {
  const [uploading, setUploading] = useState(false);
  const [uploadingName, setUploadingName] = useState("");
  const [ytBusy, setYtBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleFiles = useCallback(async (files) => {
    setError(null);
    setUploading(true);
    try {
      for (const file of files) {
        setUploadingName(file.name);
        await uploadFile(file, grantId || null, null);
      }
      onUploadsChange();
    } catch (err) {
      setError(err.message);
    }
    setUploading(false);
    setUploadingName("");
  }, [grantId, onUploadsChange]);

  const handleYouTube = useCallback(async (url) => {
    const trimmed = (url || "").trim();
    if (!trimmed) return false;
    setError(null);
    setYtBusy(true);
    try {
      await addYouTubeUrl(trimmed, grantId || null, "youtube");
      onUploadsChange();
      setYtBusy(false);
      return true;
    } catch (err) {
      setError(err.message);
      setYtBusy(false);
      return false;
    }
  }, [grantId, onUploadsChange]);

  const handleDelete = useCallback(async (id, name) => {
    if (!window.confirm(`Delete "${name || "this file"}"? This cannot be undone.`)) return;
    try {
      await deleteUpload(id);
      onUploadsChange();
    } catch (err) {
      setError(err.message);
    }
  }, [onUploadsChange]);

  return {
    uploading, uploadingName, ytBusy, error, setError,
    handleFiles, handleYouTube, handleDelete,
  };
}
