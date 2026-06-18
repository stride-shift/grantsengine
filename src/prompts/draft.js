// Prompt builders extracted move-only from src/hooks/useAI.js (Phase 3). Each takes a context
// bag (the locals runAI assembles) and returns { system, user, search, maxTokens } — or { result }
// for a precomputed early return. Pure: no I/O. Pinned byte-for-byte by useAI.prompts.snapshot.test.js.

import { funderStrategy } from "../data/funderStrategy";
import { parseStructuredResearch } from "../utils";
import { getResearchForDraft, getResearchForSection } from "./lib";

const P = (system, user, search, maxTokens) => ({ system, user, search, maxTokens });

export const buildDraftPrompt = (ctx) => {
  const { type, grant, orgName, orgCtx, factGuard, budgetInfo, perStudentStr, costHook, priorResearch, priorFitScore, grants, team, stages } = ctx;
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
      return P(
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
};

export const buildSectionDraftPrompt = (ctx) => {
  const { type, grant, orgName, orgCtx, factGuard, budgetInfo, perStudentStr, costHook, priorResearch, priorFitScore, grants, team, stages } = ctx;
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

      return P(
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
};

export const buildConceptNotePrompt = (ctx) => {
  const { type, grant, orgName, orgCtx, factGuard, budgetInfo, perStudentStr, costHook, priorResearch, priorFitScore, grants, team, stages } = ctx;
      // Phase 8: short pre-proposal pitch — sells the IDEA before any full proposal
      const fs = funderStrategy(grant);
      return P(
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
};
