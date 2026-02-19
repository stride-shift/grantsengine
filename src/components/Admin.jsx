import { useState, useEffect, useMemo } from "react";
import { C, FONT, MONO } from "../theme";
import { Label, Avatar, Btn } from "./index";
import { getAdminSessions, getAdminSessionHistory, getAdminActivity } from "../api";

// ── Time formatting ──
const ago = (ts) => {
  if (!ts) return "—";
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
};

const fmtDuration = (mins) => {
  if (!mins || mins < 1) return "<1m";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return m ? `${h}h ${m}m` : `${h}h`;
};

const fmtDate = (ts) => {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

// ── Event config ──
const EVENT_CONFIG = {
  login:        { label: "Logged in",      icon: "→",  color: C.t3,     bg: C.warm200 },
  logout:       { label: "Logged out",     icon: "←",  color: C.t3,     bg: C.warm200 },
  grant_create: { label: "Created grant",  icon: "+",  color: C.ok,     bg: C.okSoft },
  grant_update: { label: "Updated grant",  icon: "✎",  color: C.blue,   bg: C.blueSoft },
  stage_change: { label: "Stage change",   icon: "▶",  color: C.navy,   bg: C.navySoft },
  grant_delete: { label: "Deleted grant",  icon: "✗",  color: C.red,    bg: C.redSoft },
  ai_call:      { label: "AI call",        icon: "◆",  color: C.purple, bg: C.purpleSoft },
  export:       { label: "Export",         icon: "↓",  color: C.amber,  bg: C.amberSoft },
};

const eventLabel = (event, meta) => {
  const cfg = EVENT_CONFIG[event] || { label: event, icon: "·", color: C.t3, bg: C.warm200 };
  if (event === "stage_change" && meta?.from_stage && meta?.to_stage) {
    return `${meta.grant_name || "Grant"}: ${meta.from_stage} → ${meta.to_stage}`;
  }
  if (meta?.grant_name) return meta.grant_name;
  if (meta?.member_name) return meta.member_name;
  return "";
};

export default function Admin({ org, team }) {
  const [activeSessions, setActiveSessions] = useState([]);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [activity, setActivity] = useState([]);
  const [filterMember, setFilterMember] = useState(null);
  const [loading, setLoading] = useState(true);

  const realTeam = useMemo(() => (team || []).filter(t => t.id !== "team"), [team]);

  // Load all admin data
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

  // Auto-refresh active sessions every 30s
  useEffect(() => {
    const t = setInterval(async () => {
      try { setActiveSessions(await getAdminSessions()); } catch { /* ignore */ }
    }, 30000);
    return () => clearInterval(t);
  }, []);

  const getMember = (id) => realTeam.find(t => t.id === id) || { name: "Team", initials: "—", role: "none" };

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
        <div style={{ fontSize: 13, color: C.t3, marginTop: 2 }}>User activity and session management</div>
      </div>

      {/* ── Panel 1: Who's Online ── */}
      <div style={{
        background: C.white, borderRadius: 16, padding: 20, boxShadow: C.cardShadow, marginBottom: 20,
        border: `1.5px solid ${C.primary}25`,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <Label>Who's Online</Label>
          <span style={{
            fontSize: 11, fontWeight: 600, color: C.ok, background: C.okSoft,
            padding: "3px 10px", borderRadius: 8,
          }}>{activeSessions.length} active</span>
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
      </div>

      {/* ── Panel 2: Login History ── */}
      <div style={{
        background: C.white, borderRadius: 16, padding: 20, boxShadow: C.cardShadow, marginBottom: 20,
        border: `1.5px solid ${C.primary}25`,
      }}>
        <Label>Login History</Label>

        {sessionHistory.length === 0 ? (
          <div style={{ fontSize: 13, color: C.t4, padding: "8px 0" }}>No login history yet. Team members will appear here once they sign in with personal accounts.</div>
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
                    ...(isActive
                      ? { color: C.ok, background: C.okSoft }
                      : { color: C.t4, background: C.warm200 }
                    ),
                  }}>
                    {isActive ? "Active" : "Ended"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Panel 3: Activity Feed ── */}
      <div style={{
        background: C.white, borderRadius: 16, padding: 20, boxShadow: C.cardShadow, marginBottom: 20,
        border: `1.5px solid ${C.primary}25`,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <Label>Activity Feed</Label>
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
            {filterMember ? "No activity from this team member." : "No activity recorded yet."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 500, overflowY: "auto" }}>
            {activity.map((a, i) => {
              const cfg = EVENT_CONFIG[a.event] || { label: a.event, icon: "·", color: C.t3, bg: C.warm200 };
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
      </div>

      {/* ── Per-member summary ── */}
      <div style={{
        background: C.white, borderRadius: 16, padding: 20, boxShadow: C.cardShadow, marginBottom: 20,
        border: `1.5px solid ${C.primary}25`,
      }}>
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
                    {sessions.length} sessions · {events.length} actions
                  </div>
                  {lastActive && (
                    <div style={{ fontSize: 10, color: C.t4 }}>Last: {ago(lastActive)}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
