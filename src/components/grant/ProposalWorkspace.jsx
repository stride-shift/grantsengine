import { useState, useCallback, useRef, useEffect } from "react";
import { C, FONT, MONO } from "@/theme";
import { Btn, CopyBtn, DownloadBtn } from "@/components/ui";
import { assembleText, effectiveAsk, isAIError, cleanProposalText, validateProposalBreaks, readabilityScore, readabilityLabel } from "@/utils";
import { buildGlossaryAppendix } from "@/data/glossary";
import { funderStrategy, PTYPES } from "@/data/funderStrategy";
import SectionCard from "./SectionCard";
import { analyzeEditInBackground } from "@/editLearner";

/* ── Proposal Workspace ──
   Section-by-section proposal editor.
   Replaces the monolithic Draft Proposal AICard.
*/

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
const extractAskFromText = (text) => {
  // Generic form first — works for any client without programme-type taxonomy
  const generic = text.match(/RECOMMENDED_ASK:\s*R\s*([\d,\s]+)/i);
  if (generic) {
    const amount = parseInt(generic[1].replace(/[,\s]/g, ''));
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
    const amount = parseInt(structured[4].replace(/[,\s]/g, ''));
    if (PTYPES[typeNum] && amount > 0) return { ask: amount, typeNum, mcCount: count, years, reasoning: null };
  }
  return null;
};

