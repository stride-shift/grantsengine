import { useState, useEffect, useCallback, useRef } from "react";
import { C, FONT, MONO, injectFonts } from "./theme";
import { uid, td, dL } from "./utils";
import {
  isLoggedIn, getAuth, setAuth, login, logout, setPassword,
  getGrants, saveGrant, addGrant as apiAddGrant, removeGrant,
  getTeam, getProfile, getPipelineConfig, getOrg, checkHealth, api,
  getUploadsContext,
} from "./api";

import OrgSelector from "./components/OrgSelector";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import Pipeline from "./components/Pipeline";
import GrantDetail from "./components/GrantDetail";
import Settings from "./components/Settings";

injectFonts();

const DEFAULT_STAGES = [
  { id: "scouted", label: "Scouted", c: "#6B7280", bg: "#F3F4F6" },
  { id: "qualifying", label: "Qualifying", c: "#1E56A0", bg: "#E8F0FD" },
  { id: "drafting", label: "Drafting", c: "#D4A017", bg: "#FEF7E0" },
  { id: "review", label: "Review", c: "#7C3AED", bg: "#EDE9FE" },
  { id: "submitted", label: "Submitted", c: "#D03228", bg: "#FDE8E7" },
  { id: "awaiting", label: "Awaiting", c: "#0891B2", bg: "#ECFEFF" },
  { id: "won", label: "Won", c: "#16A34A", bg: "#DCFCE7" },
  { id: "lost", label: "Lost", c: "#DC2626", bg: "#FEE2E2" },
  { id: "deferred", label: "Deferred", c: "#9CA3AF", bg: "#F3F4F6" },
];

const DEFAULT_FTYPES = ["Corporate CSI", "Government/SETA", "International", "Foundation", "Tech Company"];

