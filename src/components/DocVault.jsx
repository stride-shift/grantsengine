import { useState, useEffect, useMemo } from "react";
import { C, FONT, MONO } from "../theme";
import { Btn } from "./index";
import { getUploads, uploadFile, deleteUpload, getUploadsByCategory, getUploadDownloadUrl, kvGet, kvSet } from "../api";
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

export default function DocVault({ grants, complianceDocs, currentMember }) {
  const ROLE_LEVELS = { director: 3, board: 3, hop: 2, pm: 1, coord: 1, comms: 0 };
  const memberLevel = ROLE_LEVELS[currentMember?.role] || 0;
  const isAdmin = memberLevel >= 2;
  const [uploads, setUploads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState("all");
  const [uploading, setUploading] = useState(false);
  const [uploadCat, setUploadCat] = useState("org");
  const [uploadVisibility, setUploadVisibility] = useState("public");
  const [showUpload, setShowUpload] = useState(false);
  const [proposalSubTab, setProposalSubTab] = useState("all"); // "all" | "references"
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

  const toggleReference = (id) => {
    setReferenceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      const arr = [...next];
      kvSet("proposal_references", arr).catch(() => {});
      return next;
    });
  };

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

  const handleUpload = async (e, category) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const cat = category || (activeCategory !== "all" ? activeCategory : "org");
      await uploadFile(file, null, cat, uploadVisibility);
      const data = await getUploads();
      setUploads(data || []);
    } catch (err) {
      alert("Upload failed: " + err.message);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const triggerUpload = (cat) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,.doc,.docx,.xlsx,.xls,.csv,.txt,.md,.jpg,.jpeg,.png";
    input.onchange = (e) => handleUpload(e, cat);
    input.click();
  };

  const changeDocCategory = async (docId, newCategory) => {
    try {
      const { f: apiFetch } = await import("../api");
    } catch {}
    // Update category via a PUT to the upload — we need a server endpoint for this
    // For now, use the existing pattern: delete + re-create is too destructive
    // Instead, add a PATCH-style update
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
      </div>

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

      {/* Proposal library sub-tabs */}
      {activeCategory === "proposal" && <>
        <div style={{ display: "flex", gap: 0, marginBottom: 12, borderBottom: `2px solid ${C.line}` }}>
          {[["all", "All Proposals"], ["references", "AI References"]].map(([k, l]) => (
            <button key={k} onClick={() => setProposalSubTab(k)} style={{
              padding: "8px 20px", fontSize: 13, fontWeight: 600, fontFamily: FONT,
              border: "none", cursor: "pointer",
              borderBottom: proposalSubTab === k ? `2px solid ${C.primary}` : "2px solid transparent",
              background: "transparent",
              color: proposalSubTab === k ? C.primary : C.t3,
              marginBottom: -2,
            }}>{l}{k === "references" && referenceIds.size > 0 && (
              <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, background: C.primarySoft, color: C.primary, padding: "1px 6px", borderRadius: 100 }}>{referenceIds.size}</span>
            )}</button>
          ))}
        </div>

        {/* All Proposals explainer */}
        {proposalSubTab === "all" && (
          <div style={{
            background: C.raised, borderRadius: 8, padding: "10px 14px", marginBottom: 10,
          }}>
            <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.5 }}>
              Proposals are auto-saved here when a grant moves to "Submitted". You can also upload past successful proposals manually. Star ★ your best ones to teach the AI — go to <button onClick={() => setProposalSubTab("references")} style={{ color: C.primary, fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 12 }}>AI References</button> to manage them.
            </div>
          </div>
        )}
      </>}

      {/* AI References tab content */}
      {activeCategory === "proposal" && proposalSubTab === "references" && (
        <div style={{
          background: `linear-gradient(135deg, ${C.primarySoft} 0%, ${C.blueSoft || C.primarySoft} 100%)`,
          borderRadius: 10, padding: "14px 18px", marginBottom: 14,
          border: `1px solid ${C.primary}15`,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.primary, marginBottom: 4 }}>Reference Proposals for AI</div>
          <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.5, marginBottom: 12 }}>
            Mark your best proposals as references. The AI studies these when drafting new proposals — matching your tone, structure, and framing. Toggle the star ★ on any proposal to add or remove it.
          </div>

          {filtered.length === 0 ? (
            <div style={{ fontSize: 12, color: C.t3, padding: "12px 0", textAlign: "center" }}>
              No proposals uploaded yet. Go to <button onClick={() => setProposalSubTab("all")} style={{ color: C.primary, fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontFamily: FONT, fontSize: 12 }}>All Proposals</button> to upload some first.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {filtered.map(doc => {
                const isRef = referenceIds.has(doc.id);
                return (
                  <div key={doc.id} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                    background: isRef ? C.white : `${C.white}80`, borderRadius: 8,
                    border: `1px solid ${isRef ? C.primary + "40" : C.line}`,
                  }}>
                    <button onClick={() => toggleReference(doc.id)} style={{
                      fontSize: 20, background: "none", border: "none", cursor: "pointer",
                      color: isRef ? "#F59E0B" : C.t4, padding: 0, lineHeight: 1,
                    }} title={isRef ? "Remove as AI reference" : "Mark as AI reference"}>
                      {isRef ? "★" : "☆"}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.original_name}</div>
                      <div style={{ fontSize: 11, color: doc.has_text ? C.ok : C.amber, marginTop: 1 }}>
                        {doc.has_text ? "✓ Text extracted — AI can read this" : "⚠ No text extracted — AI cannot use this"}
                      </div>
                    </div>
                    {isRef && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: C.ok, background: C.okSoft, padding: "2px 8px", borderRadius: 100, flexShrink: 0 }}>Active reference</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: "center", padding: 40, color: C.t3, fontSize: 13 }}>Loading documents...</div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && !(activeCategory === "proposal" && proposalSubTab === "references") && (
        <div style={{
          textAlign: "center", padding: "40px 20px",
          background: C.white, borderRadius: 10, border: `1px solid ${C.line}`,
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.dark, marginBottom: 4 }}>
            No documents{activeCategory !== "all" ? ` in ${DOC_CATEGORIES.find(c => c.id === activeCategory)?.label}` : ""}
          </div>
          <div style={{ fontSize: 12, color: C.t3, marginBottom: 12 }}>
            Upload documents to get started
          </div>
          <Btn v="primary" style={{ fontSize: 12, padding: "8px 20px" }} onClick={() => triggerUpload(activeCategory === "all" ? "org" : activeCategory)} disabled={uploading}>
            {uploading ? "Uploading..." : `+ Upload to ${DOC_CATEGORIES.find(c => c.id === activeCategory)?.label || "Documents"}`}
          </Btn>
        </div>
      )}

      {/* Document list — hidden when viewing AI References tab */}
      {!loading && filtered.length > 0 && !(activeCategory === "proposal" && proposalSubTab === "references") && (
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
                    {!doc.has_text && doc.mime_type !== "video/youtube" && (
                      <button onClick={async (e) => {
                        e.stopPropagation();
                        const btn = e.currentTarget;
                        btn.textContent = "Extracting...";
                        btn.disabled = true;
                        try {
                          const res = await fetch(`/api/org/${localStorage.getItem("gt_slug")}/uploads/${doc.id}/reextract`, {
                            method: "POST", headers: { "Authorization": `Bearer ${localStorage.getItem("gt_token")}` },
                          });
                          const data = await res.json();
                          if (data.extracted) {
                            btn.textContent = "✓ Done";
                            btn.style.color = C.ok;
                            // Refresh uploads
                            const fresh = await getUploads();
                            setUploads(fresh || []);
                          } else {
                            btn.textContent = "Failed";
                            btn.style.color = C.red;
                          }
                        } catch { btn.textContent = "Error"; btn.style.color = C.red; }
                      }} style={{ fontSize: 10, fontWeight: 600, color: C.blue, background: "none", border: `1px solid ${C.blue}30`, borderRadius: 4, padding: "1px 6px", cursor: "pointer", fontFamily: FONT }}>
                        Re-extract text
                      </button>
                    )}
                    {doc.visibility === "admin" && <span style={{ fontSize: 9, fontWeight: 700, color: C.amber, background: C.amberSoft, padding: "1px 6px", borderRadius: 100 }}>ADMIN ONLY</span>}
                    {age !== null && <span>{age === 0 ? "Today" : age === 1 ? "Yesterday" : `${age}d ago`}</span>}
                    {doc.grant_id && (
                      <span style={{ color: C.primary }}>Linked to grant</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {doc.category === "proposal" && (
                  <button onClick={(e) => { e.stopPropagation(); toggleReference(doc.id); }}
                    style={{
                      fontSize: 18, background: "none", border: "none", cursor: "pointer",
                      color: referenceIds.has(doc.id) ? "#F59E0B" : C.t4, padding: "2px 4px", lineHeight: 1,
                      flexShrink: 0, transition: "all 0.15s",
                    }}
                    title={referenceIds.has(doc.id) ? "Remove as AI reference" : "Mark as AI reference — AI will learn from this proposal"}>
                    {referenceIds.has(doc.id) ? "★" : "☆"}
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); handleView(doc); }}
                  style={{
                    fontSize: 11, color: C.primary, background: "none",
                    border: `1px solid ${C.primary}30`, borderRadius: 5,
                    cursor: "pointer", fontFamily: FONT, padding: "4px 10px", fontWeight: 600, flexShrink: 0,
                  }}
                  title="View / Download"
                >View ↗</button>
                <select
                  value={doc.category || "org"}
                  onClick={e => e.stopPropagation()}
                  onChange={e => { e.stopPropagation(); changeDocCategory(doc.id, e.target.value); }}
                  style={{
                    fontSize: 11, fontFamily: FONT, border: `1px solid ${C.line}`, borderRadius: 5,
                    padding: "4px 6px", background: C.white, color: C.t3, cursor: "pointer", flexShrink: 0,
                  }}
                  title="Move to category"
                >
                  {DOC_CATEGORIES.filter(c => c.id !== "all").map(c => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete "${doc.original_name}"?`)) {
                      deleteUpload(doc.id).then(() => setUploads(prev => prev.filter(u => u.id !== doc.id))).catch(err => alert("Delete failed: " + err.message));
                    }
                  }}
                  style={{
                    fontSize: 14, color: C.t4, background: "none", border: "none",
                    cursor: "pointer", fontFamily: FONT, padding: "4px 8px", flexShrink: 0,
                  }}
                  title="Delete document"
                >✕</button>
              </div>
            );
          })}
          {/* Inline upload button at bottom of list */}
          <button onClick={() => triggerUpload(activeCategory === "all" ? "org" : activeCategory)} disabled={uploading}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "10px 14px", borderRadius: 8,
              border: `1px dashed ${C.line}`, background: "transparent",
              cursor: "pointer", fontFamily: FONT, fontSize: 12, fontWeight: 600, color: C.t3,
              transition: "all 0.15s", width: "100%",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.primary; e.currentTarget.style.color = C.primary; e.currentTarget.style.background = C.primarySoft; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.color = C.t3; e.currentTarget.style.background = "transparent"; }}
          >
            {uploading ? "Uploading..." : `+ Upload to ${DOC_CATEGORIES.find(c => c.id === activeCategory)?.label || "Documents"}`}
          </button>
        </div>
      )}
    </div>
  );
}
