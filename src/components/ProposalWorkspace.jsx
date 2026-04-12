import { useState, useCallback, useRef, useEffect } from "react";
import { C, FONT, MONO } from "../theme";
import { Btn, CopyBtn, DownloadBtn } from "./index";
import { assembleText, effectiveAsk, isAIError, cleanProposalText } from "../utils";
import { funderStrategy, detectType, PTYPES } from "../data/funderStrategy";
import SectionCard from "./SectionCard";
import { analyzeEditInBackground } from "../editLearner";

/* ── Proposal Workspace ──
   Section-by-section proposal editor.
   Replaces the monolithic Draft Proposal AICard.
*/

// Parse ASK_RECOMMENDATION from a section (typically Budget)
// Format: ASK_RECOMMENDATION: Type [1-7], [count] cohort(s), [years] year(s), R[total]
// The year(s) part is optional — defaults to 1
const extractAskFromText = (text) => {
  const structured = text.match(/ASK_RECOMMENDATION:\s*Type\s*(\d),\s*(\d+)\s*cohort\(s?\),\s*(?:(\d+)\s*year\(s?\),\s*)?R([\d,\s]+)/i);
  if (structured) {
    const typeNum = parseInt(structured[1]);
    const count = parseInt(structured[2]);
    const years = structured[3] ? parseInt(structured[3]) : 1;
    const amount = parseInt(structured[4].replace(/[,\s]/g, ''));
    if (PTYPES[typeNum] && amount > 0) return { ask: amount, typeNum, mcCount: count, years };
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
    if (!researchDone) { onRunResearch?.(); return; }
    if (generatingAllRef.current) return;
    generatingAllRef.current = true;
    setBusy(p => ({ ...p, generateAll: true }));

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

        const result = await onRunAI("sectionDraft", g, {
          sectionName,
          sectionIndex: i,
          totalSections: order.length,
          allSections: order,
          completedSections,
          customInstructions: currentSections[sectionName]?.customInstructions || "",
          research: ai?.research || null,
          fitscore: ai?.fitscore || null,
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

    // Parse ASK_RECOMMENDATION from Budget-like sections
    const budgetSection = order.find(n => n.toLowerCase().includes("budget"));
    if (budgetSection && currentSections[budgetSection]?.text) {
      const extracted = extractAskFromText(currentSections[budgetSection].text);
      if (extracted) {
        updates.ask = extracted.ask;
        updates.askSource = "ai-draft";
        updates.aiRecommendedAsk = extracted.ask;
        if (extracted.years > 1) updates.askYears = extracted.years;
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
      const { generateDocxFromSections, generateDocx } = await import("../docxGenerator.js");
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
  const assembledText = assembleText(sections, order);

  // ── Legacy migration: grant has aiDraft but no aiSections ──
  const hasLegacyDraft = g.aiDraft && !g.aiSections;
  const migrateToSections = useCallback(() => {
    const text = g.aiDraft;
    const newSections = {};
    let remaining = text;

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
        const m = remaining.match(p);
        if (m) { matchIdx = m.index; matchLen = m[0].length; break; }
      }

      if (matchIdx >= 0) {
        const startIdx = matchIdx + matchLen;
        // Find next section header
        let endIdx = remaining.length;
        for (let j = i + 1; j < order.length; j++) {
          const nextEsc = order[j].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const nextP = new RegExp(`(?:^|\\n)\\s*(?:\\d+\\.?\\s*)?${nextEsc}\\s*\\n`, "i");
          const nextM = remaining.slice(startIdx).match(nextP);
          if (nextM) { endIdx = startIdx + nextM.index; break; }
        }
        const sectionText = remaining.slice(startIdx, endIdx).replace(/^[\s=\-]+/, "").trim();
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

      {/* ── Document Preview ── */}
      {showPreview && assembledText.trim() && (
        <div style={{ padding: "0 14px 14px" }}>
          <div style={{
            background: "#fff", borderRadius: 8, border: `1px solid ${C.line}`,
            boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
            maxHeight: "70vh", overflow: "auto",
          }}>
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

              {/* Sections */}
              {order.map((name, i) => {
                const section = sections[name];
                if (!section?.text || isAIError(section.text)) return null;
                return (
                  <div key={name} style={{ marginBottom: 28 }}>
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
          </div>
        </div>
      )}

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
