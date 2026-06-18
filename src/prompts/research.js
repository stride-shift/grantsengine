// Prompt builders extracted move-only from src/hooks/useAI.js (Phase 3). Each takes a context
// bag (the locals runAI assembles) and returns { system, user, search, maxTokens } — or { result }
// for a precomputed early return. Pure: no I/O. Pinned byte-for-byte by useAI.prompts.snapshot.test.js.

import { funderStrategy } from "../data/funderStrategy";

const P = (system, user, search, maxTokens) => ({ system, user, search, maxTokens });

export const buildResearchPrompt = (ctx) => {
  const { type, grant, orgName, orgCtx, factGuard, budgetInfo, perStudentStr, costHook, priorResearch, priorFitScore, grants, team, stages } = ctx;
      const fs = funderStrategy(grant);
      return P(
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
};

export const buildFollowupPrompt = (ctx) => {
  const { type, grant, orgName, orgCtx, factGuard, budgetInfo, perStudentStr, costHook, priorResearch, priorFitScore, grants, team, stages } = ctx;
      const fs = funderStrategy(grant);
      return P(
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
};

export const buildFitScorePrompt = (ctx) => {
  const { type, grant, orgName, orgCtx, factGuard, budgetInfo, perStudentStr, costHook, priorResearch, priorFitScore, grants, team, stages } = ctx;
      const fs = funderStrategy(grant);
      return P(
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
};
