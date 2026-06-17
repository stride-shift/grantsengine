import { useState, useEffect, useMemo, useRef } from "react";
import { C, FONT, MONO, resetTheme } from "../theme";
import { Btn, Label, Avatar, RoleBadge } from "./index";
import UploadZone from "./UploadZone";
import { checkHealth, getUploads, uploadFile, uploadOrgLogo, memberSetPassword } from "../api";
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

function ChangePassword({ memberId, slug }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        background: C.warm200, border: "none", borderRadius: 8, padding: "6px 14px",
        fontSize: 12, fontWeight: 600, color: C.t2, cursor: "pointer", fontFamily: FONT,
        transition: "all 0.15s",
      }}
        onMouseEnter={e => { e.currentTarget.style.background = C.navySoft; }}
        onMouseLeave={e => { e.currentTarget.style.background = C.warm200; }}
      >Change Password</button>
    );
  }

  const submit = async () => {
    if (!pw || pw.length < 6) { setMsg("Min 6 characters"); return; }
    if (pw !== pw2) { setMsg("Passwords don't match"); return; }
    setBusy(true);
    setMsg("");
    try {
      await memberSetPassword(slug, memberId, pw);
      setMsg("✓ Password updated");
      setPw(""); setPw2("");
      setTimeout(() => { setOpen(false); setMsg(""); }, 1500);
    } catch (ex) {
      setMsg(ex.message);
    }
    setBusy(false);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <input type="password" aria-label="New password" value={pw} onChange={e => setPw(e.target.value)}
        placeholder="New password" style={{
          width: 120, padding: "5px 10px", fontSize: 12, borderRadius: 8,
          border: `1px solid ${C.line}`, outline: "none", fontFamily: FONT,
        }} />
      <input type="password" aria-label="Confirm new password" value={pw2} onChange={e => setPw2(e.target.value)}
        placeholder="Confirm" style={{
          width: 100, padding: "5px 10px", fontSize: 12, borderRadius: 8,
          border: `1px solid ${C.line}`, outline: "none", fontFamily: FONT,
        }} />
      <Btn onClick={submit} disabled={busy} style={{ fontSize: 11, padding: "5px 12px" }}>
        {busy ? "..." : "Save"}
      </Btn>
      <button onClick={() => { setOpen(false); setMsg(""); }} style={{
        background: "none", border: "none", color: C.t4, cursor: "pointer", fontSize: 12, fontFamily: FONT,
      }}>Cancel</button>
      {msg && <span style={{ fontSize: 11, color: msg.startsWith("✓") ? C.ok : C.red }}>{msg}</span>}
    </div>
  );
}

/* Editable knowledge base for the org profile.
 *
 * Why this exists: the AI uses these fields as its source of truth for every
 * proposal, fit score, and budget. Hardcoded programme templates would lock
 * the app to one org — this lets each client define their own programmes,
 * costs, tone, and history so the AI infers everything from their own data.
 */
