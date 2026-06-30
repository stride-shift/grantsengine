import { useState, useMemo, lazy, Suspense } from "react";
import { C, FONT, MONO } from "@/theme";
import { Label, Avatar, Btn, RoleBadge } from "@/components/ui";
import useTeamAdmin from "@/hooks/useTeamAdmin";
import useAdminSessions from "@/hooks/useAdminSessions";
import useAIReset from "@/hooks/useAIReset";

const SuperAdminDashboard = lazy(() => import("@/components/superadmin/SuperAdminDashboard"));

const ROLES = [
  { id: "director", label: "Admin", desc: "Full access, manage users" },
  { id: "board", label: "Board", desc: "View and approve" },
  { id: "hop", label: "Head of Programmes", desc: "Manage grants and drafts" },
  { id: "pm", label: "Programme Manager", desc: "Create and edit grants" },
];

// ── Time formatting ──
const ago = (ts) => {
  if (!ts) return "\u2014";
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
};

const fmtDuration = (mins) => {
  if (!mins || mins < 1) return "<1m";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
};

const fmtDate = (ts) => {
  if (!ts) return "\u2014";
  return new Date(ts).toLocaleDateString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

const EVENT_CONFIG = {
  login:        { label: "Logged in",      icon: "\u2192", color: C.t3,     bg: C.warm200 },
  logout:       { label: "Logged out",     icon: "\u2190", color: C.t3,     bg: C.warm200 },
  grant_create: { label: "Created grant",  icon: "+",      color: C.ok,     bg: C.okSoft },
  grant_update: { label: "Updated grant",  icon: "\u270E", color: C.blue,   bg: C.blueSoft },
  stage_change: { label: "Stage change",   icon: "\u25B6", color: C.navy,   bg: C.navySoft },
  grant_delete: { label: "Deleted grant",  icon: "\u2717", color: C.red,    bg: C.redSoft },
  ai_call:      { label: "AI call",        icon: "\u25C6", color: C.purple, bg: C.purpleSoft },
  export:       { label: "Export",         icon: "\u2193", color: C.amber,  bg: C.amberSoft },
  admin_action: { label: "Admin",         icon: "\u2699", color: C.primary, bg: C.primarySoft },
};

const eventLabel = (event, meta) => {
  if (event === "stage_change" && meta?.from_stage && meta?.to_stage) {
    return `${meta.grant_name || "Grant"}: ${meta.from_stage} \u2192 ${meta.to_stage}`;
  }
  if (event === "admin_action" && meta?.action) {
    return `${meta.action.replace(/_/g, " ")} \u2014 ${meta.target_member || ""}`;
  }
  if (meta?.grant_name) return meta.grant_name;
  if (meta?.member_name) return meta.member_name;
  return "";
};

const Card = ({ children, style: sx }) => (
  <div style={{
    background: C.white, borderRadius: 10, padding: 16, boxShadow: C.cardShadow,
    border: `1px solid ${C.line}`, marginBottom: 14, ...sx,
  }}>{children}</div>
);

const Input = ({ value, onChange, placeholder, type = "text", style: sx }) => (
  <input
    type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    style={{
      width: "100%", padding: "8px 12px", fontSize: 13, fontFamily: FONT,
      border: `1px solid ${C.line}`, borderRadius: 8, outline: "none",
      color: C.dark, background: C.white, boxSizing: "border-box",
      ...sx,
    }}
    onFocus={e => e.target.style.borderColor = C.primary}
    onBlur={e => e.target.style.borderColor = C.line}
  />
);

export default function Admin({ org, team, grants = [], currentMember, onSaveGrant, onSetGrants, onTeamChanged }) {
  // Sessions / history / activity + 30s auto-refresh (headless).
  const {
    activeSessions, sessionHistory, activity,
    filterMember, setFilterMember, loading,
  } = useAdminSessions();

  // Team CRUD handlers + flash/active-action state (headless).
  const {
    activeAction, setActiveAction,
    actionBusy, actionMsg, flash,
    handleAdd, handleRoleChange, handleResetPassword, handleDelete,
  } = useTeamAdmin(onTeamChanged);

  // ── Render-only form / dialog state ──
  // In-page sub-tabs. The Super Admin tab is only added to the strip for members
  // whose session is flagged isSuperAdmin (the server independently enforces access).
  const [subTab, setSubTab] = useState("team");
  const isSuperAdmin = !!currentMember?.isSuperAdmin;
  const subTabs = [
    { id: "team", label: "Team" },
    { id: "sessions", label: "Sessions" },
    { id: "activity", label: "Activity" },
    { id: "data", label: "Data" },
    ...(isSuperAdmin ? [{ id: "superadmin", label: "Super Admin" }] : []),
  ];
  const [confirmReset, setConfirmReset] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("pm");
  const [editRole, setEditRole] = useState("");
  const [resetPw, setResetPw] = useState("");

  const realTeam = useMemo(() => (team || []).filter(t => t.id !== "team"), [team]);

  // Grants carrying any AI-generated content — used by both the reset handler
  // and the confirm button's count label.
  const withAI = useMemo(
    () => grants.filter(g =>
      g.aiResearch || g.aiDraft || g.aiFitscore || g.aiFollowup || g.aiWinloss || g.aiSections || g.aiResearchStructured
    ),
    [grants]
  );

  // Reset-all-AI-content loop (headless).
  const { reset: resetAI, busy: resetBusy, progress: resetProgress } =
    useAIReset(withAI, onSaveGrant, onSetGrants, flash, grants.length);

  const getMember = (id) => realTeam.find(t => t.id === id) || { name: "Team", initials: "\u2014", role: "none" };

  // Submit the add-member form, then clear it on success (form text is UI state).
  const submitAdd = async () => {
    const ok = await handleAdd({ name: newName, email: newEmail, role: newRole });
    if (ok) { setNewName(""); setNewEmail(""); setNewRole("pm"); setAddMode(false); }
  };

  // Reset password, then clear the (UI-owned) password input on success only.
  const submitResetPassword = async () => {
    const ok = await handleResetPassword(resetPw);
    if (ok) setResetPw("");
  };

  // Sub-tab strip (matched to ResourcesHub): active = primary text + 2px bottom
  // border, inactive = C.t3, strip baseline = C.line. Only rendered when there's
  // more than one tab (i.e. a super-admin).
  const tabStrip = subTabs.length > 1 ? (
    <div style={{
      display: "flex", gap: 4, flexWrap: "wrap",
      borderBottom: `1px solid ${C.line}`, marginBottom: 20,
    }}>
      {subTabs.map(t => {
        const active = subTab === t.id;
        return (
          <button key={t.id} onClick={() => setSubTab(t.id)} style={{
            padding: "8px 14px", border: "none", background: "transparent",
            fontSize: 13, fontWeight: 600, fontFamily: FONT, cursor: "pointer",
            color: active ? C.primary : C.t3,
            borderBottom: `2px solid ${active ? C.primary : "transparent"}`,
            marginBottom: -1,
          }}>{t.label}</button>
        );
      })}
    </div>
  ) : null;

  // Guard: only super-admins ever see the Super Admin tab content (the strip
  // already hides the tab for everyone else; this protects against a stale subTab).
  const showSuperAdmin = subTab === "superadmin" && isSuperAdmin;

  if (loading && !showSuperAdmin) {
    return (
      <div style={{ padding: "16px 16px", fontFamily: FONT, maxWidth: 900 }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.dark, letterSpacing: -0.5 }}>Admin</div>
          <div style={{ fontSize: 13, color: C.t3, marginTop: 2 }}>Manage users, sessions and activity</div>
        </div>
        {tabStrip}
        <div style={{ fontSize: 13, color: C.t3 }}>Loading admin data...</div>
      </div>
    );
  }

  if (showSuperAdmin) {
    return (
      <div style={{ padding: "16px 16px", fontFamily: FONT, maxWidth: 1100 }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.dark, letterSpacing: -0.5 }}>Admin</div>
          <div style={{ fontSize: 13, color: C.t3, marginTop: 2 }}>Platform-wide organisation management</div>
        </div>
        {tabStrip}
        <Suspense fallback={<div style={{ fontSize: 13, color: C.t3 }}>Loading…</div>}>
          <SuperAdminDashboard />
        </Suspense>
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 16px", fontFamily: FONT, maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: C.dark, letterSpacing: -0.5 }}>Admin</div>
        <div style={{ fontSize: 13, color: C.t3, marginTop: 2 }}>Manage users, sessions and activity</div>
      </div>

      {tabStrip}

      {/* Flash message */}
      {actionMsg && (
        <div style={{
          padding: "10px 16px", borderRadius: 10, marginBottom: 16,
          background: actionMsg.startsWith("Error") ? C.redSoft : C.okSoft,
          color: actionMsg.startsWith("Error") ? C.red : C.ok,
          fontSize: 13, fontWeight: 600,
        }}>{actionMsg}</div>
      )}

      {/* ═══ 1. USER MANAGEMENT ═══ */}
      {subTab === "team" && (
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <Label>Team Members</Label>
          {!addMode && (
            <Btn v="primary" onClick={() => setAddMode(true)} style={{ fontSize: 12, padding: "5px 14px" }}>
              + Add User
            </Btn>
          )}
        </div>

        {/* Add user form */}
        {addMode && (
          <div style={{
            padding: 14, background: C.warm100, borderRadius: 10, marginBottom: 14,
            border: `1px solid ${C.primary}20`,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.dark, marginBottom: 12 }}>New Team Member</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <Input value={newName} onChange={setNewName} placeholder="Name" style={{ flex: "1 1 140px" }} />
              <Input value={newEmail} onChange={setNewEmail} placeholder="Email (optional)" style={{ flex: "1 1 180px" }} />
              <select
                value={newRole} onChange={e => setNewRole(e.target.value)}
                style={{
                  padding: "8px 12px", fontSize: 13, fontFamily: FONT,
                  border: `1px solid ${C.line}`, borderRadius: 8, outline: "none",
                  color: C.dark, background: C.white, cursor: "pointer",
                }}
              >
                {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn v="primary" onClick={submitAdd} disabled={actionBusy || !newName.trim()} style={{ fontSize: 12, padding: "6px 14px" }}>
                {actionBusy ? "Adding..." : "Add"}
              </Btn>
              <Btn v="ghost" onClick={() => { setAddMode(false); setNewName(""); setNewEmail(""); setNewRole("pm"); }} style={{ fontSize: 12, padding: "6px 14px" }}>
                Cancel
              </Btn>
            </div>
          </div>
        )}

        {/* Team list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {realTeam.map(m => {
            const isMe = m.id === currentMember?.id;
            const isOnline = activeSessions.some(s => s.member_id === m.id);
            const isEditing = activeAction?.id === m.id && activeAction?.mode === "edit";
            const isResetting = activeAction?.id === m.id && activeAction?.mode === "reset";
            const isDeleting = activeAction?.id === m.id && activeAction?.mode === "delete";

            return (
              <div key={m.id} style={{
                padding: "10px 14px", borderRadius: 10,
                background: isEditing || isResetting || isDeleting ? C.warm100 : "transparent",
                border: isEditing || isResetting || isDeleting ? `1px solid ${C.line}` : "1px solid transparent",
                transition: "background 0.15s",
              }}>
                {/* Main row */}
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ position: "relative" }}>
                    <Avatar member={m} size={32} />
                    {isOnline && (
                      <span style={{
                        position: "absolute", bottom: -1, right: -1, width: 8, height: 8,
                        borderRadius: "50%", background: C.ok, border: `2px solid ${C.white}`,
                      }} />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>{m.name}</span>
                      {isMe && <span style={{ fontSize: 10, fontWeight: 600, color: C.t4 }}>(you)</span>}
                    </div>
                    {m.email && <div style={{ fontSize: 11, color: C.t3 }}>{m.email}</div>}
                  </div>
                  <RoleBadge role={m.role} />
                  {/* Action buttons — don't show for self */}
                  {!isMe && (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => { setActiveAction(isEditing ? null : { id: m.id, mode: "edit" }); setEditRole(m.role); }}
                        title="Change role"
                        style={{
                          width: 28, height: 28, borderRadius: 7, border: "none", cursor: "pointer",
                          background: isEditing ? C.primarySoft : C.raised, color: isEditing ? C.primary : C.t3,
                          fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: FONT, transition: "all 0.15s",
                        }}
                      >{"\u270E"}</button>
                      <button onClick={() => { setActiveAction(isResetting ? null : { id: m.id, mode: "reset" }); setResetPw(""); }}
                        title="Reset password"
                        style={{
                          width: 28, height: 28, borderRadius: 7, border: "none", cursor: "pointer",
                          background: isResetting ? C.amberSoft : C.raised, color: isResetting ? C.amber : C.t3,
                          fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: MONO, transition: "all 0.15s",
                        }}
                      >{"\u26BF"}</button>
                      <button onClick={() => { setActiveAction(isDeleting ? null : { id: m.id, mode: "delete" }); }}
                        title="Remove user"
                        style={{
                          width: 28, height: 28, borderRadius: 7, border: "none", cursor: "pointer",
                          background: isDeleting ? C.redSoft : C.raised, color: isDeleting ? C.red : C.t4,
                          fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: FONT, transition: "all 0.15s",
                        }}
                      >{"\u2717"}</button>
                    </div>
                  )}
                </div>

                {/* Inline edit: role change */}
                {isEditing && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingLeft: 42 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: C.t3 }}>Role:</span>
                    <select
                      value={editRole} onChange={e => setEditRole(e.target.value)}
                      style={{
                        padding: "5px 10px", fontSize: 12, fontFamily: FONT,
                        border: `1px solid ${C.line}`, borderRadius: 6, outline: "none",
                        color: C.dark, background: C.white, cursor: "pointer",
                      }}
                    >
                      {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                    <Btn v="primary" onClick={() => handleRoleChange(m.id, editRole)} disabled={actionBusy || editRole === m.role}
                      style={{ fontSize: 11, padding: "4px 10px" }}>Save</Btn>
                    <Btn v="ghost" onClick={() => setActiveAction(null)} style={{ fontSize: 11, padding: "4px 10px" }}>Cancel</Btn>
                  </div>
                )}

                {/* Inline edit: password reset */}
                {isResetting && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingLeft: 42 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: C.t3 }}>New password:</span>
                    <Input value={resetPw} onChange={setResetPw} placeholder="Min 6 characters" type="password"
                      style={{ width: 180, padding: "5px 10px", fontSize: 12 }} />
                    <Btn v="primary" onClick={submitResetPassword} disabled={actionBusy || resetPw.length < 6}
                      style={{ fontSize: 11, padding: "4px 10px" }}>Reset</Btn>
                    <Btn v="ghost" onClick={() => { setActiveAction(null); setResetPw(""); }} style={{ fontSize: 11, padding: "4px 10px" }}>Cancel</Btn>
                  </div>
                )}

                {/* Inline confirm: delete */}
                {isDeleting && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingLeft: 42 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.red }}>Remove {m.name}?</span>
                    <Btn v="danger" onClick={() => handleDelete(m.id)} disabled={actionBusy}
                      style={{ fontSize: 11, padding: "4px 10px" }}>{actionBusy ? "Removing..." : "Yes, remove"}</Btn>
                    <Btn v="ghost" onClick={() => setActiveAction(null)} style={{ fontSize: 11, padding: "4px 10px" }}>Cancel</Btn>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
      )}

      {/* ═══ DATA TOOLS ═══ */}
      {subTab === "data" && (
      <Card>
        <Label>Data Tools</Label>
        <div style={{ marginTop: 8 }}>
          {/* Reset AI content */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "12px 14px", borderRadius: 10, background: C.warm100, border: `1px solid ${C.line}`,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>Reset All AI Content</div>
              <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
                Clear research, drafts, fit scores, and proposals from all {grants.length} opportunities.
                Keeps funder names, notes, uploads, budgets, and stages intact.
              </div>
            </div>
            {!confirmReset ? (
              <Btn v="ghost" onClick={() => setConfirmReset(true)}
                style={{ fontSize: 12, padding: "6px 14px", color: C.red, whiteSpace: "nowrap", marginLeft: 16 }}>
                Reset AI
              </Btn>
            ) : (
              <div style={{ display: "flex", gap: 8, marginLeft: 16, flexShrink: 0 }}>
                <Btn v="danger" disabled={resetBusy} onClick={async () => {
                  await resetAI();
                  setConfirmReset(false);
                }} style={{ fontSize: 12, padding: "6px 14px" }}>
                  {resetBusy
                    ? `${resetProgress?.done || 0}/${resetProgress?.total || "?"}...`
                    : `Yes, reset ${withAI.length} grants`}
                </Btn>
                <Btn v="ghost" onClick={() => setConfirmReset(false)} disabled={resetBusy}
                  style={{ fontSize: 12, padding: "6px 14px" }}>
                  Cancel
                </Btn>
              </div>
            )}
          </div>
        </div>
      </Card>

      )}

      {/* ═══ 2. WHO'S ONLINE ═══ */}
      {subTab === "sessions" && (
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <Label>Active Sessions</Label>
          <span style={{
            fontSize: 11, fontWeight: 600, color: C.ok, background: C.okSoft,
            padding: "3px 10px", borderRadius: 8,
          }}>{activeSessions.length} online</span>
        </div>

        {activeSessions.length === 0 ? (
          <div style={{ fontSize: 13, color: C.t4, padding: "8px 0" }}>No active sessions</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {activeSessions.map((s, i) => {
              const m = getMember(s.member_id);
              return (
                <div key={i} className="ge-hover-slide" style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                  borderRadius: 10, opacity: 0.9,
                }}>
                  <div style={{ position: "relative" }}>
                    <Avatar member={m} size={30} />
                    <span style={{
                      position: "absolute", bottom: -1, right: -1, width: 8, height: 8,
                      borderRadius: "50%", background: C.ok, border: `2px solid ${C.white}`,
                    }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>{s.member_name || m.name}</span>
                    <span style={{ fontSize: 11, color: C.t4, marginLeft: 8 }}>{s.role || m.role}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, color: C.t3 }}>Since {ago(s.created_at)}</div>
                    {s.last_active_at && (
                      <div style={{ fontSize: 10, color: C.t4 }}>Active {ago(s.last_active_at)}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      )}

      {/* ═══ 3. LOGIN HISTORY ═══ */}
      {subTab === "sessions" && (
      <Card>
        <Label>Login History</Label>
        {sessionHistory.length === 0 ? (
          <div style={{ fontSize: 13, color: C.t4, padding: "8px 0" }}>No login history yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {sessionHistory.map((s, i) => {
              const m = getMember(s.member_id);
              const isActive = !s.ended_at && new Date(s.expires_at || 0) > new Date();
              return (
                <div key={i} className="ge-hover-slide" style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
                  borderRadius: 8, opacity: 0.85, fontSize: 12,
                }}>
                  <Avatar member={m} size={24} />
                  <span style={{ fontWeight: 600, color: C.dark, minWidth: 70 }}>{s.member_name || m.name}</span>
                  <span style={{ color: C.t3, flex: 1 }}>{fmtDate(s.created_at)}</span>
                  <span style={{ color: C.t2, fontFamily: MONO, fontSize: 11, minWidth: 50, textAlign: "right" }}>
                    {fmtDuration(s.duration_mins)}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                    ...(isActive ? { color: C.ok, background: C.okSoft } : { color: C.t4, background: C.warm200 }),
                  }}>
                    {isActive ? "Active" : "Ended"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      )}

      {/* ═══ 4. ACTIVITY FEED ═══ */}
      {subTab === "activity" && (
      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <Label>Activity</Label>
          <span style={{ fontSize: 11, color: C.t4 }}>{activity.length} events</span>
        </div>

        {/* Member filter chips */}
        <div style={{ display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
          <button
            onClick={() => setFilterMember(null)}
            style={{
              padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600, fontFamily: FONT,
              cursor: "pointer", border: "none",
              background: !filterMember ? C.navy : C.warm200,
              color: !filterMember ? C.white : C.t2,
              transition: "all 0.15s",
            }}
          >All</button>
          {realTeam.map(m => (
            <button
              key={m.id}
              onClick={() => setFilterMember(filterMember === m.id ? null : m.id)}
              style={{
                padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600, fontFamily: FONT,
                cursor: "pointer", border: "none", display: "flex", alignItems: "center", gap: 5,
                background: filterMember === m.id ? C.navy : C.warm200,
                color: filterMember === m.id ? C.white : C.t2,
                transition: "all 0.15s",
              }}
            >
              <Avatar member={m} size={16} />
              {m.name}
            </button>
          ))}
        </div>

        {activity.length === 0 ? (
          <div style={{ fontSize: 13, color: C.t4, padding: "8px 0" }}>
            {filterMember ? "No activity from this member." : "No activity recorded yet."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 500, overflowY: "auto" }}>
            {activity.map((a, i) => {
              const cfg = EVENT_CONFIG[a.event] || { label: a.event, icon: "\u00B7", color: C.t3, bg: C.warm200 };
              const detail = eventLabel(a.event, a.meta);
              const m = getMember(a.member_id);
              return (
                <div key={i} className="ge-hover-slide" style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
                  borderRadius: 8, opacity: 0.85, fontSize: 12,
                }}>
                  <Avatar member={m} size={22} />
                  <span style={{ fontWeight: 600, color: C.dark, minWidth: 60 }}>{a.member_name || m.name}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                    color: cfg.color, background: cfg.bg, minWidth: 75, textAlign: "center",
                    fontFamily: MONO, letterSpacing: 0.3,
                  }}>
                    {cfg.icon} {cfg.label}
                  </span>
                  <span style={{ flex: 1, color: C.t2, fontSize: 12, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>
                    {detail}
                  </span>
                  <span style={{ fontSize: 10, color: C.t4, minWidth: 55, textAlign: "right", whiteSpace: "nowrap" }}>
                    {ago(a.created_at)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      )}

      {/* ═══ 5. TEAM SUMMARY ═══ */}
      {subTab === "team" && (
      <Card>
        <Label>Team Summary</Label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {realTeam.map(m => {
            const sessions = sessionHistory.filter(s => s.member_id === m.id);
            const events = activity.filter(a => a.member_id === m.id);
            const lastActive = sessions[0]?.last_active_at || sessions[0]?.created_at;
            return (
              <div key={m.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                borderRadius: 10, background: C.warm100, border: `1px solid ${C.line}`,
              }}>
                <Avatar member={m} size={32} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
                    {sessions.length} sessions / {events.length} actions
                  </div>
                  {lastActive && (
                    <div style={{ fontSize: 10, color: C.t4 }}>Last: {ago(lastActive)}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
      )}
    </div>
  );
}
