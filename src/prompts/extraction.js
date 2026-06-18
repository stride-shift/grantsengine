// Prompt builders extracted move-only from src/hooks/useAI.js (Phase 3). Each takes a context
// bag (the locals runAI assembles) and returns { system, user, search, maxTokens } — or { result }
// for a precomputed early return. Pure: no I/O. Pinned byte-for-byte by useAI.prompts.snapshot.test.js.


const P = (system, user, search, maxTokens) => ({ system, user, search, maxTokens });

export const buildExtractRequiredDocs = (ctx) => {
  const { type, grant, orgName, orgCtx, factGuard, budgetInfo, perStudentStr, costHook, priorResearch, priorFitScore, grants, team, stages } = ctx;
      // Parse the funder brief + research to extract the exact list of documents
      // the funder expects attached. Returns a structured JSON list so the UI
      // can render a checklist.
      const sources = [
        grant.funderBrief ? `=== FUNDER BRIEF ===\n${grant.funderBrief}` : "",
        grant.aiResearch ? `=== RESEARCH ===\n${String(grant.aiResearch).slice(0, 4000)}` : "",
        grant.notes ? `=== TEAM NOTES ===\n${grant.notes}` : "",
      ].filter(Boolean).join("\n\n");
      if (!sources.trim()) return { result: JSON.stringify({ documents: [], note: "No brief or research yet — run Funder Research first." }) };
      return P(
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
};

export const buildExtractEmailFeedback = (ctx) => {
  const { type, grant, orgName, orgCtx, factGuard, budgetInfo, perStudentStr, costHook, priorResearch, priorFitScore, grants, team, stages } = ctx;
      // Parse a pasted funder email/response and extract structured feedback.
      // Returns a short, structured summary the team can paste into Funder Feedback.
      // Input passes via grant.notes (re-used as the pasted text payload).
      const pasted = (grant.notes || "").trim();
      if (!pasted || pasted.length < 30) return { result: "Paste the funder's email or response first — at least a few sentences." };
      return P(
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
};

export const buildExtractNotes = (ctx) => {
  const { type, grant, orgName, orgCtx, factGuard, budgetInfo, perStudentStr, costHook, priorResearch, priorFitScore, grants, team, stages } = ctx;
      // Pull useful internal-notes intel from uploaded org docs.
      // The orgCtx already includes uploaded board minutes, past proposals, donor
      // reports, etc. We just need to ask the model to surface anything specific
      // to THIS funder that would be useful in the internal notes field.
      return P(
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
};

export const buildFetchFunderBrief = (ctx) => {
  const { type, grant, orgName, orgCtx, factGuard, budgetInfo, perStudentStr, costHook, priorResearch, priorFitScore, grants, team, stages } = ctx;
      // Search the funder's website for an actual RFP / call document, then extract
      // the full text (or as much as is publicly available) so the user doesn't have
      // to paste it manually. Returns plain text in the "brief" field, plus the source
      // URL it found and a confidence rating.
      return P(
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
};

export const buildFindApplyUrl = (ctx) => {
  const { type, grant, orgName, orgCtx, factGuard, budgetInfo, perStudentStr, costHook, priorResearch, priorFitScore, grants, team, stages } = ctx;
      // Return MULTIPLE candidate URLs. Client verifies each in order and uses
      // the first one that loads. More shots on goal = higher success rate when
      // any single URL is hallucinated or fails verification.
      return P(
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
};

export const buildUrlExtractPrompt = (ctx) => {
  const { type, grant, orgName, orgCtx, factGuard, budgetInfo, perStudentStr, costHook, priorResearch, priorFitScore, grants, team, stages } = ctx;
      // priorResearch carries the URL
      const url = priorResearch || "";
      return P(
        `Extract grant/funding opportunity details from a URL. Return ONLY valid JSON — no markdown, no backticks, no explanation.

SCHEMA: {"name":"[grant name]","funder":"[funding org]","type":"[Corporate CSI|Government/SETA|International|Foundation|Tech Company]","ask":[amount in ZAR integer, 0 if unknown],"deadline":"[YYYY-MM-DD or null]","focus":["tag1","tag2"],"notes":"[eligibility, requirements, key details]","applyUrl":"[direct application URL]"}

RULES: "ask" = realistic midpoint if range given, convert USD at ~R18/$. "type" must be exactly one of the 5 options. "focus" = 2-5 tags from: youth-employment, digital-skills, AI/4IR, education, women, rural-dev, STEM, entrepreneurship. "applyUrl" = most direct application link found.`,
        `Fetch and extract grant information from: ${url}`,
        true, 800
      );
};