export default function App() {
  // ── Auth state ──
  const [authed, setAuthed] = useState(isLoggedIn());
  const [orgSlug, setOrgSlug] = useState(getAuth().slug);
  const [selectingOrg, setSelectingOrg] = useState(!isLoggedIn());
  const [needsPassword, setNeedsPassword] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

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
  const saveTimers = useRef({});

  // ── Debounced save ──
  const dSave = useCallback((grantId, data) => {
    clearTimeout(saveTimers.current[grantId]);
    saveTimers.current[grantId] = setTimeout(() => saveGrant(data), 500);
  }, []);

  // ── Load data after auth ──
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [orgData, grantsData, teamData, profileData, pipeConfig] = await Promise.all([
        getOrg(),
        getGrants(),
        getTeam(),
        getProfile(),
        getPipelineConfig(),
      ]);
      setOrg(orgData);
      setGrants(grantsData || []);
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
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authed) loadData();
  }, [authed, loadData]);

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
    setAuthed(true);
    setLoggingIn(false);
    setNeedsPassword(false);
  };

  const handleLogout = async () => {
    await logout();
    setAuthed(false);
    setOrg(null);
    setGrants([]);
    setTeam([{ id: "team", name: "Unassigned", initials: "\u2014", role: "none" }]);
    setView("dashboard");
    setSel(null);
    setSelectingOrg(true);
    setLoggingIn(false);
    window.history.pushState({}, "", "/");
  };

  // ── Grant mutations ──
  const updateGrant = (id, updates) => {
    setGrants(prev => {
      const next = prev.map(g => g.id === id ? { ...g, ...updates } : g);
      const updated = next.find(g => g.id === id);
      if (updated) dSave(id, updated);
      return next;
    });
  };

  const addGrant = (grant) => {
    const g = { ...grant, id: grant.id || uid() };
    setGrants(prev => [...prev, g]);
    apiAddGrant(g);
  };

  const deleteGrant = (id) => {
    setGrants(prev => prev.filter(g => g.id !== id));
    removeGrant(id);
  };

  // ── AI handler (enriched with uploads context + optional prior research) ──
  const runAI = async (type, grant, priorResearch) => {
    // Build org context — use context_slim to stay within API token limits
    const baseCtx = profile?.context_slim || profile?.mission || org?.name || "";

    // Build structured profile data that may not be in context_slim/full
    const profileSections = [];

    // Add team/governance info
    if (team?.length > 1) {
      const directors = team.filter(t => t.role === "director" && t.id !== "team");
      const staff = team.filter(t => !["director", "none"].includes(t.role) && t.id !== "team");
      if (directors.length || staff.length) {
        let teamBlock = "=== TEAM ===";
        if (directors.length) teamBlock += "\nDirectors: " + directors.map(t => `${t.name} (${t.persona || t.role})`).join("; ");
        if (staff.length) teamBlock += "\nStaff: " + staff.map(t => `${t.name} — ${t.role}${t.persona ? ` (${t.persona})` : ""}`).join("; ");
        profileSections.push(teamBlock);
      }
    }

    // Add structured programme costs (always useful for proposals)
    if (profile?.programmes?.length && type === "draft") {
      const progBlock = "=== EXACT PROGRAMME COSTS (use these figures) ===\n" +
        profile.programmes.map(p => `${p.name}: R${(p.cost || 0).toLocaleString()} — ${p.desc}`).join("\n");
      profileSections.push(progBlock);
    }

    // Add impact stats
    if (profile?.impact_stats && type === "draft") {
      const s = profile.impact_stats;
      profileSections.push(`=== VERIFIED IMPACT STATS (use these exact numbers) ===\nCompletion rate: ${Math.round((s.completion_rate || 0) * 100)}% (sector avg: ${Math.round((s.sector_average_completion || 0) * 100)}%)\nEmployment rate: ${Math.round((s.employment_rate || 0) * 100)}% within ${s.employment_window_months || 3} months\nLearners trained: ${s.learners_trained || "500+"}`);
    }

    // Add tone & anti-patterns
    if (profile?.tone) profileSections.push(`TONE: ${profile.tone}`);
    if (profile?.anti_patterns) profileSections.push(`ANTI-PATTERNS: ${profile.anti_patterns}`);
    if (profile?.past_funders) profileSections.push(`PAST FUNDERS: ${profile.past_funders}`);

    let orgCtx = baseCtx;
    if (profileSections.length) {
      orgCtx += "\n\n" + profileSections.join("\n\n");
    }

    // Load uploaded document context — these are the user's own documents, give them priority
    // Budgets reduced to stay within API rate limits (30K input tokens ≈ 22K chars total)
    const grantDocBudget = type === "draft" ? 3000 : 2000;
    const orgDocBudget = type === "draft" ? 2000 : 1500;
    try {
      const uploads = await getUploadsContext(grant?.id);
      const sections = [];

      // Grant-level documents (HIGHEST priority — user uploaded these specifically for this grant)
      if (uploads.grant_uploads?.length) {
        sections.push("=== GRANT DOCUMENTS ===");
        let budget = grantDocBudget;
        for (const u of uploads.grant_uploads) {
          if (budget <= 0) break;
          if (!u.extracted_text) continue;
          const text = u.extracted_text.slice(0, Math.min(2000, budget));
          sections.push(`[${u.original_name}]\n${text}`);
          budget -= text.length;
        }
      }

      // Org-level knowledge base
      if (uploads.org_uploads?.length) {
        sections.push("=== ORG KNOWLEDGE BASE ===");
        let budget = orgDocBudget;
        for (const u of uploads.org_uploads) {
          if (budget <= 0) break;
          if (!u.extracted_text) continue;
          const text = u.extracted_text.slice(0, Math.min(2000, budget));
          sections.push(`[${u.original_name}]\n${text}`);
          budget -= text.length;
        }
      }

      if (sections.length) {
        orgCtx += "\n\n" + sections.join("\n\n");
      }
    } catch {
      // If uploads fetch fails, proceed with basic context
    }

    // Cap total context — tuned to stay within 30K input token API limit
    const maxCtx = type === "draft" ? 10000 : 8000;
    if (orgCtx.length > maxCtx) orgCtx = orgCtx.slice(0, maxCtx) + "\n[...context trimmed for length]";

    // Anti-hallucination instruction — added to every prompt type
    const factGuard = `\n\nCRITICAL ACCURACY RULES:
- ONLY use facts, names, figures, dates, and programme costs that appear in the organisation context or uploaded documents provided below.
- If specific information is not provided (e.g. a director's full name, exact budget figure, or date), write [TO BE CONFIRMED] rather than inventing it.
- Never fabricate statistics, names, amounts, or achievements not present in the provided context.
- The uploaded documents and organisation profile are your ONLY source of truth — do not hallucinate additional details.`;

    if (type === "draft") {
      const researchBlock = priorResearch
        ? `\n\n=== FUNDER INTELLIGENCE (from prior research) ===\n${priorResearch.slice(0, 2000)}`
        : "";
      return await api(
        `Grant writer for a South African NPO. Produce a COVER EMAIL then FULL PROPOSAL.

COVER EMAIL: Subject line + 5-8 sentence body. Open with who you are + what you're submitting. One proof point. Close with low-friction next step. Sign off as director.

PROPOSAL: Structured, evidence-based, tailored to this funder. Use EXACT programme costs, director names, impact stats from the context. If grant notes mention a programme type, use that type's budget. If uploaded docs contain RFP guidelines, address them directly.

FORMAT: "COVER EMAIL" heading, then separator, then "PROPOSAL" heading.

NEVER: "I hope this finds you well", "SA has X% unemployment", "we believe/are passionate", invented budget figures.${priorResearch ? " Use the funder intelligence below to tailor tone and emphasis." : ""}${factGuard}`,
        `Organisation:\n${orgCtx}\n\nGrant: ${grant.name}\nFunder: ${grant.funder}\nType: ${grant.type}\nAsk: R${grant.ask?.toLocaleString()}\nFocus: ${(grant.focus || []).join(", ")}\nNotes: ${grant.notes || "None"}${researchBlock}`,
        false, 3000
      );
    }
    if (type === "research") {
      return await api(
        `You are a funder intelligence analyst for a South African NPO. Research this funder and provide actionable insights for a grant applicant.

Provide:
1. Funder overview — what they fund, typical grant size, focus areas
2. Strategic fit — how well this organisation matches what they fund
3. Application tips — what to emphasise, what to avoid
4. Key contacts or application channels if known
5. Relationship strategy — how to approach (cold vs warm)

Use uploaded documents for additional context about the organisation. Reference specific programme types and costs from the org profile when discussing fit.${factGuard}`,
        `Organisation context:\n${orgCtx}\n\nFunder: ${grant.funder}\nType: ${grant.type}\nGrant: ${grant.name}\nAsk: R${grant.ask?.toLocaleString()}\nRelationship: ${grant.rel}\nFocus areas: ${(grant.focus || []).join(", ")}\nNotes: ${grant.notes || "None"}`,
        true, 2000
      );
    }
    if (type === "followup") {
      return await api(
        `You are a grants coordinator for a South African NPO. Draft a professional follow-up email for this grant application.

The email should:
- Be warm but professional
- Reference the specific grant/proposal submitted
- Include a concrete next step or ask
- Be concise (under 200 words)
- Sign off as the organisation director
- Reference specific details from the uploaded documents or organisation profile if relevant${factGuard}`,
        `Organisation:\n${orgCtx}\n\nGrant: ${grant.name}\nFunder: ${grant.funder}\nStage: ${grant.stage}\nAsk: R${grant.ask?.toLocaleString()}\nSubmitted: ${grant.subDate || "Not yet"}\nNotes: ${grant.notes || "None"}`,
        false, 1000
      );
    }
    return "Unknown AI action";
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
            background: `linear-gradient(135deg, ${C.primary} 0%, #E04840 100%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, fontWeight: 800, color: "#fff", fontFamily: MONO,
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
          <style>{`
            @keyframes app-load-bar {
              0% { width: 5%; margin-left: 0; }
              50% { width: 60%; margin-left: 20%; }
              100% { width: 5%; margin-left: 95%; }
            }
          `}</style>
        </div>
      </div>
    );
  }

  const selectedGrant = sel ? grants.find(g => g.id === sel) : null;
  const notifCount = grants.filter(g => {
    if (["won", "lost", "deferred"].includes(g.stage)) return false;
    const d = dL(g.deadline);
    return d !== null && d <= 14;
  }).length;

  const sidebarItems = [
    { id: "dashboard", label: "Dashboard", icon: "\u25a6" },
    { id: "pipeline", label: "Pipeline", icon: "\u25b6" },
    { id: "settings", label: "Settings", icon: "\u2699" },
  ];

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: FONT, background: C.bg }}>
      {/* Sidebar — Clean White */}
      <div style={{
        width: 240, background: C.sidebar,
        display: "flex", flexDirection: "column", flexShrink: 0,
        borderRight: `1px solid ${C.line}`,
        boxShadow: "1px 0 8px rgba(0, 0, 0, 0.04)",
      }}>
        {/* Org header */}
        <div style={{ padding: "26px 20px 22px", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: `linear-gradient(135deg, ${C.primary} 0%, #E04840 100%)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 15, fontWeight: 800, color: "#fff", fontFamily: MONO,
              boxShadow: `0 2px 10px ${C.primaryGlow}`,
            }}>{(org?.name || orgSlug)?.[0]?.toUpperCase()}</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, letterSpacing: -0.2 }}>{org?.name || orgSlug}</div>
              <div style={{ fontSize: 10, color: C.t4, letterSpacing: 0.5, fontWeight: 500 }}>Grant Engine</div>
            </div>
          </div>
        </div>

        {/* Nav items */}
        <div style={{ flex: 1, padding: "20px 12px" }}>
          {sidebarItems.map(item => {
            const active = !sel && view === item.id;
            return (
              <button key={item.id}
                onClick={() => { setView(item.id); setSel(null); }}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%",
                  padding: "11px 14px", marginBottom: 4, border: "none",
                  background: active ? C.sidebarActive : "transparent",
                  color: active ? C.sidebarTextActive : C.sidebarText,
                  fontSize: 13, fontWeight: active ? 600 : 500, cursor: "pointer",
                  borderRadius: 10, fontFamily: FONT, textAlign: "left",
                  transition: "all 0.15s ease",
                  borderLeft: active ? `3px solid ${C.sidebarAccent}` : "3px solid transparent",
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = C.sidebarHover; e.currentTarget.style.color = C.sidebarTextActive; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.sidebarText; } }}>
                <span style={{ fontSize: 15, opacity: active ? 1 : 0.6 }}>{item.icon}</span>
                {item.label}
                {item.id === "dashboard" && notifCount > 0 && (
                  <span style={{
                    marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "#fff",
                    background: C.primary, borderRadius: 10, padding: "2px 7px", minWidth: 18,
                    textAlign: "center", boxShadow: `0 1px 6px ${C.primaryGlow}`,
                  }}>{notifCount}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Logout / Switch Org */}
        <div style={{ padding: "14px 12px", borderTop: `1px solid ${C.line}`, display: "flex", flexDirection: "column", gap: 2 }}>
          <button onClick={handleLogout}
            style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: "9px 14px", border: "none",
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
              display: "flex", alignItems: "center", gap: 10, width: "100%",
              padding: "9px 14px", border: "none",
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
        {sel && selectedGrant ? (
          <GrantDetail
            grant={selectedGrant}
            team={team}
            stages={stages}
            funderTypes={funderTypes}
            onUpdate={updateGrant}
            onDelete={deleteGrant}
            onBack={() => setSel(null)}
            onRunAI={runAI}
          />
        ) : view === "dashboard" ? (
          <Dashboard
            grants={grants}
            team={team}
            stages={stages}
            orgName={org?.name}
            onSelectGrant={(id) => setSel(id)}
          />
        ) : view === "pipeline" ? (
          <Pipeline
            grants={grants}
            team={team}
            stages={stages}
            funderTypes={funderTypes}
            onSelectGrant={(id) => setSel(id)}
            onUpdateGrant={updateGrant}
            onAddGrant={addGrant}
            api={api}
          />
        ) : view === "settings" ? (
          <Settings
            org={org}
            profile={profile}
            team={team}
            onUpdateProfile={() => {}}
            onLogout={handleLogout}
          />
        ) : null}
      </div>

      {/* Pulse animation */}
      <style>{`@keyframes ge-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }`}</style>
    </div>
  );
}