function KnowledgeBaseEditor({ profile, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);

  const startEdit = () => {
    setDraft({
      mission: profile.mission || "",
      programmes: Array.isArray(profile.programmes) ? [...profile.programmes] : [],
      tone: profile.tone || "",
      anti_patterns: profile.anti_patterns || "",
      past_funders: profile.past_funders || "",
      impact_stats: profile.impact_stats || {},
      context_slim: profile.context_slim || "",
      context_full: profile.context_full || "",
    });
    setEditing(true);
  };

  const cancel = () => { setDraft(null); setEditing(false); };

  const save = async () => {
    if (!onSave || !draft) return;
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
      setDraft(null);
    } catch (e) {
      console.error("Failed to save profile:", e);
      alert("Failed to save: " + e.message);
    }
    setSaving(false);
  };

  // ── Read-only view ──
  if (!editing) {
    const programmes = Array.isArray(profile.programmes) ? profile.programmes : [];
    const stats = profile.impact_stats || {};
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: C.t3, textTransform: "uppercase",
          letterSpacing: 0.8, marginBottom: 8, display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: profile.mission ? C.ok : C.amber }} />
          Knowledge Base
          <span style={{ fontSize: 10, fontWeight: 500, color: C.t4, textTransform: "none", letterSpacing: 0 }}>
            — AI uses this to write every proposal
          </span>
          <button onClick={startEdit} style={{
            marginLeft: "auto", fontSize: 11, fontWeight: 600, color: C.primary,
            background: C.primarySoft, border: "none", borderRadius: 6,
            padding: "4px 12px", cursor: "pointer", fontFamily: FONT,
          }}>Edit</button>
        </div>
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
          <KBField label="Mission" value={profile.mission} empty="Add a 1-2 sentence statement of who you are and what you do." />
          <KBField
            label={`Programmes (${programmes.length})`}
            empty="Add the programme types you deliver — name, cost, students, duration. The AI uses these to size every budget."
            value={programmes.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {programmes.map((p, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ padding: "3px 8px", fontSize: 11, background: C.primarySoft, color: C.primary, borderRadius: 6, fontWeight: 600 }}>
                      {p.name || "(unnamed)"}
                    </span>
                    {p.cost > 0 && <span style={{ fontSize: 11, color: C.t3, fontFamily: MONO }}>R{Number(p.cost).toLocaleString()}</span>}
                    {p.students && <span style={{ fontSize: 11, color: C.t3 }}>· {p.students} students</span>}
                    {p.duration && <span style={{ fontSize: 11, color: C.t3 }}>· {p.duration}</span>}
                    {p.description && <span style={{ fontSize: 11, color: C.t4, flex: 1 }}>— {p.description}</span>}
                  </div>
                ))}
              </div>
            ) : null}
          />
          {(stats.completion_rate != null || stats.employment_rate != null || stats.learners_trained != null) && (
            <KBField label="Impact stats" value={
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {stats.completion_rate != null && <span><strong style={{ color: C.ok }}>{Math.round(stats.completion_rate * 100)}%</strong> Completion</span>}
                {stats.employment_rate != null && <span><strong style={{ color: C.primary }}>{Math.round(stats.employment_rate * 100)}%</strong> Employment</span>}
                {stats.learners_trained != null && <span><strong style={{ color: C.dark }}>{stats.learners_trained}+</strong> Learners trained</span>}
              </div>
            } />
          )}
          <KBField label="Tone" value={profile.tone} empty="How proposals should sound — warm, formal, founder-led, evidence-first, etc." />
          <KBField label="Anti-patterns" value={profile.anti_patterns} empty="Phrases or framings the AI should NEVER use (e.g. 'imagine a world where', 'leverage synergies')." />
          <KBField label="Past funders" value={profile.past_funders} empty="Comma-separated list of organisations that have funded you before — gives AI context on what works." />
          <KBField label="Extended context" value={profile.context_slim} mono empty="A longer org description the AI can reference. Paste your boilerplate org bio, theory of change, signature stories." last />
        </div>
      </div>
    );
  }

  // ── Edit view ──
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: C.t3, textTransform: "uppercase",
        letterSpacing: 0.8, marginBottom: 8, display: "flex", alignItems: "center", gap: 6,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.amber }} />
        Knowledge Base (editing)
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button onClick={cancel} style={{
            fontSize: 11, fontWeight: 600, color: C.t3, background: "none",
            border: `1px solid ${C.line}`, borderRadius: 6, padding: "4px 12px",
            cursor: "pointer", fontFamily: FONT,
          }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{
            fontSize: 11, fontWeight: 700, color: C.white,
            background: saving ? C.t4 : C.primary, border: "none",
            borderRadius: 6, padding: "4px 14px", cursor: saving ? "wait" : "pointer", fontFamily: FONT,
          }}>{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </div>
      <div style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
        <EditField label="Mission" hint="One or two sentences. Who you are, what you do, who you serve.">
          <textarea aria-label="Mission" value={draft.mission} onChange={e => setDraft(d => ({ ...d, mission: e.target.value }))}
            rows={3} style={kbInputStyle} placeholder="e.g. We train unemployed youth in AI-native digital skills…" />
        </EditField>

        <ProgrammesEditor programmes={draft.programmes} onChange={list => setDraft(d => ({ ...d, programmes: list }))} />

        <EditField label="Impact stats" hint="Completion rate, employment rate, learners trained — used as proof points.">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8 }}>
            <PctInput label="Completion %" value={draft.impact_stats?.completion_rate}
              onChange={v => setDraft(d => ({ ...d, impact_stats: { ...(d.impact_stats || {}), completion_rate: v } }))} />
            <PctInput label="Employment %" value={draft.impact_stats?.employment_rate}
              onChange={v => setDraft(d => ({ ...d, impact_stats: { ...(d.impact_stats || {}), employment_rate: v } }))} />
            <NumInput label="Learners trained" value={draft.impact_stats?.learners_trained}
              onChange={v => setDraft(d => ({ ...d, impact_stats: { ...(d.impact_stats || {}), learners_trained: v } }))} />
          </div>
        </EditField>

        <EditField label="Tone" hint="How the AI should write — warm, formal, founder-led, technical, etc.">
          <textarea aria-label="Tone" value={draft.tone} onChange={e => setDraft(d => ({ ...d, tone: e.target.value }))}
            rows={2} style={kbInputStyle} placeholder="e.g. Warm and confident. A founder who knows the work; avoid corporate buzz-words." />
        </EditField>

        <EditField label="Anti-patterns" hint="Phrases or framings the AI must NEVER use.">
          <textarea aria-label="Anti-patterns" value={draft.anti_patterns} onChange={e => setDraft(d => ({ ...d, anti_patterns: e.target.value }))}
            rows={2} style={kbInputStyle} placeholder="e.g. 'Imagine a world where', 'leverage synergies', stat-only openings…" />
        </EditField>

        <EditField label="Past funders" hint="Comma-separated. Helps AI lean on continuity language for returning funders.">
          <textarea aria-label="Past funders" value={draft.past_funders} onChange={e => setDraft(d => ({ ...d, past_funders: e.target.value }))}
            rows={2} style={kbInputStyle} placeholder="e.g. GIDF, DG Murray Trust, TK Foundation, CCBA Foundation" />
        </EditField>

        <EditField label="Extended context" hint="Longer org bio, theory of change, signature stories. Injected into every AI prompt as background.">
          <textarea aria-label="Extended context" value={draft.context_slim} onChange={e => setDraft(d => ({ ...d, context_slim: e.target.value }))}
            rows={10} style={{ ...kbInputStyle, fontFamily: MONO, fontSize: 11 }}
            placeholder="Paste org description, programme details, alumni stories — anything the AI should always have access to." />
          <div style={{ fontSize: 10, color: C.t4, marginTop: 4 }}>
            {(draft.context_slim || "").length.toLocaleString()} characters — keep under 8,000 to leave room for funder-specific context.
          </div>
        </EditField>
      </div>
    </div>
  );
}

