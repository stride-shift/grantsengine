// Prompt builder for type === "draft" — full proposal draft.
// Extracted verbatim from useAI.js. Pure function: takes the already-built
// context (orgCtx, orgName, budgetInfo, perStudentStr, costHook, factGuard …)
// plus the call args (grant, priorResearch, priorFitScore) and returns the
// system/user prompt strings + api options. No behaviour change.
import { funderStrategy } from "../../data/funderStrategy";
import { parseStructuredResearch } from "../../utils";

export default function buildDraft(ctx) {
  const {
    grant, priorResearch, priorFitScore,
    orgCtx, orgName, budgetInfo, perStudentStr, costHook, factGuard,
    getResearchForDraft,
  } = ctx;

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
  return {
    system: `You write funding proposals for ${orgName}. The organisation's full context — mission, programmes, outcomes, alumni stories, tools, and delivery model — is provided in the user message below. Use that context as your source of truth.

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
    user: `Organisation:\n${orgCtx}\n\nGrant: ${grant.name}\nFunder: ${grant.funder}\nType: ${grant.type}\n${grant.ask > 0 ? `Ask: R${grant.ask.toLocaleString()}` : `Funder Budget: R${(grant.funderBudget || 0).toLocaleString()} — recommend the best programme type and calculate the right ask`}\nFocus: ${(Array.isArray(grant.focus) ? grant.focus : []).join(", ")}\nNotes: ${grant.notes || "None"}${grant.funderBrief ? `\n\n=== FUNDER BRIEF (PRIMARY SOURCE OF TRUTH — paste from funder verbatim) ===\n${grant.funderBrief}\nCRITICAL: This is the funder's own words. Mirror their language, answer every question they ask, and respect every constraint they specify (deadlines, page limits, eligibility, themes). If anything in this brief contradicts other context, the brief wins. Do NOT introduce facts, dates, or programme details that are not in this brief, the grant data, or the organisation context.` : ""}${grant.funderFeedback ? `\n\n=== FUNDER FEEDBACK (from previous application) ===\n${grant.funderFeedback}\nCRITICAL: This is real feedback from the funder. Address every concern raised. If they said the budget was too high, adjust. If they wanted more evidence, provide it. This feedback is your most important input.` : ""}${researchBlock}${fitScoreBlock}`,
    search: false,
    maxTokens: 5000,
  };
}
