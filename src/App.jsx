import { useState, useEffect, useCallback, useRef } from "react";
import { C, FONT, MONO, injectFonts } from "./theme";
import { uid, td, dL, effectiveAsk } from "./utils";
import { funderStrategy, isFunderReturning } from "./data/funderStrategy";
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

const SIDEBAR_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: "\u25a6" },
  { id: "pipeline", label: "Pipeline", icon: "\u25b6" },
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
      } catch {
        setSaveState("error");
      }
    }, 1000);
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

      // Migrate existing grants: backfill funderBudget/askSource for pre-redesign grants
      const raw = grantsData || [];
      const migrated = raw.map(g => {
        if (g.funderBudget !== undefined) return g;
        return { ...g, funderBudget: g.ask || null, askSource: g.ask ? "scout-aligned" : null, aiRecommendedAsk: null };
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
      toast("Failed to load workspace data. Please refresh.", { type: "error", duration: 0 });
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

  const deleteGrant = async (id) => {
    const backup = grants.find(g => g.id === id);
    if (!backup) return;
    setGrants(prev => prev.filter(g => g.id !== id));
    // Show undo toast — restore if user clicks Undo within 5s
    const undoId = toast(`${backup.name} deleted`, {
      type: "undo",
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          setGrants(prev => [...prev, backup]);
          toast(`${backup.name} restored`, { type: "success", duration: 2000 });
        },
      },
    });
    try {
      await removeGrant(id);
    } catch (err) {
      console.error("Failed to delete grant:", id, err);
      if (backup) setGrants(prev => [...prev, backup]);
      toast(`Failed to delete — ${backup.name} restored`, { type: "error" });
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

    // Load uploaded document context — cached per grant to avoid redundant fetches
    // Budgets reduced to stay within API rate limits (30K input tokens ≈ 22K chars total)
    const grantDocBudget = type === "draft" ? 3000 : 2000;
    const orgDocBudget = type === "draft" ? 2000 : 1500;
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
    const maxCtx = type === "draft" ? 10000 : 8000;
    if (orgCtx.length > maxCtx) orgCtx = orgCtx.slice(0, maxCtx) + "\n[...context trimmed for length]";

    // Anti-hallucination instruction — added to every prompt type
    const factGuard = `\n\nCRITICAL ACCURACY RULES:
- ONLY use facts, names, figures, dates, and programme costs that appear in the organisation context or uploaded documents provided below.
- If specific information is not provided (e.g. a director's full name, exact budget figure, or date), write [TO BE CONFIRMED] rather than inventing it.
- Never fabricate statistics, names, amounts, or achievements not present in the provided context.
- The uploaded documents and organisation profile are your ONLY source of truth — do not hallucinate additional details.`;

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
- Use vivid, specific details: a student's first day with ChatGPT, a graduate landing their first tech role, a coach watching the lightbulb moment. These aren't made up — they're the reality of d-lab's programme.
- Be concrete and grounded: real numbers, real names, real programme details. Emotion comes from specificity, not adjectives.
- Vary sentence length. Short punchy sentences land harder after longer ones.
- The tone is: "We built something that works. Here's the proof. Here's what your investment makes possible."
- CRITICAL: The emotive, narrative energy of the opening must carry through the ENTIRE proposal. Do NOT switch to dry, bureaucratic grant-speak after the first paragraph. Every section should read like it was written by someone who cares deeply, not by a compliance officer. The programme section should make the reader SEE the training room. The budget section should make them feel the value. The impact section should make them want to be part of it.

FRAMING: d-lab's story is the SYSTEM — 7 programme types, partner delivery model, in-house AI tools (LMS, Language Leveller, Assessornator, Cyborg Habits), corporate clients, diversified revenue. This isn't a charity asking for help. It's an engine asking for fuel.

COVER EMAIL: Subject line + 5-8 sentence body. Open with a specific, compelling hook — NOT "I am writing to submit..." Open with the human impact or the opportunity. One proof point. Close with a low-friction next step. Sign off as director.

PROPOSAL STRUCTURE (follow this funder-appropriate order):
${fs.structure.map((s, i) => `${i + 1}. ${s}`).join("\n")}

DEPTH — this is critical. Write a SUBSTANTIVE proposal, not a skeleton:
- Each section must be 2-4 rich paragraphs, not bullet lists or single paragraphs.
- The Executive Summary alone should be 200-300 words — a compelling standalone case.
- Programme sections should describe the actual week-by-week or phase-by-phase journey: what happens on Day 1, what tools they use, what the coaching looks like, what a Design Thinking sprint feels like, what the Cyborg Habits platform does. Paint the picture.
- Impact sections should weave numbers INTO narrative: "Of the 20 students in our most recent cohort, 17 were employed within 90 days — at companies like..." not just "85% employment rate."
- Budget sections should tell the story of value: "For R25,800 per student — less than the cost of a semester at most private colleges — a young person receives 9 months of daily coaching, enterprise software access, ICITP accreditation, and a career launchpad."
- Include specific d-lab details that bring it to life: the AI tools (Language Leveller, Assessornator, LMS), the coaching model, the partner delivery structure, the accreditation pathway.
- If the funder type expects compliance sections (SETA alignment, B-BBEE, M&E frameworks), write those with EQUAL depth — but still with narrative warmth.

FUNDER ANGLE: Lead with "${fs.lead}"
OPENING HOOK: ${fs.hook}
USE THEIR LANGUAGE: ${fs.lang}
${relNote}
${fs.pt ? `PROGRAMME TYPE: ${fs.pt.label} — ${fs.pt.students} students, R${(fs.pt.cost||0).toLocaleString()}, ${fs.pt.duration}. Budget: ${fs.pt.budget}` : ""}
${fs.mc ? `MULTI-COHORT: ${fs.mc.count} cohorts requested` : ""}

Use EXACT programme costs, director names, impact stats from the context. If grant notes mention a programme type, use that type's budget. If uploaded docs contain RFP guidelines, address them directly.

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
- Generic filler like "we look forward to partnering" — every sentence must earn its place${priorResearch ? "\nUse the funder intelligence below to tailor tone and emphasis." : ""}${priorFitScore || grant.aiFitscore ? "\nIMPORTANT: A fit score analysis is included below. Use it strategically — lean into the STRENGTHS it identifies, directly address any GAPS or RISKS it flags (turn weaknesses into narrative strengths where possible), and match the emphasis to the alignment areas scored highest." : ""}

ASK RECOMMENDATION — CRITICAL:
At the very END of your proposal (after all sections), include this structured line on its own line. The system parses it to set the grant ask:
ASK_RECOMMENDATION: Type [1-7], [count] cohort(s), R[total amount as integer with no commas or spaces]
Example: ASK_RECOMMENDATION: Type 3, 1 cohort(s), R1236000
Choose the programme type that best fits the funder's priorities and budget. Use the exact cost from the programme types list. For multi-cohort requests, multiply by the number of cohorts.${factGuard}`,
        `Organisation:\n${orgCtx}\n\nGrant: ${grant.name}\nFunder: ${grant.funder}\nType: ${grant.type}\n${grant.ask > 0 ? `Ask: R${grant.ask.toLocaleString()}` : `Funder Budget: R${(grant.funderBudget || 0).toLocaleString()} — recommend the best programme type and calculate the right ask`}\nFocus: ${(grant.focus || []).join(", ")}\nNotes: ${grant.notes || "None"}${researchBlock}${fitScoreBlock}`,
        false, 5000
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
- Sign off as the organisation director
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
      const overdue = grants.filter(g => { const dd = dL(g.deadline); return dd !== null && dd < 0 && !["won","lost","deferred"].includes(g.stage); });
      const urgent = grants.filter(g => { const dd = dL(g.deadline); return dd !== null && dd >= 0 && dd <= 14 && !["won","lost","deferred"].includes(g.stage); });
      const drafting = grants.filter(g => g.stage === "drafting");
      const submitted = grants.filter(g => ["submitted", "awaiting"].includes(g.stage));
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
        `Organisation:\n${orgCtx}\n\nQ1 2026 quarterly report.
Pipeline: ${act.length} active grants (R${totalAsk.toLocaleString()}), ${won.length} won (R${wonVal.toLocaleString()}), ${lost.length} lost.
By stage: ${byStage}.
Top grants: ${act.sort((a, b) => effectiveAsk(b) - effectiveAsk(a)).slice(0, 5).map(g => `${g.name} (R${effectiveAsk(g).toLocaleString()}, ${g.stage})`).join("; ")}`,
        false, 2000
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
          {SIDEBAR_ITEMS.map(item => {
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
            onNavigate={(v) => { setSel(null); setView(v); }}
            onRunBrief={() => runAI("brief", { name: "Pipeline", funder: "", type: "", ask: 0, focus: [], geo: [], rel: "", notes: "", deadline: null, stage: "" })}
            onRunReport={() => runAI("report", { name: "Report", funder: "", type: "", ask: 0, focus: [], geo: [], rel: "", notes: "", deadline: null, stage: "" })}
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
            onRunAI={runAI}
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

      {/* animations injected globally via injectFonts() */}
    </div>
  );
}
