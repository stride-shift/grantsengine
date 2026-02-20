import { useState, useEffect, useMemo } from "react";
import { C, FONT, MONO } from "../theme";
import { Label, Avatar, Btn, RoleBadge } from "./index";
import { getAdminSessions, getAdminSessionHistory, getAdminActivity, upsertTeamMember, deleteTeamMember, adminResetPassword } from "../api";

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
    background: C.white, borderRadius: 14, padding: 20, boxShadow: C.cardShadow,
    border: `1px solid ${C.line}`, marginBottom: 16, ...sx,
  }}>{children}</div>
);

const Input = ({ value, onChange, placeholder, type = "text", style: sx }) => (
  <input
    type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    style={{
      width: "100%", padding: "8px 12px", fontSize: 13, fontFamily: FONT,
      border: `1.5px solid ${C.line}`, borderRadius: 8, outline: "none",
      color: C.dark, background: C.white, boxSizing: "border-box",
      ...sx,
    }}
    onFocus={e => e.target.style.borderColor = C.primary}
    onBlur={e => e.target.style.borderColor = C.line}
  />
);

export default function Admin({ org, team, currentMember, onTeamChanged }) {
  const [activeSessions, setActiveSessions] = useState([]);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [activity, setActivity] = useState([]);
  const [filterMember, setFilterMember] = useState(null);
  const [loading, setLoading] = useState(true);

  // User management state
  const [addMode, setAddMode] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("pm");
  const [editId, setEditId] = useState(null);
  const [editRole, setEditRole] = useState("");
  const [resetId, setResetId] = useState(null);
  const [resetPw, setResetPw] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);

  const realTeam = useMemo(() => (team || []).filter(t => t.id !== "team"), [team]);

  const loadData = async () => {
    try {
      const [sess, hist, act] = await Promise.all([
        getAdminSessions(),
        getAdminSessionHistory(30),
        getAdminActivity(filterMember, 100),
      ]);
      setActiveSessions(sess);
      setSessionHistory(hist);
      setActivity(act);
    } catch (err) {
      console.error("Admin data load failed:", err);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [filterMember]);

  useEffect(() => {
    const t = setInterval(async () => {
      try { setActiveSessions(await getAdminSessions()); } catch { /* ignore */ }
    }, 30000);
    return () => clearInterval(t);
  }, []);

  const getMember = (id) => realTeam.find(t => t.id === id) || { name: "Team", initials: "\u2014", role: "none" };

  const flash = (msg) => { setActionMsg(msg); setTimeout(() => setActionMsg(null), 3000); };

  // ── User management actions ──
  const handleAdd = async () => {
    if (!newName.trim()) return;
    setActionBusy(true);
    try {
      const initials = newName.trim().split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
      const id = newName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      await upsertTeamMember({ id, name: newName.trim(), initials, role: newRole, email: newEmail.trim() || null });
      setNewName(""); setNewEmail(""); setNewRole("pm"); setAddMode(false);
      flash(`${newName.trim()} added`);
      onTeamChanged?.();
    } catch (e) { flash(`Error: ${e.message}`); }
    setActionBusy(false);
  };

  const handleRoleChange = async (memberId) => {
    setActionBusy(true);
    try {
      await upsertTeamMember({ id: memberId, role: editRole });
      setEditId(null);
      flash("Role updated");
      onTeamChanged?.();
    } catch (e) { flash(`Error: ${e.message}`); }
    setActionBusy(false);
  };

  const handleResetPassword = async () => {
    if (!resetPw || resetPw.length < 6) { flash("Password must be 6+ characters"); return; }
    setActionBusy(true);
    try {
      await adminResetPassword(resetId, resetPw);
      setResetId(null); setResetPw("");
      flash("Password reset");
    } catch (e) { flash(`Error: ${e.message}`); }
    setActionBusy(false);
  };

  const handleDelete = async (id) => {
    setActionBusy(true);
    try {
      await deleteTeamMember(id);
      setConfirmDelete(null);
      flash("User removed");
      onTeamChanged?.();
    } catch (e) { flash(`Error: ${e.message}`); }
    setActionBusy(false);
  };

  if (loading) {
    return (
      <div style={{ padding: 32, fontFamily: FONT }}>
        <div style={{ fontSize: 13, color: C.t3 }}>Loading admin data...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 32px", fontFamily: FONT, maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.dark, letterSpacing: -0.5 }}>Admin</div>
        <div style={{ fontSize: 13, color: C.t3, marginTop: 2 }}>Manage users, sessions and activity</div>
      </div>

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
            padding: 16, background: C.warm100, borderRadius: 10, marginBottom: 16,
            border: `1.5px solid ${C.primary}20`,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.dark, marginBottom: 12 }}>New Team Member</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <Input value={newName} onChange={setNewName} placeholder="Name" style={{ flex: "1 1 140px" }} />
              <Input value={newEmail} onChange={setNewEmail} placeholder="Email (optional)" style={{ flex: "1 1 180px" }} />
              <select
                value={newRole} onChange={e => setNewRole(e.target.value)}
                style={{
                  padding: "8px 12px", fontSize: 13, fontFamily: FONT,
                  border: `1.5px solid ${C.line}`, borderRadius: 8, outline: "none",
                  color: C.dark, background: C.white, cursor: "pointer",
                }}
              >
                {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn v="primary" onClick={handleAdd} disabled={actionBusy || !newName.trim()} style={{ fontSize: 12, padding: "6px 14px" }}>
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
            const isEditing = editId === m.id;
            const isResetting = resetId === m.id;
            const isDeleting = confirmDelete === m.id;

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
                  <div style={{ fontSize: 10, color: m.password_hash !== undefined ? C.t4 : C.amber, fontWeight: 500 }}>
                    {/* password_hash is stripped from API, so we check hasPassword flag */}
                  </div>
                  {/* Action buttons — don't show for self */}
                  {!isMe && (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => { setEditId(isEditing ? null : m.id); setEditRole(m.role); setResetId(null); setConfirmDelete(null); }}
                        title="Change role"
                        style={{
                          width: 28, height: 28, borderRadius: 7, border: "none", cursor: "pointer",
                          background: isEditing ? C.primarySoft : C.raised, color: isEditing ? C.primary : C.t3,
                          fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: FONT, transition: "all 0.15s",
                        }}
                      >{"\u270E"}</button>
                      <button onClick={() => { setResetId(isResetting ? null : m.id); setResetPw(""); setEditId(null); setConfirmDelete(null); }}
                        title="Reset password"
                        style={{
                          width: 28, height: 28, borderRadius: 7, border: "none", cursor: "pointer",
                          background: isResetting ? C.amberSoft : C.raised, color: isResetting ? C.amber : C.t3,
                          fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: MONO, transition: "all 0.15s",
                        }}
                      >{"\u26BF"}</button>
                      <button onClick={() => { setConfirmDelete(isDeleting ? null : m.id); setEditId(null); setResetId(null); }}
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
                        border: `1.5px solid ${C.line}`, borderRadius: 6, outline: "none",
                        color: C.dark, background: C.white, cursor: "pointer",
                      }}
                    >
                      {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                    <Btn v="primary" onClick={() => handleRoleChange(m.id)} disabled={actionBusy || editRole === m.role}
                      style={{ fontSize: 11, padding: "4px 10px" }}>Save</Btn>
                    <Btn v="ghost" onClick={() => setEditId(null)} style={{ fontSize: 11, padding: "4px 10px" }}>Cancel</Btn>
                  </div>
                )}

                {/* Inline edit: password reset */}
                {isResetting && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingLeft: 42 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: C.t3 }}>New password:</span>
                    <Input value={resetPw} onChange={setResetPw} placeholder="Min 6 characters" type="password"
                      style={{ width: 180, padding: "5px 10px", fontSize: 12 }} />
                    <Btn v="primary" onClick={handleResetPassword} disabled={actionBusy || resetPw.length < 6}
                      style={{ fontSize: 11, padding: "4px 10px" }}>Reset</Btn>
                    <Btn v="ghost" onClick={() => { setResetId(null); setResetPw(""); }} style={{ fontSize: 11, padding: "4px 10px" }}>Cancel</Btn>
                  </div>
                )}

                {/* Inline confirm: delete */}
                {isDeleting && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingLeft: 42 }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: C.red }}>Remove {m.name}?</span>
                    <Btn v="danger" onClick={() => handleDelete(m.id)} disabled={actionBusy}
                      style={{ fontSize: 11, padding: "4px 10px" }}>{actionBusy ? "Removing..." : "Yes, remove"}</Btn>
                    <Btn v="ghost" onClick={() => setConfirmDelete(null)} style={{ fontSize: 11, padding: "4px 10px" }}>Cancel</Btn>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* ═══ 2. WHO'S ONLINE ═══ */}
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

      {/* ═══ 3. LOGIN HISTORY ═══ */}
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

      {/* ═══ 4. ACTIVITY FEED ═══ */}
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
              color: !filterMember ? "#fff" : C.t2,
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
                color: filterMember === m.id ? "#fff" : C.t2,
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
                  <span style={{ flex: 1, color: C.t2, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
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

      {/* ═══ 5. TEAM SUMMARY ═══ */}
      <Card>
        <Label>Team Summary</Label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {realTeam.map(m => {
            const sessions = sessionHistory.filter(s => s.member_id === m.id);
            const events = activity.filter(a => a.member_id === m.id);
            const lastActive = sessions[0]?.last_active_at || sessions[0]?.created_at;
            return (
              <div key={m.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
                borderRadius: 12, background: C.warm100, border: `1px solid ${C.line}`,
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
    </div>
  );
}