const kbInputStyle = {
  width: "100%", padding: "8px 10px", fontSize: 12, lineHeight: 1.5,
  border: `1px solid ${C.line}`, borderRadius: 6, outline: "none",
  resize: "vertical", boxSizing: "border-box", fontFamily: FONT,
};

function EditField({ label, hint, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>{label}</div>
      {hint && <div style={{ fontSize: 11, color: C.t4, marginBottom: 6 }}>{hint}</div>}
      {children}
    </div>
  );
}

function KBField({ label, value, empty, mono, last }) {
  const hasValue = !!value && (typeof value !== "string" || value.trim().length > 0);
  return (
    <div style={{ padding: "10px 14px", borderBottom: last ? "none" : `1px solid ${C.line}` }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.t4, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>{label}</div>
      {hasValue ? (
        typeof value === "string"
          ? <div style={{ fontSize: 12, color: C.t1, lineHeight: 1.5, fontFamily: mono ? MONO : FONT, whiteSpace: mono ? "pre-wrap" : "normal" }}>{value}</div>
          : value
      ) : (
        <div style={{ fontSize: 11, color: C.t4, fontStyle: "italic" }}>{empty || "Not set"}</div>
      )}
    </div>
  );
}

function PctInput({ label, value, onChange }) {
  const v = value != null ? Math.round(value * 100) : "";
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.t4, marginBottom: 4 }}>{label}</div>
      <input type="number" min={0} max={100} value={v}
        onChange={e => { const n = parseInt(e.target.value); onChange(isNaN(n) ? null : Math.max(0, Math.min(100, n)) / 100); }}
        style={{ ...kbInputStyle, width: "100%" }} />
    </label>
  );
}

