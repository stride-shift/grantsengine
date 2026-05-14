import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { C, FONT, MONO, injectFonts, applyOrgTheme, resetTheme } from "./theme";
import { uid, td, dL, addD, effectiveAsk, isUsableUrl, normaliseFunder, grantCompleteness, sanitizeNotes } from "./utils";
import { CAD } from "./data/constants";
import {
  isLoggedIn, getAuth, setAuth, getCurrentMember, login, logout, setPassword,
  memberLogin, memberSetPassword,
  getGrants, saveGrant, addGrant as apiAddGrant, removeGrant,
  getTeam, getProfile, getPipelineConfig, getOrg, updateOrg as apiUpdateOrg, checkHealth, api, verifyUrls,
  getCompliance, updateComplianceDoc, createComplianceDoc,
} from "./api";
import useAI from "./hooks/useAI";

import { Component } from "react";
import OrgSelector from "./components/OrgSelector";
import Login from "./components/Login";
import { ToastProvider, useToast } from "./components/Toast";
import TourOverlay from "./components/TourOverlay";
import { hasSeenOverview } from "./data/tourSteps";

/* Context-aware help button. On Dashboard, opens a popover so the user can pick
 * between the nav walkthrough (overview) and the dashboard walkthrough.
 * On every other tab, a single click launches that tab's tour directly. */
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
import dlabLogo from "./dlab.png";
import geIcon from "./ge-icon.png";
import NorthernLights from "./components/NorthernLights";

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
const Calendar = lazy(() => import("./components/Calendar"));
const Vetting = lazy(() => import("./components/Vetting"));
const DocVault = lazy(() => import("./components/DocVault"));

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
  { id: "calendar", label: "Calendar", icon: "\u25CB" },
  { id: "docs", label: "Documents", icon: "\u25A1" },
  { id: "funders", label: "Funders", icon: "\u2661" },
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [complianceDocs, setComplianceDocs] = useState([]);
  // Phase 12: which tour (if any) is currently running. null = no tour.
  const [activeTour, setActiveTour] = useState(null);
  const saveTimers = useRef({});

  // Auto-open the OVERVIEW tour the first time a member signs in. No artificial
  // delay — the TourOverlay polls for the target element internally, so it
  // gracefully waits for the sidebar to render.
  useEffect(() => {
    if (!currentMember?.id) return;
    if (!hasSeenOverview(currentMember.id, currentMember.role)) {
      setActiveTour("overview");
    }
  }, [currentMember?.id, currentMember?.role]);
  const { runAI, clearUploadsCache } = useAI({ org, profile, team, grants, stages });

  // ── Background hygiene job — runs ONCE per (member, org) session after grants load.
  // Three silent passes, in order:
  //   1. Sanitize notes  — strip internal jargon (e.g. "1 x Type 3 cohort with stipends")
  //   2. Dedupe          — same funder = same grant; keep most-complete, archive the rest
  //   3. URL hygiene     — every active grant gets a working applyUrl, or none. Missing
  //                        and dead-link (404) URLs trigger an AI search; the result is
  //                        verified before being saved. Failed URLs are CLEARED.
  // No UI, no progress bar, no buttons. The user just sees the pipeline get cleaner.
  const repairRanForRef = useRef(null);
  useEffect(() => {
    if (!grants || grants.length === 0) return;
    if (!runAI || !currentMember?.id) return;
    if (repairRanForRef.current === currentMember.id) return;
    repairRanForRef.current = currentMember.id;

    const CLOSED = new Set(["won", "lost", "deferred", "archived"]);
    const initialGrants = grants;

    const persist = (id, patch) => {
      setGrants(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x));
      const g = initialGrants.find(x => x.id === id) || {};
      dSave(id, { ...g, ...patch });
    };

    (async () => {
      // ─── Pass 1: sanitize notes (regex, instant) ───
      let cleanedNotes = 0;
      for (const g of initialGrants) {
        const cleaned = sanitizeNotes(g.notes);
        if (cleaned !== g.notes && (cleaned || "").length !== (g.notes || "").length) {
          persist(g.id, { notes: cleaned });
          cleanedNotes++;
        }
      }

      // ─── Pass 2: dedupe by normalised funder name (instant) ───
      // For each cluster of active grants sharing a normalised funder, keep the most-
      // complete and archive the rest. Closed grants are left alone.
      const clusters = new Map();
      for (const g of initialGrants) {
        if (CLOSED.has(g.stage)) continue;
        const key = normaliseFunder(g.funder);
        if (!key) continue;
        if (!clusters.has(key)) clusters.set(key, []);
        clusters.get(key).push(g);
      }
      let archived = 0;
      for (const [, group] of clusters) {
        if (group.length < 2) continue;
        // Sort so the most-complete (highest score) is index 0; archive every other.
        group.sort((a, b) => grantCompleteness(b) - grantCompleteness(a));
        for (let i = 1; i < group.length; i++) {
          const d = group[i];
          persist(d.id, { stage: "archived", _archivedFrom: d.stage });
          archived++;
        }
      }

      // ─── Pass 3: URL hygiene (AI + verifyUrls, rate-limited) ───
      // After dedupe, only operate on grants we've kept (not archived in this pass).
      const archivedIds = new Set();
      for (const [, group] of clusters) {
        if (group.length < 2) continue;
        for (let i = 1; i < group.length; i++) archivedIds.add(group[i].id);
      }

      const liveGrants = initialGrants.filter(g => !CLOSED.has(g.stage) && !archivedIds.has(g.id));

      // First batch-check every existing applyUrl in one HEAD/GET sweep.
      const existingUrls = [...new Set(liveGrants.filter(g => isUsableUrl(g.applyUrl)).map(g => g.applyUrl))];
      let urlHealth = new Map();
      if (existingUrls.length > 0) {
        try {
          const results = await verifyUrls(existingUrls);
          for (const r of results) urlHealth.set(r.url, r);
        } catch { /* best-effort */ }
      }

      let fixed = 0, cleared = 0;
      for (let i = 0; i < liveGrants.length; i++) {
        const g = liveGrants[i];
        const current = g.applyUrl;
        const healthy = current && isUsableUrl(current) && (urlHealth.get(current)?.ok === true);
        if (healthy) continue;

        // Ask AI for candidate URLs, try each until one loads.
        let savedNew = false;
        try {
          const raw = await runAI("findApplyUrl", g);
          const txt = String(raw || "");

          // Parse structured candidates and keep pageType info so we can prefer specific
          // pages over the homepage when picking the winner.
          let typedCandidates = []; // [{ url, pageType }, ...]
          try {
            const cleaned = txt.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
            const sIdx = cleaned.indexOf("{"), eIdx = cleaned.lastIndexOf("}");
            if (sIdx >= 0 && eIdx > sIdx) {
              const parsed = JSON.parse(cleaned.slice(sIdx, eIdx + 1));
              if (Array.isArray(parsed.candidates)) {
                typedCandidates = parsed.candidates
                  .filter(c => c.url)
                  .map(c => ({ url: c.url, pageType: c.pageType || "info_page" }));
              } else if (parsed.url) {
                typedCandidates = [{ url: parsed.url, pageType: parsed.pageType || "info_page" }];
              }
            }
          } catch { /* fall through */ }

          // Extract URLs from raw text as fallback
          const seenUrls = new Set(typedCandidates.map(c => c.url));
          const urlMatches = (txt.match(/https?:\/\/[^\s"'<>)\]]+/gi) || []).map(u => u.replace(/[.,;:)\]}>]+$/, ""));
          for (const u of urlMatches) {
            if (!seenUrls.has(u)) { typedCandidates.push({ url: u, pageType: "info_page" }); seenUrls.add(u); }
          }

          // Synthesize funder homepage guesses as absolute-last-resort fallback
          const slug = (g.funder || "").toLowerCase()
            .replace(/\b(the|foundation|trust|fund|group|company|corporation|corp|inc|ltd|pty|sa|africa)\b/g, "")
            .replace(/[^a-z0-9]/g, "").trim();
          if (slug && slug.length >= 3) {
            for (const u of [`https://www.${slug}.co.za`, `https://${slug}.co.za`, `https://www.${slug}.com`, `https://www.${slug}.org`, `https://www.${slug}.org.za`]) {
              if (!seenUrls.has(u)) { typedCandidates.push({ url: u, pageType: "homepage" }); seenUrls.add(u); }
            }
          }

          // Filter to usable URLs, then sort by page-type priority so the homepage
          // is the LAST resort, not the first verified one.
          typedCandidates = typedCandidates.filter(c => isUsableUrl(c.url));
          const TYPE_PRIORITY = { form: 0, info_page: 1, contact: 2, homepage: 3 };
          typedCandidates.sort((a, b) => (TYPE_PRIORITY[a.pageType] ?? 1) - (TYPE_PRIORITY[b.pageType] ?? 1));

          if (typedCandidates.length > 0) {
            try {
              const check = await verifyUrls(typedCandidates.map(c => c.url));
              const statusMap = new Map((check || []).map(r => [r.url, r]));
              for (const c of typedCandidates) {
                if (statusMap.get(c.url)?.ok === true) {
                  persist(g.id, { applyUrl: c.url });
                  savedNew = true;
                  fixed++;
                  break;
                }
              }
            } catch { /* fall through */ }
          }
        } catch { /* swallow */ }

        // If the current URL was bad and we couldn't find a working alternative, clear it.
        if (!savedNew && current && !healthy) {
          persist(g.id, { applyUrl: "" });
          cleared++;
        }

        // Rate-limit between AI calls
        if (i < liveGrants.length - 1) await new Promise(r => setTimeout(r, 4500));
      }

      // ─── Pass 4: fetch published funder briefs for grants that don't have one yet ───
      // Same rate limit as URL hygiene. Runs after URL fixing so the AI has fresh
      // funder URLs to search from. Only attempts grants where briefs are likely to
      // exist (Government/SETA and International funders publish RFPs; most corporate
      // CSI funders don't).
      let briefsFilled = 0;
      const grantsNeedingBrief = liveGrants.filter(g => {
        if (g.funderBrief && g.funderBrief.trim().length > 50) return false;
        return ["Government/SETA", "International", "Foundation"].includes(g.type);
      });
      for (let i = 0; i < grantsNeedingBrief.length; i++) {
        const g = grantsNeedingBrief[i];
        try {
          const raw = await runAI("fetchFunderBrief", g);
          const txt = String(raw || "").replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
          const sIdx = txt.indexOf("{"), eIdx = txt.lastIndexOf("}");
          let parsed = null;
          try { if (sIdx >= 0 && eIdx > sIdx) parsed = JSON.parse(txt.slice(sIdx, eIdx + 1)); } catch {}
          if (parsed?.brief && parsed.brief.length > 100) {
            const note = parsed.sourceUrl ? `\n\n---\nSource: ${parsed.sourceUrl}` : "";
            persist(g.id, { funderBrief: parsed.brief + note });
            briefsFilled++;
          }
        } catch { /* swallow */ }
        if (i < grantsNeedingBrief.length - 1) await new Promise(r => setTimeout(r, 4500));
      }

      // Final, single discrete toast — only if something actually changed
      const bits = [];
      if (cleanedNotes) bits.push(`cleaned ${cleanedNotes} note${cleanedNotes === 1 ? "" : "s"}`);
      if (archived) bits.push(`archived ${archived} duplicate${archived === 1 ? "" : "s"}`);
      if (fixed) bits.push(`fixed ${fixed} link${fixed === 1 ? "" : "s"}`);
      if (cleared) bits.push(`cleared ${cleared} dead link${cleared === 1 ? "" : "s"}`);
      if (briefsFilled) bits.push(`fetched ${briefsFilled} funder brief${briefsFilled === 1 ? "" : "s"}`);
      if (bits.length) toast(`Pipeline tidy-up: ${bits.join(", ")}.`, { type: "success", duration: 5000 });
    })();
  }, [grants, runAI, currentMember?.id]);

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
      const PRE_SUB = ["scouted", "vetting", "qualifying", "drafting", "review"];
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
        selectedGrant={sel}
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
            <button onClick={handleSwitchOrg}
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
              <span style={{ fontSize: 13 }}>{"\u21C4"}</span>
              Switch Organisation
            </button>
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
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="ge-main" style={{ flex: 1, overflow: "auto", background: C.bg, marginLeft: 240 }}>
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
