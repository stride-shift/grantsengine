import { useState, useEffect, useCallback, useRef, lazy, Suspense, Component } from "react";
import { C, FONT, injectFonts, applyOrgTheme, resetTheme } from "./theme";
import { dL } from "./utils";
import {
  logout,
  saveGrant,
  getTeam, getProfile, updateProfile as apiUpdateProfile, updateOrg as apiUpdateOrg, checkHealth, api,
} from "./api";
import useAI from "./hooks/useAI";
import useSave from "./hooks/useSave";
import useComplianceDocs from "./hooks/useComplianceDocs";
import useGrants from "./hooks/useGrants";
import { resolveSubscription } from "@/data/subscription";
import SubscriptionBanner from "@/components/subscription/SubscriptionBanner";
import useDataLoad from "./hooks/useDataLoad";
import useSession from "./hooks/useSession";
import useRouting from "./hooks/useRouting";
import { saIsLoggedIn } from "./api";
import usePipelineHygiene from "./hooks/usePipelineHygiene";

import OrgSelector from "@/components/auth/OrgSelector";
import Login from "@/components/auth/Login";
import EmailLogin from "@/components/auth/EmailLogin";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import TourOverlay from "@/components/chrome/TourOverlay";
import { hasSeenOverview } from "./data/tourSteps";

/* Context-aware help button. On Dashboard, opens a popover so the user can pick
 * between the nav walkthrough (overview) and the dashboard walkthrough.
 * On every other tab, a single click launches that tab's tour directly. */
