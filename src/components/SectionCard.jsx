import { useState, useEffect } from "react";
import { C, FONT, MONO } from "../theme";
import { Btn, CopyBtn, AILoadingPanel, stripMd, timeAgo } from "./index";

/* ── Render section content with markdown table support ── */
function RenderContent({ text }) {
  if (!text || typeof text !== "string") return null;

  // Split text into blocks: detect markdown tables (lines starting with |)
  const lines = text.split("\n");
  const blocks = [];
  let currentText = [];
  let currentTable = [];

  const flushText = () => {
    if (currentText.length) {
      blocks.push({ type: "text", content: currentText.join("\n") });
      currentText = [];
    }
  };
  const flushTable = () => {
    if (currentTable.length) {
      blocks.push({ type: "table", rows: currentTable });
      currentTable = [];
    }
  };

  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      // Skip separator rows (|:---|:---|)
      if (/^\|[\s:_-|]+\|$/.test(trimmed)) {
        if (!currentTable.length) flushText(); // ensure text flushed before table
        return;
      }
      if (!currentTable.length) flushText();
      const cells = trimmed.split("|").slice(1, -1).map(c => c.trim());
      currentTable.push(cells);
    } else {
      flushTable();
      currentText.push(line);
    }
  });
  flushText();
  flushTable();

  const thStyle = {
    padding: "6px 10px", textAlign: "left", fontSize: 11, fontWeight: 600,
    color: C.t3, borderBottom: `2px solid ${C.primary}22`, background: C.warm50 || "#faf8f5",
    fontFamily: FONT, whiteSpace: "nowrap",
  };
  const tdStyle = {
    padding: "6px 10px", fontSize: 12, color: C.t1, borderBottom: `1px solid ${C.primary}08`,
    fontFamily: FONT, lineHeight: 1.5,
  };
  const amtStyle = { ...tdStyle, textAlign: "right", fontFamily: MONO, fontWeight: 500, whiteSpace: "nowrap" };
  // Detect if a cell looks like a currency amount
  const isAmt = (s) => /^R[\d,.\s]+$/.test(s.replace(/[*_]/g, "").trim());
  const isTotalRow = (cells) => cells.some(c => /total|per student|per learner/i.test(c.replace(/[*_]/g, "")));

  return blocks.map((block, i) => {
    if (block.type === "text") {
      return <span key={i}>{stripMd(block.content)}</span>;
    }
    // Table block
    const [header, ...bodyRows] = block.rows;
    return (
      <table key={i} style={{
        width: "100%", borderCollapse: "collapse", margin: "10px 0",
        borderRadius: 6, overflow: "hidden", border: `1px solid ${C.primary}10`,
      }}>
        {header && (
          <thead>
            <tr>{header.map((h, j) => <th key={j} style={thStyle}>{stripMd(h)}</th>)}</tr>
          </thead>
        )}
        <tbody>
          {bodyRows.map((row, ri) => {
            const total = isTotalRow(row);
            return (
              <tr key={ri} style={{
                background: total ? `${C.primary}08` : ri % 2 === 0 ? "transparent" : `${C.primary}03`,
                fontWeight: total ? 600 : 400,
              }}>
                {row.map((cell, ci) => (
                  <td key={ci} style={isAmt(cell) ? amtStyle : tdStyle}>
                    {stripMd(cell.replace(/[*_]/g, ""))}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  });
}

/* ── Inline budget table ── */
function BudgetTable({ bt }) {
  if (!bt?.items?.length) return null;
  const fmtR = (n) => `R${(n || 0).toLocaleString()}`;
  const totalStudents = (bt.cohorts || 1) * (bt.studentsPerCohort || 0);
  const isMultiCohort = bt.cohorts > 1;

  return (
    <div style={{ marginBottom: 14 }}>
      <table style={{
        width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: FONT,
        borderRadius: 10, overflow: "hidden",
      }}>
        <thead>
          <tr style={{ background: C.navy }}>
            <th style={{ padding: "9px 14px", textAlign: "left", color: C.white, fontWeight: 700, fontSize: 11, letterSpacing: 0.3 }}>Line Item</th>
            <th style={{ padding: "9px 14px", textAlign: "right", color: C.white, fontWeight: 700, fontSize: 11, fontFamily: MONO, letterSpacing: 0.3 }}>Amount (ZAR)</th>
          </tr>
        </thead>
        <tbody>
          {bt.items.map((it, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? C.warm100 : C.white, borderBottom: `1px solid ${C.line}` }}>
              <td style={{ padding: "8px 14px", color: C.t1, borderLeft: `3px solid ${C.primary}25` }}>{it.label}</td>
              <td style={{ padding: "8px 14px", textAlign: "right", fontFamily: MONO, fontWeight: 600, color: C.t1 }}>{fmtR(it.amount)}</td>
            </tr>
          ))}
          {isMultiCohort && (
            <tr style={{ background: C.raised, borderTop: `2px solid ${C.line}` }}>
              <td style={{ padding: "8px 14px", fontWeight: 600, color: C.t2, borderLeft: `3px solid ${C.primary}40` }}>
                Subtotal per cohort
              </td>
              <td style={{ padding: "8px 14px", textAlign: "right", fontFamily: MONO, fontWeight: 600, color: C.t2 }}>
                {fmtR(bt.items.reduce((s, it) => s + (it.amount || 0), 0))}
              </td>
            </tr>
          )}
          {isMultiCohort && (
            <tr style={{ background: C.raised }}>
              <td style={{ padding: "8px 14px", fontWeight: 600, color: C.t2, borderLeft: `3px solid ${C.primary}40` }}>
                {bt.cohorts} cohorts \u00d7 {bt.studentsPerCohort} students
              </td>
              <td style={{ padding: "8px 14px", textAlign: "right", fontFamily: MONO, fontWeight: 600, color: C.t2 }}>
                {fmtR(bt.subtotal)}
              </td>
            </tr>
          )}
          {bt.includeOrgContribution && bt.orgContribution > 0 && (
            <tr style={{ background: C.okSoft }}>
              <td style={{ padding: "8px 14px", fontWeight: 600, color: C.ok, borderLeft: `3px solid ${C.ok}40` }}>
                30% Org Contribution
              </td>
              <td style={{ padding: "8px 14px", textAlign: "right", fontFamily: MONO, fontWeight: 600, color: C.ok }}>
                {fmtR(bt.orgContribution)}
              </td>
            </tr>
          )}
          <tr style={{ background: C.navy }}>
            <td style={{ padding: "10px 14px", fontWeight: 800, color: C.white, fontSize: 13 }}>
              TOTAL
              {totalStudents > 0 && <span style={{ fontWeight: 400, fontSize: 10, opacity: 0.7, marginLeft: 8 }}>{totalStudents} learners</span>}
            </td>
            <td style={{ padding: "10px 14px", textAlign: "right", fontFamily: MONO, fontWeight: 800, color: C.white, fontSize: 14 }}>
              {fmtR(bt.total)}
            </td>
          </tr>
        </tbody>
      </table>
      {bt.perStudent > 0 && (
        <div style={{ fontSize: 11, color: C.t3, marginTop: 6, textAlign: "right", fontFamily: MONO }}>
          {fmtR(bt.perStudent)} per learner · {bt.duration || ""}
          {bt.typeLabel && <span style={{ marginLeft: 6, color: C.t4 }}>· {bt.typeLabel}</span>}
        </div>
      )}
    </div>
  );
}

/* ── Section Card ──
   Individual section of a section-by-section proposal.
   States: empty / loading / view / edit / error
*/
export default function SectionCard({ name, index, total, section, busy, onGenerate, onSave, onRestore, budgetTable }) {
  const hasText = section?.text && !section.text.startsWith("Error");
  const isError = section?.text && (section.text.startsWith("Error") || section.text.startsWith("Rate limit") || section.text.startsWith("Connection"));
  const [expanded, setExpanded] = useState(!hasText);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [showInstructions, setShowInstructions] = useState(false);
  const [instructions, setInstructions] = useState(section?.customInstructions || "");

  // Auto-expand when result arrives
  useEffect(() => { if (hasText && !busy) setExpanded(true); }, [hasText, busy]);

  // Sync instructions from section prop
  useEffect(() => { setInstructions(section?.customInstructions || ""); }, [section?.customInstructions]);

  const startEdit = () => {
    setEditText(section?.text || "");
    setEditing(true);
    setExpanded(true);
  };

  const saveEdit = () => {
    onSave(editText);
    setEditing(false);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditText("");
  };

  // Status indicator
  const statusIcon = busy ? "\u2026" : hasText ? (section.isManualEdit ? "\u270E" : "\u2713") : isError ? "!" : (index + 1);
  const statusColor = busy ? C.purple : hasText ? (section.isManualEdit ? C.amber : C.ok) : isError ? C.red : C.t4;
  const statusBg = busy ? C.purpleSoft : hasText ? (section.isManualEdit ? C.amberSoft : C.okSoft) : isError ? C.redSoft : C.raised;

  const isBudget = name.toLowerCase().includes("budget");

  // Loading step title — match section name to loading steps
  const loadTitle = name.toLowerCase().includes("cover") ? "Cover Letter"
    : name.toLowerCase().includes("summary") ? "Executive Summary"
    : name.toLowerCase().includes("budget") ? "Budget"
    : name.toLowerCase().includes("impact") || name.toLowerCase().includes("outcome") ? "Impact"
    : name.toLowerCase().includes("programme") || name.toLowerCase().includes("program") ? "Programme"
    : name;

  return (
    <div style={{
      background: C.white, borderRadius: 10, overflow: "hidden",
      border: busy ? `1px solid ${C.purple}30` : hasText ? `1px solid ${C.ok}20` : isError ? `1px solid ${C.red}20` : `1px solid ${C.line}`,
      boxShadow: C.cardShadow, transition: "all 0.2s ease",
      animation: busy ? "ge-pulse 1.4s ease-in-out infinite" : "none",
    }}>
      {/* Header */}
      <div
        style={{
          padding: "12px 14px 10px", display: "flex", alignItems: "center", gap: 10,
          cursor: hasText && !editing ? "pointer" : "default",
        }}
        onClick={() => { if (hasText && !editing && !busy) setExpanded(p => !p); }}
      >
        {/* Step number / status */}
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: busy ? 12 : hasText ? 14 : 12, fontWeight: 700, fontFamily: MONO,
          background: statusBg, color: statusColor,
          transition: "all 0.2s ease",
        }}>
          {statusIcon}
        </div>

        {/* Title + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, letterSpacing: -0.2 }}>
            {index + 1}. {name}
          </div>
          {hasText && !expanded && !editing && (
            <div style={{ fontSize: 11, color: C.t4, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {stripMd(section.text).slice(0, 80)}...
            </div>
          )}
          {hasText && expanded && !editing && (
            <div style={{ fontSize: 10, color: C.t4, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
              {section.isManualEdit && <span style={{ color: C.amber, fontWeight: 600 }}>Edited</span>}
              {section.generatedAt && <span style={{ fontFamily: MONO }}>{timeAgo(section.generatedAt)}</span>}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {hasText && !busy && !editing && (
            <>
              <CopyBtn text={section.text} />
              <button onClick={(e) => { e.stopPropagation(); startEdit(); }}
                style={{
                  background: "none", border: `1px solid ${C.line}`, borderRadius: 6,
                  padding: "4px 10px", fontSize: 10, fontWeight: 600, color: C.t3,
                  cursor: "pointer", fontFamily: FONT,
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.t3; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.line; }}
              >Edit</button>
            </>
          )}
          {!busy && !editing && (
            <Btn
              onClick={(e) => { e.stopPropagation(); onGenerate(instructions || undefined); }}
              v={hasText ? "ghost" : "primary"}
              style={{ fontSize: 11, padding: "5px 12px" }}
            >
              {hasText ? "\u21bb Regen" : "Generate"}
            </Btn>
          )}
          {hasText && !busy && !editing && (
            <button onClick={(e) => { e.stopPropagation(); setExpanded(p => !p); }}
              style={{
                background: "none", border: "none", padding: "4px 6px",
                fontSize: 12, color: C.t4, cursor: "pointer", fontFamily: FONT,
              }}
            >{expanded ? "\u25B2" : "\u25BC"}</button>
          )}
        </div>
      </div>

      {/* Loading panel */}
      {busy && (
        <div style={{ padding: "0 14px 12px" }}>
          <AILoadingPanel title={loadTitle} />
        </div>
      )}

      {/* Error display */}
      {isError && !busy && (
        <div style={{ padding: "0 14px 12px" }}>
          <div style={{
            padding: "10px 14px", background: C.redSoft, borderRadius: 8,
            border: `1px solid ${C.red}15`, fontSize: 12, color: C.red, lineHeight: 1.5,
          }}>{section.text}</div>
        </div>
      )}

      {/* View mode — formatted text */}
      {hasText && !busy && expanded && !editing && (
        <div style={{ padding: "0 14px 12px" }}>
          {/* Budget table — shown above prose for budget sections */}
          {isBudget && budgetTable && <BudgetTable bt={budgetTable} />}
          <div style={{
            padding: "12px 14px", background: C.warm100, borderRadius: 8,
            border: `1px solid ${C.primary}12`,
            fontSize: 13, lineHeight: 1.75, color: C.t1, whiteSpace: "pre-wrap",
            maxHeight: 400, overflow: "auto",
          }}><RenderContent text={section.text} /></div>

          {/* Custom instructions for regen */}
          <div style={{ marginTop: 8 }}>
            {!showInstructions ? (
              <button onClick={() => setShowInstructions(true)}
                style={{
                  background: "none", border: "none", fontSize: 11, color: C.t4,
                  cursor: "pointer", fontFamily: FONT, padding: "2px 0",
                }}
                onMouseEnter={e => { e.currentTarget.style.color = C.primary; }}
                onMouseLeave={e => { e.currentTarget.style.color = C.t4; }}
              >+ Add regeneration instructions</button>
            ) : (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  value={instructions}
                  onChange={e => setInstructions(e.target.value)}
                  placeholder="e.g. 'Make this more concise' or 'Emphasise AI tools'"
                  style={{
                    flex: 1, padding: "6px 10px", fontSize: 12, borderRadius: 6,
                    border: `1px solid ${C.line}`, fontFamily: FONT, color: C.t1,
                    background: C.white, outline: "none",
                  }}
                  onFocus={e => { e.target.style.borderColor = C.primary; }}
                  onBlur={e => { e.target.style.borderColor = C.line; }}
                  onKeyDown={e => { if (e.key === "Enter") { onGenerate(instructions); setShowInstructions(false); } }}
                />
                <Btn onClick={() => { onGenerate(instructions); setShowInstructions(false); }}
                  v="ghost" style={{ fontSize: 11, padding: "5px 10px" }}>{"\u21bb"} Regen</Btn>
                <button onClick={() => setShowInstructions(false)}
                  style={{ background: "none", border: "none", fontSize: 11, color: C.t4, cursor: "pointer", fontFamily: FONT }}>Cancel</button>
              </div>
            )}
          </div>

          {/* Per-section history */}
          {section.history && section.history.length > 0 && (
            <details style={{ marginTop: 6, fontSize: 11, color: C.t4 }}>
              <summary style={{ cursor: "pointer", fontWeight: 600, padding: "4px 0", userSelect: "none" }}>
                {section.history.length} previous version{section.history.length > 1 ? "s" : ""}
              </summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 4 }}>
                {section.history.slice().reverse().map((v, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "6px 10px", background: C.warm100, borderRadius: 6, border: `1px solid ${C.line}`,
                  }}>
                    <span style={{ fontSize: 10, fontFamily: MONO, color: C.t4 }}>{timeAgo(v.ts)}</span>
                    <span style={{ fontSize: 10, color: C.t3, flex: 1, marginLeft: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {v.text.slice(0, 60)}...
                    </span>
                    <button onClick={() => onRestore(section.history.length - 1 - i)}
                      style={{
                        fontSize: 10, fontWeight: 600, color: C.primary, background: C.primarySoft,
                        border: "none", borderRadius: 5, padding: "3px 8px", cursor: "pointer", fontFamily: FONT,
                        marginLeft: 8, flexShrink: 0,
                      }}>Restore</button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Edit mode — textarea */}
      {editing && (
        <div style={{ padding: "0 14px 12px" }}>
          <textarea
            value={editText}
            onChange={e => setEditText(e.target.value)}
            style={{
              width: "100%", minHeight: 200, padding: "12px 14px",
              fontSize: 13, lineHeight: 1.7, fontFamily: FONT, color: C.t1,
              borderRadius: 8, border: `1px solid ${C.primary}40`,
              background: C.warm100, outline: "none", resize: "vertical",
              boxSizing: "border-box",
            }}
            autoFocus
          />
          <div style={{ display: "flex", gap: 6, marginTop: 8, justifyContent: "flex-end" }}>
            <button onClick={cancelEdit}
              style={{
                padding: "5px 12px", fontSize: 11, fontWeight: 600, color: C.t3,
                background: "none", border: `1px solid ${C.line}`, borderRadius: 6,
                cursor: "pointer", fontFamily: FONT,
              }}>Cancel</button>
            <Btn onClick={saveEdit} v="primary" style={{ fontSize: 11, padding: "6px 14px" }}>
              Save
            </Btn>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasText && !isError && !busy && (
        <div style={{ padding: "0 14px 12px" }}>
          <div style={{
            padding: "16px", textAlign: "center", background: C.warm100, borderRadius: 8,
            border: `1px dashed ${C.line}`,
          }}>
            <div style={{ fontSize: 12, color: C.t4, marginBottom: 8 }}>
              Section not yet generated
            </div>
            <Btn onClick={() => onGenerate()} v="primary" style={{ fontSize: 12, padding: "7px 18px" }}>
              Generate {name}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}
