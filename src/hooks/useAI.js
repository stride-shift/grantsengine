import { useRef } from "react";
import { parseStructuredResearch, dL, effectiveAsk } from "../utils";
import { funderStrategy, isFunderReturning, detectType, PTYPES } from "../data/funderStrategy";
import { api, getUploadsContext } from "../api";
import { getWritingLearnings } from "../editLearner";

export default function useAI({ org, profile, team, grants, stages }) {
  const uploadsCache = useRef({});
  const learningsCache = useRef({ text: null, fetchedAt: 0 });

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
    const factGuard = `\n\nCRITICAL ACCURACY RULES:
- Use facts, names, impact stats, and achievements from the organisation context and uploaded documents. These are your primary source of truth.
- If specific information is not provided (e.g. an exact date), write [TO BE CONFIRMED] rather than inventing it.
- Do NOT name directors individually — refer to "the directors", "programme management and ops team", or "the leadership team".
- Never fabricate statistics, names, or achievements not present in the provided context.
- You MAY creatively design programme structures, propose new combinations of the organisation's components, and scale up delivery models — but ground everything in the organisation's real capabilities and cost structures.
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
      return await api(
        `You write funding proposals for ${orgName}. The organisation's full context — mission, programmes, outcomes, alumni stories, tools, and delivery model — is provided in the user message below. Use that context as your source of truth.

RULE #1 — NEVER USE THESE WORDS TO OPEN ANY SENTENCE: "Imagine", "Picture", "Consider", "Think of", "Meet", "What if", "Close your eyes". These are BANNED. Start every sentence with something real and concrete — a fact, a name, a number, a direct statement. This rule applies to EVERY section, EVERY paragraph.

VOICE — maintain in EVERY section, not just the opening:
- Warm, human, confident. A founder who KNOWS this works, offering a funder the chance to back something real.
- Write like a person, not a grant machine. Emotion comes from specificity, not adjectives.
- Use the organisation's REAL alumni stories from the context below. Use each story ONCE — never repeat it across sections.
- Use any employer testimonials from the context as proof of graduate quality — once.
- Vary sentence length. Short punchy sentences land harder after longer ones.
- The tone: "We built something that works. Here's the proof. Here's what your investment makes possible."
- CRITICAL: Sustain narrative energy through the ENTIRE proposal. Do NOT switch to bureaucratic grant-speak after the opening. Every section should feel alive.

FRAMING: Frame the organisation as a SYSTEM — reference its programme types, delivery model, tools, clients, and revenue streams from the context. This isn't a charity asking for help. It's an engine asking for fuel.

AMBITION — think BIG. Do NOT constrain yourself to the organisation's smallest or cheapest programme type:
- The organisation's programme types are a GUIDE, not a cage. Use them as building blocks but design the programme around what the FUNDER wants to achieve.
- If the funder can support a large grant, don't propose the minimum. Go large — propose multi-cohort, extended duration, wraparound services, employer partnerships, expansion to new sites.
- Combine programme elements creatively. Think about what would make the funder PROUD to back this.
- The budget should fill the funder's capacity, not sit timidly below it.
- Be guided by the organisation's actual costs and delivery model, but don't be limited by them.

SCALE THROUGH TECHNOLOGY — if the organisation has proprietary tools or technology described in the context, this is a key differentiator:
- Reference the specific tools by name from the context. Explain how they change the economics of delivery.
- If technology enables quality at scale, lean into this as a headline differentiator.
- Propose higher student numbers than the funder might expect if the technology supports it.

COVER EMAIL: Subject line + 5-8 sentence body. Open with a specific, compelling hook — NOT "I am writing to submit..." Open with the human impact or the opportunity. One proof point. Close with a low-friction next step. Sign off as the director (do NOT name them — just "Director, ${orgName}").

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
- Include specific organisational details from the context that bring it to life: tools, coaching model, delivery structure, accreditation pathway.
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
These phrases are AUTOMATIC FAILURES. Do not use them or any close variation. Use PLAIN, SPECIFIC language instead.

ANTI-REPETITION — critical:
- NEVER open two sections with the same narrative device. If one opens with a story, the next must open with data, a direct statement, or the funder's own mission.
- NEVER reuse an alumni story, statistic, or proof point that already appeared in another section.
- NEVER repeat the same adjectives, sentence structures, or transitional phrases across sections.
- NEVER pad with development-sector jargon. Every sentence must be specific to ${orgName}.
- NEVER name staff in the narrative. Do NOT name any team member.

ADDITIONAL RULES:
- If the organisation builds its own tools (per context), do NOT include third-party AI tool costs in budgets. Use "AI platform & tools (proprietary)" instead.
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
Use the organisation's programme types as a starting framework, but MATCH THE ASK TO THE FUNDER'S CAPACITY. If the funder budget is large, don't propose the minimum — propose something that fills their capacity with genuine impact. Go multi-cohort, multi-year, add components, extend duration, propose a flagship programme. The ask should be ambitious but justified — every unit of currency should map to real delivery.${factGuard}`,
        `Organisation:\n${orgCtx}\n\nGrant: ${grant.name}\nFunder: ${grant.funder}\nType: ${grant.type}\n${grant.ask > 0 ? `Ask: R${grant.ask.toLocaleString()}` : `Funder Budget: R${(grant.funderBudget || 0).toLocaleString()} — recommend the best programme type and calculate the right ask`}\nFocus: ${(grant.focus || []).join(", ")}\nNotes: ${grant.notes || "None"}${grant.funderFeedback ? `\n\n=== FUNDER FEEDBACK (from previous application) ===\n${grant.funderFeedback}\nCRITICAL: This is real feedback from the funder. Address every concern raised. If they said the budget was too high, adjust. If they wanted more evidence, provide it. This feedback is your most important input.` : ""}${researchBlock}${fitScoreBlock}`,
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
      const totalWords = targetPages * 500; // ~500 words/page for formatted proposals
      const coverWords = 200;
      const execSummaryWords = Math.min(300, Math.round(totalWords * 0.12));
      const budgetWords = 400;
      const appendixWords = 150;
      // Count fixed vs body sections
      const fixedTypes = s => { const l = s.toLowerCase(); return l.includes("cover") || (l.includes("summary") || l.includes("executive")) || l.includes("budget") || l.includes("appendix") || l.includes("appendices"); };
      const sectionList = allSections || [];
      const fixedCount = sectionList.length > 0 ? sectionList.filter(fixedTypes).length : Math.min(4, (totalSections || 6));
      const bodySectionCount = Math.max((totalSections || 6) - fixedCount, 2);
      const bodyWords = totalWords - coverWords - execSummaryWords - budgetWords - appendixWords;
      const perBodySection = Math.max(200, Math.round(bodyWords / Math.max(bodySectionCount, 1)));
      const wordLimit = isCover ? coverWords : isExecSummary ? execSummaryWords : isBudget ? budgetWords : isAppendix ? appendixWords : perBodySection;
      const paraGuide = wordLimit < 300 ? "1-2 focused paragraphs" : wordLimit < 500 ? "2-3 tight paragraphs" : wordLimit < 800 ? "3-4 paragraphs" : "4-6 paragraphs";

      // Section-specific depth guidance — rich, strategic blocks per section type
      let sectionGuide = "";

      if (isCover) {
        sectionGuide = `COVER EMAIL INSTRUCTIONS:
Subject line + 5-8 sentence body. Open with a specific, compelling hook — NOT "I am writing to submit..." and NOT "Imagine..." Open with human impact or the opportunity. One proof point. Close with a low-friction next step. Sign off as "Director, ${orgName}" (do NOT name them).

OPENING HOOK: ${fs.hook}

OPENING TECHNIQUE — choose ONE (whichever fits this funder best):
- A real student/beneficiary outcome from the organisation context
- A striking cost comparison (${costHook})
- The funder's own stated mission, connected directly to ${orgName}'s work
- A provocative question relevant to the organisation's mission
- A concrete result using real outcomes data from the context
NEVER open with "Imagine..." or scene-setting invitations. Start with something real.`;

      } else if (isExecSummary) {
        sectionGuide = `EXECUTIVE SUMMARY INSTRUCTIONS:
~${wordLimit} words. A compelling standalone case — someone should want to fund ${orgName} after reading ONLY this section.
Use a DIFFERENT hook from the cover letter — check the ALREADY-WRITTEN SECTIONS and do NOT repeat the same opening device or story.

OPENING — choose ONE technique that is DIFFERENT from the cover letter:
- A striking data point that reframes the problem
- A bold claim about the organisation's model from the context
- The funder's own stated priority, connected directly to ${orgName}'s work
- A concrete outcome using real impact data from the context
NEVER open with "Imagine..." or "Picture..." or any invitation to hypothesise.

FRAMING: Frame ${orgName} as a SYSTEM — reference its programme types, delivery model, tools, clients, and revenue streams from the context. This isn't a charity asking for help. It's an engine asking for fuel.

AMBITION — think BIG:
- If the funder can support a large amount, don't propose the minimum. Propose multi-cohort, extended duration, wraparound services.
- Combine programme elements creatively from the context.
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
${structuredRes?.budgetRange ? `FUNDER BUDGET INTELLIGENCE (from research): ${structuredRes.budgetRange}\nSize the ask to match their capacity — don't propose R500K when they typically give R2M.\n` : ""}AMBITION: The budget should fill the funder's capacity, not sit timidly below it. Match the ask to the funder's ambition.
- Use the organisation's programme types as building blocks but design for what the FUNDER wants to achieve.
- Go multi-cohort, add components, extend duration where the budget allows.

SCALE THROUGH TECHNOLOGY — if the organisation has proprietary tools (per context):
- Reference how the tools change delivery economics. Per-student cost drops at scale.
- Propose higher student numbers than expected if the technology supports it.

After the table, weave the numbers into narrative: "For ${perStudentStr} per student — less than a semester at most private colleges — a young person receives ${budgetInfo?.duration || "9 months"} of daily coaching, enterprise software access, ICITP accreditation, and a career launchpad."

ASK RECOMMENDATION — include at the VERY END on its own line:
${bt ? `ASK_RECOMMENDATION: Type ${bt.typeNum}, ${bt.cohorts} cohort(s), ${bt.years || 1} year(s), R${bt.total}` : `ASK_RECOMMENDATION: Type [1-7], [count] cohort(s), [years] year(s), R[total amount as integer with no commas or spaces]
Example (single year): ASK_RECOMMENDATION: Type 3, 2 cohort(s), 1 year(s), R2472000
Example (multi-year): ASK_RECOMMENDATION: Type 1, 3 cohort(s), 3 year(s), R4644000`}`;

      } else if (isProgramme) {
        sectionGuide = `PROGRAMME SECTION INSTRUCTIONS:
Open with a direct, concrete statement about the programme — NOT "imagine" or "picture this". For example: "Each cohort begins with a week of digital onboarding..." or "The programme runs in three distinct phases..."

Describe the programme using the phases, pillars, and curriculum structure from the organisation context. Be specific and factual — the reader should understand exactly what ${orgName} delivers.

Describe what actually happens: what tools learners use, what coaching looks like (1:1 and group), what activities and challenges involve. Be concrete — use programme details from the context.

SCALE THROUGH TECHNOLOGY — if the organisation has proprietary tools (per context), reference them by name:
- Explain how each tool changes the economics of delivery
- Show how the coaching model uses technology to maintain quality at scale

AMBITION: Design the programme around what the FUNDER wants to achieve:
- Combine programme elements creatively from the context.
- Think about what makes the funder PROUD. Match the scale of their ambition.`;

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
  ? `Open with the specific gap ${orgName} addresses — not generic stats. Frame the challenge through the organisation's unique lens from the context.`
  : `Open with ${orgName}'s business model strength — a statement about sustainability, not a hypothetical. Reference programme types, revenue streams, and delivery model from the context.`}
Write ${paraGuide}. Be specific to the organisation's model from the context, not generic development language.

${isChallenge ? `Frame the challenge through ${orgName}'s lens — what specific gap does it fill? Reference the organisation's unique approach from the context.` : ""}

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

      // Token budget scaled to word limit (~0.75 words/token + buffer)
      const tokenBudget = Math.max(600, Math.round(wordLimit / 0.75) + 200);

      return await api(
        `You write ONE section of a funding proposal for ${orgName}. The organisation's full context — mission, programmes, outcomes, alumni stories, tools — is provided in the user message below.

SECTION: "${sectionName}" (Section ${sectionIndex + 1} of ${totalSections})

RULE #1 — NEVER USE THESE WORDS TO OPEN ANY SENTENCE: "Imagine", "Picture", "Consider", "Think of", "Meet", "What if", "Close your eyes". These are BANNED. Start every sentence with something real and concrete — a fact, a name, a number, a direct statement.

VOICE — this is the most important instruction:
- Warm, human, confident. A founder who KNOWS this works, offering a funder the chance to back something real.
- Write like a person, not a grant machine. Let the reader feel the energy of what ${orgName} does.
- Use the organisation's REAL alumni stories from the context — but use each story ONCE across the full proposal. If a prior section already used a story, pick a different one.
- Be concrete and grounded: real numbers, real programme details. Emotion comes from specificity, not adjectives.
- Vary sentence length. Short punchy sentences land harder after longer ones.
- CRITICAL: The emotive, narrative energy must carry through. Do NOT switch to dry, bureaucratic grant-speak.

${sectionGuide}

PROPOSAL LENGTH: This proposal targets ${targetPages} pages total (~${totalWords} words across ${totalSections} sections).
THIS SECTION: ~${wordLimit} words maximum (${paraGuide}). ${wordLimit < 400 ? "Be surgical — every sentence must earn its place." : wordLimit < 600 ? "Be concise — prioritise evidence over elaboration." : "Be thorough but focused."}${fs.formatNotes ? `\nFUNDER FORMAT: ${fs.formatNotes}` : ""}
DO NOT pad with filler, repeated context, or unnecessary transitions. Density > length.

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
These phrases are AUTOMATIC FAILURES. Use PLAIN, SPECIFIC language instead.

ANTI-REPETITION — critical:
- Read the ALREADY-WRITTEN SECTIONS below carefully. Do NOT reuse their opening devices, alumni stories, statistics, or key phrases.
- If a prior section opens with a student story, you MUST use a completely different technique (data point, direct statement, funder's own mission, concrete programme detail).
- Do NOT echo the same adjectives, metaphors, or sentence structures used in prior sections.
- Every section must feel fresh — as if written by the same author but covering genuinely new ground.
- NEVER name staff in the narrative. Do NOT write "Imagine Ayanda welcoming..." or name any team member.

ADDITIONAL RULES:
- If the organisation builds its own tools (per context), do NOT include third-party AI tool costs in budgets — use "AI platform & tools (proprietary)"
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
        `Organisation context:\n${orgCtx}\n\nFunder: ${grant.funder}\nType: ${grant.type}\nGrant: ${grant.name}\n${grant.ask > 0 ? `Ask: R${grant.ask.toLocaleString()}` : `Funder Budget: ~R${(grant.funderBudget || 0).toLocaleString()} (ask TBD — will be set after proposal)`}\nRelationship: ${grant.rel}${fs.returning ? " (RETURNING FUNDER — existing relationship)" : ""}\nFocus areas: ${(grant.focus || []).join(", ")}${fs.noIntel ? "\n\nNO PRE-EXISTING FUNDER INTELLIGENCE — research from scratch. Build a complete picture." : `\n\n=== EXISTING FUNDER INTELLIGENCE (build on this, don't duplicate) ===\nLead angle: ${fs.lead}\nHook: ${fs.hook}\nRecommended sections: ${(fs.sections || []).join(", ")}\nLanguage register: ${fs.lang}${fs.returning ? "\nStatus: RETURNING FUNDER — look for what the organisation delivered with their previous funding, what outcomes were achieved, and what the continuity angle is." : ""}`}\n\n${grant.notes ? `TEAM INTEL (from grant notes — treat as high-priority context):\n${grant.notes}` : "Notes: None"}${grant.funderFeedback ? `\n\n=== PREVIOUS FUNDER FEEDBACK ===\n${grant.funderFeedback}\nUse this feedback to refine your research — understand what the funder valued or didn't value.` : ""}`,
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
        `Organisation:\n${orgCtx}\n\nGrant: ${grant.name}\nFunder: ${grant.funder}\nType: ${grant.type}\n${grant.ask > 0 ? `Ask: R${grant.ask.toLocaleString()}` : `Funder Budget: ~R${(grant.funderBudget || 0).toLocaleString()} (ask TBD)`}\nRelationship: ${grant.rel}${fs.returning ? " (RETURNING FUNDER)" : ""}\nFocus: ${(grant.focus || []).join(", ")}\nGeography: ${(grant.geo || []).join(", ") || "National"}\nDeadline: ${grant.deadline || "Rolling"}\nNotes: ${grant.notes || "None"}\n\nFUNDER INTEL: This funder cares about "${fs.lead}". Their language: ${fs.lang}.${fs.returning ? ` ${orgName} is a returning grantee.` : ""}`,
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
