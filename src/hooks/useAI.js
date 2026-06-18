import { useRef } from "react";
import { detectType } from "../data/funderStrategy";
import { api, getUploadsContext, getUploadFull, kvGet } from "../api";
import { getWritingLearnings } from "../editLearner";
import { FACT_GUARD } from "../prompts/lib";
import { buildDraftPrompt, buildSectionDraftPrompt, buildConceptNotePrompt } from "../prompts/draft";
import { buildResearchPrompt, buildFollowupPrompt, buildFitScorePrompt } from "../prompts/research";
import { buildExtractRequiredDocs, buildExtractEmailFeedback, buildExtractNotes, buildFetchFunderBrief, buildFindApplyUrl, buildUrlExtractPrompt } from "../prompts/extraction";
import { buildBriefPrompt, buildWinLossPrompt, buildReportPrompt, buildInsightsOrStrategyPrompt } from "../prompts/operations";

export default function useAI({ org, profile, team, grants, stages }) {
  const uploadsCache = useRef({});
  const learningsCache = useRef({ text: null, fetchedAt: 0 });
  const proposalLibraryCache = useRef({ proposals: null, fetchedAt: 0 });

  // ── AI handler (enriched with uploads context + optional prior research) ──
  const runAI = async (type, grant, priorResearch, priorFitScore) => {
    // Dynamic org identity — used throughout all prompts instead of hardcoded org names
    const orgName = org?.name || "the organisation";

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

    // Add structured programme costs from this org's profile (source of truth
    // for budgets — the AI uses these instead of any hardcoded template).
    // Tolerates legacy `desc` field as well as new `description` field.
    const needsOrgContext = ["draft", "sectionDraft", "research", "fitscore", "followup"].includes(type);
    if (profile?.programmes?.length && needsOrgContext) {
      const lines = profile.programmes.map(p => {
        const bits = [`${p.name}: R${(p.cost || 0).toLocaleString()}`];
        if (p.students) bits.push(`${p.students} students`);
        if (p.duration) bits.push(p.duration);
        const desc = p.description || p.desc;
        if (desc) bits.push(`— ${desc}`);
        return bits.join(" · ");
      });
      const progBlock = "=== PROGRAMMES (this org's source of truth — use these figures when sizing budgets) ===\n" + lines.join("\n");
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
          const text = u.extracted_text.slice(0, Math.min(4000, budget));
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

      // Proposal library — inject starred reference proposals for tone and structure
      if (isDraftType && remaining > 500) {
        try {
          const now = Date.now();
          if (!proposalLibraryCache.current.proposals || now - proposalLibraryCache.current.fetchedAt > 120000) {
            // Get starred reference IDs from KV store
            let refIdList = [];
            try {
              const refData = await kvGet("proposal_references");
              refIdList = Array.isArray(refData) ? refData : (refData?.value || []);
            } catch { /* no references set */ }

            const withText = [];
            if (refIdList.length > 0) {
              // Fetch full text for starred proposals only (up to 3)
              for (const id of refIdList) {
                try {
                  const full = await getUploadFull(id);
                  if (full?.extracted_text) {
                    withText.push({ name: full.original_name, text: full.extracted_text });
                  }
                } catch { /* skip failed fetches */ }
                if (withText.length >= 50) break;
              }
            }
            proposalLibraryCache.current = { proposals: withText, fetchedAt: now };
          }
          // Also pull in-app draft references — grants the team has marked as
          // good examples via the "Use as AI reference" toggle on closed grants.
          let inAppRefs = [];
          try {
            const grantRefData = await kvGet("proposal_grant_references");
            const grantRefIds = Array.isArray(grantRefData) ? grantRefData : (grantRefData?.value || []);
            if (grantRefIds.length > 0 && Array.isArray(grants)) {
              for (const gid of grantRefIds) {
                const g = grants.find(x => x.id === gid);
                if (!g) continue;
                // Prefer aiSections (assembled), fall back to aiDraft
                let text = "";
                if (g.aiSections) {
                  text = Object.values(g.aiSections).map(s => s?.text || "").filter(Boolean).join("\n\n");
                }
                if (!text && g.aiDraft) text = g.aiDraft;
                if (text && text.length > 200) {
                  const outcomeTag = g.stage === "won" ? "WON" : g.stage === "lost" ? "LOST" : g.stage?.toUpperCase() || "DRAFT";
                  inAppRefs.push({ name: `${g.funder || "Funder"} — ${g.name || "Untitled"} [${outcomeTag}]`, text });
                }
                if (inAppRefs.length >= 4) break;
              }
            }
          } catch { /* in-app refs are non-blocking */ }

          const allRefs = [...(proposalLibraryCache.current.proposals || []), ...inAppRefs];
          if (allRefs.length > 0) {
            const proposalBudget = Math.min(6000, remaining - 200);
            const parts = ["=== REFERENCE PROPOSALS (starred by the team as examples of good proposals — match their quality) ===",
              "Study these proposals carefully. Match their tone, specificity, structure, and voice when writing the new proposal. Pay attention to how they open, how they frame budgets, how they tell the org story, and how they close. WON proposals show what works; LOST proposals show what to avoid repeating."];
            let budget = proposalBudget;
            for (const p of allRefs) {
              if (budget <= 0) break;
              const excerpt = p.text.slice(0, Math.min(2500, budget));
              parts.push(`[Reference: ${p.name}]\n${excerpt}`);
              budget -= excerpt.length;
            }
            if (parts.length > 2) {
              const block = "\n\n" + parts.join("\n\n");
              orgCtx += block;
              remaining -= block.length;
            }
          }
        } catch (e) { console.warn('[useAI] reference proposal injection failed:', e?.message); /* non-blocking */ }
      }

      // Org-level knowledge base (fills remaining space)
      if (uploads.org_uploads?.length && remaining > 200) {
        const orgDocBudget = Math.min(isDraftType ? 2000 : 1500, remaining - 100);
        const parts = ["=== ORG KNOWLEDGE BASE ==="];
        let budget = orgDocBudget;
        for (const u of uploads.org_uploads) {
          if (budget <= 0) break;
          if (!u.extracted_text) continue;
          const text = u.extracted_text.slice(0, Math.min(4000, budget));
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

    // Anti-hallucination instruction — added to every prompt type (now in ../prompts/lib)
    const factGuard = FACT_GUARD;

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
${bt.includeOrgContribution ? `30% organisational contribution to core operating costs (ADDED to the ask — NOT a deduction; do NOT write "less 30%" or treat as a discount): R${(bt.totalOrgContribution || (bt.orgContribution || 0) * btYears).toLocaleString()}${btYears > 1 ? ` over ${btYears} years (R${(bt.orgContribution || 0).toLocaleString()}/year)` : ""}\n` : ""}${btYears > 1 ? `Annual total (including org contribution): R${(bt.annualTotal || bt.total / btYears).toLocaleString()}\n` : ""}TOTAL ASK${btYears > 1 ? ` (${btYears}-YEAR)` : ""}: R${bt.total.toLocaleString()} (this is the full amount requested from the funder, inclusive of the 30% org contribution) | Per student: R${bt.perStudent.toLocaleString()}` }
      : detectedPt
        ? { perStudent: detectedPt.perStudent, total: detectedPt.cost, typeLabel: detectedPt.label,
            students: detectedPt.students, cohorts: 1, duration: detectedPt.duration,
            block: `PROGRAMME TYPE (detected): ${detectedPt.label}
Students: ${detectedPt.students || "varies"} | Duration: ${detectedPt.duration}
Cost: R${(detectedPt.cost||0).toLocaleString()} | Per student: R${detectedPt.perStudent.toLocaleString()}` }
        : null;
    const perStudentStr = budgetInfo ? `R${budgetInfo.perStudent.toLocaleString()}` : "[per-student cost from budget]";
    const costHook = budgetInfo
      ? `"For ${perStudentStr} per student, ${orgName} delivers a fully accredited programme lasting ${budgetInfo.duration || "nine months"} — a fraction of the cost of youth unemployment."`
      : `"${orgName} delivers accredited professional development at a fraction of the cost of youth unemployment."`;

    const ctx = { type, grant, orgName, orgCtx, factGuard, budgetInfo, perStudentStr, costHook, priorResearch, priorFitScore, grants, team, stages };
    const dispatch = async (b) => (b && b.result !== undefined) ? b.result : await api(b.system, b.user, b.search, b.maxTokens);

    if (type === "draft") return dispatch(buildDraftPrompt(ctx));
    if (type === "sectionDraft") return dispatch(buildSectionDraftPrompt(ctx));
    if (type === "conceptNote") return dispatch(buildConceptNotePrompt(ctx));
    if (type === "research") return dispatch(buildResearchPrompt(ctx));
    if (type === "followup") return dispatch(buildFollowupPrompt(ctx));
    if (type === "extractRequiredDocs") return dispatch(buildExtractRequiredDocs(ctx));
    if (type === "extractEmailFeedback") return dispatch(buildExtractEmailFeedback(ctx));
    if (type === "extractNotes") return dispatch(buildExtractNotes(ctx));
    if (type === "fitscore") return dispatch(buildFitScorePrompt(ctx));
    if (type === "brief") return dispatch(buildBriefPrompt(ctx));
    if (type === "winloss") return dispatch(buildWinLossPrompt(ctx));
    if (type === "fetchFunderBrief") return dispatch(buildFetchFunderBrief(ctx));
    if (type === "findApplyUrl") return dispatch(buildFindApplyUrl(ctx));
    if (type === "urlextract") return dispatch(buildUrlExtractPrompt(ctx));
    if (type === "report") return dispatch(buildReportPrompt(ctx));
    if (type === "insights" || type === "strategy") return dispatch(buildInsightsOrStrategyPrompt(ctx));
    return "Unknown AI action";
  };

  const clearUploadsCache = (grantId) => {
    if (grantId) {
      delete uploadsCache.current[grantId];
    } else {
      uploadsCache.current = {};
    }
  };

  return { runAI, clearUploadsCache };
}
