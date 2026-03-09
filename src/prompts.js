/* ═══════════════════════════════════════
   Grant Engine — AI Prompt Templates

   `scoutPrompt` and `scoutBriefPrompt` are active — used by Pipeline.jsx and server/jobs/scout.js.
   All other AI prompts live inline in App.jsx (draft, research, fit score,
   follow-up, review, brief, report, conference, URL extract, full application).
   ═══════════════════════════════════════ */

// ── SCOUT BRIEF: distill org identity for filtering ──
export const scoutBriefPrompt = (orgContext) => ({
  system: `You distill an organisation's identity into a concise scout brief that shapes which grant opportunities an AI should find for them.

Output format — plain text, NO markdown, NO bullet points, NO headers. Use this exact structure:

Line 1: One sentence — what the org does and who it serves.
Line 2: "WE DO:" followed by 6-8 SPECIFIC focus areas, comma-separated. Be precise (e.g. "youth employment" not "education", "AI-native digital skills" not "technology").
Line 3: "WE DON'T DO:" followed by 5-7 sectors/topics that are NOT relevant — common funder categories this org should NEVER be matched with.
Line 4: "SECRET SAUCE:" One sentence about what makes this org's approach distinctive — the numbers and the method that set them apart.

Be specific and opinionated. This brief is used to FILTER grant opportunities — vagueness wastes time. The "WE DON'T DO" list is critical for excluding irrelevant results.`,
  user: orgContext,
  maxTok: 500,
  search: false,
});

// ── REJECTION BLOCK: converts accumulated rejections into prompt text ──
export const buildRejectionBlock = (rejections) => {
  if (!rejections || rejections.length === 0) return "";

  // Cap at 50 most recent
  const recent = rejections.slice(-50);

  const rejectedFunders = [...new Set(recent.map(r => r.funder).filter(Boolean))];
  const rejectedFocusAreas = [...new Set(recent.flatMap(r => r.focus || []))];
  const customReasons = recent.filter(r => r.reasonText).map(r => `${r.name}: ${r.reasonText}`);

  let block = `\nPREVIOUSLY REJECTED — the user marked these as NOT relevant. DO NOT recommend these funders or similar opportunities:\n`;
  if (rejectedFunders.length) block += `Rejected funders: ${rejectedFunders.join(", ")}\n`;
  if (rejectedFocusAreas.length) block += `Rejected focus areas (AVOID these sectors): ${rejectedFocusAreas.join(", ")}\n`;
  if (customReasons.length) block += `Rejection notes: ${customReasons.join("; ")}\n`;
  block += `DO NOT return opportunities in the rejected sectors above. Prioritise opportunities that match the Scout Brief.\n`;
  return block;
};