// Sidebar global search — surfaces any grant by funder, name, type or notes.
// Picking a result opens the grant directly (no detour through the pipeline).
function GlobalSearch({ grants, query, onQueryChange, onPick }) {
  const [focused, setFocused] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!focused) return;
    const handler = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setFocused(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [focused]);

  const q = query.trim().toLowerCase();
  const matches = !q ? [] : grants
    .filter(g => {
      if (g.stage === "archived") return false;
      const hay = `${g.funder || ""} ${g.name || ""} ${g.type || ""} ${g.notes || ""} ${g.market || ""}`.toLowerCase();
      return hay.includes(q);
    })
    .slice(0, 8);

  return (
    <div ref={boxRef} style={{ padding: "10px 12px 0", position: "relative" }}>
      <div style={{ position: "relative" }}>
        <span style={{
          position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
          color: "rgba(255,255,255,0.4)", fontSize: 12, pointerEvents: "none",
        }}>{"⚲"}</span>
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="Search grants…"
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "8px 10px 8px 28px", fontSize: 12,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8, color: "#fff", outline: "none",
            fontFamily: FONT,
          }}
        />
      </div>
      {focused && q && (
        <div style={{
          position: "absolute", top: "100%", left: 12, right: 12, marginTop: 6,
          background: "#0e1b2c", border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 8, overflow: "hidden", zIndex: 30,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          maxHeight: 320, overflowY: "auto",
        }}>
          {matches.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: 12, color: "rgba(255,255,255,0.45)", fontFamily: FONT }}>
              No grants match "{query}"
            </div>
          ) : matches.map(g => (
            <button
              key={g.id}
              onClick={() => { onPick(g.id); setFocused(false); }}
              style={{
                width: "100%", textAlign: "left", padding: "10px 12px",
                background: "transparent", border: "none", cursor: "pointer",
                borderBottom: "1px solid rgba(255,255,255,0.06)", fontFamily: FONT,
                display: "block",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", marginBottom: 2 }}>{g.funder || "(no funder)"}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
                {g.name || "Untitled"} · {g.stage || "—"}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HelpButton({ currentView, selectedGrant, onLaunch }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Click-outside closes the popover
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const tabTourFor = (view, hasGrant) => {
    if (hasGrant) return "grantDetail";
    switch (view) {
      case "dashboard": return "dashboard";
      case "pipeline":  return "pipeline";
      case "vetting":   return "vetting";
      case "calendar":  return "calendar";
      case "docs":      return "docs";
      case "funders":   return "funders";
      case "settings":  return "settings";
      default:          return "overview";
    }
  };

  const handleClick = () => {
    // Only Dashboard offers a menu — every other tab launches its tour directly.
    if (currentView === "dashboard" && !selectedGrant) {
      setMenuOpen(o => !o);
    } else {
      onLaunch(tabTourFor(currentView, !!selectedGrant));
    }
  };

  return (
    <div ref={menuRef} style={{ position: "fixed", bottom: 18, right: 18, zIndex: 60 }}>
      <button
        data-tour="help-button"
        onClick={handleClick}
        title={currentView === "dashboard" ? "Walk me through the app" : "Walk through this tab"}
        style={{
          width: 42, height: 42, borderRadius: "50%",
          background: C.primary, border: "none",
          boxShadow: `0 6px 18px ${C.primary}55, 0 2px 6px rgba(0,0,0,0.15)`,
          cursor: "pointer", fontFamily: FONT,
          fontSize: 20, fontWeight: 800, color: C.white,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "transform 180ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 180ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.08)"; e.currentTarget.style.boxShadow = `0 8px 24px ${C.primary}80, 0 2px 6px rgba(0,0,0,0.2)`; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = `0 6px 18px ${C.primary}55, 0 2px 6px rgba(0,0,0,0.15)`; }}
      >
        ?
      </button>

      {/* Popover — only mounted when menu is open (Dashboard only) */}
      {menuOpen && (
        <div style={{
          position: "absolute", bottom: 52, right: 0,
          width: 280, background: C.white, borderRadius: 12,
          boxShadow: "0 12px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)",
          border: `1px solid ${C.line}`, overflow: "hidden",
          fontFamily: FONT,
          animation: "ge-help-pop 180ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}>
          <button
            onClick={() => { setMenuOpen(false); onLaunch("overview"); }}
            style={{
              width: "100%", textAlign: "left", padding: "12px 14px",
              background: "none", border: "none", cursor: "pointer", fontFamily: FONT,
              borderBottom: `1px solid ${C.line}`,
              transition: "background 150ms cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = C.primarySoft || `${C.primary}10`}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: C.primary, marginBottom: 2 }}>
              Walk me through every tab
            </div>
            <div style={{ fontSize: 11, color: C.t3 }}>
              A guided tour across the whole app
            </div>
          </button>
          <button
            onClick={() => { setMenuOpen(false); onLaunch("dashboard"); }}
            style={{
              width: "100%", textAlign: "left", padding: "12px 14px",
              background: "none", border: "none", cursor: "pointer", fontFamily: FONT,
              transition: "background 150ms cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = C.primarySoft || `${C.primary}10`}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, marginBottom: 2 }}>
              Dashboard walkthrough
            </div>
            <div style={{ fontSize: 11, color: C.t3 }}>
              Tour the sections of the dashboard
            </div>
          </button>
        </div>
      )}

      <style>{`
        @keyframes ge-help-pop {
          0% { opacity: 0; transform: translateY(6px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
import geLogo from "./grants-engine-logo.png";
import NorthernLights from "@/components/chrome/NorthernLights";

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
const Dashboard = lazy(() => import("@/components/dashboard/Dashboard"));
const Pipeline = lazy(() => import("@/components/pipeline/Pipeline"));
const GrantDetail = lazy(() => import("@/components/grant/GrantDetail"));
const Settings = lazy(() => import("@/components/settings/Settings"));
const Funders = lazy(() => import("@/components/funders/Funders"));
const Admin = lazy(() => import("@/components/settings/Admin"));
const Calendar = lazy(() => import("@/components/calendar/Calendar"));
const Vetting = lazy(() => import("@/components/pipeline/Vetting"));
const DocVault = lazy(() => import("@/components/documents/DocVault"));
const ResourcesHub = lazy(() => import("@/components/resources/ResourcesHub"));
const Archive = lazy(() => import("@/components/pipeline/Archive"));
const SuperAdminLogin = lazy(() => import("@/components/superadmin/SuperAdminLogin"));
const SuperAdminDashboard = lazy(() => import("@/components/superadmin/SuperAdminDashboard"));

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
  { id: "dashboard", label: "Dashboard", icon: "\u25A6" },
  { id: "pipeline", label: "Pipeline", icon: "\u25B7" },
  { id: "vetting", label: "Vetting", icon: "\u2714" },
  { id: "resources", label: "Resources", icon: "\u2606" },
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
  // ── Auth/org session (state + login handlers; teardown stays in resetSession) ──
  const {
    authed, orgSlug, currentMember, needsPassword, loggingIn, selectingOrg, resetParams,
    handleOrgSelect, handleLogin, handleMemberLogin, handleEmailLogin,
    goBackToOrgSelect, clearAuthState,
  } = useSession();
  // View/selection state + URL sync (pushState/popstate)
  const { view, sel, setView, setSel } = useRouting({ orgSlug, authed });

  // ── App state ──
  const [org, setOrg] = useState(null);
  const [profile, setProfile] = useState(null);
  const [team, setTeam] = useState([{ id: "team", name: "Unassigned", initials: "\u2014", role: "none" }]);
  const [stages, setStages] = useState(DEFAULT_STAGES);
  const [funderTypes, setFunderTypes] = useState(DEFAULT_FTYPES);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Super-admin console auth (separate token); local state so login/logout re-renders.
  const [saAuthed, setSaAuthed] = useState(saIsLoggedIn());
  // Global search — sidebar input that surfaces any grant by funder, name, notes, type
  const [globalQ, setGlobalQ] = useState("");
  const { complianceDocs, setComplianceDocs, upsertCompDoc } = useComplianceDocs(toast);
  // Phase 12: which tour (if any) is currently running. null = no tour.
  const [activeTour, setActiveTour] = useState(null);

  // Subscription state (manual billing). readOnly = trial expired AND a super-admin
  // enabled the per-org read-only lock; by default an expired org just sees a banner.
  const subscription = resolveSubscription(org);
  const readOnly = subscription.readOnlyLock;

  // Debounced persistence + save-state indicator (cancels pending saves on logout)
  const { saveState, dSave } = useSave(toast, authed);
  // Grants collection + mutations (auto-log, auto-followups, optimistic add/delete+undo)
  const { grants, setGrants, updateGrant, addGrant, deleteGrant } = useGrants({ stages, team, dSave, toast, readOnly });
  // Initial workspace load after auth (fetch + migrate + apply to state)
  const { loading } = useDataLoad({ authed, setOrg, setProfile, setTeam, setStages, setFunderTypes, setComplianceDocs, setGrants, dSave, toast });

  // Auto-open the OVERVIEW tour the first time a member signs in. No artificial
  // delay — the TourOverlay polls for the target element internally, so it
  // gracefully waits for the sidebar to render.
  useEffect(() => {
    if (!currentMember?.id) return;
    if (!hasSeenOverview(currentMember.id, currentMember.role)) {
      setActiveTour("overview");
    }
  }, [currentMember?.id, currentMember?.role]);

  // Track grant opens. Records { memberId, at } per view; dedupes so refreshes
  // and tab-switches within 5 minutes don't spam the log. Tail-capped at 50.
  const lastViewLogRef = useRef({}); // grantId -> last logged timestamp (for this session)
  useEffect(() => {
    if (!sel || !currentMember?.id) return;
    const now = Date.now();
    const lastSession = lastViewLogRef.current[sel] || 0;
    if (now - lastSession < 5 * 60 * 1000) return;
    lastViewLogRef.current[sel] = now;
    setGrants(prev => prev.map(g => {
      if (g.id !== sel) return g;
      const last = (g.viewLog || []).slice(-1)[0];
      if (last && last.memberId === currentMember.id && now - new Date(last.at).getTime() < 5 * 60 * 1000) {
        return g;
      }
      const next = [...(g.viewLog || []), { memberId: currentMember.id, at: new Date().toISOString() }].slice(-50);
      const updated = { ...g, viewLog: next };
      // Silent persist — view log is observability data, not a meaningful edit
      try { dSave(g.id, updated, { silent: true }); } catch {}
      return updated;
    }));
    // `grants` is intentionally omitted: the effect is gated to fire only on
    // grant-open (sel) / member change, and reads grants via the functional
    // setGrants updater — adding it would re-log on every unrelated grant edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, currentMember?.id]);

  const { runAI, clearUploadsCache } = useAI({ org, profile, team, grants, stages, readOnly });

  // Background hygiene: 4 silent passes (sanitize/dedupe/URL/brief), once per member+version
  usePipelineHygiene({ grants, runAI, currentMember, setGrants, dSave, toast });




  // ── Auth handlers (login flows live in useSession; teardown stays here) ──
  const resetSession = () => {
    clearAuthState();
    setOrg(null);
    setGrants([]);
    setTeam([{ id: "team", name: "Unassigned", initials: "\u2014", role: "none" }]);
    setView("dashboard");
    setSel(null);
    clearUploadsCache();
    resetTheme();
    window.history.pushState({}, "", "/");
  };

  const handleLogout = async () => {
    await logout();
    resetSession();
  };

  // ── Render ──

  // Hidden super-admin platform console — reached only via the unlinked ?superadmin
  // URL. Uses a separate super-admin token; logging in/out flips saAuthed to re-render.
  if (new URLSearchParams(window.location.search).get("superadmin")) {
    return (
      <Suspense fallback={<div style={{ minHeight: "100vh", background: C.bg }} />}>
        {saAuthed
          ? <SuperAdminDashboard onLogout={() => setSaAuthed(false)} />
          : <SuperAdminLogin onAuthed={() => setSaAuthed(true)} />}
      </Suspense>
    );
  }

  // Login screens render ONLY when not authenticated — a successful login (authed)
  // always proceeds to the app, so a stale selectingOrg/loggingIn flag can never
  // surface the org picker over a signed-in session. Primary path is email login;
  // the org/member picker is a dormant fallback (reached only on logout / via the
  // ?superadmin route); loggingIn also serves the password-reset deep-link (it
  // defaults true when ?reset= is present).
  if (!authed && selectingOrg) {
    return <OrgSelector onSelect={handleOrgSelect} />;
  }

  if (!authed && loggingIn) {
    return (
      <Login
        slug={orgSlug}
        needsPassword={needsPassword}
        onLogin={handleLogin}
        onMemberLogin={handleMemberLogin}
        onBack={goBackToOrgSelect}
      />
    );
  }

  if (!authed) {
    return <EmailLogin onLogin={handleEmailLogin} />;
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#030712", fontFamily: FONT, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, zIndex: 0 }}><NorthernLights /></div>
        <div style={{ textAlign: "center", position: "relative", zIndex: 1 }}>
          <img src={geLogo} alt="Grants Engine" style={{ height: 80, objectFit: "contain", marginBottom: 24, animation: "ge-pulse 2.5s ease-in-out infinite" }} />
          <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 8, letterSpacing: -0.3 }}>Loading your workspace</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}>Fetching grants, team, and settings...</div>
          <div style={{ marginTop: 20, width: 180, height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden", margin: "20px auto 0" }}>
            <div style={{
              height: "100%", borderRadius: 2,
              background: "linear-gradient(90deg, #4ADE80, #22D3EE, #4ADE80)",
              backgroundSize: "200% 100%",
              animation: "app-load-bar 2s ease-in-out infinite",
            }} />
          </div>
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
  const vettingCount = grants.filter(g => g.stage === "scouted" || g.stage === "vetting").length;

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: FONT, background: C.bg }}>
      {/* Phase 12: role-based anchored tour. tourId="overview" auto-fires on first login;
          any tab can also call setActiveTour("pipeline" | "grantDetail" | ...) for a deeper tour. */}
      <TourOverlay
        tourId={activeTour}
        currentMember={currentMember}
        currentView={view}
        selectedGrant={sel ? grants.find(g => g.id === sel) : null}
        onNavigate={(v) => setView(v === "grant-detail" ? view : v)}
        onClose={() => setActiveTour(null)}
      />
      {/* Persistent help button — bottom-right corner.
          On Dashboard: opens a popover with two options (nav walkthrough vs dashboard walkthrough).
          Everywhere else: directly launches the tour for the current tab. */}
      <HelpButton
        currentView={view}
        selectedGrant={sel}
        onLaunch={setActiveTour}
      />
      {/* Mobile top header */}
      <div className="ge-mobile-header" style={{
        display: "none", position: "fixed", top: 0, left: 0, right: 0, height: 56, zIndex: 20,
        background: "#0a1628", alignItems: "center", justifyContent: "space-between", padding: "0 16px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
      }}>
        <button onClick={() => setMobileMenuOpen(true)} style={{
          background: "none", border: "none", cursor: "pointer", padding: 6, color: "#fff", fontSize: 22,
        }}>{"\u2630"}</button>
        <img src={geLogo} alt="Grants Engine" style={{ height: 32, objectFit: "contain" }} />
        <div style={{ width: 34 }} />
      </div>

      {/* Mobile overlay */}
      <div className={`ge-sidebar-overlay${mobileMenuOpen ? " ge-sidebar-open" : ""}`} onClick={() => setMobileMenuOpen(false)} />

      {/* Sidebar background animation */}
      <div className={`ge-sidebar-bg${mobileMenuOpen ? " ge-sidebar-open" : ""}`} style={{ position: "fixed", top: 0, left: 0, width: 240, bottom: 0, zIndex: 9 }}>
        <NorthernLights />
      </div>
      {/* Sidebar — dark glass on aurora */}
      <div className={`ge-sidebar${mobileMenuOpen ? " ge-sidebar-open" : ""}`} style={{
        width: 240, position: "fixed", top: 0, left: 0, bottom: 0, overflow: "hidden",
        display: "flex", flexDirection: "column",
        background: "rgba(0,0,0,0.15)",
        borderRight: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "1px 0 20px rgba(0, 0, 0, 0.2)",
        zIndex: 10,
      }}>
        {/* Grants Engine logo — top */}
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <img src={geLogo} alt="Grants Engine" style={{ height: 40, objectFit: "contain" }} />
          {/* Close button — visible only on mobile via CSS (ge-mobile-header controls) */}
          <button onClick={() => setMobileMenuOpen(false)} style={{
            background: "none", border: "none", color: "rgba(255,255,255,0.5)",
            fontSize: 20, cursor: "pointer", padding: 4, display: "none",
          }} className="ge-mobile-header">{"\u2715"}</button>
        </div>

        {/* Global search \u2014 finds any grant by funder, name, type or notes */}
        <GlobalSearch
          grants={grants}
          query={globalQ}
          onQueryChange={setGlobalQ}
          onPick={(id) => { setGlobalQ(""); setSel(id); setMobileMenuOpen(false); }}
        />

        {/* Nav items */}
        <div style={{ flex: 1, padding: "14px 10px" }}>
          {[...SIDEBAR_ITEMS, ...(currentMember?.role === "director" ? [{ id: "admin", label: "Admin", icon: "\u25CA" }] : [])].map(item => {
            const active = !sel && view === item.id;
            return (
              <button key={item.id}
                data-tour={`nav-${item.id}`}
                onClick={() => { setView(item.id); setSel(null); setMobileMenuOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, width: "100%",
                  padding: "8px 12px", marginBottom: 2, border: "none",
                  background: active ? "rgba(74, 222, 128, 0.12)" : "transparent",
                  color: active ? "#4ADE80" : "rgba(255,255,255,0.5)",
                  fontSize: 12, fontWeight: active ? 600 : 500, cursor: "pointer",
                  borderRadius: 8, fontFamily: FONT, textAlign: "left",
                  transition: "all 0.2s ease",
                  borderLeft: active ? "2px solid #4ADE80" : "2px solid transparent",
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#E2E8F0"; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.5)"; } }}>
                <span style={{ fontSize: 13, opacity: active ? 1 : 0.6 }}>{item.icon}</span>
                {item.label}
                {item.id === "dashboard" && notifCount > 0 && (
                  <span style={{
                    marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "#0B1120",
                    background: "#4ADE80", borderRadius: 10, padding: "2px 7px", minWidth: 18,
                    textAlign: "center", boxShadow: "0 1px 8px rgba(74, 222, 128, 0.3)",
                  }}>{notifCount}</span>
                )}
                {item.id === "vetting" && vettingCount > 0 && (
                  <span style={{
                    marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "#0B1120",
                    background: "#FBBF24", borderRadius: 10, padding: "2px 7px", minWidth: 18,
                    textAlign: "center", boxShadow: "0 1px 8px rgba(251, 191, 36, 0.3)",
                  }}>{vettingCount}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Bottom: org info + actions */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ padding: "12px 16px 8px", display: "flex", alignItems: "center", gap: 10 }}>
            {org?.logo_url ? (
              <img src={org.logo_url} alt={org?.name || ""} style={{ height: 32, width: 32, objectFit: "contain", borderRadius: 6, flexShrink: 0 }} />
            ) : (
              <div style={{ width: 32, height: 32, borderRadius: 6, background: "rgba(74,222,128,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#4ADE80", flexShrink: 0 }}>
                {(org?.name || orgSlug || "?").charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#E2E8F0", lineHeight: 1.2 }}>{org?.name || orgSlug}</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 500, marginTop: 2 }}>
                {saveState === "saving" && <span style={{ color: "#FBBF24", animation: "ge-pulse 1.2s ease-in-out infinite" }}>Saving...</span>}
                {saveState === "saved" && <span style={{ color: "#4ADE80" }}>✓ Saved</span>}
                {saveState === "error" && <span style={{ color: "#F87171" }}>Save failed</span>}
                {saveState === "idle" && "Grants Engine"}
              </div>
            </div>
          </div>
          <div style={{ padding: "4px 10px 10px", display: "flex", flexDirection: "column", gap: 1 }}>
            <button onClick={handleLogout}
              style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "7px 12px", border: "none",
                background: "transparent", color: "rgba(255,255,255,0.4)",
                fontSize: 12, fontWeight: 500, cursor: "pointer",
                borderRadius: 8, fontFamily: FONT, textAlign: "left",
                transition: "all 0.2s ease",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "#E2E8F0"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}>
              <span style={{ fontSize: 13 }}>{"\u21AA"}</span>
              Log out
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="ge-main" style={{ flex: 1, overflow: "auto", background: C.bg, marginLeft: 240 }}>
        <div style={{ position: "sticky", top: 0, zIndex: 20 }}>
          <SubscriptionBanner subscription={subscription} orgName={org?.name} />
        </div>
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
            onAddGrant={addGrant}
            onSelectGrant={(id) => setSel(id)}
            onBack={() => setSel(null)}
            onRunAI={runAI}
            onUploadsChanged={(grantId) => { clearUploadsCache(grantId); }}
            onLaunchTour={setActiveTour}
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
            onLaunchTour={setActiveTour}
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
            onLaunchTour={setActiveTour}
          />
        ) : view === "vetting" ? (
          <Vetting
            grants={grants}
            team={team}
            stages={stages}
            onSelectGrant={(id) => setSel(id)}
            onUpdateGrant={updateGrant}
            onNavigate={(v) => { setSel(null); setView(v); }}
            onLaunchTour={setActiveTour}
          />
        ) : view === "calendar" ? (
          <Calendar
            grants={grants}
            team={team}
            stages={stages}
            onSelectGrant={(id) => setSel(id)}
            onLaunchTour={setActiveTour}
          />
        ) : view === "docs" ? (
          <DocVault
            grants={grants}
            complianceDocs={complianceDocs}
            currentMember={currentMember}
            onLaunchTour={setActiveTour}
          />
        ) : view === "funders" ? (
          <Funders
            grants={grants}
            team={team}
            stages={stages}
            onSelectGrant={(id) => setSel(id)}
            onNavigate={(v) => { setSel(null); setView(v); }}
            onLaunchTour={setActiveTour}
          />
        ) : view === "archive" ? (
          <Archive
            grants={grants}
            team={team}
            stages={stages}
            onSelectGrant={(id) => setSel(id)}
          />
        ) : view === "resources" ? (
          <ResourcesHub
            org={org}
            profile={profile}
            grants={grants}
            team={team}
            stages={stages}
            complianceDocs={complianceDocs}
            currentMember={currentMember}
            onSelectGrant={(id) => setSel(id)}
            onNavigate={(v) => { setSel(null); setView(v); }}
            onLaunchTour={setActiveTour}
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
            onLaunchTour={setActiveTour}
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