export default function ProposalWorkspace({ grant, ai, orgName, onRunAI, onRunResearch, onUpdate, busy, setBusy, autoGenerate, onAutoGenerateComplete, isLocked = false }) {
  const g = grant;
  const fs = funderStrategy(g);
  const order = g.aiSectionsOrder || fs.structure;
  const sections = g.aiSections || {};
  const generatingAllRef = useRef(false);
  const [showLegacy, setShowLegacy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Research must be done before drafting
  const researchDone = !!(g.aiResearch && !isAIError(g.aiResearch)) || !!(ai?.research && !isAIError(ai.research));

  // Count completed sections
  const completedCount = order.filter(n => sections[n]?.text && !isAIError(sections[n].text)).length;
  const totalCount = order.length;
  const allDone = completedCount === totalCount;
  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Is any section currently generating?
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
        // Save previous version to history
        const prev = sections[sectionName] || {};
        const newHistory = [...(prev.history || [])];
        if (prev.text && !isAIError(prev.text)) {
          newHistory.push({ ts: prev.generatedAt || new Date().toISOString(), text: prev.text });
          if (newHistory.length > 3) newHistory.shift();
        }

        const newSections = {
          ...sections,
          [sectionName]: {
            text: cleaned,
            generatedAt: new Date().toISOString(),
            editedAt: null,
            isManualEdit: false,
            customInstructions: customInstructions || prev.customInstructions || "",
            history: newHistory,
          },
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
  }, [g, order, sections, totalCount, ai, onRunAI, onUpdate, setBusy]);

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
          // Save previous version to history
          const prev = currentSections[sectionName] || {};
          const newHistory = [...(prev.history || [])];
          if (prev.text && !isAIError(prev.text)) {
            newHistory.push({ ts: prev.generatedAt || new Date().toISOString(), text: prev.text });
            if (newHistory.length > 3) newHistory.shift();
          }

          currentSections = {
            ...currentSections,
            [sectionName]: {
              text: cleaned,
              generatedAt: new Date().toISOString(),
              editedAt: null,
              isManualEdit: false,
              customInstructions: prev.customInstructions || "",
              history: newHistory,
            },
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
    const newHistory = [...(prev.history || [])];
    if (prev.text && !isAIError(prev.text)) {
      newHistory.push({ ts: prev.generatedAt || prev.editedAt || new Date().toISOString(), text: prev.text });
      if (newHistory.length > 3) newHistory.shift();
    }

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

  // ── Export .docx ──
  const exportDocx = useCallback(async () => {
    const assembled = assembleText(sections, order);
    if (!assembled.trim()) return;
    try {
      const { generateDocxFromSections, generateDocx } = await import("@/docxGenerator.js");
      const meta = { grantName: g.name, funder: g.funder, orgName: orgName || "the organisation", ask: effectiveAsk(g), type: g.type, budgetTable: g.budgetTable || null };
      if (generateDocxFromSections) {
        await generateDocxFromSections(sections, order, `${g.name}_proposal`, meta);
      } else {
        await generateDocx(assembled, `${g.name}_proposal`, meta);
      }
    } catch (e) {
      console.error("Export failed:", e);
    }
  }, [sections, order, g]);

  // ── Copy all assembled text ──
  // If the user has opted in to a glossary appendix, build it from the assembled text
  // and append. Only adds when at least one glossary term actually appears.
  // The appendix is built once from the base text and reused both here and by the
  // glossary toggle button below (it only ever repeats terms already in the base, so
  // detecting terms on base vs base+appendix yields the same set).
  const assembledBase = assembleText(sections, order);
  const glossaryAppendix = buildGlossaryAppendix(assembledBase);
  const assembledText = (g.includeGlossary && glossaryAppendix)
    ? (assembledBase + "\n\n" + glossaryAppendix)
    : assembledBase;

  // ── Readability badge (Flesch Reading Ease) ──
  // Donor-facing proposals should land in "plain English" or "fairly difficult".
  const readabilityBadgeProps = (() => {
    if (assembledText.length <= 500) return null;
    const score = readabilityScore(assembledText);
    const meta = readabilityLabel(score);
    if (score === null || !meta) return null;
    const toneColor = meta.tone === "ok" ? C.ok : meta.tone === "amber" ? C.amber : C.red;
    return { score, meta, toneColor };
  })();

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

  const pendingCount = totalCount - completedCount;

  return (
    <div style={{
      background: C.white, borderRadius: 10, overflow: "hidden",
      border: `1px solid ${allDone ? C.ok + "30" : C.line}`,
      boxShadow: C.cardShadow,
    }}>
      {/* ── Toolbar ── */}
      <div style={{
        padding: "12px 16px 10px", display: "flex", alignItems: "center", gap: 8,
        borderBottom: `1px solid ${C.line}`,
      }}>
        {/* Title + progress */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, letterSpacing: -0.3 }}>
            Proposal Workspace
          </div>
          <div style={{ fontSize: 11, color: C.t3, marginTop: 3, display: "flex", alignItems: "center", gap: 8 }}>
            <span>{completedCount}/{totalCount} sections</span>
            <div style={{
              flex: 1, maxWidth: 120, height: 4, background: C.raised, borderRadius: 2, overflow: "hidden",
            }}>
              <div style={{
                width: `${pct}%`, height: "100%", borderRadius: 2,
                background: allDone ? C.ok : `linear-gradient(90deg, ${C.primary}, ${C.purple})`,
                transition: "width 0.3s ease",
              }} />
            </div>
            {g.aiSectionsAt && <span style={{ fontSize: 10, fontFamily: MONO, color: C.t4 }}>Last full run: {new Date(g.aiSectionsAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}</span>}
            {/* Readability — Flesch Reading Ease on the assembled proposal. */}
            {readabilityBadgeProps && (
              <span title={readabilityBadgeProps.meta.note} style={{
                fontSize: 10, fontFamily: MONO, color: readabilityBadgeProps.toneColor, fontWeight: 700,
                padding: "1px 6px", borderRadius: 4, background: `${readabilityBadgeProps.toneColor}10`,
              }}>
                Readability: {readabilityBadgeProps.score} · {readabilityBadgeProps.meta.label}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {completedCount > 0 && (
            <>
              {/* View toggle: Sections / Full Document */}
              <div style={{ display: "flex", border: `1px solid ${C.line}`, borderRadius: 6, overflow: "hidden" }}>
                <button onClick={() => setShowPreview(false)} style={{
                  padding: "5px 12px", fontSize: 11, fontWeight: 600, fontFamily: FONT, border: "none", cursor: "pointer",
                  background: !showPreview ? C.primary : C.white, color: !showPreview ? "#fff" : C.t3,
                }}>Sections</button>
                <button onClick={() => setShowPreview(true)} style={{
                  padding: "5px 12px", fontSize: 11, fontWeight: 600, fontFamily: FONT, border: "none", cursor: "pointer",
                  background: showPreview ? C.primary : C.white, color: showPreview ? "#fff" : C.t3,
                }}>Full Document</button>
              </div>
              <CopyBtn text={assembledText} />
              <DownloadBtn
                text={assembledText}
                filename={`${g.name}_proposal`}
                onDocx={async (text, fn) => { await exportDocx(); }}
              />
              {/* Glossary toggle — appends a glossary of SA NPO terms / sector
                  acronyms to the proposal so international or non-specialist
                  funders aren't tripped up by B-BBEE, POPIA, SETA, etc. */}
              {(() => {
                const hasTerms = !!glossaryAppendix;
                const on = !!g.includeGlossary;
                const disabled = !hasTerms && !on;
                return (
                  <button
                    onClick={() => onUpdate(g.id, { includeGlossary: !on })}
                    disabled={disabled}
                    title={!hasTerms && !on ? "No glossary terms detected in this proposal yet." : on ? "Glossary ON — click to remove" : "Append a glossary to this proposal"}
                    style={{
                      fontSize: 11, fontWeight: 600,
                      color: on ? C.white : (disabled ? C.t4 : C.t2),
                      background: on ? C.primary : C.white,
                      border: `1px solid ${on ? C.primary : C.line}`,
                      borderRadius: 6, padding: "5px 12px",
                      cursor: disabled ? "not-allowed" : "pointer", fontFamily: FONT,
                      opacity: disabled ? 0.55 : 1,
                    }}>
                    ⓘ Glossary{on ? " ✓" : ""}
                  </button>
                );
              })()}
            </>
          )}
          {isGeneratingAll ? (
            <Btn onClick={stopGenerateAll} v="ghost" style={{ fontSize: 11, padding: "7px 14px", color: C.red }}>
              Stop
            </Btn>
          ) : (
            <Btn
              onClick={generateAll}
              disabled={anySectionBusy || !researchDone || isLocked}
              v={allDone ? "ghost" : "primary"}
              style={{ fontSize: 12, padding: "7px 16px", opacity: (researchDone && !isLocked) ? 1 : 0.5 }}
              title={isLocked ? "Proposal is locked" : researchDone ? undefined : "Run Funder Research first"}
            >
              {isLocked ? "Locked" : anySectionBusy ? "Generating..." : !researchDone ? "Research Required" : allDone ? "\u21bb Regenerate All" : `Generate All (${pendingCount})`}
            </Btn>
          )}
        </div>
      </div>

      {/* ── Research required — prominent inline card ── */}
      {!researchDone && (
        <div style={{
          margin: "12px 16px", padding: "16px 20px", background: `linear-gradient(135deg, ${C.blueSoft}, ${C.purpleSoft})`,
          borderRadius: 12, border: `1px solid ${C.blue}20`,
        }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <span style={{ fontSize: 24, lineHeight: 1 }}>🔍</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 4 }}>
                Research {g.funder || "this funder"} first
              </div>
              <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.5, marginBottom: 12 }}>
                Every proposal section will be tailored to what {g.funder || "the funder"} actually funds, their application process, and what they look for. Without research, sections use generic content.
              </div>
              <Btn
                onClick={() => onRunResearch?.()}
                disabled={busy.research}
                style={{ fontSize: 13, padding: "8px 20px", fontWeight: 700 }}
              >
                {busy.research ? "Researching..." : `Run Research on ${g.funder || "Funder"}`}
              </Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── Legacy migration banner ── */}
      {hasLegacyDraft && (
        <div style={{
          padding: "10px 16px", background: C.amberSoft, borderBottom: `1px solid ${C.amber}20`,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 12, color: C.t2, flex: 1, lineHeight: 1.4 }}>
            This grant has a single-draft proposal. Convert to editable sections or generate fresh.
          </span>
          <Btn onClick={migrateToSections} v="ghost" style={{ fontSize: 11, padding: "5px 12px", flexShrink: 0 }}>
            Convert Existing
          </Btn>
          <Btn onClick={generateAll} v="primary" disabled={!researchDone} style={{ fontSize: 11, padding: "5px 12px", flexShrink: 0, opacity: researchDone ? 1 : 0.5 }}
            title={researchDone ? undefined : "Run Funder Research first"}>
            {researchDone ? "Generate Fresh" : "Research First"}
          </Btn>
        </div>
      )}

      {/* ── Quality check: visual breaks ── */}
      {assembledText.trim().split(/\s+/).filter(Boolean).length > 300 && (() => {
        const { issues, score } = validateProposalBreaks(assembledText);
        if (issues.length === 0) return null;
        return (
          <div style={{
            margin: "0 14px 12px", padding: "10px 12px", borderRadius: 8,
            background: score < 60 ? `${C.amber}10` : `${C.amber}06`,
            border: `1px solid ${C.amber}30`,
            fontFamily: FONT,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: C.amber, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Readability check · {score}/100
              </span>
              <span style={{ fontSize: 11, color: C.t4 }}>Funders skim — break up walls of text.</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11, color: C.t2, lineHeight: 1.55 }}>
              {issues.map((iss, i) => <li key={i} style={{ marginBottom: 2 }}>{iss}</li>)}
            </ul>
          </div>
        );
      })()}

      {/* ── Document Preview ── */}
      {showPreview && assembledText.trim() && (() => {
        const fitscoreNum = (() => {
          if (!g?.aiFitscore) return null;
          const m = String(g.aiFitscore).match(/SCORE:\s*(\d+)/i);
          return m ? parseInt(m[1]) : null;
        })();
        const wordCount = assembledText.split(/\s+/).filter(Boolean).length;
        const showTOC = order.filter(n => sections[n]?.text && !isAIError(sections[n].text)).length >= 3;
        return (
        <div style={{ padding: "0 14px 14px" }}>
          <div style={{
            background: "#fff", borderRadius: 8, border: `1px solid ${C.line}`,
            boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
            maxHeight: "75vh", overflow: "hidden",
            display: "flex",
          }}>
            {/* TOC sidebar — only when proposal has 3+ sections */}
            {showTOC && (
              <div style={{ width: 220, borderRight: `1px solid ${C.line}`, overflow: "auto", padding: "16px 0", background: C.warm100, flexShrink: 0 }}>
                <div style={{ padding: "0 16px 10px", fontSize: 9, fontWeight: 700, color: C.t4, letterSpacing: 0.6, textTransform: "uppercase", fontFamily: FONT }}>Contents</div>
                {order.map((name, i) => {
                  const section = sections[name];
                  if (!section?.text || isAIError(section.text)) return null;
                  return (
                    <a key={name} href={`#docprev-sec-${i}`}
                      onClick={e => { e.preventDefault(); document.getElementById(`docprev-sec-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                      style={{ display: "block", padding: "6px 16px", fontSize: 11, color: C.t2, textDecoration: "none", lineHeight: 1.4, fontFamily: FONT, borderLeft: "2px solid transparent" }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderLeftColor = C.primary; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderLeftColor = "transparent"; }}>
                      <span style={{ fontFamily: MONO, color: C.t4, marginRight: 6 }}>{String(i + 1).padStart(2, "0")}</span>
                      {name}
                    </a>
                  );
                })}
              </div>
            )}
            {/* Document */}
            <div style={{ flex: 1, overflow: "auto", minWidth: 0 }}>
              {/* Sticky metadata bar — funder, ask, deadline, fit score always visible */}
              <div style={{
                position: "sticky", top: 0, zIndex: 5,
                background: "rgba(255,255,255,0.97)", backdropFilter: "blur(8px)",
                borderBottom: `1px solid ${C.line}`,
                padding: "10px 24px", fontFamily: FONT,
                display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", fontSize: 11,
              }}>
                <span style={{ color: C.t3 }}>Funder: <strong style={{ color: C.dark }}>{g.funder}</strong></span>
                {g.ask > 0 && <span style={{ color: C.t3 }}>Ask: <strong style={{ color: C.dark, fontFamily: MONO }}>R{g.ask.toLocaleString()}</strong></span>}
                {g.deadline && <span style={{ color: C.t3 }}>Deadline: <strong style={{ color: C.dark }}>{new Date(g.deadline).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}</strong></span>}
                <span style={{ color: C.t3, fontFamily: MONO }}>{wordCount.toLocaleString()} words</span>
                {fitscoreNum !== null && (
                  <span style={{
                    marginLeft: "auto",
                    fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 100,
                    background: fitscoreNum >= 70 ? `${C.ok}15` : fitscoreNum >= 50 ? `${C.amber}15` : `${C.red}15`,
                    color: fitscoreNum >= 70 ? C.ok : fitscoreNum >= 50 ? C.amber : C.red,
                    fontFamily: MONO, letterSpacing: 0.4,
                  }}>
                    FIT {fitscoreNum}
                  </span>
                )}
              </div>
            {/* Page-like container */}
            <div style={{
              maxWidth: 700, margin: "0 auto", padding: "48px 56px",
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: 13, lineHeight: 1.7, color: "#1a1a1a",
            }}>
              {/* Header */}
              <div style={{ textAlign: "center", marginBottom: 32, borderBottom: `2px solid ${C.primary}`, paddingBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: C.t3, textTransform: "uppercase", letterSpacing: 2, marginBottom: 8, fontFamily: FONT }}>
                  Funding Proposal
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, color: C.dark, fontFamily: FONT, marginBottom: 4 }}>
                  {g.name}
                </div>
                <div style={{ fontSize: 14, color: C.t2, fontFamily: FONT }}>
                  {g.funder}{g.ask > 0 ? ` · R${g.ask.toLocaleString()}` : ""}
                </div>
                {g.deadline && (
                  <div style={{ fontSize: 11, color: C.t3, marginTop: 4, fontFamily: FONT }}>
                    Deadline: {new Date(g.deadline).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}
                  </div>
                )}
              </div>

              {/* Table of contents — printed at the top for long proposals (300+ words) */}
              {showTOC && wordCount > 800 && (
                <div style={{ marginBottom: 32, padding: "16px 20px", background: C.warm100, borderRadius: 6, border: `1px solid ${C.line}`, fontFamily: FONT }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.t4, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 }}>Contents</div>
                  {order.map((name, i) => {
                    const sec = sections[name];
                    if (!sec?.text || isAIError(sec.text)) return null;
                    return (
                      <div key={name} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "3px 0", fontSize: 12 }}>
                        <a href={`#docprev-sec-${i}`}
                          onClick={e => { e.preventDefault(); document.getElementById(`docprev-sec-${i}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                          style={{ color: C.dark, textDecoration: "none", fontFamily: FONT }}>
                          <span style={{ fontFamily: MONO, color: C.t4, marginRight: 8 }}>{String(i + 1).padStart(2, "0")}</span>
                          {name}
                        </a>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Sections */}
              {order.map((name, i) => {
                const section = sections[name];
                if (!section?.text || isAIError(section.text)) return null;
                return (
                  <div key={name} id={`docprev-sec-${i}`} style={{ marginBottom: 28, scrollMarginTop: 70 }}>
                    <div style={{
                      fontSize: 15, fontWeight: 700, color: C.dark, fontFamily: FONT,
                      marginBottom: 8, paddingBottom: 4,
                      borderBottom: `1px solid ${C.line}`,
                    }}>
                      {i + 1}. {name}
                    </div>
                    {section.text.split("\n").map((para, j) => {
                      const trimmed = para.trim();
                      if (!trimmed) return <div key={j} style={{ height: 8 }} />;
                      // Bullet points
                      if (trimmed.startsWith("- ") || trimmed.startsWith("• ") || trimmed.startsWith("* ")) {
                        return (
                          <div key={j} style={{ display: "flex", gap: 8, marginBottom: 4, paddingLeft: 12 }}>
                            <span style={{ color: C.primary, flexShrink: 0 }}>•</span>
                            <span>{trimmed.slice(2)}</span>
                          </div>
                        );
                      }
                      // Bold lines (likely sub-headings)
                      if (trimmed.startsWith("**") && trimmed.endsWith("**")) {
                        return <div key={j} style={{ fontWeight: 700, marginTop: 12, marginBottom: 4, fontFamily: FONT }}>{trimmed.replace(/\*\*/g, "")}</div>;
                      }
                      // Table rows (pipe-separated)
                      if (trimmed.includes("|") && trimmed.split("|").length >= 3) {
                        const cells = trimmed.split("|").map(c => c.trim()).filter(Boolean);
                        return (
                          <div key={j} style={{ display: "flex", borderBottom: `1px solid ${C.line}`, padding: "4px 0" }}>
                            {cells.map((cell, k) => (
                              <span key={k} style={{ flex: k === 0 ? 2 : 1, fontSize: 12, fontFamily: FONT, color: k === 0 ? C.dark : C.t2 }}>{cell}</span>
                            ))}
                          </div>
                        );
                      }
                      // Regular paragraph
                      return <p key={j} style={{ margin: "0 0 8px 0" }}>{trimmed}</p>;
                    })}
                  </div>
                );
              })}

              {/* Footer */}
              <div style={{ marginTop: 40, paddingTop: 16, borderTop: `1px solid ${C.line}`, textAlign: "center" }}>
                <div style={{ fontSize: 11, color: C.t4, fontFamily: FONT }}>
                  Prepared by {orgName || "the organisation"} · {new Date().toLocaleDateString("en-ZA", { month: "long", year: "numeric" })}
                </div>
              </div>
            </div>
            </div>{/* end document column */}
          </div>{/* end flex wrapper */}
        </div>
        );
      })()}

      {/* ── Section Cards (hidden in Full Document view) ── */}
      {!showPreview && <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {order.map((name, i) => (
          <SectionCard
            key={name}
            name={name}
            index={i}
            total={totalCount}
            section={sections[name] || null}
            busy={!!busySections[name]}
            onGenerate={isLocked ? undefined : (customInstructions) => generateSection(name, customInstructions)}
            onSave={isLocked ? undefined : (newText) => saveSectionEdit(name, newText)}
            onRestore={isLocked ? undefined : (historyIdx) => restoreSection(name, historyIdx)}
            budgetTable={name.toLowerCase().includes("budget") ? g.budgetTable : undefined}
            isLocked={isLocked}
          />
        ))}
      </div>}

      {/* ── Legacy draft viewer (toggle) ── */}
      {hasLegacyDraft && (
        <div style={{ padding: "0 14px 12px" }}>
          <button onClick={() => setShowLegacy(p => !p)}
            style={{
              fontSize: 11, color: C.t4, background: "none", border: "none",
              cursor: "pointer", fontFamily: FONT, padding: "4px 0",
            }}>
            {showLegacy ? "Hide" : "Show"} original single draft
          </button>
          {showLegacy && (
            <div style={{
              marginTop: 6, padding: "14px 16px", background: C.warm100, borderRadius: 10,
              border: `1px solid ${C.line}`, fontSize: 12, lineHeight: 1.7, color: C.t2,
              whiteSpace: "pre-wrap", maxHeight: 300, overflow: "auto",
            }}>
              {g.aiDraft}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
