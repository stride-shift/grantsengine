import { useState, useCallback } from "react";
import { C, FONT, MONO } from "@/theme";
import { Btn, CopyBtn, DownloadBtn } from "@/components/ui";
import { assembleText, effectiveAsk, isAIError, validateProposalBreaks } from "@/utils";
import SectionCard from "./SectionCard";
import useProposalSections from "@/hooks/useProposalSections";

/* ── Proposal Workspace ──
   Section-by-section proposal editor. Render-only: all business logic
   (section generation, history ring buffer, edits, legacy migration, and the
   assembled-text / readability / glossary derivations) lives in
   useProposalSections. This component only renders and holds transient UI state.
*/

export default function ProposalWorkspace({ grant, ai, orgName, onRunAI, onRunResearch, onUpdate, busy, setBusy, autoGenerate, onAutoGenerateComplete, isLocked = false }) {
  const g = grant;

  const {
    order, sections,
    researchDone, completedCount, totalCount, allDone, pct, pendingCount,
    busySections, anySectionBusy, isGeneratingAll,
    hasLegacyDraft, assembledText, glossaryAppendix, readabilityBadgeProps,
    generateSection, generateAll, stopGenerateAll,
    saveSectionEdit, restoreSection, migrateToSections,
  } = useProposalSections({
    grant: g, ai, onRunAI, onRunResearch, onUpdate, busy, setBusy,
    autoGenerate, onAutoGenerateComplete,
  });

  // ── Transient UI state ──
  const [showLegacy, setShowLegacy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // ── Export .docx (download side-effect; uses orgName + section shape) ──
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
  }, [sections, order, g, orgName]);

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