function NumInput({ label, value, onChange }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.t4, marginBottom: 4 }}>{label}</div>
      <input type="number" min={0} value={value != null ? value : ""}
        onChange={e => { const n = parseInt(e.target.value); onChange(isNaN(n) ? null : n); }}
        style={{ ...kbInputStyle, width: "100%" }} />
    </label>
  );
}

function ProgrammesEditor({ programmes, onChange }) {
  const update = (i, patch) => onChange(programmes.map((p, j) => j === i ? { ...p, ...patch } : p));
  const remove = (i) => onChange(programmes.filter((_, j) => j !== i));
  const add = () => onChange([...programmes, { name: "", cost: 0, students: "", duration: "", description: "" }]);

  return (
    <EditField
      label={`Programmes (${programmes.length})`}
      hint="The AI uses these to size every budget recommendation. Add the programme types you actually deliver — name, full cost, expected enrolment, duration."
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {programmes.map((p, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr 2fr 30px", gap: 6, alignItems: "start" }}>
            <input value={p.name || ""} onChange={e => update(i, { name: e.target.value })}
              placeholder="Programme name" style={kbInputStyle} />
            <input type="number" min={0} value={p.cost || ""} onChange={e => update(i, { cost: parseInt(e.target.value) || 0 })}
              placeholder="Cost (R)" style={{ ...kbInputStyle, fontFamily: MONO }} />
            <input value={p.students || ""} onChange={e => update(i, { students: e.target.value })}
              placeholder="Students" style={kbInputStyle} />
            <input value={p.duration || ""} onChange={e => update(i, { duration: e.target.value })}
              placeholder="Duration (e.g. 9 months)" style={kbInputStyle} />
            <input value={p.description || ""} onChange={e => update(i, { description: e.target.value })}
              placeholder="Short description (optional)" style={kbInputStyle} />
            <button onClick={() => remove(i)} title="Remove programme" style={{
              background: "none", border: "none", color: C.t4, cursor: "pointer",
              fontSize: 14, padding: 0, fontFamily: FONT,
            }}>×</button>
          </div>
        ))}
        <button onClick={add} style={{
          alignSelf: "flex-start", fontSize: 11, fontWeight: 600, color: C.primary,
          background: C.primarySoft, border: "none", borderRadius: 6,
          padding: "5px 12px", cursor: "pointer", fontFamily: FONT,
        }}>+ Add programme</button>
      </div>
    </EditField>
  );
}

