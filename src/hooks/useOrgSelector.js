import { useState, useEffect, useCallback } from "react";
import { getOrgs, createNewOrg, deleteOrg } from "@/api";
import useAsyncAction from "@/hooks/useAsyncAction";

/**
 * Org Selector view-model. Owns the org-list load, the create-org form logic
 * (validate → logo step → POST with optional logo_url), and the delete-org
 * confirm + DELETE flow. The component renders from this and only keeps the
 * transient text being typed / file-upload preview / modal rendering.
 *
 * @param onSelect (slug, isNew) callback invoked after picking or creating an org
 */
export default function useOrgSelector(onSelect) {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Create-org form
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [website, setWebsite] = useState("");
  const [err, setErr] = useState("");
  const [logoStep, setLogoStep] = useState(false);

  // Super-admin mode
  const [adminMode, setAdminMode] = useState(false);
  const [adminKey, setAdminKey] = useState("");

  // Delete flow
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [confirmSlug, setConfirmSlug] = useState("");
  const [deleteErr, setDeleteErr] = useState("");

  // ── Load org list on mount ──
  useEffect(() => {
    getOrgs().then(o => { setOrgs(o); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  // ── Create form ──
  const autoSlug = useCallback((n) => {
    setName(n);
    setSlug(prevSlug => {
      // keep the slug auto-derived as long as the user hasn't typed their own
      if (!prevSlug || prevSlug === name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")) {
        return n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      }
      return prevSlug;
    });
  }, [name]);

  const setSlugClean = useCallback((v) => {
    setSlug(v.toLowerCase().replace(/[^a-z0-9-]/g, ""));
  }, []);

  // Step 1: validate form → always show logo step
  const handleCreateClick = useCallback((e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!name || !slug) return;
    if (!adminKey) { setErr("An admin key is required to create an organisation."); return; }
    setLogoStep(true);
  }, [name, slug, adminKey]);

  // Step 2: actually create the org (with or without logo_url)
  const create = useAsyncAction(
    async (logoUrl) => {
      const payload = { name, slug, website };
      if (logoUrl) payload.logo_url = logoUrl;
      return createNewOrg(payload, adminKey);
    },
    {
      onSuccess: (org) => onSelect(org.slug, true),
      onError: (e) => { setErr(e?.message || String(e)); setLogoStep(false); },
    }
  );

  const doCreate = useCallback((logoUrl) => {
    setErr("");
    return create.run(logoUrl);
  }, [create]);

  const backFromLogoStep = useCallback(() => {
    setLogoStep(false);
    setErr("");
  }, []);

  // ── Delete flow ──
  const del = useAsyncAction(
    async () => {
      await deleteOrg(deleteTarget.slug, adminKey);
      return deleteTarget.slug;
    },
    {
      onSuccess: (deletedSlug) => {
        setOrgs(prev => prev.filter(o => o.slug !== deletedSlug));
        setDeleteTarget(null);
        setConfirmSlug("");
      },
      onError: (e) => setDeleteErr(e?.message || String(e)),
    }
  );

  const doDelete = useCallback(() => {
    if (!deleteTarget || confirmSlug !== deleteTarget.slug) return;
    setDeleteErr("");
    return del.run();
  }, [deleteTarget, confirmSlug, del]);

  const openDelete = useCallback((org) => {
    setDeleteTarget(org);
    setConfirmSlug("");
    setDeleteErr("");
  }, []);

  const cancelDelete = useCallback(() => {
    setDeleteTarget(null);
    setConfirmSlug("");
    setDeleteErr("");
  }, []);

  const exitAdmin = useCallback(() => {
    setAdminMode(false);
    setAdminKey("");
  }, []);

  return {
    // list
    orgs, loading,
    // admin
    adminMode, setAdminMode, adminKey, setAdminKey, exitAdmin,
    // create form
    showCreate, setShowCreate,
    name, slug, website,
    setName, setWebsite,
    autoSlug, setSlug: setSlugClean,
    err, setErr,
    logoStep, backFromLogoStep,
    creating: create.busy,
    handleCreateClick, doCreate,
    // delete
    deleteTarget, confirmSlug, setConfirmSlug,
    deleteErr, deleting: del.busy,
    openDelete, cancelDelete, doDelete,
  };
}
