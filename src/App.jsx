import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { C, FONT, MONO, injectFonts } from "./theme";
import { uid, td, dL, addD, effectiveAsk, parseStructuredResearch } from "./utils";
import { CAD } from "./data/constants";
import { funderStrategy, isFunderReturning, detectType, PTYPES } from "./data/funderStrategy";
import {
  isLoggedIn, getAuth, setAuth, getCurrentMember, login, logout, setPassword,
  memberLogin, memberSetPassword,
  getGrants, saveGrant, addGrant as apiAddGrant, removeGrant,
  getTeam, getProfile, getPipelineConfig, getOrg, checkHealth, api,
  getUploadsContext,
  getCompliance, updateComplianceDoc, createComplianceDoc,
} from "./api";
import { getWritingLearnings } from "./editLearner";

import OrgSelector from "./components/OrgSelector";
import Login from "./components/Login";
import { ToastProvider, useToast } from "./components/Toast";

// Lazy-load major views — each becomes its own chunk
const Dashboard = lazy(() => import("./components/Dashboard"));
const Pipeline = lazy(() => import("./components/Pipeline"));
const GrantDetail = lazy(() => import("./components/GrantDetail"));
const Settings = lazy(() => import("./components/Settings"));
const Funders = lazy(() => import("./components/Funders"));
const Admin = lazy(() => import("./components/Admin"));

injectFonts();

