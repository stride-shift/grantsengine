import { useState, useCallback, useRef } from "react";
import { C, FONT, MONO } from "../theme";
import { Btn, CopyBtn, DownloadBtn } from "./index";
import { assembleText, effectiveAsk } from "../utils";
import { funderStrategy, detectType, PTYPES } from "../data/funderStrategy";
import SectionCard from "./SectionCard";

/* ── Proposal Workspace ──
   Section-by-section proposal editor.
   Replaces the monolithic Draft Proposal AICard.
*/

const isAIError = (r) => !r || r.startsWith("Error") || r.startsWith("Rate limit") || r.startsWith("Connection") || r.startsWith("Request failed") || r.startsWith("No response") || r.startsWith("The AI service");

// Parse ASK_RECOMMENDATION from a section (typically Budget)
const extractAskFromText = (text) => {
  const structured = text.match(/ASK_RECOMMENDATION:\s*Type\s*(\d),\s*(\d+)\s*cohort\(s?\),\s*R(\d+)/i);
  if (structured) {
    const typeNum = parseInt(structured[1]);
    const count = parseInt(structured[2]);
    const amount = parseInt(structured[3]);
    if (PTYPES[typeNum] && amount > 0) return { ask: amount, typeNum, mcCount: count };
  }
  return null;
};

export default function ProposalWorkspace({ grant, ai, onRunAI, onUpdate, busy, setBusy }) {
  const g = grant;
  const fs = funderStrategy(g);
  const order = g.aiSectionsOrder || fs.structure;
  const sections = g.aiSections || {};
  const generatingAllRef = useRef(false);
  const [showLegacy, setShowLegacy] = useState(false);

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
        completedSections,
        customInstructions: customInstructions || "",
        research: ai?.research || null,
        fitscore: ai?.fitscore || null,
      }, null);

      if (!isAIError(result)) {
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
            text: result,
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
          completedSections,
          customInstructions: currentSections[sectionName]?.customInstructions || "",
          research: ai?.research || null,
          fitscore: ai?.fitscore || null,
        }, null);

        if (!isAIError(result)) {
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
              text: result,
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
      }
    }

    // Auto-advance stage
    if (["scouted", "qualifying"].includes(g.stage)) {
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
      const meta = { grantName: g.name, funder: g.funder, orgName: "d-lab NPC", ask: effectiveAsk(g), type: g.type };
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
      background: C.white, borderRadius: 16, overflow: "hidden",
      border: `1.5px solid ${allDone ? C.ok + "30" : C.line}`,
      boxShadow: C.cardShadow,
    }}>
      {/* ── Toolbar ── */}
      <div style={{
        padding: "16px 20px 14px", display: "flex", alignItems: "center", gap: 10,
        borderBottom: `1px solid ${C.line}`,
      }}>
        {/* Title + progress */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, letterSpacing: -0.3 }}>
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
              disabled={anySectionBusy}
              v={allDone ? "ghost" : "primary"}
              style={{ fontSize: 12, padding: "7px 16px" }}
            >
              {anySectionBusy ? "Generating..." : allDone ? "\u21bb Regenerate All" : `Generate All (${pendingCount})`}
            </Btn>
          )}
        </div>
      </div>

      {/* ── Legacy migration banner ── */}
      {hasLegacyDraft && (
        <div style={{
          padding: "12px 20px", background: C.amberSoft, borderBottom: `1px solid ${C.amber}20`,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 12, color: C.t2, flex: 1, lineHeight: 1.4 }}>
            This grant has a single-draft proposal. Convert to editable sections or generate fresh.
          </span>
          <Btn onClick={migrateToSections} v="ghost" style={{ fontSize: 11, padding: "5px 12px", flexShrink: 0 }}>
            Convert Existing
          </Btn>
          <Btn onClick={generateAll} v="primary" style={{ fontSize: 11, padding: "5px 12px", flexShrink: 0 }}>
            Generate Fresh
          </Btn>
        </div>
      )}

      {/* ── Section Cards ── */}
      <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
        {order.map((name, i) => (
          <SectionCard
            key={name}
            name={name}
            index={i}
            total={totalCount}
            section={sections[name] || null}
            busy={!!busySections[name]}
            onGenerate={(customInstructions) => generateSection(name, customInstructions)}
            onSave={(newText) => saveSectionEdit(name, newText)}
            onRestore={(historyIdx) => restoreSection(name, historyIdx)}
          />
        ))}
      </div>

      {/* ── Legacy draft viewer (toggle) ── */}
      {hasLegacyDraft && (
        <div style={{ padding: "0 18px 14px" }}>
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
