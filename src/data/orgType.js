/* Organisation type — drives which Resources are shown.
 *
 * The type is either set explicitly on the org (org.org_type, chosen in Settings)
 * or inferred from the details the org already entered (industry, name, mission).
 * Used by the Resources tab to avoid showing, e.g., NGO-only freebies to a
 * corporate org. Unknown type → show everything (resolveOrgType falls back to 'ngo'
 * only for the label; the Resources filter treats a null match as "show all").
 */

export const ORG_TYPES = [
  { id: "ngo", label: "NGO / Non-profit" },
  { id: "corporate", label: "Corporate / CSI" },
  { id: "government", label: "Government / Public sector" },
  { id: "social_enterprise", label: "Social enterprise" },
  { id: "education", label: "Education / Academic" },
];

export const orgTypeLabel = (id) => ORG_TYPES.find((t) => t.id === id)?.label || "Organisation";

// Keyword → type. Checked in priority order (most specific first) so a
// "government department" isn't mis-tagged corporate by the word "department".
const MATCHERS = [
  { id: "government", re: /\b(government|govt|municipal|municipality|department of|ministry|public sector|state-owned|provincial|national treasury|seta)\b/ },
  { id: "education", re: /\b(university|college|school|academy|tvet|\bfet\b|education|faculty|campus)\b/ },
  { id: "social_enterprise", re: /\b(social enterprise|social-enterprise|b-corp|impact business|for-profit social)\b/ },
  { id: "corporate", re: /\b(pty|\(pty\)|ltd|limited|corporate|corporation|company|business|csi|bank|insurer|insurance|mining|retail|holdings|group)\b/ },
  { id: "ngo", re: /\b(ngo|npo|npc|non-profit|nonprofit|not-for-profit|trust|foundation|charity|pbo|community)\b/ },
];

/** Infer an org type from the details already on the org/profile. Defaults to 'ngo'. */
export const deriveOrgType = (org, profile) => {
  const hay = [
    org?.industry,
    org?.name,
    profile?.mission,
    profile?.context_slim,
  ].filter(Boolean).join(" ").toLowerCase();
  if (!hay.trim()) return "ngo";
  for (const m of MATCHERS) {
    if (m.re.test(hay)) return m.id;
  }
  return "ngo";
};

/** Explicit org.org_type wins; otherwise infer. */
export const resolveOrgType = (org, profile) => org?.org_type || deriveOrgType(org, profile);
