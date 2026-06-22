import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  assembleText,
  isAIError,
  cleanProposalText,
  readabilityScore,
  readabilityLabel,
} from "@/utils";
import { buildGlossaryAppendix } from "@/data/glossary";
import { funderStrategy, PTYPES } from "@/data/funderStrategy";
import { analyzeEditInBackground } from "@/editLearner";
import { C } from "@/theme";

/* ── useProposalSections ──
   Headless view-model for the section-by-section proposal editor. Owns all
   business logic: section generation (single + sequential "all"), the 3-entry
   history ring buffer, manual-edit saves, history restore, legacy draft
   migration, and every derived value the workspace renders (assembled text +
   glossary appendix, readability badge, completed/all-done/percent, research
   gate). The component (ProposalWorkspace.jsx) renders from this and keeps only
   transient UI state (view toggle, expanded section, in-progress edit text).

   IMPORTANT — behaviour-preserving notes:
   - The section object shape written to g.aiSections is identical to the
     original inline implementation (consumed by SectionCard, the preview, the
     docx export, and editLearner).
   - busy / setBusy stay owned by the parent (App.jsx) and are threaded through
     here unchanged, so the busy.sections / busy.generateAll contract is intact.
   - The ring buffer keeps at most 3 history entries.
   - generateAll cancellation still works via generatingAllRef.
*/

// Push the previous version of a section onto its history ring buffer (cap 3).
// Mirrors the original inline logic exactly: only push real (non-AI-error) text.
const pushHistory = (prev, tsFallbackKeys = ["generatedAt"]) => {
  const newHistory = [...(prev.history || [])];
  if (prev.text && !isAIError(prev.text)) {
    let ts = null;
    for (const k of tsFallbackKeys) { if (prev[k]) { ts = prev[k]; break; } }
    newHistory.push({ ts: ts || new Date().toISOString(), text: prev.text });
    if (newHistory.length > 3) newHistory.shift();
  }
  return newHistory;
};

// Build a freshly-generated section object from cleaned AI text.
const buildSection = (cleaned, prev, customInstructions, newHistory) => ({
  text: cleaned,
  generatedAt: new Date().toISOString(),
  editedAt: null,
  isManualEdit: false,
  customInstructions: customInstructions ?? prev.customInstructions ?? "",
  history: newHistory,
});

// Parse the AI's recommended ask + reasoning from a Budget section.
// Two formats are supported:
//
//   1. Generic (any org)  — preferred, works for every client:
//        RECOMMENDED_ASK: R[amount]
//        ASK_REASONING: [1-3 sentences explaining why]
//
//   2. Legacy d-lab specific — kept for backward compat with existing seeded
//      grants that may have older ASK_RECOMMENDATION strings in their drafts:
//        ASK_RECOMMENDATION: Type [1-7], [count] cohort(s), [years] year(s), R[total]
//
// Returns { ask, reasoning, years?, mcCount?, typeNum? } or null.
export const extractAskFromText = (text) => {
  // Generic form first — works for any client without programme-type taxonomy
  const generic = text.match(/RECOMMENDED_ASK:\s*R\s*([\d,\s]+)/i);
  if (generic) {
    const amount = parseInt(generic[1].replace(/[,\s]/g, ""));
    if (amount > 0) {
      const reasonMatch = text.match(/ASK_REASONING:\s*([^\n]+(?:\n[^\n]+){0,2})/i);
      const yearsMatch = text.match(/ASK_YEARS:\s*(\d+)/i);
      return {
        ask: amount,
        reasoning: reasonMatch ? reasonMatch[1].trim() : null,
        years: yearsMatch ? parseInt(yearsMatch[1]) : 1,
      };
    }
  }
  // Legacy d-lab form
  const structured = text.match(/ASK_RECOMMENDATION:\s*Type\s*(\d),\s*(\d+)\s*cohort\(s?\),\s*(?:(\d+)\s*year\(s?\),\s*)?R([\d,\s]+)/i);
  if (structured) {
    const typeNum = parseInt(structured[1]);
    const count = parseInt(structured[2]);
    const years = structured[3] ? parseInt(structured[3]) : 1;
    const amount = parseInt(structured[4].replace(/[,\s]/g, ""));
    if (PTYPES[typeNum] && amount > 0) return { ask: amount, typeNum, mcCount: count, years, reasoning: null };
  }
  return null;
};

/**
 * @param grant     the grant being drafted
 * @param ai        per-grant AI result bag (ai.research / ai.fitscore)
 * @param onRunAI   (kind, grant, args, search) => Promise<string> AI proxy
 * @param onRunResearch optional callback used by the research gate
 * @param onUpdate  (grantId, changes) persistence callback
 * @param busy      busy-state bag owned by the parent (busy.sections / busy.generateAll)
 * @param setBusy   setter for the busy-state bag
 */
