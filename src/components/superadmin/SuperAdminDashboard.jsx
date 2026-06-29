import { useState, useEffect, useCallback } from "react";
import { C, FONT, MONO } from "@/theme";
import { Btn, Label } from "@/components/ui";
import { OrgAvatar } from "@/components/auth/OrgSelector";
import {
  superAdminVerify, superAdminLogout,
  saGetOrgs, saGetOrgActivity, saGetOrgSessions, saGetOrgUsage, saSetSubscription,
} from "@/api";
import {
  PLAN_LABELS, STATUS_LABELS, PRICING, formatZar, resolveSubscription,
} from "@/data/subscription";

/* ── Time helpers (matched to Admin.jsx) ── */
const ago = (ts) => {
  if (!ts) return "—";
  const mins = Math.round((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
};

const fmtDate = (ts) => {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
};

const fmtDateTime = (ts) => {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};

// Compact large numbers: 2900 → "2.9k", 1_300_000 → "1.3M"
const compact = (n) => {
  const v = Number(n || 0);
  if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1).replace(/\.0$/, "")}k`;
  return `${v}`;
};

/* ── Event config (matched to Admin.jsx) ── */
const EVENT_CONFIG = {
  login:        { label: "Logged in",     icon: "→", color: C.t3,      bg: C.warm200 },
  logout:       { label: "Logged out",    icon: "←", color: C.t3,      bg: C.warm200 },
  grant_create: { label: "Created grant", icon: "+",      color: C.ok,      bg: C.okSoft },
  grant_update: { label: "Updated grant", icon: "✎", color: C.blue,    bg: C.blueSoft },
  stage_change: { label: "Stage change",  icon: "▶", color: C.navy,    bg: C.navySoft },
  grant_delete: { label: "Deleted grant", icon: "✗", color: C.red,     bg: C.redSoft },
  ai_call:      { label: "AI call",       icon: "◆", color: C.purple,  bg: C.purpleSoft },
  export:       { label: "Export",        icon: "↓", color: C.amber,   bg: C.amberSoft },
  admin_action: { label: "Admin",         icon: "⚙", color: C.primary, bg: C.primarySoft },
};

const eventDetail = (event, meta) => {
  if (!meta) return "";
  if (event === "stage_change" && meta.from_stage && meta.to_stage) {
    return `${meta.grant_name || "Grant"}: ${meta.from_stage} → ${meta.to_stage}`;
  }
  if (event === "admin_action" && meta.action) {
    return `${meta.action.replace(/_/g, " ")} — ${meta.target_member || ""}`;
  }
  return meta.grant_name || meta.member_name || "";
};

/* ── Status badge colour by resolved status ── */
const STATUS_STYLE = {
  trial:     { color: C.t2,  bg: C.warm200 },
  active:    { color: C.ok,  bg: C.okSoft },
  expired:   { color: C.amber, bg: C.amberSoft },
  cancelled: { color: C.red, bg: C.redSoft },
};

const StatusBadge = ({ status }) => {
  const s = STATUS_STYLE[status] || STATUS_STYLE.trial;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
      color: s.color, background: s.bg, whiteSpace: "nowrap",
    }}>
      {STATUS_LABELS[status] || status}
    </span>
  );
};

const Card = ({ children, style: sx }) => (
  <div style={{
    background: C.white, borderRadius: 10, padding: 16, boxShadow: C.cardShadow,
    border: `1px solid ${C.line}`, marginBottom: 14, ...sx,
  }}>{children}</div>
);

/* ── Detail row ── */
const Row = ({ k, v }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: `1px solid ${C.line}`, fontSize: 13 }}>
    <span style={{ color: C.t3, fontWeight: 600 }}>{k}</span>
    <span style={{ color: C.dark, textAlign: "right", wordBreak: "break-word" }}>{v ?? "—"}</span>
  </div>
);

/* ── Usage stat card ── */
const Stat = ({ label, value, hint }) => (
  <div style={{
    padding: "14px 16px", borderRadius: 10, background: C.warm100, border: `1px solid ${C.line}`,
  }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 800, color: C.dark, marginTop: 4, fontFamily: MONO }}>{value}</div>
    {hint && <div style={{ fontSize: 11, color: C.t4, marginTop: 2 }}>{hint}</div>}
  </div>
);

const TABS = [
  { id: "details", label: "Org details" },
  { id: "actions", label: "Actions" },
  { id: "usage", label: "Usage" },
  { id: "subscription", label: "Subscription" },
];

export default function SuperAdminDashboard({ onLogout }) {
  const [admin, setAdmin] = useState(null);
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("details");

  // Per-tab lazy data for the selected org
  const [activity, setActivity] = useState(null);
  const [usage, setUsage] = useState(null);
  const [sessions, setSessions] = useState(null);
  const [tabLoading, setTabLoading] = useState(false);
  const [tabErr, setTabErr] = useState("");

  const selected = orgs.find(o => o.id === selectedId) || null;

  const loadOrgs = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const [v, list] = await Promise.all([
        superAdminVerify().catch(() => null),
        saGetOrgs(),
      ]);
      if (v?.admin) setAdmin(v.admin);
      const arr = Array.isArray(list) ? list : [];
      setOrgs(arr);
      setSelectedId(prev => prev && arr.some(o => o.id === prev) ? prev : (arr[0]?.id ?? null));
    } catch (ex) {
      setErr(ex.message || "Failed to load organisations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadOrgs(); }, [loadOrgs]);

  // Load the data the active tab needs whenever org/tab changes.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    const run = async () => {
      setTabErr("");
      try {
        if (tab === "actions" && activity === null) {
          setTabLoading(true);
          const a = await saGetOrgActivity(selected.id, 100);
          if (!cancelled) setActivity(Array.isArray(a) ? a : []);
        } else if (tab === "usage" && usage === null) {
          setTabLoading(true);
          const [u, s] = await Promise.all([
            saGetOrgUsage(selected.id),
            saGetOrgSessions(selected.id).catch(() => null),
          ]);
          if (!cancelled) { setUsage(u || {}); setSessions(s); }
        }
      } catch (ex) {
        if (!cancelled) setTabErr(ex.message || "Failed to load");
      } finally {
        if (!cancelled) setTabLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, tab]);

  // Reset per-tab caches when switching org.
  useEffect(() => {
    setActivity(null);
    setUsage(null);
    setSessions(null);
    setTab("details");
  }, [selectedId]);

  const handleLogout = async () => {
    await superAdminLogout();
    onLogout?.();
  };

  // ── Top bar ──
  const topBar = (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 20px", background: C.white, borderBottom: `1px solid ${C.line}`,
      position: "sticky", top: 0, zIndex: 5,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: C.dark, letterSpacing: -0.3 }}>Grants Engine</span>
        <span style={{
          fontSize: 10, fontWeight: 700, color: C.primary, background: C.primarySoft,
          padding: "2px 8px", borderRadius: 6, textTransform: "uppercase", letterSpacing: 0.5,
        }}>Super-admin</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {admin && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>{admin.name}</div>
            <div style={{ fontSize: 11, color: C.t3 }}>{admin.email}</div>
          </div>
        )}
        <Btn v="ghost" onClick={handleLogout} style={{ fontSize: 12, padding: "6px 14px" }}>Log out</Btn>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT }}>
        {topBar}
        <div style={{ padding: 32, fontSize: 13, color: C.t3 }}>Loading organisations…</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: FONT }}>
      {topBar}

      {err && (
        <div style={{ margin: 20, padding: "10px 16px", borderRadius: 10, background: C.redSoft, color: C.red, fontSize: 13, fontWeight: 600 }}>
          {err}
        </div>
      )}

      <div style={{ display: "flex", gap: 16, padding: 20, alignItems: "flex-start" }} className="ge-tablet-stack">
        {/* ── Left: org list ── */}
        <div style={{ flex: "0 0 320px", maxWidth: 320 }} className="ge-tablet-full">
          <Card style={{ marginBottom: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <Label style={{ marginBottom: 0 }}>Organisations</Label>
              <span style={{ fontSize: 11, color: C.t4 }}>{orgs.length}</span>
            </div>
            {orgs.length === 0 ? (
              <div style={{ fontSize: 13, color: C.t4, padding: "8px 0" }}>No organisations yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {orgs.map(org => {
                  const sub = resolveSubscription(org);
                  const u = org.usage || {};
                  const isSel = org.id === selectedId;
                  return (
                    <button key={org.id} onClick={() => setSelectedId(org.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
                        borderRadius: 10, cursor: "pointer", textAlign: "left", fontFamily: FONT,
                        background: isSel ? C.primarySoft : "transparent",
                        border: `1px solid ${isSel ? C.primaryBorder : "transparent"}`,
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = C.hover; }}
                      onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
                    >
                      <OrgAvatar name={org.name} logoUrl={org.logo_url} slug={org.slug} size={34} radius={9} fontSize={14} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: C.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{org.name}</span>
                          <StatusBadge status={sub.status} />
                        </div>
                        <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
                          {compact(u.grants || 0)} grants · {compact(u.aiCalls || 0)} AI calls
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* ── Right: selected org ── */}
        <div style={{ flex: 1, minWidth: 0 }} className="ge-tablet-full">
          {!selected ? (
            <Card><div style={{ fontSize: 13, color: C.t4 }}>Select an organisation.</div></Card>
          ) : (
            <>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <OrgAvatar name={selected.name} logoUrl={selected.logo_url} slug={selected.slug} size={44} radius={10} fontSize={18} />
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: C.dark, letterSpacing: -0.3 }}>{selected.name}</div>
                  <div style={{ fontSize: 12, color: C.t3, fontFamily: MONO }}>/{selected.slug}</div>
                </div>
              </div>

              {/* Mini-tabs */}
              <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
                {TABS.map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    style={{
                      padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: FONT,
                      cursor: "pointer", border: "none",
                      background: tab === t.id ? C.navy : C.warm200,
                      color: tab === t.id ? C.white : C.t2,
                      transition: "all 0.15s",
                    }}
                  >{t.label}</button>
                ))}
              </div>

              {tabErr && (
                <Card style={{ background: C.redSoft, borderColor: `${C.red}30` }}>
                  <div style={{ fontSize: 13, color: C.red, fontWeight: 600 }}>{tabErr}</div>
                </Card>
              )}

              {tab === "details" && <OrgDetailsTab org={selected} />}
              {tab === "actions" && <ActionsTab activity={activity} loading={tabLoading} />}
              {tab === "usage" && <UsageTab usage={usage} sessions={sessions} loading={tabLoading} />}
              {tab === "subscription" && (
                <SubscriptionTab org={selected} onSaved={loadOrgs} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ════ Tab: Org details ════ */
function OrgDetailsTab({ org }) {
  const u = org.usage || {};
  return (
    <Card>
      <Label>Organisation</Label>
      <div style={{ marginTop: 4 }}>
        <Row k="Name" v={org.name} />
        <Row k="Slug" v={<span style={{ fontFamily: MONO }}>/{org.slug}</span>} />
        <Row k="Website" v={org.website ? <a href={org.website} target="_blank" rel="noreferrer" style={{ color: C.primary }}>{org.website}</a> : "—"} />
        <Row k="Industry" v={org.industry} />
        <Row k="Country" v={org.country} />
        <Row k="Org type" v={org.org_type} />
        <Row k="Created" v={fmtDate(org.created_at)} />
        <Row k="Members" v={u.members ?? "—"} />
      </div>
    </Card>
  );
}

/* ════ Tab: Actions (activity feed) ════ */
function ActionsTab({ activity, loading }) {
  if (loading || activity === null) {
    return <Card><div style={{ fontSize: 13, color: C.t3 }}>Loading activity…</div></Card>;
  }
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <Label style={{ marginBottom: 0 }}>Activity</Label>
        <span style={{ fontSize: 11, color: C.t4 }}>{activity.length} events</span>
      </div>
      {activity.length === 0 ? (
        <div style={{ fontSize: 13, color: C.t4, padding: "8px 0" }}>No activity recorded yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 560, overflowY: "auto" }}>
          {activity.map((a, i) => {
            const cfg = EVENT_CONFIG[a.event] || { label: a.event, icon: "·", color: C.t3, bg: C.warm200 };
            const detail = eventDetail(a.event, a.meta);
            return (
              <div key={i} className="ge-hover-slide" style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
                borderRadius: 8, opacity: 0.9, fontSize: 12,
              }}>
                <span style={{ fontWeight: 600, color: C.dark, minWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {a.member_name || "—"}
                </span>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                  color: cfg.color, background: cfg.bg, minWidth: 80, textAlign: "center",
                  fontFamily: MONO, letterSpacing: 0.3,
                }}>
                  {cfg.icon} {cfg.label}
                </span>
                <span style={{ flex: 1, color: C.t2, fontSize: 12, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
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
  );
}

/* ════ Tab: Usage ════ */
function UsageTab({ usage, sessions, loading }) {
  if (loading || usage === null) {
    return <Card><div style={{ fontSize: 13, color: C.t3 }}>Loading usage…</div></Card>;
  }
  const u = usage || {};
  const runs = Array.isArray(u.agentRuns) ? u.agentRuns : [];
  return (
    <>
      <Card>
        <Label>Usage</Label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginTop: 4 }}>
          <Stat label="Grants" value={compact(u.grants || 0)} />
          <Stat label="Members" value={compact(u.members || 0)} />
          <Stat label="AI calls" value={compact(u.aiCalls || 0)} />
          <Stat label="Tokens in" value={compact(u.tokensIn || 0)} />
          <Stat label="Tokens out" value={compact(u.tokensOut || 0)} />
          <Stat label="Cost" value={`$${Number(u.costUsd || 0).toFixed(2)}`} hint="from agent_runs.cost_usd" />
        </div>
        <div style={{ fontSize: 12, color: C.t3, marginTop: 14 }}>
          Last activity: <strong style={{ color: C.dark }}>{ago(u.lastActivityAt)}</strong>
          {sessions?.active && <span> · {sessions.active.length} active session{sessions.active.length === 1 ? "" : "s"}</span>}
        </div>
      </Card>

      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <Label style={{ marginBottom: 0 }}>Recent agent runs</Label>
          <span style={{ fontSize: 11, color: C.t4 }}>{runs.length}</span>
        </div>
        {runs.length === 0 ? (
          <div style={{ fontSize: 13, color: C.t4, padding: "8px 0" }}>No agent runs recorded.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 360, overflowY: "auto" }}>
            {runs.slice(0, 50).map((r, i) => (
              <div key={r.id || i} className="ge-hover-slide" style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
                borderRadius: 8, fontSize: 12, opacity: 0.9,
              }}>
                <span style={{ fontWeight: 600, color: C.dark, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.agent || r.type || r.kind || "Agent run"}
                </span>
                {(r.tokens_in != null || r.tokens_out != null) && (
                  <span style={{ color: C.t3, fontFamily: MONO, fontSize: 11 }}>
                    {compact(r.tokens_in || 0)}/{compact(r.tokens_out || 0)} tok
                  </span>
                )}
                {r.cost_usd != null && (
                  <span style={{ color: C.t2, fontFamily: MONO, fontSize: 11, minWidth: 56, textAlign: "right" }}>
                    ${Number(r.cost_usd).toFixed(3)}
                  </span>
                )}
                <span style={{ fontSize: 10, color: C.t4, minWidth: 55, textAlign: "right", whiteSpace: "nowrap" }}>
                  {ago(r.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

/* ════ Tab: Subscription ════ */
const PLAN_OPTIONS = ["free_week", "monthly", "yearly"];
const STATUS_OPTIONS = ["trial", "active", "expired", "cancelled"];

function SubscriptionTab({ org, onSaved }) {
  const current = resolveSubscription(org);
  const [plan, setPlan] = useState(org.subscription_plan || "free_week");
  const [status, setStatus] = useState(org.subscription_status || "trial");
  const [lock, setLock] = useState(!!org.readonly_lock);
  const [trialEnds, setTrialEnds] = useState(
    org.trial_expires_at ? new Date(org.trial_expires_at).toISOString().slice(0, 10) : ""
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Re-sync local form when the selected org changes.
  useEffect(() => {
    setPlan(org.subscription_plan || "free_week");
    setStatus(org.subscription_status || "trial");
    setLock(!!org.readonly_lock);
    setTrialEnds(org.trial_expires_at ? new Date(org.trial_expires_at).toISOString().slice(0, 10) : "");
    setMsg("");
  }, [org.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const priceFor = (p) => p === "monthly" ? formatZar(PRICING.monthly) + "/mo"
    : p === "yearly" ? formatZar(PRICING.yearly) + "/yr"
    : "Free";

  const dirty = plan !== (org.subscription_plan || "free_week")
    || status !== (org.subscription_status || "trial")
    || lock !== !!org.readonly_lock
    || trialEnds !== (org.trial_expires_at ? new Date(org.trial_expires_at).toISOString().slice(0, 10) : "");

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      await saSetSubscription(org.id, {
        subscription_plan: plan,
        subscription_status: status,
        readonly_lock: lock,
        trial_expires_at: trialEnds ? new Date(trialEnds).toISOString() : null,
      });
      setMsg("Saved");
      await onSaved?.();
    } catch (ex) {
      setMsg(`Error: ${ex.message || "Save failed"}`);
    } finally {
      setSaving(false);
    }
  };

  const selectStyle = {
    width: "100%", padding: "8px 12px", fontSize: 13, fontFamily: FONT,
    border: `1px solid ${C.line}`, borderRadius: 8, outline: "none",
    color: C.dark, background: C.white, cursor: "pointer", boxSizing: "border-box",
  };

  return (
    <>
      <Card>
        <Label>Current</Label>
        <div style={{ marginTop: 4 }}>
          <Row k="Plan" v={PLAN_LABELS[current.plan] || current.plan} />
          <Row k="Status" v={<StatusBadge status={current.status} />} />
          <Row k="Trial ends" v={current.trialEndsAt ? fmtDateTime(current.trialEndsAt) : "—"} />
          {current.daysLeft != null && (
            <Row k="Days left" v={current.daysLeft >= 0 ? `${current.daysLeft} days` : `${Math.abs(current.daysLeft)} days ago`} />
          )}
          <Row k="Read-only lock" v={current.readOnlyLock ? "On (active)" : org.readonly_lock ? "On (applies when expired)" : "Off"} />
        </div>
      </Card>

      <Card>
        <Label>Change subscription</Label>

        <div style={{ marginTop: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.t3, marginBottom: 6 }}>Plan</div>
          <select value={plan} onChange={e => setPlan(e.target.value)} style={selectStyle}>
            {PLAN_OPTIONS.map(p => (
              <option key={p} value={p}>{PLAN_LABELS[p]} — {priceFor(p)}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.t3, marginBottom: 6 }}>Status</div>
          <select value={status} onChange={e => setStatus(e.target.value)} style={selectStyle}>
            {STATUS_OPTIONS.map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.t3, marginBottom: 6 }}>Trial / access end date</div>
          <input type="date" value={trialEnds} onChange={e => setTrialEnds(e.target.value)}
            style={{ ...selectStyle, cursor: "text" }} />
        </div>

        <label style={{
          display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 14px",
          background: C.warm100, borderRadius: 10, border: `1px solid ${C.line}`, cursor: "pointer",
        }}>
          <input type="checkbox" checked={lock} onChange={e => setLock(e.target.checked)} style={{ marginTop: 2 }} />
          <span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>Read-only lock</span>
            <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
              Read-only lock blocks editing/AI for this org once expired; off = banner only.
            </div>
          </span>
        </label>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
          <Btn v="primary" onClick={save} disabled={saving || !dirty} style={{ fontSize: 13, padding: "8px 18px" }}>
            {saving ? "Saving…" : "Save"}
          </Btn>
          {msg && (
            <span style={{ fontSize: 12, fontWeight: 600, color: msg.startsWith("Error") ? C.red : C.ok }}>{msg}</span>
          )}
        </div>
      </Card>
    </>
  );
}
