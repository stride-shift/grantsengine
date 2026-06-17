import { useRef } from "react";
import { parseStructuredResearch, dL, effectiveAsk } from "../utils";
import { funderStrategy, isFunderReturning, detectType, PTYPES } from "../data/funderStrategy";
import { api, getUploadsContext, getUploadsByCategory, getUploadFull, kvGet } from "../api";
import { getWritingLearnings } from "../editLearner";

export default function useAI({ org, profile, team, grants, stages }) {
  const uploadsCache = useRef({});
  const learningsCache = useRef({ text: null, fetchedAt: 0 });
  const proposalLibraryCache = useRef({ proposals: null, fetchedAt: 0 });

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

    // Anti-hallucination instruction — added to every prompt type
    const factGuard = `\n\nCRITICAL ACCURACY RULES — ZERO TOLERANCE FOR FABRICATION:

SOURCE-OF-TRUTH HIERARCHY (in order):
1. The grant data passed in the user message (funder, ask, deadline, notes, focus, funderFeedback)
2. The funder brief and any uploaded documents in the context
3. The organisation context (programmes, impact stats, alumni)
ANYTHING NOT IN THESE SOURCES IS NOT A FACT. Do not invent.

NEVER FABRICATE:
- Deadlines or submission dates not in the grant data — if no deadline is provided, write "[Deadline: TBC]" or omit the date entirely. NEVER guess "by end of Q2" or "before 30 June" or similar plausible-sounding dates.
- Funder priorities, preferences, or strategic focus areas — if you don't have the funder's own words from research or uploaded docs, write generically (e.g. "aligns with their stated focus on skills development") rather than inventing specifics.
- Monetary amounts beyond the confirmed ask and programme costs. Sub-budgets, sub-totals, and percentage allocations must add up to the SAME total ask. If a number isn't derivable from the budget block, mark it "[TBC]".
- Programme details, cohort sizes, durations, or accreditation claims not in the org context.
- Statistics, completion rates, or employment rates other than the exact verified numbers in the context.
- Names of individuals beyond those explicitly listed in the context.

WHEN A FACT IS UNAVAILABLE, USE THESE LABELS:
- Date: "[Deadline: TBC]"  /  Amount: "[Amount: TBC]"  /  Programme detail: "[To be confirmed with funder]"
- It is BETTER to write "[TBC]" than to write a plausible-sounding fabrication. A reviewer can fix TBCs. They cannot un-trust an invented number.

DERIVED VS PROVIDED:
- "Provided" data (from context/grant/budget) must appear exactly as given — no rephrasing of numbers, no rounding, no shifting decimals.
- "Derived" data (calculated from provided data) must be mathematically consistent across the document. Per-student cost = total ÷ students. If you can't show the math, don't write the number.

TEAM/STAFF:
- Do NOT name directors individually — refer to "the directors", "programme management and ops team", or "the leadership team".

WHAT YOU MAY DO:
- Creatively design programme structures, propose new combinations of the organisation's components, and scale up delivery models — but ground everything in the organisation's real capabilities and cost structures.
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

    if (type === "draft") {
      const fs = funderStrategy(grant);
      // Use structured research if available, fall back to raw text
      const structuredRes = grant.aiResearchStructured || parseStructuredResearch(priorResearch || grant.aiResearch);
      const rawResearch = priorResearch || grant.aiResearch;
      const researchText = structuredRes ? getResearchForDraft(structuredRes, 2500) : rawResearch ? rawResearch.slice(0, 3000) : "";
      const researchBlock = researchText
        ? `\n\n=== FUNDER INTELLIGENCE (from prior research) ===\n${researchText}`
        : "";
      const fitScoreBlock = (priorFitScore || grant.aiFitscore)
        ? `\n\n=== FIT SCORE ANALYSIS ===\n${(priorFitScore || grant.aiFitscore).slice(0, 2000)}`
        : "";
      const relNote = fs.returning
        ? `RETURNING FUNDER — this is a partner renewing, not a stranger. Reference the existing relationship with specifics:\n${fs.hook}\nFrame as continuity and deepening, not a new pitch. Show what their previous investment built and what comes next.`
        : `NEW FUNDER — relationship is "${grant.rel || "Cold"}". Make it easy to say yes to a first conversation.`;

      // Detect what's missing from this grant so the AI can call those out
      // explicitly in the Assumptions section instead of fabricating to fill gaps.
      const missingFields = [];
      if (!grant.deadline) missingFields.push("submission deadline not on record");
      if (!grant.funderBudget || grant.funderBudget <= 0) missingFields.push("funder's typical grant size unknown");
      if (!grant.aiResearch) missingFields.push("no prior research on this funder");
      if (!grant.funderBrief) missingFields.push("no funder brief documented");
      if (!grant.geo || grant.geo.length === 0) missingFields.push("funder's geographic preferences unconfirmed");
      if (!grant.focus || grant.focus.length === 0) missingFields.push("funder's stated focus areas unconfirmed");
      if (grant.rel === "Cold" || !grant.rel) missingFields.push("no existing relationship with this funder");
      const assumptionsNote = missingFields.length > 0
        ? `\nASSUMPTIONS — KNOWN GAPS (these MUST appear in the Assumptions section, each as a specific bullet stating what was assumed and why):\n${missingFields.map(m => `- ${m}`).join("\n")}\n\nFor each gap, the Assumptions section must:\n1. State the assumption explicitly ("We have assumed X because Y").\n2. Flag the assumption as something that can be confirmed with the funder.\n3. NOT pretend the info is known — better to surface uncertainty than to fabricate.`
        : "";
      return await api(
        `You write funding proposals for ${orgName}. The organisation's full context — mission, programmes, outcomes, alumni stories, tools, and delivery model — is provided in the user message below. Use that context as your source of truth.

RULE #1 — NEVER FABRICATE NAMES. The ONLY real alumni you may reference by name are: Siphumezo Adam, Simanye Mdunyelwa, Prieska Mofokeng. The ONLY employer testimonial is from Michelle Adler (forgood). Do NOT invent any other names. For additional examples, use unnamed descriptions like "a graduate from the 2024 cohort".

RULE #2 — NEVER USE THESE WORDS TO OPEN ANY SENTENCE: "Imagine", "Picture", "Consider", "Think of", "Meet", "What if", "Close your eyes". These are BANNED. Start every sentence with something real and concrete — a fact, a name, a number, a direct statement. This rule applies to EVERY section, EVERY paragraph.

RULE #3 — NEVER CHANGE THE ASK AMOUNT. ${budgetInfo ? `The total funding request is R${budgetInfo.total.toLocaleString()}. This is for ${budgetInfo.students} students across ${budgetInfo.cohorts} cohort(s)${budgetInfo.years > 1 ? ` over ${budgetInfo.years} years` : ""}. The per-student cost is ${perStudentStr}. Do NOT propose additional cohorts, extra years, or inflate the total beyond R${budgetInfo.total.toLocaleString()}. Every mention of the ask amount, budget total, and per-student cost in the proposal MUST match these exact figures.` : grant.ask > 0 ? `The total funding request is R${grant.ask.toLocaleString()}. Do NOT propose a different amount. Every mention of the ask amount in the proposal MUST match this figure.` : "Match the ask to the funder's typical grant size and the organisation's programme costs."}

RULE #4 — ASK SIZING BY RELATIONSHIP. ${grant.rel === "Cold" || grant.rel === "Networking" ? `This funder relationship is "${grant.rel}". The ask MUST be proportionate to a FIRST engagement — typically 1-2 cohorts, 1 year, under R3M. Do NOT propose multi-year, multi-million rand asks to funders with no relationship history. Frame as a "proof engagement" with the option to scale after demonstrated outcomes. Build trust first, then scale.` : grant.rel === "Previous Funder" || grant.rel === "Warm Intro" ? `This funder relationship is "${grant.rel}". The ask can be more ambitious, but still proportionate to the relationship depth.` : ""}

RULE #5 — BUDGET-ONLY CONTENT. Every programme, initiative, or scale claim in the proposal MUST be covered in the budget. Do NOT describe aspirational scale (e.g., "reaching 5,000 learners across 20 schools" or "deploying to entire school districts") unless it is explicitly budgeted and being proposed. Unbudgeted aspirations undermine credibility with sophisticated funders. If it's not in the budget, it's not in the proposal.

RULE #6 — PER-STUDENT COST CONSISTENCY. The per-student cost must be consistent everywhere in the proposal. Calculate it ONCE as [total ask ÷ total students]. Use that EXACT figure in the cover letter, executive summary, budget section, and any other mention. Inconsistent per-student costs (e.g., R61,800 in one place and R111,800 in another) are a credibility-destroying error.

RULE #7 — PROGRAMME DESCRIPTION ONCE. The full programme structure (6 phases, 4 pillars, curriculum detail) should be described in detail in ONE section only (typically "Programme Details" or "Our Approach"). All other sections may reference specific elements but must NOT repeat the full structure. If "Our Approach" describes the 6 phases, "Evidence of Impact" should reference outcomes FROM those phases, not re-describe them. Similarly, AI tools should be introduced in detail ONCE — other sections reference them by name without re-explaining.

VOICE — maintain in EVERY section, not just the opening:
- Warm, human, confident. A founder who KNOWS this works, offering a funder the chance to back something real.
- Write like a person, not a grant machine. Emotion comes from specificity, not adjectives.
- Use the organisation's REAL alumni stories from the context below. Use each story ONCE — never repeat it across sections.
- Use any employer testimonials from the context as proof of graduate quality — once.
- Vary sentence length. Short punchy sentences land harder after longer ones.
- The tone: "We built something that works. Here's the proof. Here's what your investment makes possible."
- CRITICAL: Sustain narrative energy through the ENTIRE proposal. Do NOT switch to bureaucratic grant-speak after the opening. Every section should feel alive.

FRAMING: Frame the organisation as a SYSTEM — reference its programme types, delivery model, tools, clients, and revenue streams from the context. This isn't a charity asking for help. It's an engine asking for fuel.

SCALE THROUGH TECHNOLOGY — if the organisation has proprietary tools or technology described in the context, this is a key differentiator:
- Reference the specific tools by name from the context. Explain how they change the economics of delivery.
- If technology enables quality at scale, lean into this as a headline differentiator.

COVER EMAIL: Subject line + 5-8 sentence body. Open with a specific, compelling hook — NOT "I am writing to submit..." Open with the human impact or the opportunity. One proof point. Close with a low-friction next step. Sign off as the director (do NOT name them — just "Director, ${orgName}").

DOCUMENT STRUCTURE — STRICT, NO ORPHAN SECTIONS:
1. Cover email (subject line + body + sign-off).
2. Separator line.
3. "PROPOSAL" heading.
4. (If proposal >4 pages / ~2000 words) Table of Contents listing every section number and title.
5. "Executive Summary" — see Beethoven's Fifth below.
6. Body sections in the funder-appropriate order (listed below).
7. "Assumptions" section listing any assumptions made where the funder brief was silent (at minimum one bullet — "None identified" is acceptable only if the brief was fully prescriptive).
8. Final section MUST be impact-focused (not "Appendices", not "Budget"). The reader's last impression is what your money builds, not what paperwork is attached. Appendices come AFTER the impact close as a separate listing.

NEVER insert a section, paragraph, or intro line between the cover email sign-off and the "PROPOSAL" heading. NEVER insert anything between the "PROPOSAL" heading and the Executive Summary (or TOC if used).

EXECUTIVE SUMMARY — BEETHOVEN'S FIFTH (200-300 words, exactly 5 elements in this order, no others):
1. WHO WE ARE — one sentence naming ${orgName} and the system you run (programme types, scale, geography).
2. WHAT WE DO — one to two sentences on the delivery model, in concrete terms (cohort size, duration, outcomes-per-rand).
3. WHAT WE'RE ASKING FOR — one sentence stating the specific programme, scope, and cohort count being proposed.
4. HOW MUCH — one sentence with the exact ask amount (the same number that appears in the budget table — see RULE #3).
5. IMPACT — two to three sentences with specific outcomes the funder's investment unlocks (number of learners, completion rate, employment outcome). End on a forward-looking line.

Every element must be specific. The Executive Summary is the only part many readers will read in full — earn the rest of the proposal.

VARIED OPENINGS — CRITICAL:
- Every proposal must have a UNIQUE opening that is specifically crafted for THIS funder, THIS grant, THIS moment. Do NOT recycle the same narrative structure across grants.
- The opening paragraph is the most important paragraph. It must earn the next paragraph. Vary your technique:
  * Lead with a single student's story from the context (a transformation moment, a before/after)
  * Lead with a striking data point that reframes the problem (${costHook})
  * Lead with the funder's own stated mission and show how ${orgName} is already doing what they want to fund
  * Lead with a provocation or question relevant to the organisation's mission
  * Lead with a very specific, concrete scene (the first morning of a new cohort, the moment a student ships their first project)
  * Lead with the scale of what's possible — use real outcomes data from the context
- The cover email opening and the proposal executive summary opening should use DIFFERENT hooks — don't repeat yourself.
- If the grant notes mention a specific programme, theme, or context, use THAT as your opening anchor — not a generic pitch.

PROPOSAL STRUCTURE (follow this funder-appropriate order):
${fs.structure.map((s, i) => `${i + 1}. ${s}`).join("\n")}

DEPTH — this is critical. Write a SUBSTANTIVE proposal, not a skeleton:
- Each section must be 2-4 rich paragraphs, not bullet lists or single paragraphs.
- The Executive Summary alone should be 200-300 words — a compelling standalone case.
- Programme sections should describe the actual week-by-week or phase-by-phase journey: what happens on Day 1, what tools they use, what the coaching looks like. Be concrete and factual — the reader should understand exactly what ${orgName} delivers.
- Impact sections should weave numbers INTO narrative — not just "X% employment rate" but woven into stories and specifics.
- Budget section MUST include a markdown table: | Line Item | Detail | Amount | with all line items, per-student cost, and total. Wrap the table in 1-2 sentences of value narrative before and after.
- ANY costing, financial breakdown, or quantitative line-item list anywhere in the proposal MUST be presented as a markdown table — never as inline prose like "R516,000 for stipends and R720,000 for laptops". Tables are mandatory for: line-item budgets, cost-per-cohort summaries, multi-year totals, B-BBEE points calculations, and any other numeric breakdown.

VISUAL STAT CALLOUTS — use these to surface 2-4 headline impact numbers per proposal so they aren't buried in prose. Syntax (the system renders them as visual cards):
[STAT: <number> | <one-line context>]
Examples:
[STAT: 92% | Programme completion rate vs 55% sector average]
[STAT: 85% | Employment within 3 months of graduation]
[STAT: R25,800 | Cost per learner — full nine-month programme]
Place a row of 2-3 STAT callouts on their own line (no other text on that line) in: the Executive Summary, the Impact / Evidence section, and the Programme overview. Use real numbers from the organisation context — NEVER invent stats for the callouts. Do NOT overuse them — 5-8 total across the whole proposal is the maximum.
- Include specific organisational details from the context that bring it to life: tools, coaching model, delivery structure, accreditation pathway.
- If the funder type expects compliance sections (SETA alignment, B-BBEE, M&E frameworks), write those with EQUAL depth — but still with narrative warmth.
- CRITICAL: Every section must open DIFFERENTLY. Do not start two sections with the same narrative device. Vary between: data points, direct statements, outcome proof, funder mission alignment, programme specifics.

FUNDER ANGLE: Lead with "${fs.lead}"
OPENING HOOK: ${fs.hook}
USE THEIR LANGUAGE: ${fs.lang}
${relNote}
${assumptionsNote}
${budgetInfo ? `\n${budgetInfo.block}` : ""}
${fs.mc ? `MULTI-COHORT: ${fs.mc.count} cohorts requested` : ""}

UPLOADED DOCUMENTS — if GRANT DOCUMENTS appear in the context below, they are the funder's RFP, application form, or guidelines. You MUST:
- Structure your response to directly answer THEIR questions in THEIR order
- Use THEIR terminology and framing (mirror their language)
- Address every requirement they specify — don't skip sections they ask for
- If they provide word limits, scoring criteria, or specific questions, treat those as the primary framework
- ${orgName}'s content fills THEIR structure, not the other way around

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
- "catalytic investment" / "catalytic funding" / "powerful, evidence-based opportunity"
- "fostering a generation" / "digitally empowered" / "drive systemic change" (when used as filler without specifics)
These phrases are AUTOMATIC FAILURES. Do not use them or any close variation. Use PLAIN, SPECIFIC language instead. Every sentence must carry a number, a name, or a specific mechanism. If it doesn't, rewrite it.

ANTI-REPETITION — critical:
- NEVER open two sections with the same narrative device. If one opens with a story, the next must open with data, a direct statement, or the funder's own mission.
- NEVER reuse an alumni story, statistic, or proof point that already appeared in another section.
- NEVER repeat the same adjectives, sentence structures, or transitional phrases across sections.
- NEVER pad with development-sector jargon. Every sentence must be specific to ${orgName}.
- NEVER name staff in the narrative. Do NOT name any team member.
- NEVER describe the full programme structure more than once. If one section describes the 6 phases, other sections reference them without re-describing.
- NEVER re-explain how AI tools work in multiple sections. Introduce in detail once, reference by name thereafter.

ADDITIONAL RULES:
- If the organisation builds its own tools (per context), do NOT include third-party AI tool costs in budgets. Use "AI platform & tools (proprietary)" instead.
- NEVER mention directors or staff by name — refer to "the leadership team" or "programme management and ops team"
- Do NOT invent budget figures or statistics not in the context
- LEAD WITH SOLUTION, NOT PROBLEM. Do not open any section with generic problem statements about unemployment, skills gaps, or youth crisis. Open with what ${orgName} does and the evidence it works. The reader already knows the problem.
- Do NOT write thin, skeletal sections — this is a REAL proposal, not an outline
- Do NOT switch to cold, institutional tone after the opening — sustain warmth throughout${priorResearch ? "\nUse the funder intelligence below to tailor tone and emphasis." : ""}${priorFitScore || grant.aiFitscore ? "\nIMPORTANT: A fit score analysis is included below. Use it strategically — lean into the STRENGTHS it identifies, directly address any GAPS or RISKS it flags (turn weaknesses into narrative strengths where possible), and match the emphasis to the alignment areas scored highest." : ""}

BUDGET-ASK CONSISTENCY — THE MOST COMMON ERROR:
The total amount in your budget table, the amount in the budget narrative, and the RECOMMENDED_ASK MUST all be the SAME number. ${budgetInfo ? `The confirmed total is R${budgetInfo.total.toLocaleString()}. Use this exact figure everywhere.` : grant.ask > 0 ? `The confirmed ask is R${grant.ask.toLocaleString()}. Use this exact figure everywhere.` : ""}

ASK RECOMMENDATION — CRITICAL:
At the very END of your proposal (after all sections), include these three structured lines on their own lines. The system parses them to set the grant ask + show your reasoning:
RECOMMENDED_ASK: R[total amount as integer with no commas or spaces]
ASK_YEARS: [number of years over which this amount runs — 1 if single year]
ASK_REASONING: [1-3 sentences explaining how you arrived at this amount — what scope it funds, why it fits this funder, and what the per-unit logic is. Be concrete and specific to this funder + this organisation. Do NOT reference internal programme type taxonomies — explain in plain terms (e.g. "Funds 60 learners across 2 cohorts over 9 months at R~21k per learner — sits inside the funder's typical R1-2M skills bracket and matches their preferred 9-month intervention length").]
${budgetInfo ? `The ask MUST be R${budgetInfo.total.toLocaleString()}. Do NOT change this amount.` : ""}${factGuard}`,
        `Organisation:\n${orgCtx}\n\nGrant: ${grant.name}\nFunder: ${grant.funder}\nType: ${grant.type}\n${grant.ask > 0 ? `Ask: R${grant.ask.toLocaleString()}` : `Funder Budget: R${(grant.funderBudget || 0).toLocaleString()} — recommend the best programme type and calculate the right ask`}\nFocus: ${(Array.isArray(grant.focus) ? grant.focus : []).join(", ")}\nNotes: ${grant.notes || "None"}${grant.funderBrief ? `\n\n=== FUNDER BRIEF (PRIMARY SOURCE OF TRUTH — paste from funder verbatim) ===\n${grant.funderBrief}\nCRITICAL: This is the funder's own words. Mirror their language, answer every question they ask, and respect every constraint they specify (deadlines, page limits, eligibility, themes). If anything in this brief contradicts other context, the brief wins. Do NOT introduce facts, dates, or programme details that are not in this brief, the grant data, or the organisation context.` : ""}${grant.funderFeedback ? `\n\n=== FUNDER FEEDBACK (from previous application) ===\n${grant.funderFeedback}\nCRITICAL: This is real feedback from the funder. Address every concern raised. If they said the budget was too high, adjust. If they wanted more evidence, provide it. This feedback is your most important input.` : ""}${researchBlock}${fitScoreBlock}`,
        false, 5000
      );
    }
    if (type === "sectionDraft") {
      // Section-by-section proposal generation — full strategic depth per section
      const { sectionName, sectionIndex, totalSections, allSections, completedSections, customInstructions } = priorResearch || {};
      const fs = funderStrategy(grant);
      // Use structured research for section-specific injection, fall back to raw text
      const rawResearch = priorFitScore?.research || grant.aiResearch;
      const structuredRes = grant.aiResearchStructured || parseStructuredResearch(rawResearch);
      const researchText = structuredRes
        ? getResearchForSection(structuredRes, sectionName, 2000)
        : rawResearch ? rawResearch.slice(0, 2500) : "";
      const researchBlock = researchText
        ? `\n\n=== FUNDER INTELLIGENCE (tailored for ${sectionName}) ===\n${researchText}`
        : "";
      const fitBlock = (priorFitScore?.fitscore || grant.aiFitscore)
        ? `\n\n=== FIT SCORE ===\n${(priorFitScore?.fitscore || grant.aiFitscore).slice(0, 1500)}`
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
      const isAppendix = sn.includes("appendix") || sn.includes("appendices");
      const isImpact = sn.includes("impact") || sn.includes("outcome") || sn.includes("evidence");
      const isProgramme = sn.includes("programme") || sn.includes("program") || sn.includes("approach") || sn.includes("design") || sn.includes("overview") || sn.includes("innovation") || sn.includes("technology") || sn.includes("ai integration");
      const isScale = sn.includes("scale") || sn.includes("sustainability") || sn.includes("exit");
      const isChallenge = sn.includes("challenge") || sn.includes("problem") || sn.includes("theory of change");

      // ── Word budget: scale section length to total page target ──
      const targetPages = fs.targetPages || 8;
      const totalWords = targetPages * 650; // ~650 words/page for text-heavy proposals (no images, minimal headers)
      const coverWords = 250;
      const execSummaryWords = Math.min(400, Math.round(totalWords * 0.12));
      const budgetWords = 350; // tables are compact
      const appendixWords = 120; // just a checklist
      // Count fixed vs body sections
      const fixedTypes = s => { const l = s.toLowerCase(); return l.includes("cover") || (l.includes("summary") || l.includes("executive")) || l.includes("budget") || l.includes("appendix") || l.includes("appendices"); };
      const sectionList = allSections || [];
      const fixedCount = sectionList.length > 0 ? sectionList.filter(fixedTypes).length : Math.min(4, (totalSections || 6));
      const bodySectionCount = Math.max((totalSections || 6) - fixedCount, 2);
      const bodyWords = totalWords - coverWords - execSummaryWords - budgetWords - appendixWords;
      const perBodySection = Math.max(200, Math.round(bodyWords / Math.max(bodySectionCount, 1)));
      const wordLimit = isCover ? coverWords : isExecSummary ? execSummaryWords : isBudget ? budgetWords : isAppendix ? appendixWords : perBodySection;
      const promptWords = Math.round(wordLimit * 1.15); // small headroom — OpenAI tracks word targets reasonably well
      const minParas = wordLimit < 250 ? 2 : wordLimit < 400 ? 3 : wordLimit < 600 ? 4 : 5;
      const paraGuide = `EXACTLY ${minParas} paragraphs, each paragraph MUST be 80-120 words (${minParas * 100} words total). Count your paragraphs before finishing.`;

      // Section-specific depth guidance — rich, strategic blocks per section type
      let sectionGuide = "";

      if (isCover) {
        sectionGuide = `COVER EMAIL INSTRUCTIONS:
Subject line + 5-8 sentence body. Open with a specific, compelling hook — NOT "I am writing to submit..." and NOT "Imagine..." Open with human impact or the opportunity. One proof point. Close with a low-friction next step. Sign off as "Director, ${orgName}" (do NOT name them).

END CLEANLY: The cover email ends with the sign-off — nothing else. Do NOT add a P.S., a teaser line, an "Executive Summary follows" note, or any bridging paragraph. The next section is a separate document that begins on its own.

OPENING HOOK: ${fs.hook}

OPENING TECHNIQUE — choose ONE (whichever fits this funder best):
- A real student/beneficiary outcome from the organisation context
- A striking cost comparison (${costHook})
- The funder's own stated mission, connected directly to ${orgName}'s work
- A provocative question relevant to the organisation's mission
- A concrete result using real outcomes data from the context
NEVER open with "Imagine..." or scene-setting invitations. Start with something real.`;

      } else if (isExecSummary) {
        sectionGuide = `EXECUTIVE SUMMARY — BEETHOVEN'S FIFTH STRUCTURE (~${wordLimit} words):

Cover exactly these 5 elements in this order — no others:
1. WHO WE ARE — one sentence naming ${orgName} and the system it runs (programme types, scale, geography).
2. WHAT WE DO — one to two sentences on the delivery model in concrete terms (cohort size, duration, outcomes-per-rand).
3. WHAT WE'RE ASKING FOR — one sentence stating the specific programme, scope, and cohort count being proposed.
4. HOW MUCH — one sentence with the exact ask amount${budgetInfo ? ` (R${budgetInfo.total?.toLocaleString()})` : ""}, matching the budget table exactly.
5. IMPACT — two to three sentences with specific outcomes the funder's investment unlocks (number of learners, completion rate, employment outcome). End on a forward-looking line about what comes next.

Every element must be specific. This is the only section many readers will read in full — earn the rest of the proposal.

Use a DIFFERENT hook from the cover letter — check the ALREADY-WRITTEN SECTIONS and do NOT repeat the same opening device or story.

OPENING — choose ONE technique that is DIFFERENT from the cover letter:
- A striking data point that reframes the problem
- A bold claim about the organisation's model from the context
- The funder's own stated priority, connected directly to ${orgName}'s work
- A concrete outcome using real impact data from the context
NEVER open with "Imagine..." or "Picture..." or any invitation to hypothesise.

FRAMING: Frame ${orgName} as a SYSTEM — reference its programme types, delivery model, tools, clients, and revenue streams from the context. This isn't a charity asking for help. It's an engine asking for fuel.`;

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

${budgetInfo ? `${budgetInfo.block}\nCRITICAL: The budget above is the CONFIRMED, FINAL budget. Use these EXACT line items and amounts. Do NOT add cohorts, years, or inflate the total beyond what is shown above. The total ask MUST be R${budgetInfo.total?.toLocaleString()}. Any deviation is an error.\n` : ""}
${structuredRes?.budgetRange ? `FUNDER BUDGET INTELLIGENCE (from research): ${structuredRes.budgetRange}\n` : ""}
After the table, weave the numbers into narrative: "For ${perStudentStr} per student — less than a semester at most private colleges — a young person receives ${budgetInfo?.duration || "9 months"} of daily coaching, enterprise software access, ICITP accreditation, and a career launchpad."

ASK RECOMMENDATION — include these three structured lines at the VERY END, each on its own line. The system parses them:
RECOMMENDED_ASK: R[total amount as integer with no commas or spaces]
ASK_YEARS: [number of years — 1 if single year]
ASK_REASONING: [1-3 sentences explaining how you arrived at this amount — scope, fit with funder, per-unit logic. Plain language, no internal taxonomies.]
Example:
RECOMMENDED_ASK: R2472000
ASK_YEARS: 1
ASK_REASONING: Funds two cohorts of 20 learners each over 9 months at roughly R62k per learner. Sits inside this funder's typical R2-3M skills bracket and matches their preference for measurable employment outcomes within 12 months.`;

      } else if (isProgramme) {
        sectionGuide = `PROGRAMME SECTION INSTRUCTIONS:
Open with a direct, concrete statement about the programme — NOT "imagine" or "picture this". For example: "Each cohort begins with a week of digital onboarding..." or "The programme runs in three distinct phases..."

Describe the programme using the phases, pillars, and curriculum structure from the organisation context. Be specific and factual — the reader should understand exactly what ${orgName} delivers.

Describe what actually happens: what tools learners use, what coaching looks like (1:1 and group), what activities and challenges involve. Be concrete — use programme details from the context.

SCALE THROUGH TECHNOLOGY — if the organisation has proprietary tools (per context), reference them by name:
- Explain how each tool changes the economics of delivery
- Show how the coaching model uses technology to maintain quality at scale`;

      } else if (isImpact) {
        sectionGuide = `IMPACT SECTION INSTRUCTIONS:
Open with a striking outcome statement — a concrete result from the context, not a scene-setting invitation. Use real impact stats from the context. Lead with the proof, then unpack the stories behind the numbers.

Weave numbers INTO narrative — don't just list percentages. Make the impact feel human.

Include specific, vivid outcomes — use REAL alumni stories from the organisation context (but check ALREADY-WRITTEN SECTIONS to avoid repeating one already used). Reference real impact stats, placement data, employer testimonials — all from the context.

SCALE THROUGH TECHNOLOGY — the impact multiplier:
- If the organisation has proprietary tools (per context), show how they enable quality at scale.
- Reference any scalable programme elements from the context.`;

      } else if (isScale || isChallenge) {
        sectionGuide = `${isChallenge ? "CHALLENGE/PROBLEM" : "SUSTAINABILITY/SCALE"} SECTION INSTRUCTIONS:
${isChallenge
  ? `CRITICAL: Lead with the SOLUTION, not the problem. Do NOT open with "South Africa has X% unemployment" or any generic problem statement. Open with what ${orgName} does and the specific gap it fills — then briefly contextualise why that gap exists. The reader already knows the problem; they want to see that you've solved it. Frame the challenge through the organisation's unique lens from the context.`
  : `Open with ${orgName}'s business model strength — a statement about sustainability, not a hypothetical. Reference programme types, revenue streams, and delivery model from the context.`}
Write ${paraGuide}. Be specific to the organisation's model from the context, not generic development language.

${isChallenge ? `NEVER lead with the problem. Lead with the solution and the proof. Frame the challenge as "the conversion gap that ${orgName} has already proven it can close."` : ""}

SUSTAINABILITY MODEL — reference from the context:
- Programme types and revenue diversification
- Delivery model and how it enables scale
- Proprietary tools or technology that reduce per-unit costs
- Corporate or earned revenue streams that cross-subsidise community programmes`;

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
          sectionGuide = `APPENDICES — produce a structured list of supporting documents the organisation can provide.

Use the registration numbers, accreditation details, and partner names from the organisation context. Typical documents include: tax exemption certificate, NPO/company registration, accreditation certificates, audited financial statements, board resolution, organogram, B-BBEE certificate, banking confirmation, key personnel CVs, partner letters of support, sample portfolios.

Format as a numbered list with brief descriptions using actual details from the context. Add a closing note: "All documents available on request. Contact [Director, ${orgName}] for additional supporting materials."
Do NOT fabricate document contents or registration numbers — use only what's in the context.`;
        } else if (isBBBEE) {
          sectionGuide = `B-BBEE / TRANSFORMATION section — write with substance, not checkbox compliance.

Reference the organisation's B-BBEE status, beneficiary demographics, and compliance details from the context. Key points:
- B-BBEE contributor level and basis
- Beneficiary demographics and how they qualify for skills development and SED elements
- Corporate funders can claim B-BBEE points for their investment
- The double return: social impact AND regulatory compliance value
- Reference accreditation and SETA alignment where relevant (from context)
Write ${paraGuide} that make B-BBEE value tangible, not bureaucratic.`;
        } else if (isME) {
          sectionGuide = `M&E FRAMEWORK — describe the organisation's actual measurement system from the context.

Reference specific tools, metrics, reporting cadence, and tracking systems described in the organisation context. Include:
- Data systems and what they track
- Key outcome metrics (from the context — use exact numbers)
- Reporting frequency and governance
- Quality assurance mechanisms
- Post-programme tracking
Write ${paraGuide}. Make it clear this is a data-driven organisation, not one that measures attendance and calls it M&E.`;
        } else if (isRisk) {
          sectionGuide = `RISK MANAGEMENT — describe the organisation's actual risk framework from the context.

Reference financial position, delivery model, quality assurance, technology, and governance details from the context. Cover:
- Financial risks and mitigations (reserves, diversification, financial controls)
- Delivery risks (partner model, site-specific risks, attrition)
- Quality assurance mechanisms (accreditation, assessment tools, standards)
- Technology risks (tool dependencies, data privacy)
- Safeguarding considerations
Write ${paraGuide} that show genuine risk awareness, not generic risk matrices.`;
        } else if (isSafeguarding) {
          sectionGuide = `SAFEGUARDING — describe the organisation's safeguarding framework from the context.

Reference specific policies, vetting procedures, data handling, and programme-specific safeguarding measures from the context. Include:
- Staff vetting and background checks
- Reporting protocols
- Data protection and privacy compliance
- Programme-specific considerations (e.g., minors in school programmes)
- Digital safeguarding measures
Write 1-2 focused paragraphs. Be factual and specific.`;
        } else if (isOrgBackground) {
          sectionGuide = `ORGANISATIONAL BACKGROUND — tell ${orgName}'s growth story from the context.

Reference founding date, growth trajectory, governance structure, team, accreditation, and financial track record from the organisation context. Convey:
- The organisation's origin and growth journey
- Team structure and leadership
- Governance and financial controls
- Accreditation and quality credentials
- Financial stewardship (budget discipline, reserves)
Write ${paraGuide} that convey competence and growth trajectory.`;
        } else if (isRegulatory) {
          sectionGuide = `REGULATORY ALIGNMENT — reference ${orgName}'s compliance credentials from the context.

Use the organisation's actual registration numbers, accreditation details, SETA alignment, B-BBEE status, and quality assurance systems from the context. Include all relevant regulatory reference numbers.
Write ${paraGuide} with specific reference numbers and compliance details. Funders who ask for this section want proof, not promises.`;
        } else if (isTimeline) {
          sectionGuide = `IMPLEMENTATION TIMELINE — use ${orgName}'s actual delivery phases from the context.

Map out the programme timeline using the phases, durations, and milestones described in the organisation context. Include setup, delivery phases, and completion stages.
Present as a clear timeline or table. Include key milestones and decision points.`;
        } else if (isBrand) {
          sectionGuide = `BRAND ALIGNMENT & VISIBILITY — what the funder gets:
- Logo placement on cohort materials, certificates, and digital platforms
- Acknowledgement in impact reports and annual review
- Social media recognition across ${orgName}'s channels
- Invitation to showcase events and graduation ceremonies
- Option for branded cohort naming (e.g., "[Funder] Future Leaders Cohort")
- Student project alignment themed around funder's industry or social goals
- Employee volunteering: funder staff as guest speakers, mentors, or industry exposure hosts
Write 1-2 paragraphs focused on GENUINE partnership value, not just logo placement.`;
        } else {
          sectionGuide = `Open with a direct, factual statement relevant to this section's topic — NOT an "imagine" or scene-setting device.
Write ${paraGuide}. Do NOT produce bullet-only content — weave data into narrative.
Be specific about the organisation's actual capabilities from the context. Include specific details where relevant: tools, coaching model, delivery structure, accreditation pathway.`;
        }
      }

      // Token budget: generous to let model fill the space (JSON wrapper ~100 tokens)
      const tokenBudget = Math.max(1000, Math.round(promptWords / 0.75) + 400);

      return await api(
        `You write ONE section of a funding proposal for ${orgName}. The organisation's full context — mission, programmes, outcomes, alumni stories, tools — is provided in the user message below.

SECTION: "${sectionName}" (Section ${sectionIndex + 1} of ${totalSections})

RULE #1 — NEVER FABRICATE NAMES. The ONLY real alumni you may reference by name are: Siphumezo Adam, Simanye Mdunyelwa, Prieska Mofokeng. The ONLY employer testimonial is from Michelle Adler (forgood). Do NOT invent any other names. For additional examples, use unnamed descriptions like "a graduate from the 2024 cohort".

RULE #2 — NEVER USE THESE WORDS TO OPEN ANY SENTENCE: "Imagine", "Picture", "Consider", "Think of", "Meet", "What if", "Close your eyes". These are BANNED. Start every sentence with something real and concrete — a fact, a name, a number, a direct statement.

RULE #3 — NEVER CHANGE THE ASK AMOUNT. ${budgetInfo ? `The total funding request is R${budgetInfo.total.toLocaleString()}. This is for ${budgetInfo.students} students across ${budgetInfo.cohorts} cohort(s)${budgetInfo.years > 1 ? ` over ${budgetInfo.years} years` : ""}. The per-student cost is ${perStudentStr}. Do NOT propose additional cohorts, extra years, or inflate the total. Every mention of the ask amount, budget total, and per-student cost MUST match these exact figures.` : grant.ask > 0 ? `The total funding request is R${grant.ask.toLocaleString()}. Do NOT propose a different amount.` : ""}

RULE #4 — ASK SIZING BY RELATIONSHIP. ${grant.rel === "Cold" || grant.rel === "Networking" ? `Relationship is "${grant.rel}" — frame as a proof engagement, not a long-term commitment. Do NOT propose multi-year asks to cold funders.` : ""}

RULE #5 — BUDGET-ONLY CONTENT. Do NOT describe aspirational scale or programmes that are not in the budget. No "reaching 5,000 learners" or "deploying across 20 schools" unless explicitly budgeted. If it's not in the budget, it doesn't belong in the proposal.

RULE #6 — PER-STUDENT COST CONSISTENCY. Per-student cost is calculated ONCE as [total ÷ students]. Use that EXACT figure everywhere. Never state different per-student costs in different sections.

RULE #7 — PROGRAMME DESCRIPTION ONCE. The full programme structure (phases, pillars, curriculum) should be described in detail in ONE section only. Other sections reference specific elements without repeating the full structure. AI tools: introduced in detail ONCE, referenced by name thereafter.

VOICE — this is the most important instruction:
- Warm, human, confident. A founder who KNOWS this works, offering a funder the chance to back something real.
- Write like a person, not a grant machine. Let the reader feel the energy of what ${orgName} does.
- ALUMNI STORIES — CRITICAL: ONLY use real alumni named in the organisation context. The ONLY real names you may use are: Siphumezo Adam, Simanye Mdunyelwa, Prieska Mofokeng, and Michelle Adler (employer). NEVER invent, fabricate, or create fictional names (no "Thando", "Zanele", "Lindiwe", "Sipho", "Lebo", etc.). If you need more stories than are available, describe the outcome without a name ("one graduate from the 2024 Inkcubeko cohort..."). Use each real story ONCE across the full proposal — if a prior section already used a story, pick a different one or use an unnamed example.
- Be concrete and grounded: real numbers, real programme details. Emotion comes from specificity, not adjectives.
- Vary sentence length. Short punchy sentences land harder after longer ones.
- CRITICAL: The emotive, narrative energy must carry through. Do NOT switch to dry, bureaucratic grant-speak.

${sectionGuide}

PROPOSAL LENGTH: This proposal targets ${targetPages} pages total across ${totalSections} sections.
THIS SECTION: ${paraGuide}
Each paragraph must be a FULL paragraph — not 1-2 sentences. A paragraph is 4-6 sentences minimum.
${wordLimit < 400 ? "Every sentence must earn its place, but USE the full space with evidence and specifics." : wordLimit < 600 ? "Be substantive — fill each paragraph with evidence, programme details, and real outcomes." : "Be thorough — build a detailed, compelling case with evidence, stories, and specifics."}${fs.formatNotes ? `\nFUNDER FORMAT: ${fs.formatNotes}` : ""}
Short sections look under-prepared. Funders want substance and detail.

FUNDER ANGLE: Lead with "${fs.lead}"
USE THEIR LANGUAGE: ${fs.lang}
${relNote}
${budgetInfo ? `\n${budgetInfo.block}` : ""}
${fs.mc ? `MULTI-COHORT: ${fs.mc.count} cohorts requested` : ""}
${customInstructions ? `\nUSER INSTRUCTIONS FOR THIS SECTION: ${customInstructions}` : ""}${fitScoreNote}

UPLOADED DOCUMENTS — if GRANT DOCUMENTS appear in the context below, they are the funder's RFP, application form, or guidelines. Address THEIR specific questions, use THEIR terminology, follow THEIR requested structure. Their requirements are the primary framework — ${orgName}'s content fills it.

BANNED PHRASES — if ANY of these appear in your output, the section fails. Zero tolerance:
- "Imagine a..." / "Picture a..." / "Consider a..." / "Think of a..." / "Meet [name]..." / "What if you could..." / "Close your eyes..."
- "I hope this finds you well" / "I am writing to..." / "We are pleased to..."
- "We believe" / "we are passionate" / "making a difference" / "making an impact" / "changing lives" / "brighter future" / "beacon of hope"
- "catalytic intervention" / "that spark" / "transformative journey" / "holistic approach" / "game-changer" / "game changer"
- "this isn't just X; it's Y" / "not just X — it's Y" (the fake-profound reframe structure)
- "South Africa has X% youth unemployment" or any stat-as-opener that every NPO uses
- "We look forward to partnering" / "we would welcome the opportunity" / "we trust this proposal"
- "empowering" as a verb / "stakeholders" / "leverage" (as a verb) / "synergy" / "paradigm shift"
- "catalytic investment" / "catalytic funding" / "powerful, evidence-based opportunity"
- "fostering a generation" / "digitally empowered" / "drive systemic change" (when used as filler without specifics)
These phrases are AUTOMATIC FAILURES. Use PLAIN, SPECIFIC language instead. Every sentence must carry a number, a name, or a specific mechanism.

ANTI-REPETITION — critical:
- Read the ALREADY-WRITTEN SECTIONS below carefully. Do NOT reuse their opening devices, alumni stories, statistics, or key phrases.
- If a prior section opens with a student story, you MUST use a completely different technique (data point, direct statement, funder's own mission, concrete programme detail).
- Do NOT echo the same adjectives, metaphors, or sentence structures used in prior sections.
- Every section must feel fresh — as if written by the same author but covering genuinely new ground.
- NEVER name staff in the narrative. Do NOT write "Imagine Ayanda welcoming..." or name any team member.
- NEVER re-describe the full programme structure if a prior section already covered it. Reference, don't repeat.
- NEVER re-explain how AI tools work if already introduced in a prior section. Name them, don't re-explain.

ADDITIONAL RULES:
- If the organisation builds its own tools (per context), do NOT include third-party AI tool costs in budgets — use "AI platform & tools (proprietary)"
- NEVER mention directors or staff by name — refer to "the leadership team" or "programme management and ops team"
- LEAD WITH SOLUTION, NOT PROBLEM. Never open any section with generic problem statements. Open with what ${orgName} does and the evidence it works.
- BUDGET-ONLY CONTENT: Do NOT describe aspirational scale or unbudgeted programmes. If it's not funded by this proposal, don't claim it.
- Do NOT invent figures or statistics not in the context — write with substance, not padding${priorFitScore?.research || grant.aiResearch ? "\nUse the funder intelligence below to tailor tone and emphasis." : ""}

Write ONLY the "${sectionName}" section content. No section header — just the content.${factGuard}`,
        `Organisation:\n${orgCtx}\n\nGrant: ${grant.name}\nFunder: ${grant.funder}\nType: ${grant.type}\n${grant.ask > 0 ? `Ask: R${grant.ask.toLocaleString()}` : `Funder Budget: R${(grant.funderBudget || 0).toLocaleString()} — recommend the best programme type and calculate the right ask`}\nFocus: ${(Array.isArray(grant.focus) ? grant.focus : []).join(", ")}\nNotes: ${grant.notes || "None"}${grant.funderBrief ? `\n\n=== FUNDER BRIEF (PRIMARY SOURCE OF TRUTH — paste from funder verbatim) ===\n${grant.funderBrief}\nCRITICAL: Mirror the funder's language. Answer every question they ask. Respect every constraint (deadlines, page limits, eligibility, themes). If anything contradicts other context, the brief wins.` : ""}${grant.funderFeedback ? `\n\n=== FUNDER FEEDBACK (from previous application) ===\n${grant.funderFeedback}\nAddress every concern raised in this feedback.` : ""}${researchBlock}${fitBlock}${priorSummary ? `\n\nALREADY-WRITTEN SECTIONS (read these carefully — do NOT repeat their openings, stories, or statistics):\n${priorSummary}` : ""}`,
        false, tokenBudget
      );
    }
    if (type === "conceptNote") {
      // Phase 8: short pre-proposal pitch — sells the IDEA before any full proposal
      const fs = funderStrategy(grant);
      return await api(
        `You write a concept note for ${orgName}. A concept note is a short, sharp pitch that earns the right to submit a full proposal — typically 1-2 pages, sent before any formal application.

GOAL: Get the funder to say "yes, send us the full proposal." Nothing more. Do not try to close the deal in the concept note.

STRUCTURE — keep it tight. ~500-700 words total. Use these section headers, in this order:

1. WHO WE ARE (50-80 words) — one paragraph naming ${orgName}, the system you run, the scale, and one headline outcome.
2. WHAT WE WANT TO DO (100-150 words) — the specific programme or intervention you're proposing, with cohort size, duration, and concrete delivery model.
3. WHY IT MATTERS (100-150 words) — the gap this closes, anchored on real data from the context. Frame it through the funder's stated priorities if known.
4. WHAT WE NEED FROM YOU (50-80 words) — the ask: amount, what it funds, and what the funder gets back (impact, B-BBEE value, visibility — whatever applies).
5. NEXT STEPS (40-60 words) — propose a 20-minute call to discuss; offer to send the full proposal.

VOICE & RULES — same as the full proposal:
- Warm, human, confident. Specific numbers, not adjectives.
- NEVER fabricate facts. Use the org's real outcomes, alumni, and programme costs only.
- NEVER use "Imagine", "Picture", "Consider" or any scene-setting opener.
- NEVER mention staff by name.
- USE the funder brief verbatim if present — mirror their language.
${grant.funderBrief ? "\nThe FUNDER BRIEF below is the primary source of truth. Anchor your concept on what they explicitly say they want.\n" : ""}
${budgetInfo ? `\nBUDGET: The ask is R${budgetInfo.total.toLocaleString()} for ${budgetInfo.students} students. Use this exact figure.` : ""}

FORMAT: Markdown. Use ## for section headings. Keep paragraphs short — 3-5 sentences each. Optionally include ONE [STAT: value | label] callout in the WHY IT MATTERS section.

Sign off as "Director, ${orgName}".${factGuard}`,
        `Organisation:\n${orgCtx}\n\nGrant: ${grant.name}\nFunder: ${grant.funder}\nType: ${grant.type}\n${grant.ask > 0 ? `Ask: R${grant.ask.toLocaleString()}` : `Funder Budget: R${(grant.funderBudget || 0).toLocaleString()}`}\nFocus: ${(Array.isArray(grant.focus) ? grant.focus : []).join(", ")}\nNotes: ${grant.notes || "None"}${grant.funderBrief ? `\n\n=== FUNDER BRIEF (PRIMARY SOURCE OF TRUTH) ===\n${grant.funderBrief}` : ""}`,
        false, 1800
      );
    }
    if (type === "research") {
      const fs = funderStrategy(grant);
      return await api(
        `You are a funder intelligence analyst for ${orgName}. The organisation's full context — mission, programmes, outcomes — is provided below.

RESEARCH THOROUGHLY — search this funder's website, annual report, CSI report, and recent news.

Return your findings as a JSON object with these fields. Each field should be a concise, information-dense string (not arrays or nested objects). Be specific — names, numbers, dates, not generalities.

{
  "budgetRange": "Their annual CSI/grant spend, typical grant size range, and any caps or minimums",
  "recentGrants": "2-3 specific examples of who they funded recently, for how much, for what purpose",
  "contacts": "Names and titles of CSI/foundation decision-makers, plus best contact method",
  "priorities": "Their stated funding priorities + what their actual funding pattern reveals they really care about",
  "applicationProcess": "Prescribed form or open proposal? Portal or email? Deadlines? Multi-stage? What documents required?",
  "strategy": "What angle ${orgName} should lead with, which programme type to offer, what to emphasise, what to avoid",
  "${fs.returning ? "relationshipLeverage" : "doorOpener"}": "${fs.returning ? "How to use the existing relationship — what to reference from past grants, who to contact, what continuity angle works" : "How to get a first meeting — who to approach, what hook to use, what intro channel"}",
  "rawText": "A full narrative summary of all the above (4-6 paragraphs) suitable for human reading — include all the detail from the other fields woven into flowing text"
}

IMPORTANT: Return ONLY valid JSON. No markdown code fences, no text before or after the JSON object. Every field value must be a string (escape any quotes inside values).

Use uploaded documents for additional context about the organisation. Reference specific programme types and costs from the org profile when discussing fit.${factGuard}`,
        `Organisation context:\n${orgCtx}\n\nFunder: ${grant.funder}\nType: ${grant.type}\nGrant: ${grant.name}\n${grant.ask > 0 ? `Ask: R${grant.ask.toLocaleString()}` : `Funder Budget: ~R${(grant.funderBudget || 0).toLocaleString()} (ask TBD — will be set after proposal)`}\nRelationship: ${grant.rel}${fs.returning ? " (RETURNING FUNDER — existing relationship)" : ""}\nFocus areas: ${(Array.isArray(grant.focus) ? grant.focus : []).join(", ")}${fs.noIntel ? "\n\nNO PRE-EXISTING FUNDER INTELLIGENCE — research from scratch. Build a complete picture." : `\n\n=== EXISTING FUNDER INTELLIGENCE (build on this, don't duplicate) ===\nLead angle: ${fs.lead}\nHook: ${fs.hook}\nRecommended sections: ${(fs.sections || []).join(", ")}\nLanguage register: ${fs.lang}${fs.returning ? "\nStatus: RETURNING FUNDER — look for what the organisation delivered with their previous funding, what outcomes were achieved, and what the continuity angle is." : ""}`}\n\n${grant.notes ? `TEAM INTEL (from grant notes — treat as high-priority context):\n${grant.notes}` : "Notes: None"}${grant.funderFeedback ? `\n\n=== PREVIOUS FUNDER FEEDBACK ===\n${grant.funderFeedback}\nUse this feedback to refine your research — understand what the funder valued or didn't value.` : ""}`,
        true, 3000
      );
    }
    if (type === "followup") {
      const fs = funderStrategy(grant);
      return await api(
        `You write follow-up emails for ${orgName}. The organisation's context is provided below.

VOICE: Professional but human. A confident founder checking in — not a desperate fundraiser chasing. Write like you would to a colleague you respect. No grovelling. No "just following up." This person's inbox is full — give them a reason to keep reading.

REGISTER: ${grant.type === "Government/SETA" ? "Formal, reference compliance, accreditation, and regulatory alignment" : grant.type === "Corporate CSI" ? "Professional and sharp, mention B-BBEE value and brand alignment" : grant.type === "International" ? "Polished and global, reference SDG outcomes and evidence" : "Warm and direct, lead with outcomes and human impact"}

FORMAT:
Subject: [specific, compelling — NOT "Following up on our application"]
[Body — 4-8 sentences max]

The email should:
- Open with context (what was submitted, when) — but make it interesting, not administrative
- Lead with what this funder cares about: "${fs.lead}"
- Include one NEW proof point or update since submission — something that shows momentum. Use real achievements, outcomes, or milestones from the organisation context. Choose the proof point most relevant to THIS funder's priorities.
- Close with a specific, low-friction next step (15-min call, site visit, "happy to send our latest impact data")
- Under 200 words. Every sentence earns its place.
- Sign off as the director (do NOT name them — just "Director, ${orgName}")
${fs.returning ? "- RETURNING FUNDER: This is a partner. Reference the relationship warmly — you have shared history." : "- NEW FUNDER: Be respectful and make it easy to say yes to a conversation. Lower the bar: a call, a coffee, not a commitment."}${factGuard}`,
        `Organisation:\n${orgCtx}\n\nGrant: ${grant.name}\nFunder: ${grant.funder}\nStage: ${grant.stage}\n${grant.ask > 0 ? `Ask: R${grant.ask.toLocaleString()}` : `Funder Budget: ~R${(grant.funderBudget || 0).toLocaleString()}`}\nSubmitted: ${grant.subDate || "Not yet"}\nNotes: ${grant.notes || "None"}`,
        false, 1000
      );
    }
    if (type === "extractRequiredDocs") {
      // Parse the funder brief + research to extract the exact list of documents
      // the funder expects attached. Returns a structured JSON list so the UI
      // can render a checklist.
      const sources = [
        grant.funderBrief ? `=== FUNDER BRIEF ===\n${grant.funderBrief}` : "",
        grant.aiResearch ? `=== RESEARCH ===\n${String(grant.aiResearch).slice(0, 4000)}` : "",
        grant.notes ? `=== TEAM NOTES ===\n${grant.notes}` : "",
      ].filter(Boolean).join("\n\n");
      if (!sources.trim()) return JSON.stringify({ documents: [], note: "No brief or research yet — run Funder Research first." });
      return await api(
        `You extract the list of documents a funder requires for a grant application.

OUTPUT — return ONLY valid JSON (no markdown, no prose), in this exact shape:
{
  "documents": [
    {"name": "Audited Financial Statements", "required": true, "note": "Last 2 years if available"},
    {"name": "PBO Certificate", "required": true, "note": ""},
    {"name": "Board Resolution", "required": false, "note": "Only if requested at next stage"}
  ],
  "summary": "1-2 sentence summary of what the funder wants attached"
}

RULES:
- Only include documents the FUNDER specifically asks for. Do NOT invent based on what's typical.
- If the brief just says "submit a proposal", documents = []. Don't pad.
- Use the funder's exact terms when possible (e.g. "Tax Clearance Certificate" not "tax doc").
- "required: true" only if the funder uses words like "must include", "required", "mandatory". Otherwise "required: false".
- The "note" field is for any condition the funder attached (e.g. "Last 3 years", "signed by director").${factGuard}`,
        sources,
        false, 1200
      );
    }
    if (type === "extractEmailFeedback") {
      // Parse a pasted funder email/response and extract structured feedback.
      // Returns a short, structured summary the team can paste into Funder Feedback.
      // Input passes via grant.notes (re-used as the pasted text payload).
      const pasted = (grant.notes || "").trim();
      if (!pasted || pasted.length < 30) return "Paste the funder's email or response first — at least a few sentences.";
      return await api(
        `You extract structured funder feedback from a pasted email or response. The team will paste this output into the "Funder Feedback" field on the grant, then use it to refine their next attempt.

OUTPUT FORMAT (plain text, exactly these labelled sections — skip a section if the email is silent on it):

OUTCOME: [Awarded / Declined / Deferred / Shortlisted / Needs revision / Acknowledged receipt / Other]

SCORE / RANKING: [If the funder shared a score or where you ranked, capture it. Otherwise omit this section.]

KEY REASONS:
- [reason 1]
- [reason 2]
- [reason 3]

WHAT WORKED:
- [thing the funder explicitly praised]

WHAT DIDN'T:
- [thing the funder flagged as weak / missing / wrong]

REQUESTED CHANGES:
- [specific thing they asked you to change for a resubmission]

NEXT STEPS:
- [what the funder said you should do next]
- [any deadline they mentioned]

CONTACT: [name and email/phone if mentioned in the email]

RULES:
- Quote the funder's own words where possible — don't paraphrase into grant-speak.
- If a section has no content in the email, omit it entirely. Don't write "None" or "N/A".
- Do NOT invent. If the email is short or vague, the output should be short and vague.
- Plain text. No markdown. No introduction. Start directly with OUTCOME:.${factGuard}`,
        `Funder: ${grant.funder}\nGrant: ${grant.name}\n\n=== EMAIL TEXT TO PARSE ===\n${pasted}`,
        false, 900
      );
    }
    if (type === "extractNotes") {
      // Pull useful internal-notes intel from uploaded org docs.
      // The orgCtx already includes uploaded board minutes, past proposals, donor
      // reports, etc. We just need to ask the model to surface anything specific
      // to THIS funder that would be useful in the internal notes field.
      return await api(
        `You are an analyst surfacing strategically useful internal context about a specific funder.

You have access to ${orgName}'s uploaded documents — board minutes, past proposals, donor reports, contact lists, partnership records. Search them for anything relevant to "${grant.funder}".

OUTPUT — concise bullet points (4-8 max), suitable for pasting into an "Internal Notes" field. Each bullet states ONE fact. Examples of what to surface:
- Past interactions ("Met Alison at SAGEA breakfast 2023; warm")
- Decision-makers ("CSI lead is Sipho — Barbara has his number")
- Preferences ("Prefers multi-year commitments; declines AI-only programmes")
- History ("Funded R1.2M in 2022; project closed early due to compliance gap")
- Relationships ("Co-funded with TK Foundation in 2024 — overlap with David's network")
- Avoidances ("Said no last time because budget was unrealistic")

RULES:
- One fact per bullet. No generic statements.
- Cite the source document if helpful (e.g. "[2024 board minutes]").
- If you find NOTHING about this funder in the uploaded docs, output exactly: "No prior intel on ${grant.funder} in uploaded documents." Do not invent.
- Do NOT include public-facing info (annual report stats, etc) — only internal/team context.
- Plain text bullets, no markdown headings.${factGuard}`,
        `Funder: ${grant.funder}\nType: ${grant.type}\nExisting notes (don't repeat these):\n${grant.notes || "None"}\n\nOrganisation context + uploaded documents:\n${orgCtx}`,
        false, 800
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
        `Organisation:\n${orgCtx}\n\nGrant: ${grant.name}\nFunder: ${grant.funder}\nType: ${grant.type}\n${grant.ask > 0 ? `Ask: R${grant.ask.toLocaleString()}` : `Funder Budget: ~R${(grant.funderBudget || 0).toLocaleString()} (ask TBD)`}\nRelationship: ${grant.rel}${fs.returning ? " (RETURNING FUNDER)" : ""}\nFocus: ${(Array.isArray(grant.focus) ? grant.focus : []).join(", ")}\nGeography: ${(Array.isArray(grant.geo) ? grant.geo : grant.geo ? [grant.geo] : []).join(", ") || "National"}\nDeadline: ${grant.deadline || "Rolling"}\nNotes: ${grant.notes || "None"}\n\nFUNDER INTEL: This funder cares about "${fs.lead}". Their language: ${fs.lang}.${fs.returning ? ` ${orgName} is a returning grantee.` : ""}`,
        false, 800
      );
    }
    if (type === "brief") {
      // Single pass to categorise grants for brief
      const overdue = [], urgent = [], drafting = [], submitted = [];
      for (const g of grants) {
        if (g.stage === "drafting") drafting.push(g);
        if (g.stage === "submitted" || g.stage === "awaiting") submitted.push(g);
        if (["won","lost","deferred","archived"].includes(g.stage)) continue;
        const dd = dL(g.deadline);
        if (dd === null) continue;
        if (dd < 0) overdue.push(g);
        else if (dd <= 14) urgent.push(g);
      }
      return await api(
        `You are the grant operations manager for ${orgName}. Produce a daily action list — the 5-8 things that will move the pipeline forward TODAY.

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
Total pipeline: ${grants.filter(g => !["won","lost","deferred","archived"].includes(g.stage)).length} grants, R${grants.filter(g => !["won","lost","deferred","archived"].includes(g.stage)).reduce((s,g) => s+effectiveAsk(g), 0).toLocaleString()}`,
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
        `Organisation:\n${orgCtx}\n\nGrant: ${grant.name}\nFunder: ${grant.funder}\nType: ${grant.type}\nAsk: R${grant.ask?.toLocaleString()}\nRelationship: ${grant.rel}\nFocus: ${(Array.isArray(grant.focus) ? grant.focus : []).join(", ")}\nNotes: ${grant.notes || "None"}\nOutcome: ${outcome}${grant.funderFeedback ? `\n\n=== ACTUAL FUNDER FEEDBACK ===\n${grant.funderFeedback}` : ""}`,
        false, 1000
      );
    }
    if (type === "fetchFunderBrief") {
      // Search the funder's website for an actual RFP / call document, then extract
      // the full text (or as much as is publicly available) so the user doesn't have
      // to paste it manually. Returns plain text in the "brief" field, plus the source
      // URL it found and a confidence rating.
      return await api(
        `You research a specific funder and extract their published RFP / call document so a non-profit can use it as the source of truth for a proposal.

GOAL: Find the funder's most recent published funding call / RFP / application brief that an NPO would apply to, and return its full text content.

WHAT TO LOOK FOR — in order of preference:
1. A current published RFP / open call document on the funder's website (often a PDF).
2. A "how to apply" / "funding criteria" page with explicit eligibility, themes, deadline, requirements.
3. A press release or news post announcing a current grant window with detail.
4. Their funding-priorities / grants-programme overview page.

RULES:
- ONLY use information you find on the funder's OWN domain or an official partner site this session via web search.
- Do NOT invent or paraphrase. Extract the funder's own wording verbatim.
- Skip news articles, third-party blog posts, Wikipedia, LinkedIn, and grants directories.
- If the funder has no published brief, return brief: null with a note explaining what you searched.

WHAT TO INCLUDE in the extracted brief (when present in the source):
- Eligibility criteria (who can apply)
- Focus areas / themes / sectors they fund this cycle
- Application deadline / window
- Funding range or maximum grant size
- Required documents
- Specific questions the applicant must answer
- Page limits / format constraints
- Scoring criteria
- How to submit

RESPOND WITH ONLY A JSON OBJECT — no markdown, no backticks, no preamble:
{
  "brief": "[the extracted brief text verbatim, or null if none found]",
  "sourceUrl": "[URL of the page or document the brief came from]",
  "confidence": "[high|medium|low]",
  "note": "[1 sentence: what document this is and where it lives]"
}

Confidence:
- "high"   = found a current published RFP / call document with substantial detail
- "medium" = found a how-to-apply page or grants overview with useful criteria
- "low"    = only found general funding-priorities text, no specific call`,
        `Find the funder's current RFP / call document / application brief and extract its full text.

Funder: ${grant.funder}
Funder type: ${grant.type || "unknown"}
${grant.name && grant.name !== grant.funder ? `Grant programme: ${grant.name}` : ""}`,
        true, 6000
      );
    }
    if (type === "findApplyUrl") {
      // Return MULTIPLE candidate URLs. Client verifies each in order and uses
      // the first one that loads. More shots on goal = higher success rate when
      // any single URL is hallucinated or fails verification.
      return await api(
        `You are finding webpages on a specific funder's website where a non-profit could start a funding conversation.

CORE TASK: Return a list of 3-6 candidate URLs on the funder's own website. The user will verify each — your job is to give them options, not be perfect with one.

WHAT TO INCLUDE — list MOST SPECIFIC FIRST. The user picks the first one that loads, so the order matters. Prefer pages that get the NPO closer to applying:
1. **First:** Any dedicated application form, RFP, or open call page (if one exists).
2. Then: Any "how to apply" or "submission guidelines" or "contact us about funding" page.
3. Then: Their grants / funding / foundation / community page.
4. Then: Their corporate social investment / CSI / sustainability / responsibility page.
5. Then: Their main "about us" or company page (only if nothing more specific is available).
6. **Last resort, always include:** The funder's homepage as the final fallback.

VALIDATION:
- Every URL MUST be on the funder's own domain (e.g. momentumgroup.co.za, sasol.com, dgmt.co.za). Subdomains fine.
- Every URL MUST be a real link you found via web search in this session.
- Return the final destination URL, not a search-engine redirect URL.
- ALWAYS include the funder's homepage as one candidate. Even if you also find specific pages.

WRITE NOTES IN PLAIN ENGLISH. No jargon, no acronyms without explanation. Each note should be 1 short sentence saying what the page is.

RESPOND WITH ONLY A JSON OBJECT — no markdown, no backticks, no preamble:
{
  "candidates": [
    {"url": "[URL]", "pageType": "[form|info_page|contact|homepage]", "note": "[plain-English description]"},
    {"url": "[URL]", "pageType": "...", "note": "..."}
  ],
  "summary": "[1 sentence: what you found overall and how the user should approach this funder]"
}

pageType values:
- "form"      = page has an actual online application form / submission portal
- "info_page" = page describes how to apply but has no form
- "contact"   = page just has email/phone for funding inquiries
- "homepage"  = the funder's homepage`,
        `Find candidate webpages on this funder's website for starting a funding conversation. Return AT LEAST 3 URLs, always including the homepage.

Funder: ${grant.funder}
Funder type: ${grant.type || "unknown"}`,
        true, 1200
      );
    }
    if (type === "_DEAD_findApplyUrl_legacy") {
      return await api(
        `You are finding the best webpage where a non-profit could start a funding conversation with a specific organisation.

CORE RULE: ALWAYS return a URL. The "url" field MUST be a real, working URL on the funder's own website. Returning null is forbidden EXCEPT in the one case where you can prove the funder has no website at all (which is extremely rare).

WHAT TO LOOK FOR — in order of preference:
1. A dedicated application form, RFP, or open call page.
2. A "how to apply for funding" or "grants programme" page.
3. A funding / corporate social investment / community / responsibility page that describes how the funder gives money.
4. A "contact us about partnerships / funding / grants" page.
5. The funder's homepage — only as an absolute last resort, but STILL return it rather than returning null.

VALIDATION:
- The URL MUST be on the funder's own domain. Subdomains and deep paths are fine.
- The URL MUST be a real link you found via web search in this session.
- Return the final destination URL, not a search-engine redirect URL.
- If you found a useful page but it's not a literal application form, still return it. The user can navigate from there. A real page is always more useful than null.

WRITE THE NOTE IN PLAIN ENGLISH. No internal jargon, no acronyms without explanation. Say what the page IS in language a first-time user would understand. Examples:
- "Their main funding page. Lists priorities and tells you how to get in touch about a grant."
- "An application form for their education grants programme."
- "Their corporate giving page. Doesn't have a form but explains who to email."

RESPOND WITH ONLY A JSON OBJECT — no markdown, no backticks, no preamble:
{"url":"[real URL on funder's site]","confidence":"[high|medium|low]","pageType":"[form|info_page|contact|homepage]","note":"[plain-English description of the page in 1 sentence]"}

Confidence:
- "high" = dedicated application form, RFP, or open call
- "medium" = grants programme overview / how-to-apply / funding directory page
- "low" = general corporate giving / responsibility / contact page — still useful as a starting point

pageType:
- "form"      = the page has an actual online application form / submission portal
- "info_page" = the page describes how to apply (priorities, eligibility, instructions) but has no form
- "contact"   = the page just has email/phone for funding inquiries
- "homepage"  = nothing better was findable, returning the bare homepage`,
        `Find the best page on the funder's website for starting a funding conversation.

Funder: ${grant.funder}
Funder type: ${grant.type || "unknown"}`,
        true, 600
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
        `You write quarterly impact reports for ${orgName}'s funders. Audience: existing funders and board members who want to see progress, outcomes, and pipeline health.

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
        `You are a sharp-eyed pipeline analyst for ${orgName}. You find the things that busy grant managers miss — the hidden risks, the unexploited patterns, the signals in the noise.

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
        `Organisation: ${orgName}

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
        `You are a funding strategist for ${orgName}. The organisation's full context is provided below.

TASK: Produce 5–7 strategic recommendations. Each should be a specific, defensible play that ${orgName} can execute — not general advice.

Programme portfolio:
${ptypeRef}

THINK ABOUT:
- Which programme types are being pitched to the wrong funders? Name mismatches between ask amounts and funder capacity.
- Are there scalable or low-cost programme types in the portfolio that could be leveraged for large-reach proposals?
- Which funder types actually convert? If one category wins at 60% but another at 10%, the team should rebalance prospecting time.
- Multi-cohort and multi-year packaging: is anyone packaging smaller programmes into larger, multi-year proposals?
- Are returning funders being actively managed for renewals, or left to chance?
- Geographic plays: are there regions where ${orgName} has no presence but funders are active?
- Revenue concentration: if one grant represents >25% of the pipeline, that's a strategic risk.

FORMAT — for each recommendation:
- Bold title (no numbering, no emoji)
- 3–5 sentences of reasoning with specific numbers, programme costs, and funder names from the data
- "Next 30 days:" followed by one concrete action

Think like a board advisor, not a consultant. Be direct about what's working, what's not, and where the biggest leverage is.${factGuard}`,
        `Organisation: ${orgName}

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

  const clearUploadsCache = (grantId) => {
    if (grantId) {
      delete uploadsCache.current[grantId];
    } else {
      uploadsCache.current = {};
    }
  };

  return { runAI, clearUploadsCache };
}