export default function useProposalSections({
  grant,
  ai,
  onRunAI,
  onRunResearch,
  onUpdate,
  busy,
  setBusy,
  autoGenerate,
  onAutoGenerateComplete,
}) {
  const g = grant;
  const fs = funderStrategy(g);
  const order = g.aiSectionsOrder || fs.structure;
  const sections = g.aiSections || {};
  const generatingAllRef = useRef(false);

  // ── Research gate: research must be done before drafting ──
  const researchDone = !!(g.aiResearch && !isAIError(g.aiResearch)) || !!(ai?.research && !isAIError(ai.research));

  // ── Completed / all-done / percent ──
  const completedCount = order.filter(n => sections[n]?.text && !isAIError(sections[n].text)).length;
  const totalCount = order.length;
  const allDone = completedCount === totalCount;
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const pendingCount = totalCount - completedCount;

  // ── Busy projections ──
  const busySections = busy.sections || {};
  const anySectionBusy = Object.values(busySections).some(Boolean);
  const isGeneratingAll = busy.generateAll || false;

  // ── Generate a single section ──
  const generateSection = useCallback(async (sectionName, customInstructions) => {
    if (!researchDone) { onRunResearch?.(); return; }
    const sectionIndex = order.indexOf(sectionName);
    setBusy(p => ({ ...p, sections: { ...(p.sections || {}), [sectionName]: true } }));

    try {
      // Build completed sections context (prior sections only)
      const completedSections = {};
      for (let j = 0; j < sectionIndex; j++) {
        const prior = order[j];
        if (sections[prior]?.text && !isAIError(sections[prior].text)) {
          completedSections[prior] = sections[prior];
        }
      }

      const result = await onRunAI("sectionDraft", g, {
        sectionName,
        sectionIndex,
        totalSections: totalCount,
        allSections: order,
        completedSections,
        customInstructions: customInstructions || "",
        research: ai?.research || null,
        fitscore: ai?.fitscore || null,
      }, null);

      if (!isAIError(result)) {
        const cleaned = cleanProposalText(result);
        const prev = sections[sectionName] || {};
        const newHistory = pushHistory(prev, ["generatedAt"]);

        const newSections = {
          ...sections,
          [sectionName]: buildSection(cleaned, prev, customInstructions || prev.customInstructions || "", newHistory),
        };

        onUpdate(g.id, { aiSections: newSections, aiSectionsOrder: order });
      } else {
        const newSections = {
          ...sections,
          [sectionName]: { ...(sections[sectionName] || {}), text: result, generatedAt: new Date().toISOString() },
        };
        onUpdate(g.id, { aiSections: newSections, aiSectionsOrder: order });
      }
    } catch (e) {
      const newSections = {
        ...sections,
        [sectionName]: { ...(sections[sectionName] || {}), text: `Error: ${e.message}`, generatedAt: new Date().toISOString() },
      };
      onUpdate(g.id, { aiSections: newSections, aiSectionsOrder: order });
    }

    setBusy(p => ({ ...p, sections: { ...(p.sections || {}), [sectionName]: false } }));
  }, [g, order, sections, totalCount, ai, onRunAI, onRunResearch, onUpdate, setBusy, researchDone]);

  // ── Generate All sections sequentially ──
  const generateAll = useCallback(async () => {
    if (generatingAllRef.current) return;
    generatingAllRef.current = true;
    setBusy(p => ({ ...p, generateAll: true }));

    // Step 1: run research INLINE if missing — previously this bailed out and the
    // section loop never resumed once research completed, leaving the user stuck
    // staring at "Generating proposal…". Now we await it and keep the text in a
    // local var so every section call can read it without relying on stale
    // closure values of g.aiResearch.
    let researchText = (g.aiResearch && !isAIError(g.aiResearch)) ? g.aiResearch : (ai?.research && !isAIError(ai.research) ? ai.research : null);
    let fitscoreText = (g.aiFitscore && !isAIError(g.aiFitscore)) ? g.aiFitscore : (ai?.fitscore && !isAIError(ai.fitscore) ? ai.fitscore : null);
    if (!researchText) {
      setBusy(p => ({ ...p, sections: { ...(p.sections || {}), _research: true } }));
      try {
        const r = await onRunAI("research", g);
        if (!isAIError(r)) {
          researchText = cleanProposalText(r);
          onUpdate(g.id, { aiResearch: researchText, aiResearchAt: new Date().toISOString() });
        }
      } catch (e) { console.error("Research failed:", e); }
      setBusy(p => ({ ...p, sections: { ...(p.sections || {}), _research: false } }));
    }
    // Use a grant clone with the fresh research so the prompt builder picks it up
    const gWithResearch = { ...g, aiResearch: researchText || g.aiResearch, aiFitscore: fitscoreText || g.aiFitscore };

    let currentSections = { ...(g.aiSections || {}) };

    for (let i = 0; i < order.length; i++) {
      if (!generatingAllRef.current) break; // user cancelled

      const sectionName = order[i];

      // Skip user-edited sections
      if (currentSections[sectionName]?.isManualEdit) continue;

      setBusy(p => ({ ...p, sections: { ...(p.sections || {}), [sectionName]: true } }));

      try {
        // Build completed sections from what we've generated so far
        const completedSections = {};
        for (let j = 0; j < i; j++) {
          const prior = order[j];
          if (currentSections[prior]?.text && !isAIError(currentSections[prior].text)) {
            completedSections[prior] = currentSections[prior];
          }
        }

        const result = await onRunAI("sectionDraft", gWithResearch, {
          sectionName,
          sectionIndex: i,
          totalSections: order.length,
          allSections: order,
          completedSections,
          customInstructions: currentSections[sectionName]?.customInstructions || "",
          research: researchText,
          fitscore: fitscoreText,
        }, null);

        if (!isAIError(result)) {
          const cleaned = cleanProposalText(result);
          const prev = currentSections[sectionName] || {};
          const newHistory = pushHistory(prev, ["generatedAt"]);

          currentSections = {
            ...currentSections,
            [sectionName]: buildSection(cleaned, prev, prev.customInstructions || "", newHistory),
          };
        } else {
          currentSections = {
            ...currentSections,
            [sectionName]: { ...(currentSections[sectionName] || {}), text: result, generatedAt: new Date().toISOString() },
          };
        }

        // Persist after each section
        onUpdate(g.id, { aiSections: { ...currentSections }, aiSectionsOrder: order });
      } catch (e) {
        currentSections = {
          ...currentSections,
          [sectionName]: { ...(currentSections[sectionName] || {}), text: `Error: ${e.message}`, generatedAt: new Date().toISOString() },
        };
        onUpdate(g.id, { aiSections: { ...currentSections }, aiSectionsOrder: order });
      }

      setBusy(p => ({ ...p, sections: { ...(p.sections || {}), [sectionName]: false } }));
    }

    // Final assembly — populate aiDraft for backward compat
    const assembled = assembleText(currentSections, order);
    const updates = {
      aiSections: currentSections,
      aiSectionsOrder: order,
      aiSectionsAt: new Date().toISOString(),
      aiDraft: assembled,
      aiDraftAt: new Date().toISOString(),
    };

    // Parse the AI's recommended ask + reasoning from the Budget-like section.
    // Respect a manual override — if the user set the ask themselves (user-override,
    // manual, or budget-builder), we don't overwrite the ask. We still record what
    // the AI would have recommended (+ its reasoning) so the UI can show it as a hint.
    const budgetSection = order.find(n => n.toLowerCase().includes("budget"));
    if (budgetSection && currentSections[budgetSection]?.text) {
      const extracted = extractAskFromText(currentSections[budgetSection].text);
      if (extracted) {
        const userOverridden = ["user-override", "manual", "budget-builder"].includes(g.askSource);
        updates.aiRecommendedAsk = extracted.ask;
        if (extracted.reasoning) updates.aiAskReasoning = extracted.reasoning;
        if (!userOverridden) {
          updates.ask = extracted.ask;
          updates.askSource = "ai-draft";
          if (extracted.years > 1) updates.askYears = extracted.years;
        }
      }
    }

    // Auto-advance stage
    if (["scouted", "vetting", "qualifying"].includes(g.stage)) {
      updates.stage = "drafting";
    }

    onUpdate(g.id, updates);

    setBusy(p => ({ ...p, generateAll: false }));
    generatingAllRef.current = false;
  }, [g, order, ai, onRunAI, onUpdate, setBusy]);

  // ── Stop Generate All ──
  const stopGenerateAll = useCallback(() => {
    generatingAllRef.current = false;
  }, []);

  // ── Auto-generate when "Roll the Dice" triggers ──
  const autoGenTriggered = useRef(false);
  useEffect(() => {
    if (autoGenerate && !autoGenTriggered.current && !isGeneratingAll && !anySectionBusy) {
      autoGenTriggered.current = true;
      generateAll().then(() => {
        if (onAutoGenerateComplete) onAutoGenerateComplete();
        autoGenTriggered.current = false;
      });
    }
    if (!autoGenerate) autoGenTriggered.current = false;
  }, [autoGenerate, isGeneratingAll, anySectionBusy, generateAll, onAutoGenerateComplete]);

  // ── Save section edit ──
  const saveSectionEdit = useCallback((sectionName, newText) => {
    const prev = sections[sectionName] || {};
    const newHistory = pushHistory(prev, ["generatedAt", "editedAt"]);

    const newSections = {
      ...sections,
      [sectionName]: {
        ...prev,
        text: newText,
        editedAt: new Date().toISOString(),
        isManualEdit: true,
        history: newHistory,
      },
    };

    // Also update aiDraft for backward compat
    const assembled = assembleText(newSections, order);
    onUpdate(g.id, { aiSections: newSections, aiDraft: assembled, aiDraftAt: new Date().toISOString() });

    // Learn from this edit — background analysis, never blocks the UI
    const originalText = prev.text;
    if (originalText && !isAIError(originalText) && originalText !== newText) {
      analyzeEditInBackground(sectionName, originalText, newText);
    }
  }, [g.id, sections, order, onUpdate]);

  // ── Restore section from history ──
  const restoreSection = useCallback((sectionName, historyIndex) => {
    const sec = sections[sectionName];
    if (!sec?.history?.[historyIndex]) return;
    const restored = sec.history[historyIndex];
    const newSections = {
      ...sections,
      [sectionName]: {
        ...sec,
        text: restored.text,
        editedAt: new Date().toISOString(),
        isManualEdit: true,
      },
    };
    const assembled = assembleText(newSections, order);
    onUpdate(g.id, { aiSections: newSections, aiDraft: assembled, aiDraftAt: new Date().toISOString() });
  }, [g.id, sections, order, onUpdate]);

  // ── Legacy migration: grant has aiDraft but no aiSections ──
  const hasLegacyDraft = g.aiDraft && !g.aiSections;
  const migrateToSections = useCallback(() => {
    const text = g.aiDraft;
    const newSections = {};
    const fullText = text;

    for (let i = 0; i < order.length; i++) {
      const name = order[i];
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const patterns = [
        new RegExp(`(?:^|\\n)\\s*(?:\\d+\\.?\\s*)?${escaped}\\s*\\n`, "i"),
        new RegExp(`(?:^|\\n)\\s*${escaped.toUpperCase()}\\s*\\n`),
      ];

      let matchIdx = -1;
      let matchLen = 0;
      for (const p of patterns) {
        const m = fullText.match(p);
        if (m) { matchIdx = m.index; matchLen = m[0].length; break; }
      }

      if (matchIdx >= 0) {
        const startIdx = matchIdx + matchLen;
        // Find next section header
        let endIdx = fullText.length;
        for (let j = i + 1; j < order.length; j++) {
          const nextEsc = order[j].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const nextP = new RegExp(`(?:^|\\n)\\s*(?:\\d+\\.?\\s*)?${nextEsc}\\s*\\n`, "i");
          const nextM = fullText.slice(startIdx).match(nextP);
          if (nextM) { endIdx = startIdx + nextM.index; break; }
        }
        const sectionText = fullText.slice(startIdx, endIdx).replace(/^[\s=\-]+/, "").trim();
        if (sectionText) {
          newSections[name] = {
            text: sectionText,
            generatedAt: g.aiDraftAt || new Date().toISOString(),
            editedAt: null,
            isManualEdit: false,
            customInstructions: "",
            history: [],
          };
        }
      }
    }

    onUpdate(g.id, { aiSections: newSections, aiSectionsOrder: order });
  }, [g, order, onUpdate]);

  // ── Assembled text (+ optional glossary appendix) ──
  // If the user has opted in to a glossary appendix, build it from the assembled
  // text and append. Only adds when at least one glossary term actually appears.
  // The appendix is built once from the base text and reused both for copy/export
  // and the glossary toggle button (it only ever repeats terms already in the base,
  // so detecting terms on base vs base+appendix yields the same set).
  const assembledBase = useMemo(() => assembleText(sections, order), [sections, order]);
  const glossaryAppendix = useMemo(() => buildGlossaryAppendix(assembledBase), [assembledBase]);
  const assembledText = useMemo(
    () => (g.includeGlossary && glossaryAppendix) ? (assembledBase + "\n\n" + glossaryAppendix) : assembledBase,
    [g.includeGlossary, glossaryAppendix, assembledBase]
  );

  // ── Readability badge (Flesch Reading Ease) ──
  // Donor-facing proposals should land in "plain English" or "fairly difficult".
  const readabilityBadgeProps = useMemo(() => {
    if (assembledText.length <= 500) return null;
    const score = readabilityScore(assembledText);
    const meta = readabilityLabel(score);
    if (score === null || !meta) return null;
    const toneColor = meta.tone === "ok" ? C.ok : meta.tone === "amber" ? C.amber : C.red;
    return { score, meta, toneColor };
  }, [assembledText]);

  return {
    // model / config
    order, sections, fs,
    // derived
    researchDone, completedCount, totalCount, allDone, pct, pendingCount,
    busySections, anySectionBusy, isGeneratingAll,
    hasLegacyDraft, assembledText, glossaryAppendix, readabilityBadgeProps,
    // actions
    generateSection, generateAll, stopGenerateAll,
    saveSectionEdit, restoreSection, migrateToSections,
  };
}