const DEFAULT_STAGES = [
  { id: "scouted", label: "Scouted", c: "#64748B", bg: "#F1F5F9" },
  { id: "qualifying", label: "Qualifying", c: "#2563EB", bg: "#EFF6FF" },
  { id: "drafting", label: "Drafting", c: "#EA580C", bg: "#FFF7ED" },
  { id: "review", label: "Review", c: "#7C3AED", bg: "#F5F3FF" },
  { id: "submitted", label: "Submitted", c: "#DB2777", bg: "#FDF2F8" },
  { id: "awaiting", label: "Awaiting", c: "#0891B2", bg: "#ECFEFF" },
  { id: "won", label: "Won", c: "#059669", bg: "#ECFDF5" },
  { id: "lost", label: "Lost", c: "#DC2626", bg: "#FEF2F2" },
  { id: "deferred", label: "Deferred", c: "#94A3B8", bg: "#F8FAFC" },
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
  const [orgSlug, setOrgSlug] = useState(getAuth().slug);
  const [currentMember, setCurrentMember] = useState(getCurrentMember());
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
  const [complianceDocs, setComplianceDocs] = useState([]);
  const saveTimers = useRef({});
  const uploadsCache = useRef({});
  const learningsCache = useRef({ text: null, fetchedAt: 0 });

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
    uploadsCache.current = {};
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

  // ── Select research fields relevant to a specific proposal section ──
  const getResearchForSection = (structured, sectionName, budget) => {
    if (!structured) return "";
    const sn = (sectionName || "").toLowerCase();
    const isCover = sn.includes("cover");
    const isExecSummary = sn.includes("summary") || sn.includes("executive");
    const isBudget = sn.includes("budget");
    const isImpact = sn.includes("impact") || sn.includes("outcome") || sn.includes("evidence");
    const isProgramme = sn.includes("programme") || sn.includes("program") || sn.includes("approach") || sn.includes("design");
    const isScale = sn.includes("scale") || sn.includes("sustainability");

    const parts = [];
    const add = (label, key) => { if (structured[key]) parts.push(`${label}: ${structured[key]}`); };

    // Universal: every section gets funder priorities as baseline
    add("Funder priorities", "priorities");

    if (isCover) {
      add("Key contacts", "contacts");
      add("Strategy", "strategy");
      add("Application process", "applicationProcess");
      add("Recent grants", "recentGrants");
      add("Relationship", "relationshipLeverage"); add("Door opener", "doorOpener");
    } else if (isExecSummary) {
      add("Strategy", "strategy");
      add("Budget range", "budgetRange");
      add("Relationship", "relationshipLeverage"); add("Door opener", "doorOpener");
    } else if (isBudget) {
      add("Budget range", "budgetRange");
      add("Recent grants", "recentGrants");
    } else if (isImpact) {
      add("Recent grants", "recentGrants");
      add("Strategy", "strategy");
    } else if (isProgramme) {
      add("Strategy", "strategy");
      add("Recent grants", "recentGrants");
    } else if (isScale) {
      add("Strategy", "strategy");
      add("Budget range", "budgetRange");
    } else {
      // Default: all fields except rawText
      for (const [k, v] of Object.entries(structured)) {
        if (k !== "rawText" && v) add(k.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()), k);
      }
    }
    const result = parts.join("\n");
    return budget ? result.slice(0, budget) : result;
  };

  // ── Get full research for draft prompt (all fields, structured) ──
  const getResearchForDraft = (structured, budget = 2500) => {
    if (!structured) return "";
    const parts = [];
    const add = (label, key) => { if (structured[key]) parts.push(`${label}: ${structured[key]}`); };
    add("Budget & scale", "budgetRange");
    add("Recent grants", "recentGrants");
    add("Key contacts", "contacts");
    add("Funder priorities", "priorities");
    add("Application process", "applicationProcess");
    add("Strategy", "strategy");
    add("Relationship leverage", "relationshipLeverage");
    add("Door opener", "doorOpener");
    return parts.join("\n").slice(0, budget);
  };

  // ── AI handler (enriched with uploads context + optional prior research) ──
  const runAI = async (type, grant, priorResearch, priorFitScore) => {
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

    // Add structured programme costs (useful for proposals, research, and fit scoring)
    const needsOrgContext = ["draft", "sectionDraft", "research", "fitscore", "followup"].includes(type);
    if (profile?.programmes?.length && needsOrgContext) {
      const progBlock = "=== EXACT PROGRAMME COSTS (use these figures) ===\n" +
        profile.programmes.map(p => `${p.name}: R${(p.cost || 0).toLocaleString()} — ${p.desc}`).join("\n");
      profileSections.push(progBlock);
    }

    // Add impact stats
    if (profile?.impact_stats && needsOrgContext) {
      const s = profile.impact_stats;
      profileSections.push(`=== VERIFIED IMPACT STATS (use these exact numbers) ===\nCompletion rate: ${Math.round((s.completion_rate || 0) * 100)}% (sector avg: ${Math.round((s.sector_average_completion || 0) * 100)}%)\nEmployment rate: ${Math.round((s.employment_rate || 0) * 100)}% within ${s.employment_window_months || 3} months\nLearners trained: ${s.learners_trained || "60+"}`);
    }

    // Add tone & anti-patterns
    if (profile?.tone) profileSections.push(`TONE: ${profile.tone}`);
    if (profile?.anti_patterns) profileSections.push(`ANTI-PATTERNS: ${profile.anti_patterns}`);
    if (profile?.past_funders) profileSections.push(`PAST FUNDERS: ${profile.past_funders}`);

    const isDraftType = type === "draft" || type === "sectionDraft";
    const maxCtx = isDraftType ? 10000 : 8000;

    // Smart context priority assembly — budget-aware, never truncates high-priority content
    // Priority order: base profile → impact stats → grant docs → writing learnings → org docs → tone
    let orgCtx = baseCtx;
    if (profileSections.length) {
      orgCtx += "\n\n" + profileSections.join("\n\n");
    }

    let remaining = maxCtx - orgCtx.length;

    // Load uploaded document context — cached per grant to avoid redundant fetches
    try {
      const grantId = grant?.id;
      if (!uploadsCache.current[grantId]) {
        uploadsCache.current[grantId] = await getUploadsContext(grantId);
      }
      const uploads = uploadsCache.current[grantId];

      // Grant-level documents (HIGHEST priority — user uploaded these specifically for this grant)
      if (uploads.grant_uploads?.length && remaining > 200) {
        const grantDocBudget = Math.min(isDraftType ? 3000 : 2000, remaining - 100);
        const parts = ["=== GRANT DOCUMENTS ==="];
        let budget = grantDocBudget;
        for (const u of uploads.grant_uploads) {
          if (budget <= 0) break;
          if (!u.extracted_text) continue;
          const text = u.extracted_text.slice(0, Math.min(2000, budget));
          parts.push(`[${u.original_name}]\n${text}`);
          budget -= text.length;
        }
        if (parts.length > 1) {
          const block = "\n\n" + parts.join("\n\n");
          orgCtx += block;
          remaining -= block.length;
        }
      }

      // Writing learnings (small but high-value — insert before org docs so they're never truncated)
      if (isDraftType && remaining > 200) {
        try {
          const now = Date.now();
          if (!learningsCache.current.text || now - learningsCache.current.fetchedAt > 60000) {
            learningsCache.current = { text: await getWritingLearnings() || "", fetchedAt: now };
          }
          if (learningsCache.current.text) {
            const block = `\n\n=== WRITING PREFERENCES (learned from user edits — follow these closely) ===\n${learningsCache.current.text}`;
            orgCtx += block;
            remaining -= block.length;
          }
        } catch { /* Non-blocking */ }
      }

      // Org-level knowledge base (fills remaining space)
      if (uploads.org_uploads?.length && remaining > 200) {
        const orgDocBudget = Math.min(isDraftType ? 2000 : 1500, remaining - 100);
        const parts = ["=== ORG KNOWLEDGE BASE ==="];
        let budget = orgDocBudget;
        for (const u of uploads.org_uploads) {
          if (budget <= 0) break;
          if (!u.extracted_text) continue;
          const text = u.extracted_text.slice(0, Math.min(2000, budget));
          parts.push(`[${u.original_name}]\n${text}`);
          budget -= text.length;
        }
        if (parts.length > 1) {
          const block = "\n\n" + parts.join("\n\n");
          orgCtx += block;
          remaining -= block.length;
        }
      }
    } catch {
      // If uploads fetch fails, proceed with basic context
    }

    // Anti-hallucination instruction — added to every prompt type
    const factGuard = `\n\nCRITICAL ACCURACY RULES:
- Use facts, names, impact stats, and achievements from the organisation context and uploaded documents. These are your primary source of truth.
- If specific information is not provided (e.g. an exact date), write [TO BE CONFIRMED] rather than inventing it.
- Do NOT name directors individually — refer to "the directors", "programme management and ops team", or "the leadership team".
- Never fabricate statistics, names, or achievements not present in the provided context.
- You MAY creatively design programme structures, propose new combinations of d-lab's components, and scale up delivery models — but ground everything in d-lab's real capabilities and cost structures.
- Programme costs should be realistic and derived from the provided cost-per-student figures, scaled appropriately for the proposed scope.`;

    // ── Budget context builder ── used by ALL prompt types
    // Pulls from grant.budgetTable (BudgetBuilder) first, then detectType fallback
    const bt = grant.budgetTable;
    const detectedPt = detectType(grant);
    const btYears = bt?.years || 1;
    const btStudents = bt ? bt.cohorts * bt.studentsPerCohort * btYears : 0;
    const budgetInfo = bt
      ? { perStudent: bt.perStudent, total: bt.total, typeNum: bt.typeNum, typeLabel: bt.typeLabel,
          students: btStudents, cohorts: bt.cohorts, years: btYears, duration: bt.duration,
          block: `BUDGET (SOURCE OF TRUTH — use these EXACT figures):
Programme: Type ${bt.typeNum} — ${bt.typeLabel}
Students: ${btStudents}${bt.cohorts > 1 ? ` (${bt.cohorts} cohorts × ${bt.studentsPerCohort}${btYears > 1 ? ` × ${btYears} years` : ""})` : btYears > 1 ? ` (${bt.studentsPerCohort}/yr × ${btYears} years)` : ""}
Duration: ${bt.duration}${btYears > 1 ? ` per year, ${btYears}-year programme` : ""}
Line items (per cohort):
${bt.items.map(it => `  ${it.label}: R${it.amount.toLocaleString()}`).join("\n")}
${bt.includeOrgContribution ? `30% org contribution: R${(bt.orgContribution || 0).toLocaleString()}\n` : ""}${btYears > 1 ? `Annual total: R${(bt.annualTotal || bt.total / btYears).toLocaleString()}\n` : ""}TOTAL${btYears > 1 ? ` (${btYears}-YEAR)` : ""}: R${bt.total.toLocaleString()} | Per student: R${bt.perStudent.toLocaleString()}` }
      : detectedPt
        ? { perStudent: detectedPt.perStudent, total: detectedPt.cost, typeLabel: detectedPt.label,
            students: detectedPt.students, cohorts: 1, duration: detectedPt.duration,
            block: `PROGRAMME TYPE (detected): ${detectedPt.label}
Students: ${detectedPt.students || "varies"} | Duration: ${detectedPt.duration}
Cost: R${(detectedPt.cost||0).toLocaleString()} | Per student: R${detectedPt.perStudent.toLocaleString()}` }
        : null;
    const perStudentStr = budgetInfo ? `R${budgetInfo.perStudent.toLocaleString()}` : "[per-student cost from budget]";
    const costHook = budgetInfo
      ? `"It costs R180,000 to keep one young person unemployed for a year. For ${perStudentStr}, d-lab turns them into a working professional in ${budgetInfo.duration || "nine months"}."`
      : `"It costs R180,000 to keep one young person unemployed for a year. d-lab turns them into working professionals for a fraction of that."`;

    if (type === "draft") {
      const fs = funderStrategy(grant);
      // Use structured research if available, fall back to raw text
      const structuredRes = grant.aiResearchStructured || parseStructuredResearch(priorResearch || grant.aiResearch);
      const rawResearch = priorResearch || grant.aiResearch;
      const researchText = structuredRes ? getResearchForDraft(structuredRes, 2500) : rawResearch ? rawResearch.slice(0, 2000) : "";
      const researchBlock = researchText
        ? `\n\n=== FUNDER INTELLIGENCE (from prior research) ===\n${researchText}`
        : "";
      const fitScoreBlock = (priorFitScore || grant.aiFitscore)
        ? `\n\n=== FIT SCORE ANALYSIS ===\n${(priorFitScore || grant.aiFitscore).slice(0, 1500)}`
        : "";
      const relNote = fs.returning
        ? `RETURNING FUNDER — this is a partner renewing, not a stranger. Reference the existing relationship with specifics:\n${fs.hook}\nFrame as continuity and deepening, not a new pitch. Show what their previous investment built and what comes next.`
        : `NEW FUNDER — relationship is "${grant.rel || "Cold"}". Make it easy to say yes to a first conversation.`;
      return await api(
        `You write funding proposals for d-lab NPC — a South African NPO that trains unemployed youth in AI-native digital skills, with a 92% completion rate and 85% employment within 3 months.

RULE #1 — NEVER USE THESE WORDS TO OPEN ANY SENTENCE: "Imagine", "Picture", "Consider", "Think of", "Meet", "What if", "Close your eyes". These are BANNED. Start every sentence with something real and concrete — a fact, a name, a number, a direct statement. This rule applies to EVERY section, EVERY paragraph.

VOICE — maintain in EVERY section, not just the opening:
- Warm, human, confident. A founder who KNOWS this works, offering a funder the chance to back something real.
- Write like a person, not a grant machine. Emotion comes from specificity, not adjectives.
- Use d-lab's REAL alumni stories: Siphumezo Adam (pilot → ABSA CIB → d-lab staff), Simanye Mdunyelwa (graduate → ECD Facilitator), Prieska Mofokeng (started own design business), Sci-Bono graduate (→ IT Department). Use each story ONCE — never repeat it across sections.
- Use the employer testimonial (Michelle Adler, forgood) as proof of graduate quality — once.
- Vary sentence length. Short punchy sentences land harder after longer ones.
- The tone: "We built something that works. Here's the proof. Here's what your investment makes possible."
- CRITICAL: Sustain narrative energy through the ENTIRE proposal. Do NOT switch to bureaucratic grant-speak after the opening. Every section should feel alive.

FRAMING: d-lab's story is the SYSTEM — 8 programme types, partner delivery model, in-house AI tools (LMS, Language Leveller, Assessornator, Cyborg Habits), corporate clients, diversified revenue. This isn't a charity asking for help. It's an engine asking for fuel.

AMBITION — think BIG. Do NOT constrain yourself to d-lab's smallest or cheapest programme type:
- d-lab's 8 programme types are a GUIDE, not a cage. Use them as building blocks but design the programme around what the FUNDER wants to achieve.
- If the funder can support R5M, don't propose R232K. Go large — propose multi-cohort, extended duration, wraparound services, employer partnerships, expansion to new sites.
- Combine programme elements creatively: a 9-month accredited pathway PLUS a Cyborg Habits digital layer, a flagship cohort PLUS a Train-the-Trainer cascade model, an AI bootcamp PLUS a workplace integration programme.
- Think about what would make the funder PROUD to back this. What's the version of d-lab's work that matches the scale of their ambition?
- The budget should fill the funder's capacity, not sit timidly below it. If a corporate has R2M for CSI, propose R1.8M — not R500K.
- Be guided by d-lab's actual costs and delivery model, but don't be limited by them. d-lab can scale up, add components, deepen impact, and design bespoke programmes for the right funder.

SCALE THROUGH AI — this is d-lab's secret weapon and a key part of the pitch:
- d-lab has built proprietary AI tools (Language Leveller, Assessornator, LMS, Cyborg Habits) that radically change the economics of training delivery. These aren't off-the-shelf — they're built in-house, purpose-designed for South African youth.
- Language Leveller: AI-powered real-time translation and comprehension support, meaning learners can engage with English-language tech content regardless of home language. This removes the biggest barrier to scale.
- Assessornator: AI assessment and feedback engine that gives every student personalised, instant feedback — the equivalent of a dedicated tutor, at zero marginal cost per student.
- Cyborg Habits platform: asynchronous AI coaching that extends learning beyond classroom hours, building daily digital habits (R930/learner).
- The coaching model: AI handles the repetitive, personalised feedback that traditionally requires 1-on-1 human time, freeing coaches to focus on mentorship, motivation, and career guidance. This means d-lab can maintain quality at 2-3x the student numbers of traditional training providers.
- When proposing large programmes, LEAN INTO THIS: "d-lab's AI infrastructure means we can train 200 learners with the quality traditionally reserved for cohorts of 60" or "Our per-student cost drops significantly at scale because the AI tools absorb the work that would normally require additional coaches."
- Propose higher student numbers than the funder might expect. If a traditional provider would propose 40 students, d-lab can credibly propose 100-120 at comparable cost. Make this a headline differentiator.

CYBORG HABITS AT SCALE — think beyond the classroom:
- Cyborg Habits is not just a course add-on. It is a standalone, scalable digital behaviour-change platform that can reach thousands of learners asynchronously, with zero marginal instructor cost per additional user.
- FOR SCHOOLS: Cyborg Habits can be deployed to entire school districts as a "digital readiness" layer — giving Grade 10-12 learners daily AI-guided micro-challenges that build real digital literacy BEFORE they enter the job market or tertiary education. 5,000 FET learners across 20 schools, each spending 15 minutes a day building the habits that separate digitally fluent workers from digitally illiterate ones. No new teachers required — just devices and connectivity.
- FOR LARGE FUNDERS: The per-learner cost of Cyborg Habits (R930) means a R5M investment could reach 5,000+ learners for a full cycle of daily AI coaching. That's a cost-per-outcome ratio that no traditional skills programme can match.
- CASCADING IMPACT: Cyborg Habits learners don't just learn for themselves — they become AI ambassadors in their families and communities. A learner who builds the habit of using AI for problem-solving brings that skill home, to their parents' small business, to their church's admin, to their community WhatsApp group. One learner becomes a multiplier.
- EMPLOYABILITY PIPELINE: For corporates, Cyborg Habits creates a pre-screened, digitally-ready talent pool. Learners who complete the programme arrive at interviews already fluent in AI-assisted work — a generation ahead of their peers. Propose this as a recruitment funnel, not just a CSI tick-box.
- HYBRID MODELS: For big programmes, propose Cyborg Habits as the digital spine with periodic in-person bootcamps — e.g., 1,000 learners on Cyborg Habits year-round, with 100-200 selected for intensive face-to-face Type 3-5 programmes. This gives funders massive reach AND deep impact.
- DON'T BE TIMID about proposing Cyborg Habits for audiences beyond d-lab's traditional unemployed youth — it works for school learners, NEET youth, working adults upskilling, community organisations, even teacher digital literacy programmes. Match the audience to the funder's mandate.

COVER EMAIL: Subject line + 5-8 sentence body. Open with a specific, compelling hook — NOT "I am writing to submit..." Open with the human impact or the opportunity. One proof point. Close with a low-friction next step. Sign off as the director (do NOT name them — just "Director, d-lab NPC").

VARIED OPENINGS — CRITICAL:
- Every proposal must have a UNIQUE opening that is specifically crafted for THIS funder, THIS grant, THIS moment. Do NOT recycle the same narrative structure across grants.
- The opening paragraph is the most important paragraph. It must earn the next paragraph. Vary your technique:
  * Lead with a single student's story (a day in the life, a transformation moment, a before/after)
  * Lead with a striking data point that reframes the problem (${costHook})
  * Lead with the funder's own stated mission and show how d-lab is already doing what they want to fund
  * Lead with a provocation or question ("What if the most effective way to close the digital divide isn't a laptop per child — but a habit per day?")
  * Lead with a very specific, concrete scene (the first morning of a new cohort, the moment a student ships their first project, the WhatsApp message from a graduate's parent)
  * Lead with the scale of what's possible ("In the time it takes to read this proposal, three more South African graduates will enter a job market that doesn't know what to do with them. d-lab exists to change that equation.")
- The cover email opening and the proposal executive summary opening should use DIFFERENT hooks — don't repeat yourself.
- If the grant notes mention a specific programme, theme, or context, use THAT as your opening anchor — not a generic d-lab pitch.

PROPOSAL STRUCTURE (follow this funder-appropriate order):
${fs.structure.map((s, i) => `${i + 1}. ${s}`).join("\n")}

DEPTH — this is critical. Write a SUBSTANTIVE proposal, not a skeleton:
- Each section must be 2-4 rich paragraphs, not bullet lists or single paragraphs.
- The Executive Summary alone should be 200-300 words — a compelling standalone case.
- Programme sections should describe the actual week-by-week or phase-by-phase journey: what happens on Day 1, what tools they use, what the coaching looks like, what a Design Thinking sprint involves. Be concrete and factual — the reader should understand exactly what d-lab delivers.
- Impact sections should weave numbers INTO narrative: "Of the 20 students in our most recent cohort, 17 were employed within 90 days — at companies like..." not just "85% employment rate."
- Budget section MUST include a markdown table: | Line Item | Detail | Amount | with all line items, per-student cost, and total. Wrap the table in 1-2 sentences of value narrative before and after.
- Include specific d-lab details that bring it to life: the AI tools (Language Leveller, Assessornator, PoE Assessor, LMS), the coaching model, the partner delivery structure, the accreditation pathway.
- If the funder type expects compliance sections (SETA alignment, B-BBEE, M&E frameworks), write those with EQUAL depth — but still with narrative warmth.
- CRITICAL: Every section must open DIFFERENTLY. Do not start two sections with the same narrative device. Vary between: data points, direct statements, outcome proof, funder mission alignment, programme specifics.

FUNDER ANGLE: Lead with "${fs.lead}"
OPENING HOOK: ${fs.hook}
USE THEIR LANGUAGE: ${fs.lang}
${relNote}
${budgetInfo ? `\n${budgetInfo.block}` : ""}
${fs.mc ? `MULTI-COHORT: ${fs.mc.count} cohorts requested` : ""}

UPLOADED DOCUMENTS — if GRANT DOCUMENTS appear in the context below, they are the funder's RFP, application form, or guidelines. You MUST:
- Structure your response to directly answer THEIR questions in THEIR order
- Use THEIR terminology and framing (mirror their language)
- Address every requirement they specify — don't skip sections they ask for
- If they provide word limits, scoring criteria, or specific questions, treat those as the primary framework
- d-lab's content fills THEIR structure, not the other way around

Use EXACT programme costs and impact stats from the context. Do NOT mention directors by name — refer to "directors, programme management and ops team" or "the leadership team". If grant notes mention a programme type, use that type's budget.

FORMAT: "COVER EMAIL" heading, then separator, then "PROPOSAL" heading.

BANNED PHRASES — if ANY of these appear in your output, the proposal fails. Zero tolerance:
- "Imagine a..." / "Picture a..." / "Consider a..." / "Think of a..." / "Meet [name]..." / "What if you could..." / "Close your eyes..."
- "I hope this finds you well" / "I am writing to..." / "We are pleased to..."
- "We believe" / "we are passionate" / "making a difference" / "making an impact" / "changing lives" / "brighter future" / "beacon of hope"
- "catalytic intervention" / "that spark" / "transformative journey" / "holistic approach" / "game-changer" / "game changer"
- "this isn't just X; it's Y" / "not just X — it's Y" (the fake-profound reframe structure)
- "South Africa has X% youth unemployment" or any stat-as-opener that every NPO uses
- "We look forward to partnering" / "we would welcome the opportunity" / "we trust this proposal"
- "empowering" as a verb / "stakeholders" / "leverage" (as a verb) / "synergy" / "paradigm shift"
These phrases are AUTOMATIC FAILURES. Do not use them or any close variation. Use PLAIN, SPECIFIC language instead.

ANTI-REPETITION — critical:
- NEVER open two sections with the same narrative device. If one opens with a story, the next must open with data, a direct statement, or the funder's own mission.
- NEVER reuse an alumni story, statistic, or proof point that already appeared in another section.
- NEVER repeat the same adjectives, sentence structures, or transitional phrases across sections.
- NEVER pad with development-sector jargon. Every sentence must be specific to d-lab.
- NEVER name staff in the narrative. Do NOT write "Imagine Ayanda welcoming..." or name any team member.

ADDITIONAL RULES:
- NEVER include ChatGPT licenses, OpenAI subscriptions, or third-party AI tool costs in budgets — d-lab builds its own proprietary AI tools. The budget line is "AI platform & tools (proprietary)" not "Software licences (ChatGPT, Canva, etc.)"
- NEVER mention directors or staff by name — refer to "the leadership team" or "programme management and ops team"
- Do NOT invent budget figures or statistics not in the context
- Do NOT write thin, skeletal sections — this is a REAL proposal, not an outline
- Do NOT switch to cold, institutional tone after the opening — sustain warmth throughout${priorResearch ? "\nUse the funder intelligence below to tailor tone and emphasis." : ""}${priorFitScore || grant.aiFitscore ? "\nIMPORTANT: A fit score analysis is included below. Use it strategically — lean into the STRENGTHS it identifies, directly address any GAPS or RISKS it flags (turn weaknesses into narrative strengths where possible), and match the emphasis to the alignment areas scored highest." : ""}

BUDGET-ASK CONSISTENCY — THE MOST COMMON ERROR:
The total amount in your budget table, the amount in the budget narrative, and the ASK_RECOMMENDATION MUST all be the SAME number. If you propose 2 cohorts, the budget table must show 2 cohorts and the total must be 2× the per-cohort cost. If you write about 1 cohort in the narrative but recommend 2 in the ASK_RECOMMENDATION, the proposal is broken. Decide how many cohorts FIRST, then write the ENTIRE proposal around that number.

ASK RECOMMENDATION — CRITICAL:
At the very END of your proposal (after all sections), include this structured line on its own line. The system parses it to set the grant ask:
ASK_RECOMMENDATION: Type [1-7], [count] cohort(s), [years] year(s), R[total amount as integer with no commas or spaces]
Example (single year): ASK_RECOMMENDATION: Type 3, 2 cohort(s), 1 year(s), R2472000
Example (multi-year): ASK_RECOMMENDATION: Type 1, 3 cohort(s), 3 year(s), R4644000
The total R amount is the GRAND TOTAL across all years (annual × years). For multi-year proposals, include a year-by-year breakdown table in the Budget section.
Use d-lab's programme types as a starting framework, but MATCH THE ASK TO THE FUNDER'S CAPACITY. If the funder budget is R2M, don't propose R500K — propose something that fills their capacity with genuine impact. Go multi-cohort, multi-year, add components, extend duration, propose a flagship programme. The ask should be ambitious but justified — every rand should map to real delivery.${factGuard}`,
        `Organisation:\n${orgCtx}\n\nGrant: ${grant.name}\nFunder: ${grant.funder}\nType: ${grant.type}\n${grant.ask > 0 ? `Ask: R${grant.ask.toLocaleString()}` : `Funder Budget: R${(grant.funderBudget || 0).toLocaleString()} — recommend the best programme type and calculate the right ask`}\nFocus: ${(grant.focus || []).join(", ")}\nNotes: ${grant.notes || "None"}${grant.funderFeedback ? `\n\n=== FUNDER FEEDBACK (from previous application) ===\n${grant.funderFeedback}\nCRITICAL: This is real feedback from the funder. Address every concern raised. If they said the budget was too high, adjust. If they wanted more evidence, provide it. This feedback is your most important input.` : ""}${researchBlock}${fitScoreBlock}`,
        false, 5000
      );
    }
    if (type === "sectionDraft") {
      // Section-by-section proposal generation — full strategic depth per section
      const { sectionName, sectionIndex, totalSections, completedSections, customInstructions } = priorResearch || {};
      const fs = funderStrategy(grant);
      // Use structured research for section-specific injection, fall back to raw text
      const rawResearch = priorFitScore?.research || grant.aiResearch;
      const structuredRes = grant.aiResearchStructured || parseStructuredResearch(rawResearch);
      const researchText = structuredRes
        ? getResearchForSection(structuredRes, sectionName, 2000)
        : rawResearch ? rawResearch.slice(0, 1500) : "";
      const researchBlock = researchText
        ? `\n\n=== FUNDER INTELLIGENCE (tailored for ${sectionName}) ===\n${researchText}`
        : "";
      const fitBlock = (priorFitScore?.fitscore || grant.aiFitscore)
        ? `\n\n=== FIT SCORE ===\n${(priorFitScore?.fitscore || grant.aiFitscore).slice(0, 1000)}`
        : "";
      const fitScoreNote = (priorFitScore?.fitscore || grant.aiFitscore)
        ? "\nIMPORTANT: A fit score analysis is included. Lean into the STRENGTHS it identifies, directly address GAPS or RISKS (turn weaknesses into narrative strengths), match emphasis to the highest-scored alignment areas."
        : "";
      const relNote = fs.returning
        ? `RETURNING FUNDER — this is a partner renewing, not a stranger. Reference the existing relationship with specifics:\n${fs.hook}\nFrame as continuity and deepening, not a new pitch.`
        : `NEW FUNDER — relationship is "${grant.rel || "Cold"}". Make it easy to say yes to a first conversation.`;

      // Build smart prior-sections summary — extract key metadata to prevent repetition
      // instead of raw truncation which loses alumni/stats used mid-section
      const priorSummary = completedSections && Object.keys(completedSections).length > 0
        ? Object.entries(completedSections).map(([name, sec]) => {
            const text = sec.text || "";
            const firstSentence = text.split(/(?<=[.!?])\s+/)[0] || "";
            // Detect which alumni stories were used
            const alumniUsed = [];
            if (/siphu/i.test(text)) alumniUsed.push("Siphumezo");
            if (/siman/i.test(text)) alumniUsed.push("Simanye");
            if (/prieska/i.test(text)) alumniUsed.push("Prieska");
            if (/sci.?bono.*graduate/i.test(text)) alumniUsed.push("Sci-Bono graduate");
            if (/michelle.*adler|forgood/i.test(text)) alumniUsed.push("Michelle Adler/forgood");
            // Detect key stats used
            const statsUsed = [];
            if (/92%/.test(text)) statsUsed.push("92% completion");
            if (/85%/.test(text)) statsUsed.push("85% employment");
            if (/29%/.test(text)) statsUsed.push("29% pre-grad");
            if (/R180.?000/.test(text)) statsUsed.push("R180K unemployment cost");
            // Detect opening device
            let openingDevice = "direct statement";
            if (/^["""']/.test(firstSentence)) openingDevice = "quote";
            else if (/\d/.test(firstSentence.slice(0, 30))) openingDevice = "data/statistic";
            else if (alumniUsed.length && text.indexOf(alumniUsed[0]) < 200) openingDevice = "alumni story";
            const meta = [`Opens with: ${openingDevice}`];
            if (alumniUsed.length) meta.push(`Alumni used: ${alumniUsed.join(", ")}`);
            if (statsUsed.length) meta.push(`Stats used: ${statsUsed.join(", ")}`);
            return `[${name}]: ${meta.join(" | ")}\nFirst line: "${firstSentence.slice(0, 150)}"`;
          }).join("\n")
        : "";

      // Classify section for targeted strategic blocks
      const sn = sectionName.toLowerCase();
      const isCover = sn.includes("cover");
      const isExecSummary = sn.includes("summary") || sn.includes("executive");
      const isBudget = sn.includes("budget");
      const isImpact = sn.includes("impact") || sn.includes("outcome") || sn.includes("evidence");
      const isProgramme = sn.includes("programme") || sn.includes("program") || sn.includes("approach") || sn.includes("design") || sn.includes("overview") || sn.includes("innovation") || sn.includes("technology") || sn.includes("ai integration");
      const isScale = sn.includes("scale") || sn.includes("sustainability") || sn.includes("exit");
      const isChallenge = sn.includes("challenge") || sn.includes("problem") || sn.includes("theory of change");

      // Section-specific depth guidance — rich, strategic blocks per section type
      let sectionGuide = "";

      if (isCover) {
        sectionGuide = `COVER EMAIL INSTRUCTIONS:
Subject line + 5-8 sentence body. Open with a specific, compelling hook — NOT "I am writing to submit..." and NOT "Imagine..." Open with human impact or the opportunity. One proof point. Close with a low-friction next step. Sign off as "Director, d-lab NPC" (do NOT name them).

OPENING HOOK: ${fs.hook}

OPENING TECHNIQUE — choose ONE (whichever fits this funder best):
- A real student outcome: "Last year, Siphumezo Adam walked into our pilot programme unemployed. Today she runs cohort operations at d-lab."
- A striking cost comparison (${costHook})
- The funder's own stated mission, connected directly to d-lab's work
- A provocative question: "What if the most effective way to close the digital divide isn't a laptop per child — but a habit per day?"
- A concrete result: "Seventeen of twenty graduates employed within 90 days."
NEVER open with "Imagine..." or scene-setting invitations. Start with something real.`;

      } else if (isExecSummary) {
        sectionGuide = `EXECUTIVE SUMMARY INSTRUCTIONS:
200-300 words. A compelling standalone case — someone should want to fund d-lab after reading ONLY this section.
Use a DIFFERENT hook from the cover letter — check the ALREADY-WRITTEN SECTIONS and do NOT repeat the same opening device or story.

OPENING — choose ONE technique that is DIFFERENT from the cover letter:
- A striking data point that reframes the problem
- A bold claim about d-lab's model ("d-lab exists to close the conversion gap between qualification and employability")
- The funder's own stated priority, connected directly to d-lab's work
- A concrete outcome ("Last year, 85% of our graduates were employed within three months")
NEVER open with "Imagine..." or "Picture..." or any invitation to hypothesise.

FRAMING: d-lab's story is the SYSTEM — 8 programme types, partner delivery model, in-house AI tools (LMS, Language Leveller, Assessornator, Cyborg Habits), corporate clients, diversified revenue. This isn't a charity asking for help. It's an engine asking for fuel.

AMBITION — think BIG:
- If the funder can support R5M, don't propose R232K. Propose multi-cohort, extended duration, wraparound services.
- Combine elements: a 9-month accredited pathway PLUS Cyborg Habits digital layer, a flagship cohort PLUS Train-the-Trainer cascade.
- What would make this funder PROUD to back this?`;

      } else if (isBudget) {
        sectionGuide = `BUDGET INSTRUCTIONS:

FORMAT — MANDATORY: Present the budget as a clean MARKDOWN TABLE, then wrap it in narrative. Structure:

1. Open with 1-2 sentences on the value proposition (cost-per-student vs alternatives)
2. The budget table in this exact format:
   | Line Item | Detail | Amount |
   |:----------|:-------|-------:|
   | Programme delivery | 20 learners × 9 months | R620,000 |
   | ... | ... | ... |
   | **Total** | | **R1,236,000** |
   | *Per student* | | *R61,800* |
3. If multi-year: add a year-by-year summary table below
4. Close with 1-2 sentences on cost-effectiveness and what the investment buys

${budgetInfo ? `${budgetInfo.block}\nIMPORTANT: The budget above is the REAL, user-confirmed budget. Use these EXACT figures in the table. Do not hallucinate different amounts.\n` : ""}
${structuredRes?.budgetRange ? `FUNDER BUDGET INTELLIGENCE (from research): ${structuredRes.budgetRange}\nSize the ask to match their capacity — don't propose R500K when they typically give R2M.\n` : ""}AMBITION: The budget should fill the funder's capacity, not sit timidly below it. If a corporate has R2M for CSI, propose R1.8M — not R500K. Match the ask to the funder's ambition.
- Use d-lab's programme types as building blocks but design for what the FUNDER wants to achieve.
- Go multi-cohort, add components, extend duration where the budget allows.

SCALE THROUGH AI — the economics argument:
- d-lab's AI tools change delivery economics. Per-student cost drops at scale because AI absorbs work that would normally require additional coaches.
- Cyborg Habits at R930/learner means a R5M investment could reach 5,000+ learners.
- Propose higher student numbers than expected. If a traditional provider proposes 40, d-lab can credibly propose 100-120.

After the table, weave the numbers into narrative: "For ${perStudentStr} per student — less than a semester at most private colleges — a young person receives ${budgetInfo?.duration || "9 months"} of daily coaching, enterprise software access, ICITP accreditation, and a career launchpad."

ASK RECOMMENDATION — include at the VERY END on its own line:
${bt ? `ASK_RECOMMENDATION: Type ${bt.typeNum}, ${bt.cohorts} cohort(s), ${bt.years || 1} year(s), R${bt.total}` : `ASK_RECOMMENDATION: Type [1-7], [count] cohort(s), [years] year(s), R[total amount as integer with no commas or spaces]
Example (single year): ASK_RECOMMENDATION: Type 3, 2 cohort(s), 1 year(s), R2472000
Example (multi-year): ASK_RECOMMENDATION: Type 1, 3 cohort(s), 3 year(s), R4644000`}`;

      } else if (isProgramme) {
        sectionGuide = `PROGRAMME SECTION INSTRUCTIONS:
Open with a direct, concrete statement about the programme — NOT "imagine" or "picture this". For example: "Each cohort begins with a week of digital onboarding..." or "The programme runs in three distinct phases..." or "Twenty learners arrive on Day 1 with smartphones and ambition. Nine months later, they leave with ICITP accreditation and job offers."

THE 6-PHASE LEARNER JOURNEY (36 weeks — use this structure to describe what d-lab actually delivers):
1. Induction (2 weeks) — Orientation, baseline assessment, team formation, digital setup. Learners get laptops, accounts, and their first taste of AI tools.
2. Launch (4 weeks) — Foundational digital & AI skills, first Design Thinking challenge (Remember/Understand on Bloom's), PowerSkills ME module (self-discovery, resilience).
3. Orbit (8 weeks) — Core skill deepening, second DT challenge (Apply/Analyse), industry exposure visits, PowerSkills WE & WORK module (collaboration, professional conduct).
4. Landing (10 weeks) — Advanced application, third DT challenge (Evaluate/Create), portfolio building, employer readiness prep, PowerSkills WORLD module (systems thinking).
5. Internship (12 weeks) — Industry placement with workplace mentoring, employer assessment, real work experience. This is where theory becomes practice.
6. Certification & Graduation — ICITP accreditation, Portfolio of Evidence submission, ICDL certification.

4 COMPETENCY PILLARS woven through every phase: Design Thinking (creative problem-solving), Digital Competency (AI tools, data, project management), Work Readiness (career prep, industry exposure), Power Skills (ME → WE → WORK → WORLD progression).

Describe what actually happens: what tools learners use, what coaching looks like (1:1 and group), what a Design Thinking sprint involves, how the 3 DT challenges progress through Bloom's Taxonomy. Be specific and factual — the reader should understand exactly what d-lab delivers.

SCALE THROUGH AI — d-lab's secret weapon:
- d-lab has built proprietary AI tools that radically change training economics. NOT off-the-shelf — built in-house for SA youth.
- Language Leveller: AI real-time translation/comprehension so learners engage with English tech content regardless of home language. Removes the biggest barrier to scale.
- Assessornator: AI assessment giving every student personalised instant feedback — a dedicated tutor at zero marginal cost per student.
- Cyborg Habits: asynchronous AI coaching extending learning beyond classroom hours, building daily digital habits (R930/learner).
- The coaching model: AI handles repetitive personalised feedback, freeing coaches for mentorship and motivation. d-lab maintains quality at 2-3x student numbers of traditional providers.

CYBORG HABITS AT SCALE — think beyond the classroom:
- For schools: deploy to entire districts as a "digital readiness" layer. 5,000 FET learners across 20 schools, 15 min/day, no new teachers needed.
- Hybrid models: Cyborg Habits as digital spine + periodic in-person bootcamps (1,000 on platform year-round, 100-200 for intensive face-to-face).
- Cascading impact: learners become AI ambassadors in families/communities. One learner = a multiplier.

AMBITION: Design the programme around what the FUNDER wants to achieve:
- Combine elements creatively: accredited pathway + Cyborg Habits layer, flagship cohort + Train-the-Trainer cascade, AI bootcamp + workplace integration.
- Think about what makes the funder PROUD. Match the scale of their ambition.`;

      } else if (isImpact) {
        sectionGuide = `IMPACT SECTION INSTRUCTIONS:
Open with a striking outcome statement — a concrete result, not a scene-setting invitation. For example: "Ninety-two percent of d-lab learners complete their programme — nearly double the sector average." or "Seventeen of twenty graduates from our latest cohort were employed within 90 days." Lead with the proof, then unpack the stories behind the numbers.

Weave numbers INTO narrative: "Of the 20 students in our most recent cohort, 17 were employed within 90 days — at companies like..." not just "85% employment rate."

Include specific, vivid outcomes — use REAL alumni stories (but check ALREADY-WRITTEN SECTIONS to avoid repeating one already used):
- 92% completion (vs 55% sector average) — nearly DOUBLE
- 85% employment within 3 months
- Siphumezo Adam: pilot student who overcame imposter syndrome, interned at ABSA CIB, now d-lab staff — beneficiary becomes builder
- Simanye Mdunyelwa: graduate who became an ECD Facilitator — the multiplier effect
- Prieska Mofokeng: started her own design business in rural Mpumalanga — entrepreneurship beyond formal employment
- Michelle Adler (forgood): "They consistently demonstrated professionalism beyond their years"
- 50 alumni completing microjobbing contracts — the employment pipeline works
- The AI tools mean quality at scale: multi-cohort delivery reaching 60+ learners simultaneously

SCALE THROUGH AI — the impact multiplier:
- d-lab's AI infrastructure means per-student cost drops at scale while quality holds. This is the key to going from dozens to hundreds to thousands.
- Cyborg Habits reaches learners asynchronously with zero marginal instructor cost — the economics of digital impact at scale.
- Cascading impact: learners become AI ambassadors in families/communities. The WhatsApp group, the parent's small business, the church admin — one learner's habits ripple outward.`;

      } else if (isScale || isChallenge) {
        sectionGuide = `${isChallenge ? "CHALLENGE/PROBLEM" : "SUSTAINABILITY/SCALE"} SECTION INSTRUCTIONS:
${isChallenge
  ? "Open with the specific gap d-lab addresses — not generic unemployment stats. For example: \"South Africa produces 400,000 graduates annually into a market that demands skills they were never taught.\" or \"The gap isn't qualification — it's conversion. The distance between a certificate and a career.\""
  : "Open with d-lab's business model strength — a statement about sustainability, not a hypothetical. For example: \"d-lab's delivery model is designed to scale without proportional cost increase.\" or \"Seven programme types, four revenue streams, and zero external AI licensing costs.\""}
Write 2-4 rich paragraphs. Be specific to d-lab's model, not generic development language.

${isChallenge ? "Frame the challenge through d-lab's lens — not generic youth unemployment stats. What specific gap does d-lab fill that nobody else does? The answer: AI-native training that works at scale because the tools are built in-house." : ""}

SUSTAINABILITY MODEL — d-lab's diversified engine:
- 8 programme types from R232K to R5M create multiple revenue streams
- Partner delivery model: partners provide infrastructure, d-lab provides the system. This means d-lab can expand to new sites without proportional cost increase.
- Cyborg Habits is a subscription product (R930/learner) that scales independently of classroom delivery
- Corporate programmes (CCBA-style) generate revenue that cross-subsidises community programmes
- In-house AI tools have zero licensing cost — they're proprietary, reducing per-student delivery cost as the organisation grows

DON'T BE TIMID about Cyborg Habits for audiences beyond traditional unemployed youth — school learners, NEET youth, working adults upskilling, community organisations, teacher digital literacy. Match to the funder's mandate.`;

      } else {
        // Targeted guidance for common section types that would otherwise get generic output
        const isAppendices = sn.includes("appendix") || sn.includes("appendices");
        const isBBBEE = sn.includes("b-bbee") || sn.includes("bbee") || sn.includes("transformation") || sn.includes("equity");
        const isME = sn.includes("m&e") || sn.includes("monitoring") || sn.includes("evaluation") || sn.includes("framework");
        const isRisk = sn.includes("risk");
        const isSafeguarding = sn.includes("safeguard") || sn.includes("child");
        const isOrgBackground = sn.includes("organisational") || sn.includes("organizational") || sn.includes("org capacity") || sn.includes("background");
        const isRegulatory = sn.includes("regulatory") || sn.includes("nqf") || sn.includes("saqa") || sn.includes("accreditation") || sn.includes("quality assur");
        const isTimeline = sn.includes("timeline") || sn.includes("implementation");
        const isBrand = sn.includes("brand") || sn.includes("visibility");

        if (isAppendices) {
          sectionGuide = `APPENDICES — produce a structured list of supporting documents d-lab can provide:

1. Section 18A Tax Exemption Certificate (PBO 930077003)
2. NPO Registration Certificate (273-412 NPO)
3. CIPC Registration (2017/382673/08)
4. ICITP Accreditation Certificate (pivotal skills programme)
5. Latest Audited Financial Statements (compiled by Orkin Brown and Associates, CA(SA))
6. Board Resolution authorising this application
7. Organisational Organogram
8. B-BBEE Certificate / Sworn Affidavit
9. Proof of Banking Details
10. CVs of Key Personnel (Director, Head of Programmes, Programme Manager)
11. Letters of Support from delivery partners (Inkcubeko, Penreach, Sci-Bono)
12. Sample Portfolio of Evidence (student work)

Format as a numbered list with brief descriptions. Add a closing note: "All documents available on request. Contact [Director, d-lab NPC] for additional supporting materials."
Do NOT fabricate document contents — just list what's available.`;
        } else if (isBBBEE) {
          sectionGuide = `B-BBEE / TRANSFORMATION section — write with substance, not checkbox compliance:
- d-lab is a Level 1 B-BBEE contributor (as an EME NPO with >75% black beneficiaries)
- 100% of programme beneficiaries are black South African youth
- Programme directly addresses skills development (SDA element) and socio-economic development (SED element)
- Corporate funders can claim FULL B-BBEE points for their investment in d-lab
- Quantify the B-BBEE value: "For every R1M invested, [funder] receives [X] B-BBEE points across skills development and SED"
- Emphasise the double return: social impact AND regulatory compliance value
- Reference ICITP accreditation (NQF-aligned) and SETA alignment where relevant
Write 2-3 paragraphs that make B-BBEE value tangible, not bureaucratic.`;
        } else if (isME) {
          sectionGuide = `M&E FRAMEWORK — describe d-lab's actual measurement system:
- LMS tracks all student data: attendance, assignment completion, assessment scores, portfolio progress
- 6-phase milestone tracking: each phase has specific assessment gates
- Key metrics: completion rate (92%), employment rate at 3/6/12 months (85% at 3mo), pre-graduation placement (29%)
- Quarterly OKR reporting to board
- Beneficiary tracking: post-graduation employment tracking at 3, 6, and 12 months
- Partner delivery quality: standardised coaching rubrics, monthly partner reviews
- AI-powered assessment (Assessornator) ensures consistent marking standards across sites
- Portfolio of Evidence (PoE) system provides auditable proof of competence
- Data-informed iteration: programme design updated quarterly based on cohort outcomes
Write 2-3 substantive paragraphs. Make it clear this is a data-driven organisation, not one that measures attendance and calls it M&E.`;
        } else if (isRisk) {
          sectionGuide = `RISK MANAGEMENT — d-lab's actual risk framework:
- Financial: diversified revenue (grants + corporate + earned + in-kind), R4.98M reserves, two-director sign-off above R5K
- Delivery: partner model means site-specific risks don't cascade. If one partner site has issues, others continue independently
- Student attrition: stipend programmes achieve 92% completion. Programmes without stipends carry higher churn risk (lesson from Penreach 2025)
- Quality: ICITP accreditation, standardised assessment via Assessornator, coaching rubrics
- Safeguarding: child safeguarding policy for FET programme (minors), POPIA compliance for all data
- Technology: in-house AI tools mean zero vendor dependency for core delivery. No licensing risk.
- Scale: partner model allows geographic expansion without proportional cost increase
Write 2-3 paragraphs that show genuine risk awareness, not generic risk matrices.`;
        } else if (isSafeguarding) {
          sectionGuide = `SAFEGUARDING — d-lab has a formal Child Safeguarding Policy (required for FET programme with minors):
- All staff undergo vetting and background checks
- Clear reporting protocols for safeguarding concerns
- POPIA-compliant data handling for all beneficiary information
- FET programme (Type 4) works with Grade 10-12 learners through partnership with Gauteng Department of Education
- Adult programmes (18+) operate under standard duty-of-care principles
- Digital safeguarding: AI tools are monitored, learner data stays on d-lab's own LMS, no third-party data sharing
Write 1-2 focused paragraphs. Be factual and specific.`;
        } else if (isOrgBackground) {
          sectionGuide = `ORGANISATIONAL BACKGROUND — tell d-lab's growth story:
- Founded 2017, programme launched 2022 with 12-student pilot in Johannesburg
- Trajectory: pilot (2022) → proof of concept (2023, 3 cohorts) → system (2024-25, 4 provinces, 60+ learners, corporate clients)
- Board of 3 directors: Education/Marketing, Governance/Finance, Fundraising/Sustainability
- Team: Head of Programmes, Programme Manager, Cohort Coordinator, AI/LMS support
- Governance: weekly risk monitoring, quarterly OKRs, two-director financial authority above R5K
- Sister entity: The Field Institute (corporate delivery vehicle for CCBA, EOH, BAT)
- Accreditation: ICITP (SAQA registered), ICDL, Portfolios of Evidence
- Financial stewardship: approved budget R11.08M vs actual R8.23M (2025) — deliberate underspend shows discipline
Write 2-3 paragraphs that convey competence and growth trajectory.`;
        } else if (isRegulatory) {
          sectionGuide = `REGULATORY ALIGNMENT — d-lab's compliance credentials:
- ICITP-accredited pivotal skills programme (SAQA registered)
- NQF-aligned curriculum: Portfolios of Evidence + ICDL certification
- SETA alignment: programme content maps to MICT SETA requirements
- NPO 273-412 NPO | CIPC 2017/382673/08 | PBO 930077003 | Section 18A tax-exempt
- Quality assurance: Assessornator AI provides standardised assessment across all delivery sites
- B-BBEE: Level 1 contributor, 100% black beneficiaries, skills development + SED elements
Write 2-3 paragraphs with specific reference numbers and compliance details. Funders who ask for this section want proof, not promises.`;
        } else if (isTimeline) {
          sectionGuide = `IMPLEMENTATION TIMELINE — use d-lab's actual delivery phases:
- Month 1-2: Partner site setup, student recruitment and selection, facilitator training
- Month 3: Induction phase (2 weeks), digital onboarding, baseline assessments
- Month 4: Launch phase — foundational skills, first Design Thinking challenge
- Month 5-6: Orbit phase — core skill deepening, industry exposure, second DT challenge
- Month 7-8: Landing phase — advanced application, portfolio building, employer readiness
- Month 9-11: Internship placement — workplace mentoring, real work experience
- Month 12: Certification, graduation, employment placement support
Present as a clear timeline or table. Include key milestones and decision points.`;
        } else if (isBrand) {
          sectionGuide = `BRAND ALIGNMENT & VISIBILITY — what the funder gets:
- Logo placement on all cohort materials, certificates, and digital platforms
- Acknowledgement in quarterly impact reports and annual review
- Social media recognition across d-lab channels (LinkedIn, Instagram, website)
- Invitation to cohort showcase events and graduation ceremonies
- Option for branded cohort naming (e.g., "[Funder] Future Leaders Cohort")
- Student project alignment: Design Thinking challenges can be themed around funder's industry or social goals
- Employee volunteering: funder staff as guest speakers, mentors, or industry exposure hosts
Write 1-2 paragraphs focused on GENUINE partnership value, not just logo placement.`;
        } else {
          sectionGuide = `Open with a direct, factual statement relevant to this section's topic — NOT an "imagine" or scene-setting device.
Write 2-4 rich paragraphs. Do NOT produce bullet-only content — weave data into narrative.
Be specific about d-lab's actual capabilities. Include specific details where relevant: the AI tools (Language Leveller, Assessornator, LMS, Cyborg Habits), the coaching model, partner delivery structure, accreditation pathway (ICITP, ICDL).`;
        }
      }

      // Token budget per section type — generous to avoid truncated output
      const tokenBudget = isCover ? 1200
        : isExecSummary ? 1800
        : isBudget ? 2500
        : isProgramme ? 2800
        : isImpact ? 2000
        : isScale || isChallenge ? 2000
        : 1500;

      return await api(
        `You write ONE section of a funding proposal for d-lab NPC — a South African NPO training unemployed youth in AI-native digital skills (92% completion, 85% employment within 3 months).

SECTION: "${sectionName}" (Section ${sectionIndex + 1} of ${totalSections})

RULE #1 — NEVER USE THESE WORDS TO OPEN ANY SENTENCE: "Imagine", "Picture", "Consider", "Think of", "Meet", "What if", "Close your eyes". These are BANNED. Start every sentence with something real and concrete — a fact, a name, a number, a direct statement.

VOICE — this is the most important instruction:
- Warm, human, confident. A founder who KNOWS this works, offering a funder the chance to back something real.
- Write like a person, not a grant machine. Let the reader feel the energy of what d-lab does.
- Use d-lab's REAL alumni stories from the context — but use each story ONCE across the full proposal. If a prior section already used Siphumezo's story, pick a different one.
- Be concrete and grounded: real numbers, real programme details. Emotion comes from specificity, not adjectives.
- Vary sentence length. Short punchy sentences land harder after longer ones.
- CRITICAL: The emotive, narrative energy must carry through. Do NOT switch to dry, bureaucratic grant-speak.

${sectionGuide}

FUNDER ANGLE: Lead with "${fs.lead}"
USE THEIR LANGUAGE: ${fs.lang}
${relNote}
${budgetInfo ? `\n${budgetInfo.block}` : ""}
${fs.mc ? `MULTI-COHORT: ${fs.mc.count} cohorts requested` : ""}
${customInstructions ? `\nUSER INSTRUCTIONS FOR THIS SECTION: ${customInstructions}` : ""}${fitScoreNote}

UPLOADED DOCUMENTS — if GRANT DOCUMENTS appear in the context below, they are the funder's RFP, application form, or guidelines. Address THEIR specific questions, use THEIR terminology, follow THEIR requested structure. Their requirements are the primary framework — d-lab's content fills it.

BANNED PHRASES — if ANY of these appear in your output, the section fails. Zero tolerance:
- "Imagine a..." / "Picture a..." / "Consider a..." / "Think of a..." / "Meet [name]..." / "What if you could..." / "Close your eyes..."
- "I hope this finds you well" / "I am writing to..." / "We are pleased to..."
- "We believe" / "we are passionate" / "making a difference" / "making an impact" / "changing lives" / "brighter future" / "beacon of hope"
- "catalytic intervention" / "that spark" / "transformative journey" / "holistic approach" / "game-changer" / "game changer"
- "this isn't just X; it's Y" / "not just X — it's Y" (the fake-profound reframe structure)
- "South Africa has X% youth unemployment" or any stat-as-opener that every NPO uses
- "We look forward to partnering" / "we would welcome the opportunity" / "we trust this proposal"
- "empowering" as a verb / "stakeholders" / "leverage" (as a verb) / "synergy" / "paradigm shift"
These phrases are AUTOMATIC FAILURES. Use PLAIN, SPECIFIC language instead.

ANTI-REPETITION — critical:
- Read the ALREADY-WRITTEN SECTIONS below carefully. Do NOT reuse their opening devices, alumni stories, statistics, or key phrases.
- If a prior section opens with a student story, you MUST use a completely different technique (data point, direct statement, funder's own mission, concrete programme detail).
- Do NOT echo the same adjectives, metaphors, or sentence structures used in prior sections.
- Every section must feel fresh — as if written by the same author but covering genuinely new ground.
- NEVER name staff in the narrative. Do NOT write "Imagine Ayanda welcoming..." or name any team member.

ADDITIONAL RULES:
- NEVER include ChatGPT/OpenAI/third-party AI costs in budgets — d-lab builds its own AI tools. Use "AI platform & tools (proprietary)"
- NEVER mention directors or staff by name — refer to "the leadership team" or "programme management and ops team"
- Do NOT invent figures or statistics not in the context — write with substance, not padding${priorFitScore?.research || grant.aiResearch ? "\nUse the funder intelligence below to tailor tone and emphasis." : ""}

Write ONLY the "${sectionName}" section content. No section header — just the content.${factGuard}`,
        `Organisation:\n${orgCtx}\n\nGrant: ${grant.name}\nFunder: ${grant.funder}\nType: ${grant.type}\n${grant.ask > 0 ? `Ask: R${grant.ask.toLocaleString()}` : `Funder Budget: R${(grant.funderBudget || 0).toLocaleString()} — recommend the best programme type and calculate the right ask`}\nFocus: ${(grant.focus || []).join(", ")}\nNotes: ${grant.notes || "None"}${grant.funderFeedback ? `\n\n=== FUNDER FEEDBACK (from previous application) ===\n${grant.funderFeedback}\nAddress every concern raised in this feedback.` : ""}${researchBlock}${fitBlock}${priorSummary ? `\n\nALREADY-WRITTEN SECTIONS (read these carefully — do NOT repeat their openings, stories, or statistics):\n${priorSummary}` : ""}`,
        false, tokenBudget
      );
    }
    if (type === "research") {
      const fs = funderStrategy(grant);
      return await api(
        `You are a funder intelligence analyst for d-lab NPC, a South African NPO training unemployed youth in AI-native digital skills (92% completion, 85% employment, 8 programme types from R232K to R5M).

RESEARCH THOROUGHLY — search this funder's website, annual report, CSI report, and recent news.

Return your findings as a JSON object with these fields. Each field should be a concise, information-dense string (not arrays or nested objects). Be specific — names, numbers, dates, not generalities.

{
  "budgetRange": "Their annual CSI/grant spend, typical grant size range, and any caps or minimums",
  "recentGrants": "2-3 specific examples of who they funded recently, for how much, for what purpose",
  "contacts": "Names and titles of CSI/foundation decision-makers, plus best contact method",
  "priorities": "Their stated funding priorities + what their actual funding pattern reveals they really care about",
  "applicationProcess": "Prescribed form or open proposal? Portal or email? Deadlines? Multi-stage? What documents required?",
  "strategy": "What angle d-lab should lead with, which programme type (Type 1-8) to offer, what to emphasise, what to avoid",
  "${fs.returning ? "relationshipLeverage" : "doorOpener"}": "${fs.returning ? "How to use the existing relationship — what to reference from past grants, who to contact, what continuity angle works" : "How to get a first meeting — who to approach, what hook to use, what intro channel"}",
  "rawText": "A full narrative summary of all the above (4-6 paragraphs) suitable for human reading — include all the detail from the other fields woven into flowing text"
}

IMPORTANT: Return ONLY valid JSON. No markdown code fences, no text before or after the JSON object. Every field value must be a string (escape any quotes inside values).

Use uploaded documents for additional context about the organisation. Reference specific programme types and costs from the org profile when discussing fit.${factGuard}`,
        `Organisation context:\n${orgCtx}\n\nFunder: ${grant.funder}\nType: ${grant.type}\nGrant: ${grant.name}\n${grant.ask > 0 ? `Ask: R${grant.ask.toLocaleString()}` : `Funder Budget: ~R${(grant.funderBudget || 0).toLocaleString()} (ask TBD — will be set after proposal)`}\nRelationship: ${grant.rel}${fs.returning ? " (RETURNING FUNDER — d-lab has an existing relationship)" : ""}\nFocus areas: ${(grant.focus || []).join(", ")}${fs.noIntel ? "\n\nNO PRE-EXISTING FUNDER INTELLIGENCE — research from scratch. Build a complete picture." : `\n\n=== EXISTING FUNDER INTELLIGENCE (build on this, don't duplicate) ===\nLead angle: ${fs.lead}\nHook: ${fs.hook}\nRecommended sections: ${(fs.sections || []).join(", ")}\nLanguage register: ${fs.lang}${fs.returning ? "\nStatus: RETURNING FUNDER — look for what d-lab delivered with their previous funding, what outcomes were achieved, and what the continuity angle is." : ""}`}\n\n${grant.notes ? `TEAM INTEL (from grant notes — treat as high-priority context):\n${grant.notes}` : "Notes: None"}${grant.funderFeedback ? `\n\n=== PREVIOUS FUNDER FEEDBACK ===\n${grant.funderFeedback}\nUse this feedback to refine your research — understand what the funder valued or didn't value.` : ""}`,
        true, 3000
      );
    }
    if (type === "followup") {
      const fs = funderStrategy(grant);
      return await api(
        `You write follow-up emails for d-lab NPC, a South African NPO training youth in AI-native digital skills.

VOICE: Professional but human. A confident founder checking in — not a desperate fundraiser chasing. Write like you would to a colleague you respect. No grovelling. No "just following up." This person's inbox is full — give them a reason to keep reading.

REGISTER: ${grant.type === "Government/SETA" ? "Formal, reference compliance, accreditation, and regulatory alignment" : grant.type === "Corporate CSI" ? "Professional and sharp, mention B-BBEE value and brand alignment" : grant.type === "International" ? "Polished and global, reference SDG outcomes and evidence" : "Warm and direct, lead with outcomes and human impact"}

FORMAT:
Subject: [specific, compelling — NOT "Following up on our application"]
[Body — 4-8 sentences max]

The email should:
- Open with context (what was submitted, when) — but make it interesting, not administrative
- Lead with what this funder cares about: "${fs.lead}"
- Include one NEW proof point or update since submission — something that shows momentum. Strong options:
  • CCBA/Coca-Cola awarded d-lab R2.75M (Jan 2026) for an 18-month Graduate Leadership Accelerator across African markets — proves corporate delivery capability at scale
  • 92% completion rate (vs 55% sector avg), 85% employment within 3 months
  • 4 cohorts running simultaneously across 3 provinces in 2026
  • Proprietary AI tools (Language Leveller, Assessornator) enabling quality at 2-3x student numbers
  • Choose the proof point most relevant to THIS funder's priorities
- Close with a specific, low-friction next step (15-min call, site visit, "happy to send our latest impact data")
- Under 200 words. Every sentence earns its place.
- Sign off as the director (do NOT name them — just "Director, d-lab NPC")
${fs.returning ? "- RETURNING FUNDER: This is a partner. Reference the relationship warmly — you have shared history." : "- NEW FUNDER: Be respectful and make it easy to say yes to a conversation. Lower the bar: a call, a coffee, not a commitment."}${factGuard}`,
        `Organisation:\n${orgCtx}\n\nGrant: ${grant.name}\nFunder: ${grant.funder}\nStage: ${grant.stage}\n${grant.ask > 0 ? `Ask: R${grant.ask.toLocaleString()}` : `Funder Budget: ~R${(grant.funderBudget || 0).toLocaleString()}`}\nSubmitted: ${grant.subDate || "Not yet"}\nNotes: ${grant.notes || "None"}`,
        false, 1000
      );
    }
    if (type === "fitscore") {
      const fs = funderStrategy(grant);
      return await api(
        `You are a grant fit analyst for a South African NPO. Assess how well this grant opportunity matches the organisation.

RESPOND IN EXACTLY THIS FORMAT:
SCORE: [number 0-100]
VERDICT: [one of: Strong Fit | Good Fit | Moderate Fit | Weak Fit | Poor Fit]

WIN FACTORS:
- [factor 1]
- [factor 2]
- [factor 3]

RISK FACTORS:
- [risk 1]
- [risk 2]

RECOMMENDATION: [1-2 sentences on whether to pursue and what to emphasise]

DRAFTING DIRECTIVES (specific instructions for the proposal writer):
- EMPHASISE: [what to highlight — e.g., "AI tools heavily — this funder has funded tech upskilling before"]
- EMPHASISE: [second emphasis — e.g., "partner delivery model — addresses the small org size concern"]
- AVOID: [what to downplay — e.g., "don't lead with scale numbers — this funder cares about depth not breadth"]
- PROGRAMME FIT: [which Type 1-8 to propose and why — e.g., "Type 3 (R1.236M) matches their typical grant range of R1-2M"]
- TONE: [register adjustment — e.g., "formal and evidence-heavy — this is a government funder" or "warm and entrepreneurial — this is a corporate CSI team"]

SCORING GUIDE:
- Funder focuses on youth/education/skills/digital = +15
- Ask within funder's typical range = +15
- Geographic match = +10
- Existing relationship (Previous Funder/Warm Intro) = +20
- AI/tech angle matches funder = +10
- Programme type fits funder's priorities = +15
- B-BBEE/compliance alignment = +5
- Timing (deadline feasible) = +10
- Deduct for: org too small, outside focus, budget mismatch, missing track record`,
        `Organisation:\n${orgCtx}\n\nGrant: ${grant.name}\nFunder: ${grant.funder}\nType: ${grant.type}\n${grant.ask > 0 ? `Ask: R${grant.ask.toLocaleString()}` : `Funder Budget: ~R${(grant.funderBudget || 0).toLocaleString()} (ask TBD)`}\nRelationship: ${grant.rel}${fs.returning ? " (RETURNING FUNDER)" : ""}\nFocus: ${(grant.focus || []).join(", ")}\nGeography: ${(grant.geo || []).join(", ") || "National"}\nDeadline: ${grant.deadline || "Rolling"}\nNotes: ${grant.notes || "None"}\n\nFUNDER INTEL: This funder cares about "${fs.lead}". Their language: ${fs.lang}.${fs.returning ? " d-lab is a returning grantee." : ""}`,
        false, 800
      );
    }
    if (type === "brief") {
      // Single pass to categorise grants for brief
      const overdue = [], urgent = [], drafting = [], submitted = [];
      for (const g of grants) {
        if (g.stage === "drafting") drafting.push(g);
        if (g.stage === "submitted" || g.stage === "awaiting") submitted.push(g);
        if (["won","lost","deferred"].includes(g.stage)) continue;
        const dd = dL(g.deadline);
        if (dd === null) continue;
        if (dd < 0) overdue.push(g);
        else if (dd <= 14) urgent.push(g);
      }
      return await api(
        `You are d-lab's grant operations manager. Produce a daily action list — the 5-8 things that will move the pipeline forward TODAY.

RULES:
- Each item: a specific, actionable task for a specific grant
- Order by urgency: overdue first, then deadlines within 14 days, then drafting priorities, then follow-ups
- Be blunt: "OVERDUE" or "X days left" where relevant
- Include the owner name where assigned
- No preamble, no markdown headers — just the action items, one per line
- End with a one-line pipeline health summary`,
        `Today: ${new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
Overdue (${overdue.length}): ${overdue.map(g => `${g.name} (${Math.abs(dL(g.deadline))}d overdue, owner: ${team.find(t=>t.id===g.owner)?.name || "Unassigned"})`).join("; ") || "None"}
Urgent <14d (${urgent.length}): ${urgent.map(g => `${g.name} (${dL(g.deadline)}d left, owner: ${team.find(t=>t.id===g.owner)?.name || "Unassigned"})`).join("; ") || "None"}
In drafting (${drafting.length}): ${drafting.map(g => `${g.name} for ${g.funder} (R${effectiveAsk(g).toLocaleString()})`).join("; ") || "None"}
Submitted/Awaiting (${submitted.length}): ${submitted.map(g => `${g.name} from ${g.funder}`).join("; ") || "None"}
Total pipeline: ${grants.filter(g => !["won","lost","deferred"].includes(g.stage)).length} grants, R${grants.filter(g => !["won","lost","deferred"].includes(g.stage)).reduce((s,g) => s+effectiveAsk(g), 0).toLocaleString()}`,
        false, 1000
      );
    }
    if (type === "winloss") {
      // priorResearch carries the outcome ("won" or "lost") and any user notes
      const outcome = priorResearch || "unknown";
      return await api(
        `You are a grants strategist analysing a ${outcome === "won" ? "successful" : "unsuccessful"} grant application.

Provide a brief analysis in this format:

${outcome === "won" ? `WHAT WORKED:
- [2-3 specific factors that likely contributed to the win]

LEVERAGE OPPORTUNITIES:
- [How to use this win for future applications — reference funders, renewals, case studies]

NEXT STEPS:
- [2-3 concrete actions — reporting requirements, relationship building, renewal timeline]` : `LIKELY REASONS:
- [2-3 specific factors that may have contributed to the loss]

LESSONS:
- [What to do differently next time with similar funders]

RECOVERY OPTIONS:
- [Alternative funders to approach, or whether to reapply next cycle]`}

Keep it concise and specific to this grant. No generic advice.${grant.funderFeedback ? "\n\nACTUAL FUNDER FEEDBACK is provided below. This is the most important input — ground your analysis in what they actually said, not speculation." : ""}`,
        `Organisation:\n${orgCtx}\n\nGrant: ${grant.name}\nFunder: ${grant.funder}\nType: ${grant.type}\nAsk: R${grant.ask?.toLocaleString()}\nRelationship: ${grant.rel}\nFocus: ${(grant.focus || []).join(", ")}\nNotes: ${grant.notes || "None"}\nOutcome: ${outcome}${grant.funderFeedback ? `\n\n=== ACTUAL FUNDER FEEDBACK ===\n${grant.funderFeedback}` : ""}`,
        false, 1000
      );
    }
    if (type === "urlextract") {
      // priorResearch carries the URL
      const url = priorResearch || "";
      return await api(
        `Extract grant/funding opportunity details from a URL. Return ONLY valid JSON — no markdown, no backticks, no explanation.

SCHEMA: {"name":"[grant name]","funder":"[funding org]","type":"[Corporate CSI|Government/SETA|International|Foundation|Tech Company]","ask":[amount in ZAR integer, 0 if unknown],"deadline":"[YYYY-MM-DD or null]","focus":["tag1","tag2"],"notes":"[eligibility, requirements, key details]","applyUrl":"[direct application URL]"}

RULES: "ask" = realistic midpoint if range given, convert USD at ~R18/$. "type" must be exactly one of the 5 options. "focus" = 2-5 tags from: youth-employment, digital-skills, AI/4IR, education, women, rural-dev, STEM, entrepreneurship. "applyUrl" = most direct application link found.`,
        `Fetch and extract grant information from: ${url}`,
        true, 800
      );
    }
    if (type === "report") {
      const act = grants.filter(g => !["won", "lost", "deferred", "archived"].includes(g.stage));
      const won = grants.filter(g => g.stage === "won");
      const lost = grants.filter(g => g.stage === "lost");
      const totalAsk = act.reduce((s, g) => s + effectiveAsk(g), 0);
      const wonVal = won.reduce((s, g) => s + effectiveAsk(g), 0);
      const byStage = stages.filter(s => !["won", "lost", "deferred", "archived"].includes(s.id))
        .map(s => `${s.label}: ${grants.filter(g => g.stage === s.id).length}`)
        .join(", ");
      return await api(
        `You write quarterly impact reports for d-lab NPC's funders. Audience: existing funders and board members who want to see progress, outcomes, and pipeline health.

VOICE: Confident, factual. Lead with outcomes, not activities. Show momentum.

STRUCTURE:
1. HEADLINE METRICS (4-5 key numbers — completion rate, employment, pipeline value, student count)
2. PROGRAMME UPDATE (what's active, what's new, 2-3 highlights)
3. FUNDING PIPELINE (won, active, key developments)
4. LOOKING AHEAD (next quarter milestones)
5. THANK YOU (brief, genuine)

One page max. Every sentence earns its place. No hollow phrases. Use the SYSTEM framing: programme types, partner model, AI tools, diversified revenue.${factGuard}`,
        `Organisation:\n${orgCtx}\n\nQ${Math.ceil((new Date().getMonth() + 1) / 3)} ${new Date().getFullYear()} quarterly report.
Pipeline: ${act.length} active grants (R${totalAsk.toLocaleString()}), ${won.length} won (R${wonVal.toLocaleString()}), ${lost.length} lost.
By stage: ${byStage}.
Top grants: ${[...act].sort((a, b) => effectiveAsk(b) - effectiveAsk(a)).slice(0, 5).map(g => `${g.name} (R${effectiveAsk(g).toLocaleString()}, ${g.stage})`).join("; ")}`,
        false, 2000
      );
    }
    if (type === "insights" || type === "strategy") {
      // Shared single-pass categorisation for insights & strategy
      const act = [], won = [], lost = [];
      const funderTypeMap = {}, relMap = {}, focusMap = {}, ownerMap = {};
      const stageCounts = {};
      let totalAsk = 0, wonVal = 0, withAI = 0;
      let deadlinePressure = 0, overdueCount = 0, noDeadline = 0;

      // Build team lookup once
      const teamById = new Map();
      if (team) for (const t of team) teamById.set(t.id, t);

      for (const g of grants) {
        const ask = effectiveAsk(g);
        const isWon = g.stage === "won";
        const isLost = g.stage === "lost";
        const isActive = !["won", "lost", "deferred", "archived"].includes(g.stage);

        if (isWon) { won.push(g); wonVal += ask; }
        else if (isLost) { lost.push(g); }
        else if (isActive) {
          act.push(g); totalAsk += ask;
          // Deadline stats
          if (!g.deadline) noDeadline++;
          else {
            const dd = dL(g.deadline);
            if (dd !== null && dd < 0) overdueCount++;
            else if (dd !== null && dd >= 0 && dd <= 14) deadlinePressure++;
          }
          // Owner workload
          const oid = g.owner || "team";
          const m = teamById.get(oid);
          const name = m ? m.name : (oid === "team" ? "Unassigned" : oid);
          ownerMap[name] = (ownerMap[name] || 0) + 1;
        }

        // Stage counts
        stageCounts[g.stage] = (stageCounts[g.stage] || 0) + 1;

        // Funder types
        const ft = g.type || "Unknown";
        if (!funderTypeMap[ft]) funderTypeMap[ft] = { total: 0, won: 0, lost: 0, ask: 0 };
        funderTypeMap[ft].total++; funderTypeMap[ft].ask += ask;
        if (isWon) funderTypeMap[ft].won++; if (isLost) funderTypeMap[ft].lost++;

        // Relationships
        const rel = g.rel || "Unknown";
        if (!relMap[rel]) relMap[rel] = { total: 0, won: 0, lost: 0 };
        relMap[rel].total++;
        if (isWon) relMap[rel].won++; if (isLost) relMap[rel].lost++;

        // Focus tags
        for (const tag of (g.focus || [])) focusMap[tag] = (focusMap[tag] || 0) + 1;

        // AI coverage
        if (g.aiDraft || g.aiResearch || g.aiFitscore) withAI++;
      }

      const closed = won.length + lost.length;

    if (type === "insights") {
      const byStage = stages.filter(s => !["won", "lost", "deferred", "archived"].includes(s.id))
        .map(s => ({ stage: s.label, count: stageCounts[s.id] || 0 }))
        .filter(s => s.count > 0);

      return await api(
        `You are a sharp-eyed pipeline analyst for d-lab NPC, a South African youth skills NPO. You find the things that busy grant managers miss — the hidden risks, the unexploited patterns, the signals in the noise.

TASK: Produce 5–7 insights from this pipeline data. Each one should make the reader think "I hadn't noticed that."

WHAT TO LOOK FOR:
- Funnel shape: top-heavy with scouted grants that never move? Or bottom-heavy with too few new leads? Where does conversion break down?
- Concentration risk: if one funder type or one large grant accounts for >40% of the pipeline, that's fragile. Name the risk.
- Relationship patterns: which relationship statuses (Hot/Warm/Cold/New) actually convert? Where is effort wasted?
- Timing clusters: are deadlines bunched in one month creating a capacity crunch? How many grants have no deadline at all?
- Ask calibration: is the average ask realistic for the funder types being targeted? Are there outliers?
- Team balance: is one person carrying too much? Is anyone underutilised?
- Revenue gap: what's the gap between pipeline value and realistic revenue (weighted by stage probability)?

FORMAT — for each insight:
- Bold title (no emoji, no numbering)
- 2–3 sentences backed by actual numbers from the data. Name specific grants and funders.
- "This week:" followed by one concrete action.

Be blunt. If something is going well, say so briefly and move on. Spend more words on problems and opportunities.${factGuard}`,
        `Organisation: ${org?.name || "d-lab NPC"}

PIPELINE SNAPSHOT:
- Total grants: ${grants.length} (${act.length} active, ${won.length} won, ${lost.length} lost)
- Active pipeline value: R${totalAsk.toLocaleString()}
- Won value: R${wonVal.toLocaleString()}
- Win rate: ${closed > 0 ? Math.round((won.length / closed) * 100) + "%" : "No closed grants yet"}

BY STAGE: ${byStage.map(s => `${s.stage}: ${s.count}`).join(", ")}

FUNDER TYPES: ${Object.entries(funderTypeMap).map(([t, v]) => `${t}: ${v.total} grants (${v.won}W/${v.lost}L, R${v.ask.toLocaleString()})`).join("; ")}

RELATIONSHIPS: ${Object.entries(relMap).map(([r, v]) => `${r}: ${v.total} (${v.won}W/${v.lost}L)`).join("; ")}

DEADLINE PRESSURE: ${deadlinePressure} due within 14 days, ${overdueCount} overdue, ${noDeadline} without deadlines

FOCUS AREAS: ${Object.entries(focusMap).sort(([, a], [, b]) => b - a).map(([tag, n]) => `${tag} (${n})`).join(", ")}

TEAM WORKLOAD: ${Object.entries(ownerMap).map(([name, n]) => `${name}: ${n}`).join(", ")}

AI COVERAGE: ${withAI}/${grants.length} grants have some AI-generated content (${Math.round((withAI / Math.max(grants.length, 1)) * 100)}%)

TOP 5 BY ASK: ${[...act].sort((a, b) => effectiveAsk(b) - effectiveAsk(a)).slice(0, 5).map(g => `${g.name} for ${g.funder} (R${effectiveAsk(g).toLocaleString()}, ${g.stage}, rel: ${g.rel})`).join("; ")}`,
        false, 2000
      );
    } // end insights
    if (type === "strategy") {
      // Programme type usage (strategy-specific — not shared with insights)
      const ptypeUsage = {};
      for (const g of grants) {
        const pt = detectType(g);
        const label = pt ? pt.label.split(" — ")[0] : "Unclassified";
        if (!ptypeUsage[label]) ptypeUsage[label] = { total: 0, won: 0, lost: 0, ask: 0 };
        ptypeUsage[label].total++;
        ptypeUsage[label].ask += effectiveAsk(g);
        if (g.stage === "won") ptypeUsage[label].won++;
        if (g.stage === "lost") ptypeUsage[label].lost++;
      }

      // Build programme type reference
      const ptypeRef = Object.entries(PTYPES).map(([num, pt]) =>
        `Type ${num}: ${pt.label} — ${pt.students ? pt.students + " students" : "Scales to any size"}, ${pt.duration}, ${pt.cost ? "R" + pt.cost.toLocaleString() : "R930/learner"}`
      ).join("\n");

      return await api(
        `You are a funding strategist for d-lab NPC, a South African youth skills NPO with 8 programme types ranging from R232K short courses to R1.6M full-cohort programmes with laptops and stipends.

TASK: Produce 5–7 strategic recommendations. Each should be a specific, defensible play that d-lab can execute — not general advice.

d-lab's programme portfolio:
${ptypeRef}

THINK ABOUT:
- Which programme types are being pitched to the wrong funders? A R1.6M Type 2 programme pitched to a R500K corporate CSI budget is a mismatch. Name the mismatches.
- Cyborg Habits (Type 6, R930/learner, fully online) can scale to thousands — is the pipeline leveraging this for international funders, education departments, or large corporates who want reach?
- Which funder types actually convert? If Foundations win at 60% but Government/SETA wins at 10%, the team should rebalance prospecting time.
- Multi-cohort and multi-year packaging: a R516K Type 1 programme becomes a R2.5M proposal when packaged as 5 cohorts across 2 years. Is anyone packaging like this?
- Returning funders (Telkom, Sage, SAP, Get It Done) are the easiest revenue. Are renewals being actively managed or left to chance?
- Geographic plays: are there provinces, metros, or rural areas where d-lab has no presence but funders are active?
- Revenue concentration: if one grant represents >25% of the pipeline, that's a strategic risk.

FORMAT — for each recommendation:
- Bold title (no numbering, no emoji)
- 3–5 sentences of reasoning with specific numbers, programme costs, and funder names from the data
- "Next 30 days:" followed by one concrete action

Think like a board advisor, not a consultant. Be direct about what's working, what's not, and where the biggest leverage is.${factGuard}`,
        `Organisation: ${org?.name || "d-lab NPC"}

PIPELINE DATA:
- Total: ${grants.length} grants, ${act.length} active (R${totalAsk.toLocaleString()}), ${won.length} won (R${wonVal.toLocaleString()}), ${lost.length} lost
- Win rate: ${won.length + lost.length > 0 ? Math.round((won.length / (won.length + lost.length)) * 100) + "%" : "No closed grants"}

PROGRAMME TYPE USAGE IN PIPELINE:
${Object.entries(ptypeUsage).map(([label, v]) => `${label}: ${v.total} grants (${v.won}W/${v.lost}L, total ask R${v.ask.toLocaleString()})`).join("\n")}

FUNDER TYPE BREAKDOWN:
${Object.entries(funderTypeMap).map(([t, v]) => `${t}: ${v.total} grants (${v.won}W/${v.lost}L, R${v.ask.toLocaleString()})`).join("\n")}

TOP GRANTS BY VALUE:
${[...grants].sort((a, b) => effectiveAsk(b) - effectiveAsk(a)).slice(0, 8).map(g => `${g.name} — ${g.funder} (${g.type}), R${effectiveAsk(g).toLocaleString()}, ${g.stage}, rel: ${g.rel}`).join("\n")}

WON GRANTS: ${won.map(g => `${g.name} from ${g.funder} (${g.type}, R${effectiveAsk(g).toLocaleString()})`).join("; ") || "None yet"}
LOST GRANTS: ${lost.map(g => `${g.name} from ${g.funder} (${g.type}, R${effectiveAsk(g).toLocaleString()})`).join("; ") || "None yet"}`,
        false, 2500
      );
    } // end strategy
    } // end insights || strategy
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
        {/* Org header */}
        <div style={{ padding: "20px 16px 16px", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {org?.logo_url ? (
              <img src={org.logo_url} alt="" onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }}
                style={{ width: 36, height: 36, borderRadius: 10, objectFit: "cover", boxShadow: `0 2px 10px ${C.primaryGlow}` }} />
            ) : null}
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: `linear-gradient(135deg, ${C.primary} 0%, #E04840 100%)`,
              display: org?.logo_url ? "none" : "flex", alignItems: "center", justifyContent: "center",
              fontSize: 15, fontWeight: 800, color: "#fff", fontFamily: MONO,
              boxShadow: `0 2px 10px ${C.primaryGlow}`,
            }}>{(org?.name || orgSlug)?.[0]?.toUpperCase()}</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, letterSpacing: -0.2 }}>{org?.name || orgSlug}</div>
              <div style={{ fontSize: 10, color: C.t4, letterSpacing: 0.5, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                Grant Engine
                {saveState === "saving" && <span style={{ fontSize: 9, color: C.amber, fontWeight: 600, animation: "ge-pulse 1.2s ease-in-out infinite" }}>Saving...</span>}
                {saveState === "saved" && <span style={{ fontSize: 9, color: C.ok, fontWeight: 600 }}>✓ Saved</span>}
                {saveState === "error" && <span style={{ fontSize: 9, color: C.red, fontWeight: 600 }}>Save failed</span>}
              </div>
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
        <Suspense fallback={
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.primary, animation: "ge-pulse 1.4s ease-in-out infinite" }} />
            <span style={{ fontSize: 13, color: C.t3, fontFamily: FONT }}>Loading...</span>
          </div>
        }>
        {sel && selectedGrant ? (
          <GrantDetail
            grant={selectedGrant}
            team={team}
            stages={stages}
            funderTypes={funderTypes}
            complianceDocs={complianceDocs}
            currentMember={currentMember}
            onUpdate={updateGrant}
            onDelete={deleteGrant}
            onBack={() => setSel(null)}
            onRunAI={runAI}
            onUploadsChanged={(grantId) => { delete uploadsCache.current[grantId]; }}
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
            onSelectGrant={(id) => setSel(id)}
            onUpdateGrant={updateGrant}
            onAddGrant={addGrant}
            onRunAI={runAI}
            api={api}
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
            onUpdateProfile={() => {}}
            onLogout={handleLogout}
          />
        ) : view === "admin" && currentMember?.role === "director" ? (
          <Admin org={org} team={team} grants={grants} currentMember={currentMember} onSaveGrant={saveGrant} onSetGrants={setGrants} onTeamChanged={async () => {
            try { const t = await getTeam(); setTeam(t); } catch (e) { console.error("Team refresh failed:", e); }
          }} />
        ) : null}
        </Suspense>
      </div>

      {/* animations injected globally via injectFonts() */}
    </div>
  );
}
