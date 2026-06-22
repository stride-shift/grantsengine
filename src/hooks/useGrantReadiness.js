import { useMemo } from "react";
import { grantReadiness, isAIError } from "@/utils";

/**
 * Readiness + AI-status view-model for a grant. Small and mostly pure: it
 * computes the readiness object (score / missing / nextAction) and parses the
 * grant's AI state into the boolean/number flags the GrantDetail render tree
 * (workflow strip, sections, sidebar) reads.
 *
 * The AI result text lives in component/`useGrantAI` state (synced from the
 * grant on open), so it's passed in as `ai` rather than read off the grant —
 * this keeps the displayed fit/research/draft in lock-step with in-flight runs.
 *
 * @param grant the grant being viewed
 * @param complianceDocs org compliance docs (for doc-readiness scoring)
 * @param ai live AI state { research, draft, followup, fitscore, winloss }
 * @returns { readiness, fitDone, resDone, hasSections, draftDone, followupDone,
 *            winlossDone, fitScoreNum, fitVerdict, fitError }
 */
export default function useGrantReadiness(grant, complianceDocs = [], ai = {}) {
  const g = grant;

  // ── Grant readiness (computed once; used by sidebar, sticky bar, readiness bar) ──
  // try/catch → null guard preserved from the original component memo.
  const readiness = useMemo(() => {
    try { return grantReadiness(g, complianceDocs); } catch { return null; }
  }, [g, complianceDocs]);

  // ── Lifted AI status (shared by workflow strip + sections) ──
  const fitDone = ai.fitscore && !isAIError(ai.fitscore);
  const resDone = ai.research && !isAIError(ai.research);
  const hasSections = g?.aiSections && Object.values(g.aiSections).some(s => s?.text && !isAIError(s.text));
  const draftDone = hasSections || (ai.draft && !isAIError(ai.draft));
  const followupDone = ai.followup && !isAIError(ai.followup);
  const winlossDone = ai.winloss && !isAIError(ai.winloss);

  const fitScoreNum = fitDone ? (() => { const m = ai.fitscore.match(/SCORE:\s*(\d+)/); return m ? parseInt(m[1]) : null; })() : null;
  const fitVerdict = fitDone ? (() => { const m = ai.fitscore.match(/VERDICT:\s*(.+)/); return m ? m[1].trim() : null; })() : null;
  const fitError = ai.fitscore && isAIError(ai.fitscore) ? ai.fitscore : null;

  return {
    readiness,
    fitDone, resDone, hasSections, draftDone, followupDone, winlossDone,
    fitScoreNum, fitVerdict, fitError,
  };
}
