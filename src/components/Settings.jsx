import { useState, useEffect, useMemo, useRef } from "react";
import { C, FONT, MONO } from "../theme";
import { Btn, Label, Avatar, RoleBadge } from "./index";
import UploadZone from "./UploadZone";
import { checkHealth, getUploads, uploadFile } from "../api";
import { ORG_DOCS } from "../data/constants";

// ── Compliance doc status helpers ──
const statusIcon = (status, daysLeft) => {
  if (status === "valid" || status === "uploaded") {
    if (daysLeft !== null && daysLeft <= 30) return { icon: "⚠️", color: C.amber, bg: C.amberSoft, label: daysLeft <= 0 ? "Expired" : `Expires in ${daysLeft}d` };
    return { icon: "✓", color: C.ok, bg: C.okSoft, label: status === "uploaded" ? "Uploaded" : "Valid" };
  }
  if (status === "expired") return { icon: "✗", color: C.red, bg: C.redSoft, label: "Expired" };
  return { icon: "–", color: C.t4, bg: C.hover, label: "Missing" };
};

const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000);
};

const CAT_ORDER = ["Registration", "Compliance", "Financial", "Governance", "Org"];

export default function Settings({ org, profile, team, complianceDocs = [], onUpsertCompDoc, onUpdateProfile, onLogout }) {
  const [serverStatus, setServerStatus] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [expanded, setExpanded] = useState(null); // doc_id of expanded row
  const [editExpiry, setEditExpiry] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const loadUploads = async () => {
    try {
      const data = await getUploads(); // no grantId = org-level
      setUploads(data);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    checkHealth().then(setServerStatus);
    loadUploads();
  }, []);

  // Build a map: doc_id → compliance record
  const compMap = useMemo(() => {
    const m = {};
    for (const c of complianceDocs) m[c.doc_id] = c;
    return m;
  }, [complianceDocs]);

  // Group ORG_DOCS by category
  const grouped = useMemo(() => {
    const g = {};
    for (const cat of CAT_ORDER) g[cat] = [];
    for (const d of ORG_DOCS) {
      if (!g[d.cat]) g[d.cat] = [];
      g[d.cat].push(d);
    }
    return g;
  }, []);

  // Summary counts
  const summary = useMemo(() => {
    let ready = 0, missing = 0, expiring = 0;
    for (const d of ORG_DOCS) {
      const c = compMap[d.id];
      if (!c || c.status === "missing") { missing++; continue; }
      if (c.status === "expired") { missing++; continue; }
      const dl = daysUntil(c.expiry);
      if (dl !== null && dl <= 30 && dl > 0) { expiring++; ready++; }
      else if (dl !== null && dl <= 0) { missing++; }
      else { ready++; }
    }
    return { ready, missing, expiring, total: ORG_DOCS.length };
  }, [compMap]);

  // Handle expand/collapse
  const toggleExpand = (docId) => {
    if (expanded === docId) {
      setExpanded(null);
    } else {
      setExpanded(docId);
      const c = compMap[docId];
      setEditExpiry(c?.expiry || "");
      setEditNotes(c?.notes || "");
    }
  };

  // Handle file upload for a compliance doc
  const handleUpload = async (orgDoc, file) => {
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
        expiry: editExpiry || null,
        notes: editNotes || null,
      });
    } catch (err) {
      console.error("Compliance upload failed:", err);
    } finally {
      setUploading(false);
    }
  };

  // Save just expiry/notes without re-uploading
  const handleSaveMeta = async (orgDoc) => {
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
      expiry: editExpiry || null,
      notes: editNotes || null,
    });
  };

  return (
    <div style={{ padding: "28px 32px", maxWidth: 800 }}>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5, color: C.dark, marginBottom: 6 }}>Settings</div>
      <div style={{ width: 32, height: 4, background: C.primary, borderRadius: 2, marginBottom: 24 }} />

      {/* Org info */}
      <div style={{ background: C.white, borderRadius: 16, padding: 24, boxShadow: C.cardShadow, marginBottom: 20, border: `1.5px solid ${C.primary}25` }}>
        <Label>Organisation</Label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>Name</span>
            <div style={{ fontSize: 15, color: C.dark, fontWeight: 600, marginTop: 2 }}>{org?.name}</div>
          </div>
          <div>
            <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>Slug</span>
            <div style={{ fontSize: 14, color: C.t2, fontFamily: MONO, marginTop: 2 }}>/{org?.slug}</div>
          </div>
          <div>
            <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>Website</span>
            <div style={{ fontSize: 14, color: C.t2, marginTop: 2 }}>{org?.website || "\u2014"}</div>
          </div>
          <div>
            <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>Industry</span>
            <div style={{ fontSize: 14, color: C.t2, marginTop: 2 }}>{org?.industry || "\u2014"}</div>
          </div>
          <div>
            <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>Country</span>
            <div style={{ fontSize: 14, color: C.t2, marginTop: 2 }}>{org?.country || "South Africa"}</div>
          </div>
          <div>
            <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>Currency</span>
            <div style={{ fontSize: 14, color: C.t2, marginTop: 2 }}>{org?.currency || "ZAR"}</div>
          </div>
        </div>
      </div>

      {/* Profile */}
      {profile && (
        <div style={{ background: C.white, borderRadius: 16, padding: 24, boxShadow: C.cardShadow, marginBottom: 20, border: `1.5px solid ${C.primary}25` }}>
          <Label>Profile</Label>
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>Mission</span>
            <div style={{ fontSize: 13, color: C.t1, marginTop: 4, lineHeight: 1.6 }}>{profile.mission || "Not set"}</div>
          </div>
          {profile.programmes && profile.programmes.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>Programmes</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {profile.programmes.map((p, i) => (
                  <span key={i} style={{ padding: "4px 10px", fontSize: 12, background: C.primarySoft, color: C.primary, borderRadius: 6, fontWeight: 600 }}>
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Knowledge Base */}
      <div style={{ background: C.white, borderRadius: 16, padding: 24, boxShadow: C.cardShadow, marginBottom: 20, border: `1.5px solid ${C.primary}25` }}>
        <UploadZone
          uploads={uploads}
          grantId={null}
          onUploadsChange={loadUploads}
          label="Knowledge Base"
        />
        <div style={{ fontSize: 11, color: C.t4, marginTop: 8, lineHeight: 1.5 }}>
          Upload annual reports, strategy docs, budgets, impact reports, and YouTube URLs.
          Extracted text feeds into all AI-generated proposals and research for this organisation.
        </div>
      </div>

      {/* ═══ Compliance Documents ═══ */}
      <div style={{ background: C.white, borderRadius: 16, padding: 24, boxShadow: C.cardShadow, marginBottom: 20, border: `1.5px solid ${C.primary}25` }}>
        {/* Header + summary bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <Label style={{ marginBottom: 0 }}>Compliance Documents</Label>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {summary.expiring > 0 && (
              <span style={{ fontSize: 11, fontWeight: 600, color: C.amber, background: C.amberSoft, padding: "3px 8px", borderRadius: 6 }}>
                {summary.expiring} expiring
              </span>
            )}
            <span style={{ fontSize: 12, fontWeight: 700, color: summary.ready === summary.total ? C.ok : C.t2 }}>
              {summary.ready}/{summary.total} ready
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ height: 4, background: C.line, borderRadius: 2, marginBottom: 20, overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${(summary.ready / summary.total) * 100}%`,
            background: summary.ready === summary.total ? C.ok : C.primary,
            borderRadius: 2,
            transition: "width 0.3s ease",
          }} />
        </div>

        <div style={{ fontSize: 11, color: C.t4, marginBottom: 16, lineHeight: 1.5 }}>
          Upload your organisation's registration, compliance, and governance documents.
          These are cross-referenced with funder requirements on each grant.
        </div>

        {/* Grouped document list */}
        {CAT_ORDER.map(cat => {
          const docs = grouped[cat];
          if (!docs || !docs.length) return null;
          return (
            <div key={cat} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, paddingLeft: 4 }}>
                {cat}
              </div>
              <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
                {docs.map((d, i) => {
                  const c = compMap[d.id];
                  const dl = daysUntil(c?.expiry);
                  const st = statusIcon(c?.status, dl);
                  const isExpanded = expanded === d.id;

                  return (
                    <div key={d.id}>
                      {/* Row */}
                      <div
                        onClick={() => toggleExpand(d.id)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10,
                          padding: "10px 14px", cursor: "pointer",
                          borderBottom: (i < docs.length - 1 || isExpanded) ? `1px solid ${C.line}` : "none",
                          background: isExpanded ? C.hover : "transparent",
                          transition: "background 0.15s",
                        }}
                        onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = C.hover; }}
                        onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = "transparent"; }}
                      >
                        {/* Status indicator */}
                        <span style={{
                          width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 800, color: st.color, background: st.bg,
                        }}>
                          {st.icon}
                        </span>

                        {/* Name + description */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>{d.name}</div>
                          {d.desc && !isExpanded && (
                            <div style={{ fontSize: 11, color: C.t4, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.desc}</div>
                          )}
                        </div>

                        {/* Status label */}
                        <span style={{ fontSize: 11, fontWeight: 600, color: st.color, whiteSpace: "nowrap" }}>
                          {st.label}
                        </span>

                        {/* File info */}
                        {c?.file_name && (
                          <span style={{ fontSize: 10, color: C.t4, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {c.file_name}
                          </span>
                        )}

                        {/* Expand arrow */}
                        <span style={{ fontSize: 10, color: C.t4, transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▼</span>
                      </div>

                      {/* Expanded panel */}
                      {isExpanded && (
                        <div style={{ padding: "14px 14px 16px", background: C.warm100, borderBottom: i < docs.length - 1 ? `1px solid ${C.line}` : "none" }}>
                          {d.desc && (
                            <div style={{ fontSize: 12, color: C.t3, marginBottom: 12, lineHeight: 1.5 }}>{d.desc}</div>
                          )}

                          {/* Upload section */}
                          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
                            <input
                              ref={fileRef}
                              type="file"
                              style={{ display: "none" }}
                              onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) handleUpload(d, file);
                                e.target.value = "";
                              }}
                            />
                            <Btn
                              onClick={() => fileRef.current?.click()}
                              v="secondary"
                              style={{ fontSize: 12, padding: "6px 14px" }}
                              disabled={uploading}
                            >
                              {uploading ? "Uploading…" : c?.file_name ? "Replace File" : "Upload File"}
                            </Btn>
                            {c?.file_name && (
                              <span style={{ fontSize: 12, color: C.t2 }}>
                                📄 {c.file_name}
                                {c.file_size ? ` (${(c.file_size / 1024).toFixed(0)} KB)` : ""}
                              </span>
                            )}
                            {c?.uploaded_date && (
                              <span style={{ fontSize: 11, color: C.t4 }}>
                                Uploaded {new Date(c.uploaded_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                              </span>
                            )}
                          </div>

                          {/* Expiry + Notes (only for renewable docs or already has data) */}
                          {(d.renew || c?.expiry || c?.notes) && (
                            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                              {d.renew && (
                                <div>
                                  <div style={{ fontSize: 11, color: C.t4, fontWeight: 600, marginBottom: 4 }}>Expiry Date</div>
                                  <input
                                    type="date"
                                    value={editExpiry}
                                    onChange={e => setEditExpiry(e.target.value)}
                                    style={{
                                      fontSize: 12, padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.line}`,
                                      background: C.white, color: C.dark, outline: "none", fontFamily: FONT,
                                    }}
                                  />
                                </div>
                              )}
                              <div style={{ flex: 1, minWidth: 150 }}>
                                <div style={{ fontSize: 11, color: C.t4, fontWeight: 600, marginBottom: 4 }}>Notes</div>
                                <input
                                  type="text"
                                  value={editNotes}
                                  onChange={e => setEditNotes(e.target.value)}
                                  placeholder="e.g. Renewed via SARS eFiling"
                                  style={{
                                    width: "100%", fontSize: 12, padding: "6px 10px", borderRadius: 8, border: `1px solid ${C.line}`,
                                    background: C.white, color: C.dark, outline: "none", fontFamily: FONT, boxSizing: "border-box",
                                  }}
                                />
                              </div>
                              {c && (
                                <Btn
                                  onClick={() => handleSaveMeta(d)}
                                  v="primary"
                                  style={{ fontSize: 12, padding: "6px 14px" }}
                                >
                                  Save
                                </Btn>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Team */}
      <div style={{ background: C.white, borderRadius: 16, padding: 24, boxShadow: C.cardShadow, marginBottom: 20, border: `1.5px solid ${C.primary}25` }}>
        <Label>Team</Label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {team.filter(t => t.id !== "team").map(m => (
            <div key={m.id} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
              borderRadius: 10, borderBottom: `1px solid ${C.line}`,
              transition: "background 0.15s",
            }}
              onMouseEnter={e => e.currentTarget.style.background = C.hover}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <Avatar member={m} size={34} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.dark }}>{m.name}</div>
                {m.email && <div style={{ fontSize: 12, color: C.t3 }}>{m.email}</div>}
              </div>
              <RoleBadge role={m.role} />
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: C.ok, border: `2px solid ${C.white}` }} />
            </div>
          ))}
        </div>
      </div>

      {/* Server status */}
      <div style={{ background: C.white, borderRadius: 16, padding: 24, boxShadow: C.cardShadow, marginBottom: 20, border: `1.5px solid ${C.primary}25` }}>
        <Label>System</Label>
        <div style={{ display: "flex", gap: 20 }}>
          <div>
            <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>Server</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: serverStatus?.ok ? C.ok : C.red }} />
              <span style={{ fontSize: 13, color: C.t1, fontWeight: 500 }}>{serverStatus?.ok ? "Connected" : "Offline"}</span>
            </div>
          </div>
          <div>
            <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>AI</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: serverStatus?.apiKeyConfigured ? C.ok : C.amber }} />
              <span style={{ fontSize: 13, color: C.t1, fontWeight: 500 }}>{serverStatus?.apiKeyConfigured ? "API key configured" : "No API key"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Logout */}
      <Btn onClick={onLogout} v="ghost" style={{ fontSize: 13 }}>Sign Out</Btn>
    </div>
  );
}
