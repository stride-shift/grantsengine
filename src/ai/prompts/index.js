// Registry of per-action-type prompt builders for useAI.
//
// Each builder is a pure function: (ctx) => ({ system, user, search, maxTokens })
// where `ctx` is the already-assembled context the hook builds (orgCtx, orgName,
// budgetInfo, perStudentStr, costHook, factGuard, grant, priorResearch,
// priorFitScore, grants, team, stages, and the two research-selection helpers).
//
// A few builders short-circuit before any API call (no brief/research to parse,
// empty sentence list, etc). Those return { result: <string> } instead — the
// hook returns that string directly, exactly as the original inline branches did.
//
// This module moves ONLY prompt-string construction out of useAI.js. All
// orchestration (readOnly guard, context assembly, the api() call, per-type
// post-processing) stays in the hook. Behaviour is unchanged.
import buildDraft from "./draft";
import buildSectionDraft from "./sectionDraft";
import buildRewriteForReadability from "./rewriteForReadability";
import {
  buildConceptNote,
  buildResearch,
  buildFollowup,
  buildExtractRequiredDocs,
  buildExtractEmailFeedback,
  buildExtractNotes,
  buildFitscore,
  buildWinloss,
  buildFetchFunderBrief,
  buildFindApplyUrl,
  buildUrlextract,
} from "./funderTools";
import { buildBrief, buildReport, buildInsights, buildStrategy } from "./pipeline";

export const PROMPT_BUILDERS = {
  draft: buildDraft,
  sectionDraft: buildSectionDraft,
  conceptNote: buildConceptNote,
  research: buildResearch,
  followup: buildFollowup,
  extractRequiredDocs: buildExtractRequiredDocs,
  extractEmailFeedback: buildExtractEmailFeedback,
  extractNotes: buildExtractNotes,
  fitscore: buildFitscore,
  brief: buildBrief,
  winloss: buildWinloss,
  fetchFunderBrief: buildFetchFunderBrief,
  findApplyUrl: buildFindApplyUrl,
  urlextract: buildUrlextract,
  report: buildReport,
  insights: buildInsights,
  strategy: buildStrategy,
  rewriteForReadability: buildRewriteForReadability,
};

export function getPromptBuilder(type) {
  return PROMPT_BUILDERS[type] || null;
}