export default function Settings({ org, profile, team, currentMember, complianceDocs = [], onUpsertCompDoc, onUpdateProfile, onUpdateOrg, onLogout, onLaunchTour }) {
  const [serverStatus, setServerStatus] = useState(null);
  const [uploads, setUploads] = useState([]);
  const [expanded, setExpanded] = useState(null); // doc_id of expanded row
  const [editFields, setEditFields] = useState({}); // { [docId]: { expiry, notes } }
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  // ── Branding state ──
  const [brandPrimary, setBrandPrimary] = useState(org?.primary_color || "#4A7C59");
  const [brandAccent, setBrandAccent] = useState(org?.accent_color || "#C17817");
  const [brandSaving, setBrandSaving] = useState(false);
  const [brandMsg, setBrandMsg] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const logoRef = useRef(null);

  // ── Google Calendar state ──
  const [gcalConnected, setGcalConnected] = useState(false);
  const [gcalLoading, setGcalLoading] = useState(false);
  const [gcalSyncing, setGcalSyncing] = useState(false);
  const [gcalMsg, setGcalMsg] = useState("");

  useEffect(() => {
    import("../api").then(({ getGcalStatus }) => {
      getGcalStatus().then(d => setGcalConnected(d.connected)).catch(() => {});
    });
    // Listen for OAuth callback
    const handler = async (e) => {
      if (e.data === "gcal-connected") {
        setGcalConnected(true);
        setGcalMsg("Connected! Syncing deadlines...");
        try {
          const { syncAllToGcal } = await import("../api");
          const r = await syncAllToGcal();
          setGcalMsg(`Connected — ${r.synced} deadline${r.synced !== 1 ? "s" : ""} synced to your calendar`);
        } catch { setGcalMsg("Connected — auto-sync failed, try again later"); }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Sync branding state when org changes
  useEffect(() => {
    if (org) {
      setBrandPrimary(org.primary_color || "#4A7C59");
      setBrandAccent(org.accent_color || "#C17817");
    }
  }, [org?.primary_color, org?.accent_color]);

  const loadUploads = async () => {
    try {
      const data = await getUploads(); // no grantId = org-level
      setUploads(data);
    } catch (e) { console.warn("Failed to load uploads:", e.message); }
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
      // Initialize edit fields for this doc if not already set
      if (!editFields[docId]) {
        const c = compMap[docId];
        setEditFields(prev => ({ ...prev, [docId]: { expiry: c?.expiry || "", notes: c?.notes || "" } }));
      }
    }
  };
  const getEditField = (docId, field) => editFields[docId]?.[field] || "";
  const setEditField = (docId, field, value) => setEditFields(prev => ({ ...prev, [docId]: { ...prev[docId], [field]: value } }));

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
        expiry: getEditField(orgDoc.id, "expiry") || null,
        notes: getEditField(orgDoc.id, "notes") || null,
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
      expiry: getEditField(orgDoc.id, "expiry") || null,
      notes: getEditField(orgDoc.id, "notes") || null,
    });
  };

  return (
    <div style={{ padding: "16px 16px", maxWidth: 800 }}>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, color: C.dark, marginBottom: 6 }}>Settings</div>
      <div style={{ width: 32, height: 3, background: C.primary, borderRadius: 2, marginBottom: 20 }} />

      {/* Logged-in-as banner */}
      {currentMember && (
        <div style={{
          background: C.white, borderRadius: 10, padding: "12px 16px", boxShadow: C.cardShadow, marginBottom: 16,
          border: `1px solid ${C.primary}25`, display: "flex", alignItems: "center", gap: 14,
        }}>
          <Avatar member={currentMember} size={36} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>{currentMember.name}</div>
            <RoleBadge role={currentMember.role} />
          </div>
          <ChangePassword memberId={currentMember.id} slug={org?.slug} />
        </div>
      )}

      {/* Org info */}
      <div style={{ background: C.white, borderRadius: 10, padding: 18, boxShadow: C.cardShadow, marginBottom: 16, border: `1px solid ${C.primary}25` }}>
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

      {/* ═══ Branding ═══ */}
      <div style={{ background: C.white, borderRadius: 10, padding: 18, boxShadow: C.cardShadow, marginBottom: 16, border: `1px solid ${C.primary}25` }}>
        <Label>Branding</Label>
        <div style={{ fontSize: 11, color: C.t4, marginBottom: 16, lineHeight: 1.5 }}>
          Customise your organisation's appearance. Changes apply across the entire app.
        </div>

        {/* Logo */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: C.t4, fontWeight: 600, marginBottom: 8 }}>Logo</div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {org?.logo_url ? (
              <img src={org.logo_url} alt="" style={{ width: 64, height: 64, borderRadius: 14, objectFit: "contain", background: C.warm100, border: `1px solid ${C.line}` }} />
            ) : (
              <div style={{
                width: 64, height: 64, borderRadius: 14,
                background: `linear-gradient(135deg, ${brandPrimary} 0%, ${C.primaryDark} 100%)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 24, fontWeight: 800, color: C.white, fontFamily: MONO,
              }}>{(org?.name)?.[0]?.toUpperCase() || "?"}</div>
            )}
            <div>
              <input ref={logoRef} type="file" accept="image/*" style={{ display: "none" }}
                onChange={async (e) => {
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
                }}
              />
              <Btn onClick={() => logoRef.current?.click()} v="ghost" disabled={logoUploading}
                style={{ fontSize: 12, padding: "6px 14px" }}>
                {logoUploading ? "Uploading..." : org?.logo_url ? "Change Logo" : "Upload Logo"}
              </Btn>
              <div style={{ fontSize: 10, color: C.t4, marginTop: 4 }}>PNG, JPG or SVG. Max 5MB.</div>
            </div>
          </div>
        </div>

        {/* Colors */}
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: C.t4, fontWeight: 600, marginBottom: 6 }}>Primary Colour</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="color" aria-label="Primary colour picker" value={brandPrimary} onChange={e => setBrandPrimary(e.target.value)}
                style={{ width: 40, height: 40, border: `2px solid ${C.line}`, borderRadius: 10, cursor: "pointer", padding: 2 }} />
              <input type="text" aria-label="Primary colour hex value" value={brandPrimary} onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setBrandPrimary(e.target.value); }}
                style={{ width: 80, fontSize: 12, padding: "6px 8px", borderRadius: 8, border: `1px solid ${C.line}`, fontFamily: MONO, textTransform: "uppercase" }} />
              <div style={{ width: 24, height: 24, borderRadius: 6, background: brandPrimary, border: `1px solid ${C.line}` }} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: C.t4, fontWeight: 600, marginBottom: 6 }}>Accent Colour</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="color" aria-label="Accent colour picker" value={brandAccent} onChange={e => setBrandAccent(e.target.value)}
                style={{ width: 40, height: 40, border: `2px solid ${C.line}`, borderRadius: 10, cursor: "pointer", padding: 2 }} />
              <input type="text" aria-label="Accent colour hex value" value={brandAccent} onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setBrandAccent(e.target.value); }}
                style={{ width: 80, fontSize: 12, padding: "6px 8px", borderRadius: 8, border: `1px solid ${C.line}`, fontFamily: MONO, textTransform: "uppercase" }} />
              <div style={{ width: 24, height: 24, borderRadius: 6, background: brandAccent, border: `1px solid ${C.line}` }} />
            </div>
          </div>
        </div>

        {/* Preview swatch bar */}
        <div style={{ display: "flex", gap: 4, marginBottom: 16, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ flex: 3, height: 32, background: brandPrimary }} />
          <div style={{ flex: 1, height: 32, background: brandAccent }} />
          <div style={{ flex: 2, height: 32, background: C.navy }} />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Btn v="primary" disabled={brandSaving} onClick={async () => {
            if (!onUpdateOrg) return;
            setBrandSaving(true);
            setBrandMsg("");
            try {
              await onUpdateOrg({
                primary_color: brandPrimary === "#4A7C59" ? null : brandPrimary,
                primary_dark: null, // auto-derived
                accent_color: brandAccent === "#C17817" ? null : brandAccent,
              });
              setBrandMsg("✓ Saved");
              setTimeout(() => setBrandMsg(""), 2000);
            } catch (err) {
              setBrandMsg("Failed: " + err.message);
            }
            setBrandSaving(false);
          }} style={{ fontSize: 12, padding: "7px 18px" }}>
            {brandSaving ? "Saving..." : "Save Colours"}
          </Btn>
          <button onClick={async () => {
            setBrandPrimary("#4A7C59");
            setBrandAccent("#C17817");
            if (onUpdateOrg) {
              await onUpdateOrg({ primary_color: null, primary_dark: null, accent_color: null });
              resetTheme();
            }
            setBrandMsg("✓ Reset to defaults");
            setTimeout(() => setBrandMsg(""), 2000);
          }} style={{
            background: "none", border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 14px",
            fontSize: 12, color: C.t3, cursor: "pointer", fontFamily: FONT,
          }}>Reset to Defaults</button>
          {brandMsg && <span style={{ fontSize: 11, color: brandMsg.startsWith("✓") ? C.ok : C.red, fontWeight: 600 }}>{brandMsg}</span>}
        </div>
      </div>

      {/* Knowledge Base */}
      <div style={{ background: C.white, borderRadius: 10, padding: 18, boxShadow: C.cardShadow, marginBottom: 16, border: `1px solid ${C.primary}25` }}>
        <Label>Knowledge Base</Label>
        <div style={{ fontSize: 11, color: C.t4, marginBottom: 14, lineHeight: 1.5 }}>
          Everything below feeds into all AI-generated proposals, funder research, and scout results.
        </div>

        {/* Knowledge Base — editable. AI uses this + uploaded documents as the
            source of truth when generating proposals, fit scores, and budgets.
            No hardcoded programme templates — every recommendation comes from
            what's defined here + the document vault. */}
        <KnowledgeBaseEditor profile={profile || {}} onSave={onUpdateProfile} />

        {/* Uploaded Documents */}
        <div style={{
          fontSize: 11, fontWeight: 700, color: C.t3, textTransform: "uppercase",
          letterSpacing: 0.8, marginBottom: 8, display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: uploads.length > 0 ? C.ok : C.t4 }} />
          Uploaded Documents ({uploads.length})
        </div>
        <UploadZone
          uploads={uploads}
          grantId={null}
          onUploadsChange={loadUploads}
          label={null}
        />
        <div style={{ fontSize: 11, color: C.t4, marginTop: 8, lineHeight: 1.5 }}>
          Upload annual reports, strategy docs, budgets, impact reports, and YouTube URLs.
          Extracted text is combined with the org context above for AI prompts.
        </div>
      </div>

      {/* ═══ Google Calendar ═══ */}
      <div style={{ background: C.white, borderRadius: 10, padding: 18, boxShadow: C.cardShadow, marginBottom: 16, border: `1px solid ${C.primary}25` }}>
        <Label>Google Calendar Integration</Label>
        <div style={{ fontSize: 12, color: C.t3, marginBottom: 12, lineHeight: 1.5 }}>
          Connect your Google Calendar to automatically sync grant deadlines. Events are created with reminders (1 day and 2 hours before).
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {gcalConnected ? (
            <>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.ok, background: C.okSoft, padding: "4px 12px", borderRadius: 100 }}>✓ Connected</span>
              <span style={{ fontSize: 12, color: C.t3 }}>Deadlines sync automatically when set or changed.</span>
              <Btn v="ghost" style={{ fontSize: 11, padding: "5px 12px", color: C.red, borderColor: C.red + "30" }} onClick={async () => {
                const { disconnectGcal } = await import("../api");
                await disconnectGcal();
                setGcalConnected(false); setGcalMsg("Disconnected");
              }}>Disconnect</Btn>
            </>
          ) : (
            <Btn v="primary" style={{ fontSize: 12, padding: "8px 16px" }} disabled={gcalLoading} onClick={async () => {
              setGcalLoading(true);
              try {
                const { getGcalAuthUrl } = await import("../api");
                const { url } = await getGcalAuthUrl();
                window.open(url, "gcal-auth", "width=500,height=600");
              } catch (e) { setGcalMsg("Failed: " + e.message); }
              setGcalLoading(false);
            }}>{gcalLoading ? "Loading..." : "Connect Google Calendar"}</Btn>
          )}
          {gcalMsg && <span style={{ fontSize: 11, color: C.t3 }}>{gcalMsg}</span>}
        </div>
      </div>

      {/* ═══ Compliance Documents ═══ */}
      <div data-tour="settings-compliance" style={{ background: C.white, borderRadius: 10, padding: 18, boxShadow: C.cardShadow, marginBottom: 16, border: `1px solid ${C.primary}25` }}>
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
                              v="ghost"
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
                                    aria-label={`${d.name} expiry date`}
                                    value={getEditField(d.id, "expiry")}
                                    onChange={e => setEditField(d.id, "expiry", e.target.value)}
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
                                  aria-label={`${d.name} notes`}
                                  value={getEditField(d.id, "notes")}
                                  onChange={e => setEditField(d.id, "notes", e.target.value)}
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
      <div data-tour="settings-team" style={{ background: C.white, borderRadius: 10, padding: 18, boxShadow: C.cardShadow, marginBottom: 16, border: `1px solid ${C.primary}25` }}>
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
      <div style={{ background: C.white, borderRadius: 10, padding: 18, boxShadow: C.cardShadow, marginBottom: 16, border: `1px solid ${C.primary}25` }}>
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
