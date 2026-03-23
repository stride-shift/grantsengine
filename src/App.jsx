import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { C, FONT, MONO, injectFonts, applyOrgTheme, resetTheme } from "./theme";
import { uid, td, dL, addD, effectiveAsk } from "./utils";
import { CAD } from "./data/constants";
import {
  isLoggedIn, getAuth, setAuth, getCurrentMember, login, logout, setPassword,
  memberLogin, memberSetPassword,
  getGrants, saveGrant, addGrant as apiAddGrant, removeGrant,
  getTeam, getProfile, getPipelineConfig, getOrg, updateOrg as apiUpdateOrg, checkHealth, api,
  getCompliance, updateComplianceDoc, createComplianceDoc,
} from "./api";
import useAI from "./hooks/useAI";

import { Component } from "react";
import OrgSelector from "./components/OrgSelector";
import Login from "./components/Login";
import { ToastProvider, useToast } from "./components/Toast";

// Error boundary — prevents white screen on component crash
class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(err, info) { console.error("[ErrorBoundary]", err, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, textAlign: "center", fontFamily: "Inter, system-ui, sans-serif" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "#1a1a1a", marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>{this.state.error?.message || "An unexpected error occurred"}</p>
          <button onClick={() => this.setState({ error: null })}
            style={{ padding: "8px 20px", fontSize: 13, background: "#4A7C59", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Lazy-load major views — each becomes its own chunk
const Dashboard = lazy(() => import("./components/Dashboard"));
const Pipeline = lazy(() => import("./components/Pipeline"));
const GrantDetail = lazy(() => import("./components/GrantDetail"));
const Settings = lazy(() => import("./components/Settings"));
const Funders = lazy(() => import("./components/Funders"));
const Admin = lazy(() => import("./components/Admin"));

injectFonts();

const DEFAULT_STAGES = [
  { id: "scouted",    label: "Scouted",       c: "#6B7280", bg: "#F3F4F6" },
  { id: "qualifying", label: "Qualifying",    c: "#2563EB", bg: "#EFF6FF" },
  { id: "drafting",   label: "Drafting",      c: "#C17817", bg: "#FEF5E7" },
  { id: "review",     label: "Review",        c: "#6D28D9", bg: "#F3F0FF" },
  { id: "submitted",  label: "Submitted",     c: "#DB2777", bg: "#FDF2F8" },
  { id: "awaiting",   label: "Awaiting",      c: "#0891B2", bg: "#ECFEFF" },
  { id: "won",        label: "Won",           c: "#16A34A", bg: "#DCFCE7" },
  { id: "lost",       label: "Lost",          c: "#DC2626", bg: "#FEF2F2" },
  { id: "resubmit",   label: "Resubmit",      c: "#B45309", bg: "#FEF3C7" },
  { id: "deferred",   label: "Deferred",      c: "#9CA3AF", bg: "#F3F4F6" },
  { id: "archived",   label: "Not Relevant",  c: "#D1D5DB", bg: "#F9FAFB" },
];

const DEFAULT_FTYPES = ["Corporate CSI", "Government/SETA", "International", "Foundation", "Tech Company", "Partnership"];
const EMPTY_GRANT = Object.freeze({ name: "", funder: "", type: "", ask: 0, focus: [], geo: [], rel: "", notes: "", deadline: null, stage: "", market: "sa" });

const SIDEBAR_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "\u25a6" },
  { id: "pipeline", label: "Pipeline", icon: "\u25b6" },
  { id: "funders", label: "Funders", icon: "\u25c7" },
  { id: "settings", label: "Settings", icon: "\u2699" },
];

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

function AppInner() {
  const toast = useToast();
  // ── Auth state ──
  const [authed, setAuthed] = useState(isLoggedIn());
  const [orgSlug, setOrgSlug] = useState(getAuth().slug || (() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("reset") && params.get("slug") ? params.get("slug") : null;
  })());
  const [currentMember, setCurrentMember] = useState(getCurrentMember());
  // Check for password reset link — auto-select org and go to login
  const resetParams = (() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("reset") && params.get("slug") ? { token: params.get("reset"), slug: params.get("slug") } : null;
  })();
  const [selectingOrg, setSelectingOrg] = useState(!isLoggedIn() && !resetParams);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [loggingIn, setLoggingIn] = useState(!!resetParams);

