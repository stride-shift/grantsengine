import { useState, useEffect, useMemo } from "react";
import { C, FONT, MONO } from "../theme";
import { Btn } from "./index";
import { getUploads, uploadFile, deleteUpload, getUploadsByCategory, getUploadDownloadUrl } from "../api";
import { ORG_DOCS } from "../data/constants";

/* ── Document categories ── */
const DOC_CATEGORIES = [
  { id: "all", label: "All Documents", icon: "📁" },
  { id: "proposal", label: "Proposal Library", icon: "📝" },
  { id: "governance", label: "Governance", icon: "🏛" },
  { id: "financial", label: "Financial", icon: "💰" },
  { id: "team", label: "Team (CVs & IDs)", icon: "👤" },
  { id: "compliance", label: "Compliance", icon: "✓" },
  { id: "org", label: "Organisation", icon: "🏢" },
];

/* ── Map ORG_DOCS categories to vault categories ── */
const ORG_DOC_CAT_MAP = {
  Registration: "governance",
  Compliance: "compliance",
  Financial: "financial",
  Governance: "governance",
  Org: "org",
};

function formatBytes(bytes) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

export default function DocVault({ grants, complianceDocs }) {
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [uploading, setUploading] = useState(false);
  const [uploadCat, setUploadCat] = useState("org");
  const [showUpload, setShowUpload] = useState(false);

  // Load all org uploads
  useEffect(() => {
    setLoading(true);
    getUploads().then(data => {
      setUploads(data || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (activeCategory === "all") return uploads;
    return uploads.filter(u => u.category === activeCategory);
  }, [uploads, activeCategory]);

  // Stats
  const stats = useMemo(() => {
    const cats = {};
    for (const u of uploads) {
      const cat = u.category || "uncategorized";
      cats[cat] = (cats[cat] || 0) + 1;
    }
    return cats;
  }, [uploads]);

  // Compliance doc status — which required docs are uploaded
  const complianceStatus = useMemo(() => {
    const uploaded = new Set(uploads.map(u => u.category).filter(Boolean));
    const compUploaded = uploads.filter(u => u.category === "compliance" || u.category === "governance" || u.category === "financial");
    return {
      total: ORG_DOCS.length,
      uploaded: complianceDocs?.length || 0,
    };
  }, [uploads, complianceDocs]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadFile(file, null, uploadCat);
      // Reload
      const data = await getUploads();
      setUploads(data || []);
      setShowUpload(false);
    } catch (err) {
      alert("Upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!confirm("Delete this document?")) return;
    try {
      await deleteUpload(id);
      setUploads(prev => prev.filter(u => u.id !== id));
    } catch (err) {
      alert("Delete failed: " + err.message);
    }
  };

  const handleView = async (doc) => {
    try {
      const { url } = await getUploadDownloadUrl(doc.id);
      if (url) window.open(url, "_blank");
    } catch (err) {
      alert("Could not open file: " + err.message);
    }
  };

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.dark, letterSpacing: -0.3 }}>Document Vault</div>
          <div style={{ fontSize: 13, color: C.t3, marginTop: 2 }}>
            Org documents, proposals, and compliance files in one place
          </div>
        </div>
        <Btn v="primary" style={{ fontSize: 12, padding: "8px 16px" }} onClick={() => setShowUpload(!showUpload)}>
          + Upload Document
        </Btn>
      </div>

      {/* Upload panel */}
      {showUpload && (
        <div style={{
          background: C.white, borderRadius: 10, padding: "14px 18px", marginBottom: 14,
          border: `1px solid ${C.primary}30`, boxShadow: C.cardShadow,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, marginBottom: 10 }}>Upload a document</div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.t3, display: "block", marginBottom: 4 }}>Category</label>
              <select
                value={uploadCat}
                onChange={e => setUploadCat(e.target.value)}
                style={{ padding: "6px 10px", fontSize: 12, fontFamily: FONT, border: `1px solid ${C.line}`, borderRadius: 6 }}
              >
                {DOC_CATEGORIES.filter(c => c.id !== "all").map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.t3, display: "block", marginBottom: 4 }}>File</label>
              <input
                type="file"
                onChange={handleUpload}
                disabled={uploading}
                accept=".pdf,.doc,.docx,.xlsx,.xls,.csv,.txt,.md,.jpg,.jpeg,.png"
                style={{ fontSize: 12, fontFamily: FONT }}
              />
            </div>
            {uploading && <span style={{ fontSize: 12, color: C.t3 }}>Uploading...</span>}
          </div>
        </div>
      )}

      {/* Category tabs */}
      <div style={{
        display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap",
      }}>
        {DOC_CATEGORIES.map(cat => {
          const count = cat.id === "all" ? uploads.length : (stats[cat.id] || 0);
          const active = activeCategory === cat.id;
          return (
            <button key={cat.id} onClick={() => setActiveCategory(cat.id)} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 14px", fontSize: 12, fontWeight: 600, fontFamily: FONT,
              borderRadius: 8,
              border: `1px solid ${active ? C.primary : C.line}`,
              background: active ? C.primarySoft : C.white,
              color: active ? C.primary : C.t3,
              cursor: "pointer", transition: "all 0.15s",
            }}>
              <span>{cat.icon}</span>
              {cat.label}
              {count > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, fontFamily: MONO,
                  background: active ? C.primary + "20" : C.raised,
                  color: active ? C.primary : C.t4,
                  padding: "1px 7px", borderRadius: 100,
                }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Required org docs checklist — show when governance/compliance/financial selected */}
      {["governance", "financial", "compliance"].includes(activeCategory) && (
        <div style={{
          background: C.white, borderRadius: 10, padding: "14px 18px", marginBottom: 14,
          border: `1px solid ${C.line}`, boxShadow: C.cardShadow,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, marginBottom: 8 }}>
            Required documents ({activeCategory})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {ORG_DOCS
              .filter(doc => ORG_DOC_CAT_MAP[doc.cat] === activeCategory)
              .map(doc => {
                const hasFile = uploads.some(u =>
                  u.category === activeCategory &&
                  (u.original_name || "").toLowerCase().includes(doc.name.toLowerCase().split(" ")[0].toLowerCase())
                );
                const compDoc = (complianceDocs || []).find(c => c.doc_id === doc.id);
                const isUploaded = hasFile || !!compDoc;
                return (
                  <div key={doc.id} style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "5px 10px", fontSize: 11, fontWeight: 500,
                    borderRadius: 6,
                    border: `1px solid ${isUploaded ? C.ok + "30" : C.amber + "30"}`,
                    background: isUploaded ? C.okSoft : C.amberSoft,
                    color: isUploaded ? C.ok : C.amber,
                  }}>
                    <span>{isUploaded ? "✓" : "○"}</span>
                    {doc.name}
                    {doc.renew && !isUploaded && (
                      <span style={{ fontSize: 9, color: C.red }}>needs renewal</span>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Proposal library info */}
      {activeCategory === "proposal" && (
        <div style={{
          background: `linear-gradient(135deg, ${C.primarySoft} 0%, ${C.blueSoft || C.primarySoft} 100%)`,
          borderRadius: 10, padding: "12px 18px", marginBottom: 14,
          border: `1px solid ${C.primary}15`,
        }}>
          <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.5 }}>
            Proposals are auto-saved here when a grant moves to "Submitted". You can also manually upload past proposals.
            The AI uses these as reference when drafting new proposals for similar funders.
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: C.t3, fontSize: 13 }}>Loading documents...</div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div style={{
          textAlign: "center", padding: "40px 20px",
          background: C.white, borderRadius: 10, border: `1px solid ${C.line}`,
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.dark, marginBottom: 4 }}>
            No documents{activeCategory !== "all" ? ` in ${DOC_CATEGORIES.find(c => c.id === activeCategory)?.label}` : ""}
          </div>
          <div style={{ fontSize: 12, color: C.t3 }}>
            Upload documents to build your vault
          </div>
        </div>
      )}

      {/* Document list */}
      {!loading && filtered.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map(doc => {
            const age = daysSince(doc.created_at);
            const catInfo = DOC_CATEGORIES.find(c => c.id === doc.category) || { icon: "📄", label: doc.category || "Other" };
            return (
              <div key={doc.id} onClick={() => handleView(doc)} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "10px 14px",
                background: C.white, borderRadius: 8, border: `1px solid ${C.line}`,
                boxShadow: C.cardShadow, cursor: "pointer", transition: "all 0.15s",
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.primary + "60"; e.currentTarget.style.boxShadow = C.cardShadowHover; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.boxShadow = C.cardShadow; }}
              >
                {/* Icon */}
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: C.raised, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 16, flexShrink: 0,
                }}>
                  {doc.mime_type?.includes("pdf") ? "📕" :
                   doc.mime_type?.includes("word") ? "📘" :
                   doc.mime_type?.includes("sheet") || doc.mime_type?.includes("excel") ? "📗" :
                   doc.mime_type?.includes("image") ? "🖼" :
                   "📄"}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: C.dark,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {doc.original_name}
                  </div>
                  <div style={{ display: "flex", gap: 10, fontSize: 11, color: C.t3, marginTop: 2 }}>
                    <span>{formatBytes(doc.size)}</span>
                    <span>{catInfo.icon} {catInfo.label}</span>
                    {doc.has_text && <span style={{ color: C.ok }}>Text extracted</span>}
                    {age !== null && <span>{age === 0 ? "Today" : age === 1 ? "Yesterday" : `${age}d ago`}</span>}
                    {doc.grant_id && (
                      <span style={{ color: C.primary }}>Linked to grant</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleView(doc); }}
                  style={{
                    fontSize: 11, color: C.primary, background: "none",
                    border: `1px solid ${C.primary}30`, borderRadius: 5,
                    cursor: "pointer", fontFamily: FONT, padding: "4px 10px", fontWeight: 600,
                  }}
                  title="View / Download"
                >View ↗</button>
                <button
                  onClick={(e) => handleDelete(doc.id, e)}
                  style={{
                    fontSize: 12, color: C.t4, background: "none", border: "none",
                    cursor: "pointer", fontFamily: FONT, padding: "4px 8px",
                  }}
                  title="Delete document"
                >✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