// ── SCOUT ──
export const scoutPrompt = ({ existingFunders, market = "both", orgContext = "", scoutBrief = "", rejections = [] }) => {

  // ── System prompt changes entirely based on market ──
  const systemByMarket = {
    sa: {
      role: `You are a South African grant funding scout. You find open grant opportunities from South African funders for the organisation described below.`,
      searchFocus: `SEARCH for open grant opportunities in South Africa in 2026: corporate CSI funding calls, SETA discretionary grant windows, SA-based foundation rounds, government funding programmes, and SA-registered trust grants.`,
      marketRule: `FOCUS: South African funders ONLY — corporate CSI, SETAs, SA-based foundations, government agencies, SA-registered trusts. Do NOT include international or global funders.`,
    },
    global: {
      role: `You are an international grant funding scout. You find open grant opportunities from global funders for the organisation described below. The organisation is based in Africa but you must search GLOBALLY for funders — not South African domestic funders.`,
      searchFocus: `SEARCH for open international grant opportunities in 2026. You MUST search across ALL of these categories:
— US/EU/UK FOUNDATIONS: Ford Foundation, Mastercard Foundation, Skoll Foundation, Luminate, Schmidt Futures, Mozilla Foundation, Hilton Foundation, Michael & Susan Dell Foundation, ELMA Foundation, Comic Relief, IKEA Foundation, Open Society Foundations, Wellspring Philanthropic Fund, Chandler Foundation, Draper Richards Kaplan, Echoing Green, Ashoka
— BILATERAL DEVELOPMENT AGENCIES: USAID, UK FCDO (formerly DFID), GIZ (Germany), SIDA (Sweden), NORAD (Norway), Irish Aid, Swiss Agency for Development, KOICA (Korea), JICA (Japan), AFD (France), DGIS (Netherlands)
— MULTILATERAL PROGRAMMES: World Bank, IFC, UNDP, ILO, UNESCO, African Development Bank, European Commission, Global Fund
— GLOBAL TECH COMPANIES: Google.org, Microsoft Philanthropies, Salesforce.org, Cisco Foundation, Meta, Amazon Web Services, Apple, SAP Foundation, IBM, Accenture Foundation
— IMPACT INVESTORS & DFIs: Omidyar Network, Acumen, British International Investment, Norfund, FMO, Proparco, FinDev Canada
— INTERNATIONAL NGO GRANT-MAKERS: Ashoka, Echoing Green, Schwab Foundation, Skoll, Yunus Centre`,
      marketRule: `FOCUS: International/global funders ONLY. Do NOT include any South African domestic funders (no CSI, no SETAs, no SA foundations). Every result must be a funder headquartered OUTSIDE South Africa.`,
    },
    both: {
      role: `You find grant opportunities for the organisation described below.`,
      searchFocus: `SEARCH for open grant opportunities in 2026 from both South African domestic funders AND international/global funders.`,
      marketRule: `INCLUDE BOTH South African domestic funders AND international/global funders. Aim for roughly equal representation.`,
    },
  };

  const m = systemByMarket[market] || systemByMarket.both;

  // Build the scout brief and rejection injection blocks
  const briefBlock = scoutBrief
    ? `\nSCOUT BRIEF (PRIMARY MATCHING CRITERIA — use this to determine fit):\n${scoutBrief}\n`
    : "";
  const rejectionBlock = buildRejectionBlock(rejections);

  const searchScope = market === "sa"
    ? "Search for open grants in South Africa for NPOs matching the organisation profile below, March 2026. Focus on SETA windows, corporate CSI open calls, SA foundation rounds, and government funding."
    : market === "global"
    ? "Search for international and global grant opportunities for the organisation described below, March 2026. Search across: global foundations, bilateral development agencies (USAID, DFID, GIZ, etc.), multilateral programmes (World Bank, UNDP, ILO), global tech companies (Google.org, Microsoft, Cisco), impact investors, and international NGO grant-makers that fund skills development, youth employment, or digital inclusion in Africa. Do NOT return any South African domestic funders."
    : "Search for open grants for the organisation described below, March 2026. Include both SA domestic funders (SETAs, corporate CSI, foundations) AND international funders (global foundations, tech companies, development agencies).";

  return {
    system: `${m.role}
${orgContext ? `\nORGANISATION CONTEXT:\n${orgContext}\n` : ""}${briefBlock}${rejectionBlock}
${m.searchFocus}
${m.marketRule}

CRITICAL — VERIFY APPLICATION ACCESS:
For EVERY opportunity, check whether the funder accepts unsolicited proposals/applications from external organisations. Search their website for application portals, open calls, RFPs, or submission guidelines.
- "Open" = published open call, application portal, or RFP that NPOs can apply to without prior invitation
- "By invitation" = funder only accepts proposals from pre-selected or invited organisations
- "Relationship first" = no formal open call, but they accept approaches/LOIs from organisations that make contact first
- "Unknown" = could not verify — application process unclear from public sources

DO NOT include opportunities marked "By invitation" unless there is a realistic path to getting invited.
PRIORITISE "Open" opportunities. Include "Relationship first" only if the funder has a clear contact channel.

RESPOND WITH ONLY A JSON ARRAY — no markdown, no backticks, no explanation. Each object:
{"name":"[grant name]","funder":"[organisation]","type":"[Corporate CSI|Government/SETA|International|Foundation|Tech Company|Development Agency|Impact Investor]","funderBudget":[amount in ZAR integer — convert from USD/EUR/GBP if needed],"deadline":"[YYYY-MM-DD or null]","fit":"[High|Medium|Low]","reason":"[1 sentence: why it fits this organisation]","url":"[application URL or funder contact page]","focus":["tag1","tag2"],"access":"[Open|Relationship first|By invitation|Unknown]","accessNote":"[1 sentence: how to apply or how to get in the door]","market":"[sa|global]"}

FIT = HIGH only if 3+ of the organisation's key focus areas match, budget is in range, and it accepts unsolicited applications.
EXCLUDE: university-only, pure research, sectors with no relevance, invitation-only with no realistic path in.
Return 10-15 real, current opportunities. Cast a wide net across different funder types.`,
    user: `${searchScope} The organisation already has applications with: ${existingFunders}. Find NEW opportunities not already in the pipeline. For each one, VERIFY whether they accept unsolicited applications — check their website for open calls, portals, or application guidelines.`,
    maxTok: 4000,
    search: true,
  };
};
