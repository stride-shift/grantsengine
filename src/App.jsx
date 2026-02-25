import { useState, useEffect, useCallback, useRef } from "react";
import { C, FONT, MONO, injectFonts } from "./theme";
import { uid, td, dL, addD, effectiveAsk } from "./utils";
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

import OrgSelector from "./components/OrgSelector";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import Pipeline from "./components/Pipeline";
import GrantDetail from "./components/GrantDetail";
import Settings from "./components/Settings";
import Funders from "./components/Funders";
import Admin from "./components/Admin";
import { ToastProvider, useToast } from "./components/Toast";

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

const DEFAULT_FTYPES = ["Corporate CSI", "Government/SETA", "International", "Foundation", "Tech Company"];
const EMPTY_GRANT = Object.freeze({ name: "", funder: "", type: "", ask: 0, focus: [], geo: [], rel: "", notes: "", deadline: null, stage: "" });

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

    // Add structured programme costs (always useful for proposals)
    if (profile?.programmes?.length && (type === "draft" || type === "sectionDraft")) {
      const progBlock = "=== EXACT PROGRAMME COSTS (use these figures) ===\n" +
        profile.programmes.map(p => `${p.name}: R${(p.cost || 0).toLocaleString()} — ${p.desc}`).join("\n");
      profileSections.push(progBlock);
    }

    // Add impact stats
    if (profile?.impact_stats && (type === "draft" || type === "sectionDraft")) {
      const s = profile.impact_stats;
      profileSections.push(`=== VERIFIED IMPACT STATS (use these exact numbers) ===\nCompletion rate: ${Math.round((s.completion_rate || 0) * 100)}% (sector avg: ${Math.round((s.sector_average_completion || 0) * 100)}%)\nEmployment rate: ${Math.round((s.employment_rate || 0) * 100)}% within ${s.employment_window_months || 3} months\nLearners trained: ${s.learners_trained || "60+"}`);
    }

    // Add tone & anti-patterns
    if (profile?.tone) profileSections.push(`TONE: ${profile.tone}`);
    if (profile?.anti_patterns) profileSections.push(`ANTI-PATTERNS: ${profile.anti_patterns}`);
    if (profile?.past_funders) profileSections.push(`PAST FUNDERS: ${profile.past_funders}`);

    let orgCtx = baseCtx;
    if (profileSections.length) {
      orgCtx += "\n\n" + profileSections.join("\n\n");
    }

    // Load uploaded document context — cached per grant to avoid redundant fetches
    // Budgets reduced to stay within API rate limits (30K input tokens ≈ 22K chars total)
    const isDraftType = type === "draft" || type === "sectionDraft";
    const grantDocBudget = isDraftType ? 3000 : 2000;
    const orgDocBudget = isDraftType ? 2000 : 1500;
    try {
      const grantId = grant?.id;
      if (!uploadsCache.current[grantId]) {
        uploadsCache.current[grantId] = await getUploadsContext(grantId);
      }
      const uploads = uploadsCache.current[grantId];
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
    const maxCtx = isDraftType ? 10000 : 8000;
    if (orgCtx.length > maxCtx) orgCtx = orgCtx.slice(0, maxCtx) + "\n[...context trimmed for length]";

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
    const budgetInfo = bt
      ? { perStudent: bt.perStudent, total: bt.total, typeNum: bt.typeNum, typeLabel: bt.typeLabel,
          students: bt.cohorts * bt.studentsPerCohort, cohorts: bt.cohorts, duration: bt.duration,
          block: `BUDGET (SOURCE OF TRUTH — use these EXACT figures):
Programme: Type ${bt.typeNum} — ${bt.typeLabel}
Students: ${bt.cohorts * bt.studentsPerCohort}${bt.cohorts > 1 ? ` (${bt.cohorts} cohorts × ${bt.studentsPerCohort})` : ""}
Duration: ${bt.duration}
Line items:
${bt.items.map(it => `  ${it.label}: R${it.amount.toLocaleString()}`).join("\n")}
${bt.includeOrgContribution ? `30% org contribution: R${bt.orgContribution.toLocaleString()}\n` : ""}TOTAL: R${bt.total.toLocaleString()} | Per student: R${bt.perStudent.toLocaleString()}` }
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
      const researchBlock = priorResearch
        ? `\n\n=== FUNDER INTELLIGENCE (from prior research) ===\n${priorResearch.slice(0, 2000)}`
        : "";
      const fitScoreBlock = (priorFitScore || grant.aiFitscore)
        ? `\n\n=== FIT SCORE ANALYSIS ===\n${(priorFitScore || grant.aiFitscore).slice(0, 1500)}`
        : "";
      const relNote = fs.returning
        ? "RETURNING FUNDER — reference the existing relationship. This is a partner renewing, not a stranger."
        : `NEW FUNDER — relationship is "${grant.rel || "Cold"}". Make it easy to say yes to a first conversation.`;
      return await api(
        `You write funding proposals for d-lab NPC — a South African NPO that trains unemployed youth in AI-native digital skills, with a 92% completion rate and 85% employment within 3 months.

VOICE — this is the most important instruction. Maintain it in EVERY section, not just the opening:
- Warm, human, confident. You're a founder who KNOWS this works, offering a funder the chance to back something real.
- Write like a person, not a grant machine. Let the reader feel the energy of what d-lab does.
- Use vivid, specific details: a student's first day using AI tools, a graduate landing their first tech role, a coach watching the lightbulb moment. These aren't made up — they're the reality of d-lab's programme.
- Be concrete and grounded: real numbers, real names, real programme details. Emotion comes from specificity, not adjectives.
- Vary sentence length. Short punchy sentences land harder after longer ones.
- The tone is: "We built something that works. Here's the proof. Here's what your investment makes possible."
- CRITICAL: The emotive, narrative energy of the opening must carry through the ENTIRE proposal. Do NOT switch to dry, bureaucratic grant-speak after the first paragraph. Every section should read like it was written by someone who cares deeply, not by a compliance officer. The programme section should make the reader SEE the training room. The budget section should make them feel the value. The impact section should make them want to be part of it.

FRAMING: d-lab's story is the SYSTEM — 7 programme types, partner delivery model, in-house AI tools (LMS, Language Leveller, Assessornator, Cyborg Habits), corporate clients, diversified revenue. This isn't a charity asking for help. It's an engine asking for fuel.

AMBITION — think BIG. Do NOT constrain yourself to d-lab's smallest or cheapest programme type:
- d-lab's 7 programme types are a GUIDE, not a cage. Use them as building blocks but design the programme around what the FUNDER wants to achieve.
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
- FOR SCHOOLS: Cyborg Habits can be deployed to entire school districts as a "digital readiness" layer — giving Grade 10-12 learners daily AI-guided micro-challenges that build real digital literacy BEFORE they enter the job market or tertiary education. Imagine 5,000 FET learners across 20 schools, each spending 15 minutes a day building the habits that separate digitally fluent workers from digitally illiterate ones. No new teachers required — just devices and connectivity.
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
- Programme sections should describe the actual week-by-week or phase-by-phase journey: what happens on Day 1, what tools they use, what the coaching looks like, what a Design Thinking sprint feels like, what the Cyborg Habits platform does. Paint the picture.
- Impact sections should weave numbers INTO narrative: "Of the 20 students in our most recent cohort, 17 were employed within 90 days — at companies like..." not just "85% employment rate."
- Budget sections should tell the story of value: "For ${perStudentStr} per student — less than the cost of a semester at most private colleges — a young person receives ${budgetInfo?.duration || "9 months"} of daily coaching, enterprise software access, ICITP accreditation, and a career launchpad."
- Include specific d-lab details that bring it to life: the AI tools (Language Leveller, Assessornator, PoE Assessor, LMS), the coaching model, the partner delivery structure, the accreditation pathway.
- If the funder type expects compliance sections (SETA alignment, B-BBEE, M&E frameworks), write those with EQUAL depth — but still with narrative warmth.

FUNDER ANGLE: Lead with "${fs.lead}"
OPENING HOOK: ${fs.hook}
USE THEIR LANGUAGE: ${fs.lang}
${relNote}
${budgetInfo ? `\n${budgetInfo.block}` : ""}
${fs.mc ? `MULTI-COHORT: ${fs.mc.count} cohorts requested` : ""}

Use EXACT programme costs and impact stats from the context. Do NOT mention directors by name — refer to "directors, programme management and ops team" or "the leadership team". If grant notes mention a programme type, use that type's budget. If uploaded docs contain RFP guidelines, address them directly.

FORMAT: "COVER EMAIL" heading, then separator, then "PROPOSAL" heading.

ANTI-PATTERNS — never do these:
- "I hope this finds you well" or any generic opener
- "South Africa has X% youth unemployment" — every NPO says this, it's wallpaper
- "We believe", "we are passionate", "making a difference" — hollow phrases
- Leading with geography or province-counting
- Dry lists without narrative thread — every section should MOVE the reader toward yes
- Padding with generic development language — be specific to d-lab
- Invented budget figures or statistics not in the context
- Thin, skeletal sections with one paragraph each — this is a REAL proposal, not an outline
- Switching to a cold, institutional tone after the opening — sustain the warmth throughout
- Generic filler like "we look forward to partnering" — every sentence must earn its place
- Reusing the same opening structure across different proposals — if you always start with "In a training room in...", you're being lazy. Every funder deserves a fresh angle.
- NEVER include ChatGPT licenses, OpenAI subscriptions, or third-party AI tool costs in budgets — d-lab builds and uses its own proprietary AI tools
- NEVER mention directors by name — refer to "directors, programme management and ops team" or "the leadership team"${priorResearch ? "\nUse the funder intelligence below to tailor tone and emphasis." : ""}${priorFitScore || grant.aiFitscore ? "\nIMPORTANT: A fit score analysis is included below. Use it strategically — lean into the STRENGTHS it identifies, directly address any GAPS or RISKS it flags (turn weaknesses into narrative strengths where possible), and match the emphasis to the alignment areas scored highest." : ""}

ASK RECOMMENDATION — CRITICAL:
At the very END of your proposal (after all sections), include this structured line on its own line. The system parses it to set the grant ask:
ASK_RECOMMENDATION: Type [1-7], [count] cohort(s), R[total amount as integer with no commas or spaces]
Example: ASK_RECOMMENDATION: Type 3, 2 cohort(s), R2472000
Use d-lab's programme types as a starting framework, but MATCH THE ASK TO THE FUNDER'S CAPACITY. If the funder budget is R2M, don't propose R500K — propose something that fills their capacity with genuine impact. Go multi-cohort, add components, extend duration, propose a flagship programme. The ask should be ambitious but justified — every rand should map to real delivery.${factGuard}`,
        `Organisation:\n${orgCtx}\n\nGrant: ${grant.name}\nFunder: ${grant.funder}\nType: ${grant.type}\n${grant.ask > 0 ? `Ask: R${grant.ask.toLocaleString()}` : `Funder Budget: R${(grant.funderBudget || 0).toLocaleString()} — recommend the best programme type and calculate the right ask`}\nFocus: ${(grant.focus || []).join(", ")}\nNotes: ${grant.notes || "None"}${researchBlock}${fitScoreBlock}`,
        false, 5000
      );
    }
    if (type === "sectionDraft") {
      // Section-by-section proposal generation — full strategic depth per section
      const { sectionName, sectionIndex, totalSections, completedSections, customInstructions } = priorResearch || {};
      const fs = funderStrategy(grant);
      const researchBlock = (priorFitScore?.research || grant.aiResearch)
        ? `\n\n=== FUNDER INTELLIGENCE ===\n${(priorFitScore?.research || grant.aiResearch).slice(0, 1500)}`
        : "";
      const fitBlock = (priorFitScore?.fitscore || grant.aiFitscore)
        ? `\n\n=== FIT SCORE ===\n${(priorFitScore?.fitscore || grant.aiFitscore).slice(0, 1000)}`
        : "";
      const fitScoreNote = (priorFitScore?.fitscore || grant.aiFitscore)
        ? "\nIMPORTANT: A fit score analysis is included. Lean into the STRENGTHS it identifies, directly address GAPS or RISKS (turn weaknesses into narrative strengths), match emphasis to the highest-scored alignment areas."
        : "";
      const relNote = fs.returning
        ? "RETURNING FUNDER — reference the existing relationship. This is a partner renewing, not a stranger."
        : `NEW FUNDER — relationship is "${grant.rel || "Cold"}". Make it easy to say yes to a first conversation.`;

      // Build prior-sections summary for consistency
      const priorSummary = completedSections && Object.keys(completedSections).length > 0
        ? Object.entries(completedSections).map(([name, sec]) =>
            `[${name}]: ${(sec.text || "").slice(0, 150).replace(/\n/g, " ")}...`
          ).join("\n")
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
Subject line + 5-8 sentence body. Open with a specific, compelling hook — NOT "I am writing to submit..." Open with human impact or the opportunity. One proof point. Close with a low-friction next step. Sign off as "Director, d-lab NPC" (do NOT name them).

OPENING HOOK: ${fs.hook}

VARIED OPENINGS — the opening must be UNIQUE and crafted for THIS funder:
- Lead with a single student's transformation story (a day in the life, a before/after)
- Lead with a striking data point that reframes the problem (${costHook})
- Lead with the funder's own stated mission and show how d-lab is already doing what they want to fund
- Lead with a provocation ("What if the most effective way to close the digital divide isn't a laptop per child — but a habit per day?")
- Lead with a very specific scene (the first morning of a new cohort, the WhatsApp message from a graduate's parent)
Choose ONE technique — whichever fits this funder best. If grant notes mention a specific theme, use THAT as your anchor.`;

      } else if (isExecSummary) {
        sectionGuide = `EXECUTIVE SUMMARY INSTRUCTIONS:
200-300 words. A compelling standalone case — someone should want to fund d-lab after reading ONLY this section.
Use a DIFFERENT hook from the cover letter — do not repeat yourself.

FRAMING: d-lab's story is the SYSTEM — 7 programme types, partner delivery model, in-house AI tools (LMS, Language Leveller, Assessornator, Cyborg Habits), corporate clients, diversified revenue. This isn't a charity asking for help. It's an engine asking for fuel.

AMBITION — think BIG:
- If the funder can support R5M, don't propose R232K. Propose multi-cohort, extended duration, wraparound services.
- Combine elements: a 9-month accredited pathway PLUS Cyborg Habits digital layer, a flagship cohort PLUS Train-the-Trainer cascade.
- What would make this funder PROUD to back this?

VARIED OPENINGS — use a different technique from the cover letter:
- Striking data point, student story, funder's own mission, provocative question, concrete scene, or scale vision.`;

      } else if (isBudget) {
        sectionGuide = `BUDGET INSTRUCTIONS:
Tell the story of VALUE, not just line items. Show cost-per-student, cost-effectiveness vs traditional providers. Make every rand feel justified.
${budgetInfo ? `\n${budgetInfo.block}\nIMPORTANT: The budget above is the REAL, user-confirmed budget. Use these EXACT figures. Wrap compelling narrative around the real numbers. Do not hallucinate different amounts.\n` : ""}
AMBITION: The budget should fill the funder's capacity, not sit timidly below it. If a corporate has R2M for CSI, propose R1.8M — not R500K. Match the ask to the funder's ambition.
- Use d-lab's programme types as building blocks but design for what the FUNDER wants to achieve.
- Go multi-cohort, add components, extend duration where the budget allows.

SCALE THROUGH AI — the economics argument:
- d-lab's AI tools (Language Leveller, Assessornator, PoE Assessor, LMS, Cyborg Habits) change the economics of delivery. Per-student cost drops at scale because AI absorbs work that would normally require additional coaches.
- "d-lab can train 200 learners with the quality traditionally reserved for cohorts of 60."
- Cyborg Habits at R930/learner means a R5M investment could reach 5,000+ learners. No traditional programme matches that cost-per-outcome.
- Propose higher student numbers than expected. If a traditional provider proposes 40, d-lab can credibly propose 100-120.

Use d-lab's EXACT programme cost lines. Weave the numbers into narrative: "For ${perStudentStr} per student — less than a semester at most private colleges — a young person receives ${budgetInfo?.duration || "9 months"} of daily coaching, enterprise software access, ICITP accreditation, and a career launchpad."

ASK RECOMMENDATION — include at the VERY END on its own line:
${bt ? `ASK_RECOMMENDATION: Type ${bt.typeNum}, ${bt.cohorts} cohort(s), R${bt.total}` : `ASK_RECOMMENDATION: Type [1-7], [count] cohort(s), R[total amount as integer with no commas or spaces]
Example: ASK_RECOMMENDATION: Type 3, 2 cohort(s), R2472000`}`;

      } else if (isProgramme) {
        sectionGuide = `PROGRAMME SECTION INSTRUCTIONS:
Describe the actual learner journey: what happens on Day 1, what tools they use, what coaching looks like, what a Design Thinking sprint feels like. Paint the picture so vividly the reader SEES the training room.

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
Weave numbers INTO narrative: "Of the 20 students in our most recent cohort, 17 were employed within 90 days — at companies like..." not just "85% employment rate."

Include specific, vivid outcomes:
- 92% completion (vs 55% sector average) — nearly DOUBLE
- 85% employment within 3 months
- The AI tools mean quality at scale: 20 students per cohort with multi-cohort delivery reaching 60+ learners simultaneously, maintaining outcomes that traditional providers can't match beyond a single classroom

SCALE THROUGH AI — the impact multiplier:
- d-lab's AI infrastructure means per-student cost drops at scale while quality holds. This is the key to going from dozens to hundreds to thousands.
- Cyborg Habits reaches learners asynchronously with zero marginal instructor cost — the economics of digital impact at scale.
- Cascading impact: learners become AI ambassadors in families/communities. The WhatsApp group, the parent's small business, the church admin — one learner's habits ripple outward.`;

      } else if (isScale || isChallenge) {
        sectionGuide = `${isChallenge ? "CHALLENGE/PROBLEM" : "SUSTAINABILITY/SCALE"} SECTION INSTRUCTIONS:
Write 2-4 rich paragraphs. Be specific to d-lab's model, not generic development language.

${isChallenge ? "Frame the challenge through d-lab's lens — not generic youth unemployment stats. What specific gap does d-lab fill that nobody else does? The answer: AI-native training that works at scale because the tools are built in-house." : ""}

SUSTAINABILITY MODEL — d-lab's diversified engine:
- 7 programme types from R232K to R5M create multiple revenue streams
- Partner delivery model: partners provide infrastructure, d-lab provides the system. This means d-lab can expand to new sites without proportional cost increase.
- Cyborg Habits is a subscription product (R930/learner) that scales independently of classroom delivery
- Corporate programmes (CCBA-style) generate revenue that cross-subsidises community programmes
- In-house AI tools have zero licensing cost — they're proprietary, reducing per-student delivery cost as the organisation grows

DON'T BE TIMID about Cyborg Habits for audiences beyond traditional unemployed youth — school learners, NEET youth, working adults upskilling, community organisations, teacher digital literacy. Match to the funder's mandate.`;

      } else {
        // Default for compliance, regulatory, organisational, appendices, etc.
        sectionGuide = `Write 2-4 rich paragraphs. Do NOT produce bullet-only content — weave data into narrative.
Be vivid and specific — paint the picture of what d-lab does. Even compliance sections should read with narrative warmth.
Include specific d-lab details: the AI tools (Language Leveller, Assessornator, LMS, Cyborg Habits), the coaching model, partner delivery structure, accreditation pathway (ICITP, ICDL).
If this is a regulatory/compliance section (SETA, B-BBEE, M&E, NQF), write with EQUAL depth but still with the human voice.`;
      }

      // Token budget per section type — raised for richer output
      const tokenBudget = isCover ? 800
        : isExecSummary ? 1000
        : isBudget ? 1200
        : isProgramme ? 1000
        : isImpact ? 1000
        : 900;

      return await api(
        `You write ONE section of a funding proposal for d-lab NPC — a South African NPO training unemployed youth in AI-native digital skills (92% completion, 85% employment within 3 months).

SECTION: "${sectionName}" (Section ${sectionIndex + 1} of ${totalSections})

VOICE — this is the most important instruction:
- Warm, human, confident. A founder who KNOWS this works, offering a funder the chance to back something real.
- Write like a person, not a grant machine. Let the reader feel the energy of what d-lab does.
- Use vivid, specific details: a student's first day using AI tools, a graduate landing their first tech role, a coach watching the lightbulb moment.
- Be concrete and grounded: real numbers, real programme details. Emotion comes from specificity, not adjectives.
- Vary sentence length. Short punchy sentences land harder after longer ones.
- CRITICAL: The emotive, narrative energy must carry through. Do NOT switch to dry, bureaucratic grant-speak. This section should read like it was written by someone who cares deeply.

${sectionGuide}

FUNDER ANGLE: Lead with "${fs.lead}"
USE THEIR LANGUAGE: ${fs.lang}
${relNote}
${budgetInfo ? `\n${budgetInfo.block}` : ""}
${fs.mc ? `MULTI-COHORT: ${fs.mc.count} cohorts requested` : ""}
${customInstructions ? `\nUSER INSTRUCTIONS FOR THIS SECTION: ${customInstructions}` : ""}${fitScoreNote}

ANTI-PATTERNS — never do these:
- "I hope this finds you well" or any generic opener
- "South Africa has X% youth unemployment" — every NPO says this, it's wallpaper
- "We believe", "we are passionate", "making a difference" — hollow phrases
- Leading with geography or province-counting
- Dry lists without narrative thread — every sentence should MOVE the reader toward yes
- Padding with generic development language — be specific to d-lab
- Invented budget figures or statistics not in the context
- Thin, skeletal sections with one paragraph each — write with substance
- Switching to cold, institutional tone — sustain the warmth throughout
- Generic filler like "we look forward to partnering" — every sentence must earn its place
- NEVER include ChatGPT/OpenAI/third-party AI costs in budgets — d-lab builds its own AI tools
- NEVER mention directors by name — refer to "directors, programme management and ops team"${priorFitScore?.research || grant.aiResearch ? "\nUse the funder intelligence below to tailor tone and emphasis." : ""}

Write ONLY the "${sectionName}" section content. No section header — just the content.${factGuard}`,
        `Organisation:\n${orgCtx}\n\nGrant: ${grant.name}\nFunder: ${grant.funder}\nType: ${grant.type}\n${grant.ask > 0 ? `Ask: R${grant.ask.toLocaleString()}` : `Funder Budget: R${(grant.funderBudget || 0).toLocaleString()} — recommend the best programme type and calculate the right ask`}\nFocus: ${(grant.focus || []).join(", ")}\nNotes: ${grant.notes || "None"}${researchBlock}${fitBlock}${priorSummary ? `\n\nALREADY-WRITTEN SECTIONS (maintain consistency):\n${priorSummary}` : ""}`,
        false, tokenBudget
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
        `Organisation context:\n${orgCtx}\n\nFunder: ${grant.funder}\nType: ${grant.type}\nGrant: ${grant.name}\n${grant.ask > 0 ? `Ask: R${grant.ask.toLocaleString()}` : `Funder Budget: ~R${(grant.funderBudget || 0).toLocaleString()} (ask TBD — will be set after proposal)`}\nRelationship: ${grant.rel}\nFocus areas: ${(grant.focus || []).join(", ")}\nNotes: ${grant.notes || "None"}`,
        true, 2000
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
- Include one NEW proof point or update since submission — something that shows momentum
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

Keep it concise and specific to this grant. No generic advice.`,
        `Organisation:\n${orgCtx}\n\nGrant: ${grant.name}\nFunder: ${grant.funder}\nType: ${grant.type}\nAsk: R${grant.ask?.toLocaleString()}\nRelationship: ${grant.rel}\nFocus: ${(grant.focus || []).join(", ")}\nNotes: ${grant.notes || "None"}\nOutcome: ${outcome}`,
        false, 800
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
      const act = grants.filter(g => !["won", "lost", "deferred"].includes(g.stage));
      const won = grants.filter(g => g.stage === "won");
      const lost = grants.filter(g => g.stage === "lost");
      const totalAsk = act.reduce((s, g) => s + effectiveAsk(g), 0);
      const wonVal = won.reduce((s, g) => s + effectiveAsk(g), 0);
      const byStage = stages.filter(s => !["won", "lost", "deferred"].includes(s.id))
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
        const isActive = !["won", "lost", "deferred"].includes(g.stage);

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
      const byStage = stages.filter(s => !["won", "lost", "deferred"].includes(s.id))
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
        `You are a funding strategist for d-lab NPC, a South African youth skills NPO with 7 programme types ranging from R232K short courses to R1.6M full-cohort programmes with laptops and stipends.

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
    if (["won", "lost", "deferred"].includes(g.stage)) return false;
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
        <div style={{ padding: "26px 20px 22px", borderBottom: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
              <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, letterSpacing: -0.2 }}>{org?.name || orgSlug}</div>
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
        <div style={{ flex: 1, padding: "20px 12px" }}>
          {[...SIDEBAR_ITEMS, ...(currentMember?.role === "director" ? [{ id: "admin", label: "Admin", icon: "\u25CA" }] : [])].map(item => {
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
          <button onClick={handleSwitchOrg}
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
            complianceDocs={complianceDocs}
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
          <Admin org={org} team={team} currentMember={currentMember} onTeamChanged={async () => {
            try { const t = await getTeam(); setTeam(t); } catch (e) { console.error("Team refresh failed:", e); }
          }} />
        ) : null}
      </div>

      {/* animations injected globally via injectFonts() */}
    </div>
  );
}
