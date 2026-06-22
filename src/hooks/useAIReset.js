import { useState, useCallback } from "react";
import useAsyncAction from "@/hooks/useAsyncAction";

// AI fields cleared when resetting a grant's AI content.
export const AI_FIELDS = {
  aiResearch: null, aiResearchAt: null, aiResearchStructured: null,
  aiDraft: null, aiDraftAt: null,
  aiFitscore: null, aiFitscoreAt: null,
  aiFollowup: null, aiFollowupAt: null,
  aiWinloss: null,
  aiRecommendedAsk: null,
  aiSections: null,
  researchHistory: null,
};

/**
 * Reset-all-AI-content loop. Iterates the AI-bearing grants, clears AI_FIELDS
 * on each (persisting via onSaveGrant), then clears the same fields across
 * local state via onSetGrants. Tracks per-grant progress and flashes a
 * success/error message. The component owns the confirm-dialog open/close UI
 * and renders `progress`/`busy`.
 *
 * @param withAI      grants carrying AI content (the work list + count)
 * @param onSaveGrant (grant) => Promise — persists one cleaned grant
 * @param onSetGrants setter (functional) to clear AI fields in local state
 * @param flash       (msg) => void — transient status message
 * @param initialTotal initial progress total before the loop starts (the full
 *                     grant count, matching the original confirm-button label)
 */
export default function useAIReset(withAI, onSaveGrant, onSetGrants, flash, initialTotal) {
  const [progress, setProgress] = useState(null);

  const { run, busy } = useAsyncAction(
    useCallback(async () => {
      setProgress({ done: 0, total: initialTotal });
      let done = 0;
      for (const g of withAI) {
        const cleaned = { ...g, ...AI_FIELDS };
        await onSaveGrant(cleaned);
        done++;
        setProgress({ done, total: withAI.length });
      }
      // Update local state
      onSetGrants(prev => prev.map(g => ({ ...g, ...AI_FIELDS })));
      return withAI.length;
    }, [withAI, onSaveGrant, onSetGrants, initialTotal]),
    {
      onSuccess: (count) => flash(`AI content cleared from ${count} grant${count !== 1 ? "s" : ""}`),
      onError: (e) => flash(`Error: ${e.message}`),
    }
  );

  const reset = useCallback(async () => {
    await run();
    setProgress(null);
  }, [run]);

  return { reset, busy, progress };
}