  // ── App state ──
  const [org, setOrg] = useState(null);
  const [profile, setProfile] = useState(null);
  const [grants, setGrants] = useState([]);
  const [team, setTeam] = useState([{ id: "team", name: "Unassigned", initials: "\u2014", role: "none" }]);
  const [stages, setStages] = useState(DEFAULT_STAGES);
  const [funderTypes, setFunderTypes] = useState(DEFAULT_FTYPES);
  const [view, setView] = useState("dashboard");
  const [sel, setSel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [complianceDocs, setComplianceDocs] = useState([]);
  const saveTimers = useRef({});
  const { runAI, clearUploadsCache } = useAI({ org, profile, team, grants, stages });

  // ── Debounced save with status indicator ──
  const [saveState, setSaveState] = useState("idle"); // "idle" | "saving" | "saved" | "error"
  const saveStateTimer = useRef(null);

  const dSave = useCallback((grantId, data) => {
    clearTimeout(saveTimers.current[grantId]);
    saveTimers.current[grantId] = setTimeout(async () => {
      setSaveState("saving");
      try {
        await saveGrant(data);
        setSaveState("saved");
        clearTimeout(saveStateTimer.current);
        saveStateTimer.current = setTimeout(() => setSaveState("idle"), 2000);
      } catch (err) {
        setSaveState("error");
        console.error("Save failed:", err.message);
        toast(`Save failed: ${err.message}`, { type: "error", duration: 5000 });
        // Auto-clear error state after 5s
        clearTimeout(saveStateTimer.current);
        saveStateTimer.current = setTimeout(() => setSaveState("idle"), 5000);
      }
    }, 1000);
  }, []);

  // ── Load data after auth ──
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [orgData, grantsData, teamData, profileData, pipeConfig, compData] = await Promise.all([
        getOrg(),
        getGrants(),
        getTeam(),
        getProfile(),
        getPipelineConfig(),
        getCompliance().catch(() => []),
      ]);
      setOrg(orgData);
      applyOrgTheme(orgData);
      setComplianceDocs(compData || []);

      // Migrate existing grants: backfill funderBudget/askSource for pre-redesign grants
      const PRE_SUB = ["scouted", "qualifying", "drafting", "review"];
      const raw = grantsData || [];
      const migrated = raw.map(g => {
        // Phase 1: backfill funderBudget for grants that don't have it yet
        if (g.funderBudget === undefined) {
          return { ...g, funderBudget: g.ask || null, askSource: g.ask ? "scout-aligned" : null, aiRecommendedAsk: null };
        }
        // Phase 2: for pre-submission grants where ask was pre-set from seed data (not AI-derived
        // or user-overridden), reset ask to 0 so the AI draft can propose an ambitious ask
        if (g.askSource === "scout-aligned" && PRE_SUB.includes(g.stage) && !g.aiDraft) {
          return { ...g, ask: 0, funderBudget: g.funderBudget || g.ask || null, askSource: null };
        }
        return g;
      });
      setGrants(migrated);
      migrated.forEach((g, i) => { if (g !== raw[i]) dSave(g.id, g); });

      setProfile(profileData);

      // Team: ensure "Unassigned" exists
      const t = teamData || [];
      if (!t.find(m => m.id === "team")) t.push({ id: "team", name: "Unassigned", initials: "\u2014", role: "none" });
      setTeam(t);

      // Pipeline config
      if (pipeConfig) {
        if (pipeConfig.stages) setStages(pipeConfig.stages);
        if (pipeConfig.funder_types) setFunderTypes(pipeConfig.funder_types);
      }
    } catch (err) {
      console.error("Failed to load data:", err);
      toast(`Failed to load workspace: ${err.message}`, { type: "error", duration: 0 });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authed) loadData();
  }, [authed, loadData]);

  // ── Clean up save timers on unmount or org switch ──
  useEffect(() => {
    return () => {
      Object.values(saveTimers.current).forEach(t => clearTimeout(t));
      saveTimers.current = {};
      clearTimeout(saveStateTimer.current);
    };
  }, [authed]);

  // ── URL handling (simple pushState, no router) ──
  useEffect(() => {
    if (authed && orgSlug) {
      const path = sel ? `/org/${orgSlug}/grant/${sel}` :
        view === "dashboard" ? `/org/${orgSlug}` :
          `/org/${orgSlug}/${view}`;
      if (window.location.pathname !== path) {
        window.history.pushState({}, "", path);
      }
    }
  }, [authed, orgSlug, view, sel]);

  useEffect(() => {
    const onPop = () => {
      const path = window.location.pathname;
      const match = path.match(/^\/org\/([^/]+)\/?(.*)$/);
      if (match) {
        const [, slug, rest] = match;
        if (slug !== orgSlug) return; // different org, ignore
        if (rest.startsWith("grant/")) {
          setSel(rest.replace("grant/", ""));
        } else if (rest) {
          setSel(null);
          setView(rest);
        } else {
          setSel(null);
          setView("dashboard");
        }
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [orgSlug]);

  // ── Auth handlers ──
  const handleOrgSelect = (slug, isNew) => {
    setOrgSlug(slug);
    setNeedsPassword(isNew);
    setLoggingIn(true);
    setSelectingOrg(false);
  };

  const handleLogin = async (password) => {
    if (needsPassword) {
      await setPassword(orgSlug, password);
    } else {
      await login(orgSlug, password);
    }
    setCurrentMember(null); // legacy shared-password login — no member identity
    setAuthed(true);
    setLoggingIn(false);
    setNeedsPassword(false);
  };

  const handleMemberLogin = async (memberId, password, isSetPassword = false) => {
    if (isSetPassword) {
      const data = await memberSetPassword(orgSlug, memberId, password);
      setCurrentMember(data.member);
    } else {
      const data = await memberLogin(orgSlug, memberId, password);
      setCurrentMember(data.member);
    }
    setAuthed(true);
    setLoggingIn(false);
    setNeedsPassword(false);
  };

  const resetSession = () => {
    setAuthed(false);
    setCurrentMember(null);
    setOrg(null);
    setGrants([]);
    setTeam([{ id: "team", name: "Unassigned", initials: "\u2014", role: "none" }]);
    setView("dashboard");
    setSel(null);
    setSelectingOrg(true);
    setLoggingIn(false);
    clearUploadsCache();
    resetTheme();
    window.history.pushState({}, "", "/");
  };

  const handleLogout = async () => {
    await logout();
    resetSession();
  };

  const handleSwitchOrg = () => {
    resetSession();
  };

  // ── Grant mutations ──
  const updateGrant = (id, updates) => {
    setGrants(prev => {
      const old = prev.find(g => g.id === id);
      if (!old) return prev;

      // Auto-log meaningful changes (skip if caller is already setting log directly)
      const autoEntries = [];
      if (!updates.log) {
        if (updates.stage && updates.stage !== old.stage) {
          const fromLabel = stages.find(s => s.id === old.stage)?.label || old.stage;
          const toLabel = stages.find(s => s.id === updates.stage)?.label || updates.stage;
          autoEntries.push(`Stage moved: ${fromLabel} → ${toLabel}`);
        }
        if (updates.owner && updates.owner !== old.owner) {
          const member = team.find(t => t.id === updates.owner);
          autoEntries.push(`Assigned to ${member?.name || updates.owner}`);
        }
        if (updates.ask !== undefined && updates.ask !== old.ask && updates.ask > 0) {
          autoEntries.push(`Ask updated to R${Number(updates.ask).toLocaleString()}`);
        }
        if (updates.deadline && updates.deadline !== old.deadline) {
          autoEntries.push(`Deadline set to ${updates.deadline}`);
        }
        if (updates.priority !== undefined && updates.priority !== old.priority) {
          autoEntries.push(`Priority changed to ${updates.priority}`);
        }
      }

      // Auto-schedule follow-ups when moving to submitted/awaiting
      let autoFups = undefined;
      if (updates.stage && ["submitted", "awaiting"].includes(updates.stage) && !["submitted", "awaiting"].includes(old.stage)) {
        const cadence = CAD[old.type] || CAD["Foundation"];
        if (cadence && cadence.length > 0) {
          const baseDate = td();
          autoFups = cadence.map(step => ({
            date: addD(baseDate, step.d),
            label: step.l,
            type: step.t,
            done: false,
          }));
          autoEntries.push(`Follow-ups scheduled: ${cadence.length} touchpoints over ${cadence[cadence.length - 1].d} days`);
        }
      }

      const logAdditions = autoEntries.length
        ? autoEntries.map(t => ({ d: td(), t }))
        : [];
      const mergedLog = logAdditions.length
        ? [...(old.log || []), ...logAdditions]
        : undefined;

      const merged = { ...old, ...updates, ...(mergedLog ? { log: mergedLog } : {}), ...(autoFups ? { fups: autoFups } : {}) };
      const next = prev.map(g => g.id === id ? merged : g);
      dSave(id, merged);
      return next;
    });
  };

  const addGrant = async (grant) => {
    const g = { ...grant, id: grant.id || uid() };
    setGrants(prev => [...prev, g]);
    try {
      await apiAddGrant(g);
      toast(`${g.name} added to pipeline`, { type: "success", duration: 3000 });
    } catch (err) {
      console.error("Failed to save grant:", g.name, err);
      setGrants(prev => prev.filter(x => x.id !== g.id));
      toast(`Failed to add ${g.name}. Please try again.`, { type: "error" });
    }
  };

  const pendingDeletes = useRef({});

  const deleteGrant = (id) => {
    const backup = grants.find(g => g.id === id);
    if (!backup) return;
    setGrants(prev => prev.filter(g => g.id !== id));

    // Clear any existing timer for this grant (re-delete edge case)
    if (pendingDeletes.current[id]) clearTimeout(pendingDeletes.current[id]);

    // Delay server delete so undo actually works
    pendingDeletes.current[id] = setTimeout(async () => {
      delete pendingDeletes.current[id];
      try {
        await removeGrant(id);
      } catch (err) {
        console.error("Failed to delete grant:", id, err);
        setGrants(prev => [...prev, backup]);
        toast(`Failed to delete — ${backup.name} restored`, { type: "error" });
      }
    }, 6000); // 6s — slightly longer than the 5s toast

    toast(`${backup.name} deleted`, {
      type: "undo",
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(pendingDeletes.current[id]);
          delete pendingDeletes.current[id];
          setGrants(prev => [...prev, backup]);
          toast(`${backup.name} restored`, { type: "success", duration: 2000 });
        },
      },
    });
  };

  // ── Compliance doc mutations ──
  const upsertCompDoc = async (doc) => {
    try {
      if (doc.id) {
        await updateComplianceDoc(doc.id, doc);
      } else {
        const result = await createComplianceDoc(doc);
        doc = { ...doc, id: result.id };
      }
      const updated = await getCompliance().catch(() => []);
      setComplianceDocs(updated || []);
      toast(`${doc.name} updated`, { type: "success", duration: 2000 });
    } catch (err) {
      console.error("Compliance doc update failed:", err);
      toast(`Failed to update ${doc.name}`, { type: "error" });
    }
  };

  // ── Render ──

  // Not authed: show org selector or login
  if (selectingOrg) {
    return <OrgSelector onSelect={handleOrgSelect} />;
  }

  if (loggingIn || !authed) {
    return (
      <Login
        slug={orgSlug}
        needsPassword={needsPassword}
        onLogin={handleLogin}
        onMemberLogin={handleMemberLogin}
        onBack={() => { setSelectingOrg(true); setLoggingIn(false); }}
      />
    );
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: FONT }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14, margin: "0 auto 18px",
            background: `linear-gradient(135deg, ${C.primary} 0%, ${C.primaryDark} 100%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, fontWeight: 800, color: C.white, fontFamily: MONO,
            boxShadow: `0 4px 20px ${C.primaryGlow}`,
            animation: "ge-pulse 2s ease-in-out infinite",
          }}>{(orgSlug || "G")?.[0]?.toUpperCase()}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.dark, marginBottom: 6, letterSpacing: -0.3 }}>Loading your workspace</div>
          <div style={{ fontSize: 12, color: C.t4 }}>Fetching grants, team, and settings...</div>
          <div style={{ marginTop: 16, width: 140, height: 3, background: C.line, borderRadius: 2, overflow: "hidden", margin: "16px auto 0" }}>
            <div style={{
              height: "100%", borderRadius: 2,
              background: `linear-gradient(90deg, ${C.primary}, ${C.navy})`,
              animation: "app-load-bar 2.5s ease-in-out infinite",
            }} />
          </div>
          {/* animations injected globally via injectFonts() */}
        </div>
      </div>
    );
  }

  const selectedGrant = sel ? grants.find(g => g.id === sel) : null;
  const notifCount = grants.filter(g => {
    if (["won", "lost", "deferred", "archived"].includes(g.stage)) return false;
    const d = dL(g.deadline);
    return d !== null && d <= 14;
  }).length;

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: FONT, background: C.bg }}>
      {/* Sidebar — Clean White */}
      <div style={{
        width: 240, background: C.sidebar,
        display: "flex", flexDirection: "column", flexShrink: 0,
        borderRight: `1px solid ${C.line}`,
        boxShadow: "1px 0 8px rgba(0, 0, 0, 0.04)",
      }}>
        {/* Org header — prominent logo + centered name */}
        <div style={{ padding: "24px 16px 18px", borderBottom: `1px solid ${C.line}`, display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          {org?.logo_url ? (
            <img src={org.logo_url} alt={org?.name || ""}
              onError={e => { e.target.style.display = "none"; if (e.target.nextSibling) e.target.nextSibling.style.display = "flex"; }}
              style={{ width: 56, height: 56, borderRadius: 14, objectFit: "contain", background: C.white, boxShadow: `0 2px 12px ${C.primaryGlow}` }} />
          ) : null}
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: `linear-gradient(135deg, ${C.primary} 0%, ${C.primaryDark} 100%)`,
            display: org?.logo_url ? "none" : "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, fontWeight: 800, color: C.white, fontFamily: MONO,
            boxShadow: `0 2px 12px ${C.primaryGlow}`,
          }}>{(org?.name || orgSlug)?.[0]?.toUpperCase()}</div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, letterSpacing: -0.2 }}>{org?.name || orgSlug}</div>
            <div style={{ fontSize: 10, color: C.t4, letterSpacing: 0.5, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 2 }}>
              Grant Engine
              {saveState === "saving" && <span style={{ fontSize: 9, color: C.amber, fontWeight: 600, animation: "ge-pulse 1.2s ease-in-out infinite" }}>Saving...</span>}
              {saveState === "saved" && <span style={{ fontSize: 9, color: C.ok, fontWeight: 600 }}>✓ Saved</span>}
              {saveState === "error" && <span style={{ fontSize: 9, color: C.red, fontWeight: 600 }}>Save failed</span>}
            </div>
          </div>
        </div>

        {/* Nav items */}
        <div style={{ flex: 1, padding: "14px 10px" }}>
          {[...SIDEBAR_ITEMS, ...(currentMember?.role === "director" ? [{ id: "admin", label: "Admin", icon: "\u25CA" }] : [])].map(item => {
            const active = !sel && view === item.id;
            return (
              <button key={item.id}
                onClick={() => { setView(item.id); setSel(null); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  padding: "8px 12px", marginBottom: 2, border: "none",
                  background: active ? C.sidebarActive : "transparent",
                  color: active ? C.sidebarTextActive : C.sidebarText,
                  fontSize: 12, fontWeight: active ? 600 : 500, cursor: "pointer",
                  borderRadius: 8, fontFamily: FONT, textAlign: "left",
                  transition: "all 0.15s ease",
                  borderLeft: active ? `2px solid ${C.sidebarAccent}` : "2px solid transparent",
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = C.sidebarHover; e.currentTarget.style.color = C.sidebarTextActive; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.sidebarText; } }}>
                <span style={{ fontSize: 13, opacity: active ? 1 : 0.6 }}>{item.icon}</span>
                {item.label}
                {item.id === "dashboard" && notifCount > 0 && (
                  <span style={{
                    marginLeft: "auto", fontSize: 10, fontWeight: 700, color: C.white,
                    background: C.primary, borderRadius: 10, padding: "2px 7px", minWidth: 18,
                    textAlign: "center", boxShadow: `0 1px 6px ${C.primaryGlow}`,
                  }}>{notifCount}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Logout / Switch Org */}
        <div style={{ padding: "10px 10px", borderTop: `1px solid ${C.line}`, display: "flex", flexDirection: "column", gap: 1 }}>
          <button onClick={handleSwitchOrg}
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%",
              padding: "7px 12px", border: "none",
              background: "transparent", color: C.sidebarText,
              fontSize: 12, fontWeight: 500, cursor: "pointer",
              borderRadius: 8, fontFamily: FONT, textAlign: "left",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.sidebarHover; e.currentTarget.style.color = C.sidebarTextActive; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.sidebarText; }}>
            <span style={{ fontSize: 13 }}>{"\u21C4"}</span>
            Switch Organisation
          </button>
          <button onClick={handleLogout}
            style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%",
              padding: "7px 12px", border: "none",
              background: "transparent", color: C.sidebarText,
              fontSize: 12, fontWeight: 500, cursor: "pointer",
              borderRadius: 8, fontFamily: FONT, textAlign: "left",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.sidebarHover; e.currentTarget.style.color = C.sidebarTextActive; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.sidebarText; }}>
            <span style={{ fontSize: 13 }}>{"\u21AA"}</span>
            Sign Out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <ErrorBoundary>
        <Suspense fallback={
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.primary, animation: "ge-pulse 1.4s ease-in-out infinite" }} />
            <span style={{ fontSize: 13, color: C.t3, fontFamily: FONT }}>Loading...</span>
          </div>
        }>
        {sel && !selectedGrant ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, padding: 40 }}>
            <span style={{ fontSize: 32 }}>🔍</span>
            <p style={{ fontSize: 14, color: C.t3, fontFamily: FONT }}>This grant no longer exists or was removed.</p>
            <button onClick={() => setSel(null)}
              style={{ padding: "8px 20px", fontSize: 13, background: C.primary, color: C.white, border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontFamily: FONT }}>
              Back to Pipeline
            </button>
          </div>
        ) : sel && selectedGrant ? (
          <GrantDetail
            grant={selectedGrant}
            team={team}
            stages={stages}
            funderTypes={funderTypes}
            complianceDocs={complianceDocs}
            currentMember={currentMember}
            orgName={org?.name || "the organisation"}
            onUpdate={updateGrant}
            onDelete={deleteGrant}
            onBack={() => setSel(null)}
            onRunAI={runAI}
            onUploadsChanged={(grantId) => { clearUploadsCache(grantId); }}
          />
        ) : view === "dashboard" ? (
          <Dashboard
            grants={grants}
            team={team}
            stages={stages}
            complianceDocs={complianceDocs}
            orgName={org?.name}
            onSelectGrant={(id) => setSel(id)}
            onNavigate={(v) => { setSel(null); setView(v); }}
            onRunReport={() => runAI("report", EMPTY_GRANT)}
            onRunInsights={() => runAI("insights", EMPTY_GRANT)}
            onRunStrategy={() => runAI("strategy", EMPTY_GRANT)}
          />
        ) : view === "pipeline" ? (
          <Pipeline
            grants={grants}
            team={team}
            stages={stages}
            funderTypes={funderTypes}
            complianceDocs={complianceDocs}
            orgContext={profile?.context_slim || profile?.mission || org?.name || ""}
            onSelectGrant={(id) => setSel(id)}
            onUpdateGrant={updateGrant}
            onAddGrant={addGrant}
            onRunAI={runAI}
            api={api}
            onToast={toast}
          />
        ) : view === "funders" ? (
          <Funders
            grants={grants}
            team={team}
            stages={stages}
            onSelectGrant={(id) => setSel(id)}
            onNavigate={(v) => { setSel(null); setView(v); }}
          />
        ) : view === "settings" ? (
          <Settings
            org={org}
            profile={profile}
            team={team}
            currentMember={currentMember}
            complianceDocs={complianceDocs}
            onUpsertCompDoc={upsertCompDoc}
            onUpdateProfile={async (data) => {
              const { updateProfile: apiUpdateProfile } = await import("./api");
              await apiUpdateProfile(data);
              const newProfile = await getProfile();
              setProfile(newProfile);
              toast("Profile updated", { type: "success", duration: 2000 });
            }}
            onUpdateOrg={async (updates) => {
              await apiUpdateOrg(updates);
              const newOrg = { ...org, ...updates };
              setOrg(newOrg);
              applyOrgTheme(newOrg);
            }}
            onLogout={handleLogout}
          />
        ) : view === "admin" && currentMember?.role === "director" ? (
          <Admin org={org} team={team} grants={grants} currentMember={currentMember} onSaveGrant={saveGrant} onSetGrants={setGrants} onTeamChanged={async () => {
            try { const t = await getTeam(); setTeam(t); } catch (e) { console.error("Team refresh failed:", e); }
          }} />
        ) : null}
        </Suspense>
        </ErrorBoundary>
      </div>

      {/* animations injected globally via injectFonts() */}
    </div>
  );
}
