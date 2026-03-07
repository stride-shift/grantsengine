/* ═══════════════════════════════════════
   Grant Engine — AI Prompt Templates

   Only `scoutPrompt` is active — used by Pipeline.jsx and server/jobs/scout.js.
   All other AI prompts live inline in App.jsx (draft, research, fit score,
   follow-up, review, brief, report, conference, URL extract, full application).
   ═══════════════════════════════════════ */

// ── SCOUT ──
export const scoutPrompt = ({ existingFunders, market = "both", orgContext = "" }) => {
  const marketInstruction = market === "sa"
    ? "\nFOCUS: South African funders ONLY — corporate CSI, SETAs, SA-based foundations, government agencies, SA-registered trusts. Do NOT include international or global funders."
    : market === "global"
    ? "\nFOCUS: International/global funders ONLY — global foundations, development agencies, international NGOs, multilateral organisations, global tech companies. Do NOT include South African domestic funders."
    : "\nINCLUDE BOTH South African domestic funders AND international/global funders.";

  const searchScope = market === "sa"
    ? "Search for open grants in South Africa for NPOs matching the organisation profile below, March 2026. Focus on SETA windows, corporate CSI open calls, SA foundation rounds, and government funding."
    : market === "global"
    ? "Search for international and global grant opportunities for the organisation described below, March 2026. Focus on global foundations, development agencies, international tech companies, and multilateral funders that fund African NGOs."
    : "Search for open grants for the organisation described below, March 2026. Include both SA domestic funders (SETAs, corporate CSI, foundations) AND international funders (global foundations, tech companies, development agencies).";

  return {
    system: `You find grant opportunities for the organisation described below.
${orgContext ? `\nORGANISATION CONTEXT:\n${orgContext}\n` : ""}
SEARCH for open grant opportunities, CSI funding calls, SETA discretionary windows, and international tech funder programmes in 2026.
${marketInstruction}

CRITICAL — VERIFY APPLICATION ACCESS:
For EVERY opportunity, check whether the funder accepts unsolicited proposals/applications from external organisations. Search their website for application portals, open calls, RFPs, or submission guidelines.
- "Open" = published open call, application portal, or RFP that NPOs can apply to without prior invitation
- "By invitation" = funder only accepts proposals from pre-selected or invited organisations
- "Relationship first" = no formal open call, but they accept approaches/LOIs from organisations that make contact first
- "Unknown" = could not verify — application process unclear from public sources

DO NOT include opportunities marked "By invitation" unless there is a realistic path to getting invited.
PRIORITISE "Open" opportunities. Include "Relationship first" only if the funder has a clear contact channel.

RESPOND WITH ONLY A JSON ARRAY — no markdown, no backticks, no explanation. Each object:
{"name":"[grant name]","funder":"[organisation]","type":"[Corporate CSI|Government/SETA|International|Foundation|Tech Company]","funderBudget":[amount in ZAR integer — the funder's stated budget or typical grant size],"deadline":"[YYYY-MM-DD or null]","fit":"[High|Medium|Low]","reason":"[1 sentence: why it fits this organisation]","url":"[application URL or funder contact page]","focus":["tag1","tag2"],"access":"[Open|Relationship first|By invitation|Unknown]","accessNote":"[1 sentence: how to apply or how to get in the door]","market":"[sa|global]"}

FIT = HIGH only if 3+ of the organisation's key focus areas match, budget is in range, and it accepts unsolicited applications.
EXCLUDE: university-only, pure research, sectors with no relevance, invitation-only with no realistic path in.
Return 8-12 real, current opportunities.`,
    user: `${searchScope} The organisation already has applications with: ${existingFunders}. Find NEW opportunities not already in the pipeline. For each one, VERIFY whether they accept unsolicited applications — check their website for open calls, portals, or application guidelines.`,
    maxTok: 3000,
    search: true,
  };
};
