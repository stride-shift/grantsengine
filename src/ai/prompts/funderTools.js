// Prompt builders for per-grant / per-funder action types, extracted verbatim
// from useAI.js. Each is a pure function: (ctx) => { system, user, search, maxTokens }
// or, for types that short-circuit before calling the API, (ctx) => { result }.
import { funderStrategy } from "../../data/funderStrategy";

export function buildConceptNote(ctx) {
  const { grant, orgCtx, orgName, budgetInfo, factGuard } = ctx;
  // Phase 8: short pre-proposal pitch — sells the IDEA before any full proposal
  // eslint-disable-next-line no-unused-vars
  const fs = funderStrategy(grant);
  return {
    system: `You write a concept note for ${orgName}. A concept note is a short, sharp pitch that earns the right to submit a full proposal — typically 1-2 pages, sent before any formal application.

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
    user: `Organisation:\n${orgCtx}\n\nGrant: ${grant.name}\nFunder: ${grant.funder}\nType: ${grant.type}\n${grant.ask > 0 ? `Ask: R${grant.ask.toLocaleString()}` : `Funder Budget: R${(grant.funderBudget || 0).toLocaleString()}`}\nFocus: ${(Array.isArray(grant.focus) ? grant.focus : []).join(", ")}\nNotes: ${grant.notes || "None"}${grant.funderBrief ? `\n\n=== FUNDER BRIEF (PRIMARY SOURCE OF TRUTH) ===\n${grant.funderBrief}` : ""}`,
    search: false,
    maxTokens: 1800,
  };
}

export function buildResearch(ctx) {
  const { grant, orgCtx, orgName, factGuard } = ctx;
  const fs = funderStrategy(grant);
  return {
    system: `You are a funder intelligence analyst for ${orgName}. The organisation's full context — mission, programmes, outcomes — is provided below.

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
    user: `Organisation context:\n${orgCtx}\n\nFunder: ${grant.funder}\nType: ${grant.type}\nGrant: ${grant.name}\n${grant.ask > 0 ? `Ask: R${grant.ask.toLocaleString()}` : `Funder Budget: ~R${(grant.funderBudget || 0).toLocaleString()} (ask TBD — will be set after proposal)`}\nRelationship: ${grant.rel}${fs.returning ? " (RETURNING FUNDER — existing relationship)" : ""}\nFocus areas: ${(Array.isArray(grant.focus) ? grant.focus : []).join(", ")}${fs.noIntel ? "\n\nNO PRE-EXISTING FUNDER INTELLIGENCE — research from scratch. Build a complete picture." : `\n\n=== EXISTING FUNDER INTELLIGENCE (build on this, don't duplicate) ===\nLead angle: ${fs.lead}\nHook: ${fs.hook}\nRecommended sections: ${(fs.sections || []).join(", ")}\nLanguage register: ${fs.lang}${fs.returning ? "\nStatus: RETURNING FUNDER — look for what the organisation delivered with their previous funding, what outcomes were achieved, and what the continuity angle is." : ""}`}\n\n${grant.notes ? `TEAM INTEL (from grant notes — treat as high-priority context):\n${grant.notes}` : "Notes: None"}${grant.funderFeedback ? `\n\n=== PREVIOUS FUNDER FEEDBACK ===\n${grant.funderFeedback}\nUse this feedback to refine your research — understand what the funder valued or didn't value.` : ""}`,
    search: true,
    maxTokens: 3000,
  };
}

export function buildFollowup(ctx) {
  const { grant, orgCtx, orgName, factGuard } = ctx;
  const fs = funderStrategy(grant);
  return {
    system: `You write follow-up emails for ${orgName}. The organisation's context is provided below.

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
    user: `Organisation:\n${orgCtx}\n\nGrant: ${grant.name}\nFunder: ${grant.funder}\nStage: ${grant.stage}\n${grant.ask > 0 ? `Ask: R${grant.ask.toLocaleString()}` : `Funder Budget: ~R${(grant.funderBudget || 0).toLocaleString()}`}\nSubmitted: ${grant.subDate || "Not yet"}\nNotes: ${grant.notes || "None"}`,
    search: false,
    maxTokens: 1000,
  };
}

export function buildExtractRequiredDocs(ctx) {
  const { grant, factGuard } = ctx;
  // Parse the funder brief + research to extract the exact list of documents
  // the funder expects attached. Returns a structured JSON list so the UI
  // can render a checklist.
  const sources = [
    grant.funderBrief ? `=== FUNDER BRIEF ===\n${grant.funderBrief}` : "",
    grant.aiResearch ? `=== RESEARCH ===\n${String(grant.aiResearch).slice(0, 4000)}` : "",
    grant.notes ? `=== TEAM NOTES ===\n${grant.notes}` : "",
  ].filter(Boolean).join("\n\n");
  if (!sources.trim()) return { result: JSON.stringify({ documents: [], note: "No brief or research yet — run Funder Research first." }) };
  return {
    system: `You extract the list of documents a funder requires for a grant application.

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
    user: sources,
    search: false,
    maxTokens: 1200,
  };
}

export function buildExtractEmailFeedback(ctx) {
  const { grant, factGuard } = ctx;
  // Parse a pasted funder email/response and extract structured feedback.
  // Returns a short, structured summary the team can paste into Funder Feedback.
  // Input passes via grant.notes (re-used as the pasted text payload).
  const pasted = (grant.notes || "").trim();
  if (!pasted || pasted.length < 30) return { result: "Paste the funder's email or response first — at least a few sentences." };
  return {
    system: `You extract structured funder feedback from a pasted email or response. The team will paste this output into the "Funder Feedback" field on the grant, then use it to refine their next attempt.

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
    user: `Funder: ${grant.funder}\nGrant: ${grant.name}\n\n=== EMAIL TEXT TO PARSE ===\n${pasted}`,
    search: false,
    maxTokens: 900,
  };
}

export function buildExtractNotes(ctx) {
  const { grant, orgCtx, orgName, factGuard } = ctx;
  // Pull useful internal-notes intel from uploaded org docs.
  // The orgCtx already includes uploaded board minutes, past proposals, donor
  // reports, etc. We just need to ask the model to surface anything specific
  // to THIS funder that would be useful in the internal notes field.
  return {
    system: `You are an analyst surfacing strategically useful internal context about a specific funder.

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
    user: `Funder: ${grant.funder}\nType: ${grant.type}\nExisting notes (don't repeat these):\n${grant.notes || "None"}\n\nOrganisation context + uploaded documents:\n${orgCtx}`,
    search: false,
    maxTokens: 800,
  };
}

export function buildFitscore(ctx) {
  const { grant, orgCtx, orgName } = ctx;
  const fs = funderStrategy(grant);
  return {
    system: `You are a grant fit analyst for a South African NPO. Assess how well this grant opportunity matches the organisation.

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
    user: `Organisation:\n${orgCtx}\n\nGrant: ${grant.name}\nFunder: ${grant.funder}\nType: ${grant.type}\n${grant.ask > 0 ? `Ask: R${grant.ask.toLocaleString()}` : `Funder Budget: ~R${(grant.funderBudget || 0).toLocaleString()} (ask TBD)`}\nRelationship: ${grant.rel}${fs.returning ? " (RETURNING FUNDER)" : ""}\nFocus: ${(Array.isArray(grant.focus) ? grant.focus : []).join(", ")}\nGeography: ${(Array.isArray(grant.geo) ? grant.geo : grant.geo ? [grant.geo] : []).join(", ") || "National"}\nDeadline: ${grant.deadline || "Rolling"}\nNotes: ${grant.notes || "None"}\n\nFUNDER INTEL: This funder cares about "${fs.lead}". Their language: ${fs.lang}.${fs.returning ? ` ${orgName} is a returning grantee.` : ""}`,
    search: false,
    maxTokens: 800,
  };
}

export function buildWinloss(ctx) {
  const { grant, priorResearch, orgCtx } = ctx;
  // priorResearch carries the outcome ("won" or "lost") and any user notes
  const outcome = priorResearch || "unknown";
  return {
    system: `You are a grants strategist analysing a ${outcome === "won" ? "successful" : "unsuccessful"} grant application.

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
    user: `Organisation:\n${orgCtx}\n\nGrant: ${grant.name}\nFunder: ${grant.funder}\nType: ${grant.type}\nAsk: R${grant.ask?.toLocaleString()}\nRelationship: ${grant.rel}\nFocus: ${(Array.isArray(grant.focus) ? grant.focus : []).join(", ")}\nNotes: ${grant.notes || "None"}\nOutcome: ${outcome}${grant.funderFeedback ? `\n\n=== ACTUAL FUNDER FEEDBACK ===\n${grant.funderFeedback}` : ""}`,
    search: false,
    maxTokens: 1000,
  };
}

export function buildFetchFunderBrief(ctx) {
  const { grant } = ctx;
  // Search the funder's website for an actual RFP / call document, then extract
  // the full text (or as much as is publicly available) so the user doesn't have
  // to paste it manually. Returns plain text in the "brief" field, plus the source
  // URL it found and a confidence rating.
  return {
    system: `You research a specific funder and extract their published RFP / call document so a non-profit can use it as the source of truth for a proposal.

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
    user: `Find the funder's current RFP / call document / application brief and extract its full text.

Funder: ${grant.funder}
Funder type: ${grant.type || "unknown"}
${grant.name && grant.name !== grant.funder ? `Grant programme: ${grant.name}` : ""}`,
    search: true,
    maxTokens: 6000,
  };
}

export function buildFindApplyUrl(ctx) {
  const { grant } = ctx;
  // Return MULTIPLE candidate URLs. Client verifies each in order and uses
  // the first one that loads. More shots on goal = higher success rate when
  // any single URL is hallucinated or fails verification.
  return {
    system: `You are finding webpages on a specific funder's website where a non-profit could start a funding conversation.

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
    user: `Find candidate webpages on this funder's website for starting a funding conversation. Return AT LEAST 3 URLs, always including the homepage.

Funder: ${grant.funder}
Funder type: ${grant.type || "unknown"}`,
    search: true,
    maxTokens: 1200,
  };
}

export function buildUrlextract(ctx) {
  const { priorResearch } = ctx;
  // priorResearch carries the URL
  const url = priorResearch || "";
  return {
    system: `Extract grant/funding opportunity details from a URL. Return ONLY valid JSON — no markdown, no backticks, no explanation.

SCHEMA: {"name":"[grant name]","funder":"[funding org]","type":"[Corporate CSI|Government/SETA|International|Foundation|Tech Company]","ask":[amount in ZAR integer, 0 if unknown],"deadline":"[YYYY-MM-DD or null]","focus":["tag1","tag2"],"notes":"[eligibility, requirements, key details]","applyUrl":"[direct application URL]"}

RULES: "ask" = realistic midpoint if range given, convert USD at ~R18/$. "type" must be exactly one of the 5 options. "focus" = 2-5 tags from: youth-employment, digital-skills, AI/4IR, education, women, rural-dev, STEM, entrepreneurship. "applyUrl" = most direct application link found.`,
    user: `Fetch and extract grant information from: ${url}`,
    search: true,
    maxTokens: 800,
  };
}
