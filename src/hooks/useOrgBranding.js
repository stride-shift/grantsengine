import { useState, useEffect, useCallback } from "react";
import { uploadOrgLogo } from "@/api";
import { resetTheme } from "@/theme";

const DEFAULT_PRIMARY = "#4A7C59";
const DEFAULT_ACCENT = "#C17817";

/**
 * Org branding view-model: brand colour atoms (synced from the org record),
 * logo upload, and the save/reset flows. The component owns only the colour
 * picker UI; it reads `primary`/`accent` and calls the handlers here.
 *
 * Behaviour preserved 1:1 from Settings.jsx:
 *  - colours seed from org.primary_color / org.accent_color (or defaults) and
 *    re-sync whenever those org fields change
 *  - saveBrandColors writes null for a colour left at its default (so the org
 *    falls back to the built-in theme), always nulls primary_dark (auto-derived),
 *    flashes "✓ Saved" for 2s
 *  - resetBrandColors snaps atoms back to defaults, persists all-null, calls
 *    resetTheme(), flashes "✓ Reset to defaults" for 2s
 *  - handleLogoUpload uploads the file, persists logo_url, clears the input
 *
 * @param org      the org record (reads primary_color / accent_color)
 * @param onUpdateOrg (changes) persistence callback; flows no-op without it
 */
export default function useOrgBranding(org, onUpdateOrg) {
  const [primary, setPrimary] = useState(org?.primary_color || DEFAULT_PRIMARY);
  const [accent, setAccent] = useState(org?.accent_color || DEFAULT_ACCENT);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);

  // Re-seed colour atoms when the org's stored colours change.
  useEffect(() => {
    if (org) {
      setPrimary(org.primary_color || DEFAULT_PRIMARY);
      setAccent(org.accent_color || DEFAULT_ACCENT);
    }
  }, [org?.primary_color, org?.accent_color]);

  const handleLogoUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const result = await uploadOrgLogo(file);
      if (result?.logo_url && onUpdateOrg) {
        await onUpdateOrg({ logo_url: result.logo_url });
      }
    } catch (err) {
      console.error("Logo upload failed:", err);
    }
    setLogoUploading(false);
    e.target.value = "";
  }, [onUpdateOrg]);

  const saveBrandColors = useCallback(async () => {
    if (!onUpdateOrg) return;
    setSaving(true);
    setMsg("");
    try {
      await onUpdateOrg({
        primary_color: primary === DEFAULT_PRIMARY ? null : primary,
        primary_dark: null, // auto-derived
        accent_color: accent === DEFAULT_ACCENT ? null : accent,
      });
      setMsg("✓ Saved");
      setTimeout(() => setMsg(""), 2000);
    } catch (err) {
      setMsg("Failed: " + err.message);
    }
    setSaving(false);
  }, [onUpdateOrg, primary, accent]);

  const resetBrandColors = useCallback(async () => {
    setPrimary(DEFAULT_PRIMARY);
    setAccent(DEFAULT_ACCENT);
    if (onUpdateOrg) {
      await onUpdateOrg({ primary_color: null, primary_dark: null, accent_color: null });
      resetTheme();
    }
    setMsg("✓ Reset to defaults");
    setTimeout(() => setMsg(""), 2000);
  }, [onUpdateOrg]);

  return {
    primary, accent, setPrimary, setAccent,
    saving, msg, logoUploading,
    handleLogoUpload, saveBrandColors, resetBrandColors,
  };
}
