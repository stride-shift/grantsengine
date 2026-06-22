import { useState, useEffect, useRef, useCallback } from "react";
import { getUploads, uploadFile, addYouTubeUrl, deleteUpload } from "@/api";

/**
 * Upload list + mutations for a grant/category scope. Wraps the
 * select→uploadFile→refresh cycle (and YouTube-link / delete variants) that was
 * inlined in UploadZone, DocVault, and Settings.
 *
 * @param grantId  optional grant scope
 * @param category optional category tag
 * @param opts.visibility passed to uploadFile
 * @param opts.autoLoad   fetch the list on mount/grant change (default true)
 * @returns { uploads, uploading, uploadingName, error, upload, addYouTube, remove, refresh }
 */
export default function useUploadFlow(grantId, category, opts = {}) {
  const { visibility, autoLoad = true } = opts;
  const [uploads, setUploads] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadingName, setUploadingName] = useState("");
  const [error, setError] = useState(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const refresh = useCallback(async () => {
    try {
      const list = await getUploads(grantId);
      if (mounted.current) setUploads(Array.isArray(list) ? list : []);
      return list;
    } catch (e) {
      if (mounted.current) setError(e?.message || String(e));
      return null;
    }
  }, [grantId]);

  useEffect(() => { if (autoLoad) refresh(); }, [autoLoad, refresh]);

  const upload = useCallback(async (files) => {
    const list = Array.from(files?.length !== undefined ? files : [files]).filter(Boolean);
    if (!list.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of list) {
        if (mounted.current) setUploadingName(file.name || "");
        await uploadFile(file, grantId, category, visibility);
      }
      await refresh();
    } catch (e) {
      if (mounted.current) setError(e?.message || String(e));
    } finally {
      if (mounted.current) {
        setUploading(false);
        setUploadingName("");
      }
    }
  }, [grantId, category, visibility, refresh]);

  const addYouTube = useCallback(async (url) => {
    setUploading(true);
    setError(null);
    try {
      await addYouTubeUrl(url, grantId, category);
      await refresh();
    } catch (e) {
      if (mounted.current) setError(e?.message || String(e));
    } finally {
      if (mounted.current) setUploading(false);
    }
  }, [grantId, category, refresh]);

  const remove = useCallback(async (id) => {
    try {
      await deleteUpload(id);
      await refresh();
    } catch (e) {
      if (mounted.current) setError(e?.message || String(e));
    }
  }, [refresh]);

  return { uploads, uploading, uploadingName, error, upload, addYouTube, remove, refresh };
}
