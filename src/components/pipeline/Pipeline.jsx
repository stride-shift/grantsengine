import { useState, useRef } from "react";
import { C, FONT, MONO } from "@/theme";
import { fmtK, dL, td, effectiveAsk, grantReadiness } from "@/utils";
import { Btn, DeadlineBadge, TypeBadge, Avatar, Label } from "@/components/ui";
import { detectType, PTYPES } from "@/data/funderStrategy";
import { GATES, ROLES, CLOSED_STAGES } from "@/data/constants";
import usePipelineView from "@/hooks/usePipelineView";
import useGrantWizard from "@/hooks/useGrantWizard";
import ScoutPanel from "./ScoutPanel";

/* ── Readiness Chips — show missing items on kanban cards ── */
const ReadinessChips = ({ missing }) => {
  if (!missing || missing.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
      {missing.slice(0, 3).map((m, i) => (
        <span key={i} style={{
          fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 6,
          background: m.includes("docs") ? C.amberSoft : m.includes("deadline") ? C.redSoft : C.navySoft,
          color: m.includes("docs") ? C.amber : m.includes("deadline") ? C.red : C.t2,
          letterSpacing: 0.2,
        }}>{m}</span>
      ))}
      {missing.length > 3 && (
        <span style={{ fontSize: 9, color: C.t4, fontWeight: 500 }}>+{missing.length - 3}</span>
      )}
    </div>
  );
};

/* ── Gate Indicator — shows approval requirement for next stage ── */
const STAGE_ORDER = ["scouted", "vetting", "qualifying", "drafting", "review", "submitted", "awaiting"];
const GateIndicator = ({ stage, ownerRole }) => {
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) return null;
  const nextStage = STAGE_ORDER[idx + 1];
  const gateKey = `${stage}->${nextStage}`;
  const gate = GATES[gateKey];
  if (!gate) return null;
  const roleLevel = ROLES[ownerRole]?.level || 0;
  const needLevel = ROLES[gate.need]?.level || 99;
  const canSelf = roleLevel >= needLevel;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 4, marginTop: 6,
      padding: "3px 8px", borderRadius: 6, fontSize: 9, fontWeight: 600,
      background: canSelf ? C.okSoft : C.amberSoft,
      color: canSelf ? C.ok : C.amber,
    }}>
      <span style={{ fontSize: 10 }}>{canSelf ? "\u2713" : "\u25CB"}</span>
      <span>{canSelf ? "Can advance" : `${ROLES[gate.need]?.label || "Approval"} needed`}</span>
    </div>
  );
};

const COMMON_FOCUS = ["Youth Employment", "Digital Skills", "AI/4IR", "Education", "Women", "Rural Dev", "STEM", "Entrepreneurship", "Work Readiness", "Leadership"];
const GRANT_SOURCES = ["scout", "email", "relationship", "website", "referral", "other"];
const AVATAR_COLORS = [
  { bg: C.primarySoft, accent: C.primary },
  { bg: C.blueSoft, accent: C.blue },
  { bg: C.amberSoft, accent: C.amber },
  { bg: C.emeraldSoft, accent: C.emerald },
  { bg: C.tealSoft, accent: C.teal },
  { bg: C.purpleSoft, accent: C.purple },
];

export default function Pipeline({ grants, team, stages, funderTypes, complianceDocs = [], orgContext = "", onSelectGrant, onUpdateGrant, onAddGrant, onRunAI, api, onToast, onLaunchTour }) {
  // ── Transient, render-only UI state (lives in the component) ──
  const [pView, setPView] = useState("list");
  const scoutRef = useRef(null);
  const [isScouting, setIsScouting] = useState(false); // mirrors ScoutPanel scouting state for toolbar button
  const [dragId, setDragId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [customFocusInput, setCustomFocusInput] = useState(""); // transient "add custom focus" input
  const [urlInput, setUrlInput] = useState("");                 // transient URL-tool input
  const [showUrlTool, setShowUrlTool] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());    // batch operations
  const [batchAction, setBatchAction] = useState(null);         // "stage" | "owner" | "priority" | "select"

  const STAGES = stages || [];

  // ── Headless view-model: search / filter / sort / group + batch side-effects ──
  const pv = usePipelineView(grants, team, stages, { onUpdateGrant, onAddGrant, onRunAI, onToast });
  const {
    q, sf, setSf, pSort, setPSort, market, setMarket,
    activeFilters, setActiveFilters, showArchived, setShowArchived,
    handleSearchChange, getMember,
    filtered, sorted, personEntries, marketCounts, archivedCount,
    ownerNames, funderSuggestions,
    exportCSV, scoreAllGrants, scoringAll, scoreProgress, extractFromUrl, urlBusy,
  } = pv;

  // ── Headless view-model: add-grant wizard ──
  const wiz = useGrantWizard(funderTypes?.[0] || "Foundation", { onAddGrant, onSelectGrant });
  const {
    wizStep, setWizStep,
    newName, setNewName, newFunder, setNewFunder, newType, setNewType,
    newAsk, setNewAsk, newDeadline, setNewDeadline, newRel, setNewRel,
    newMarket, setNewMarket, newApplyUrl, setNewApplyUrl, newSource, setNewSource,
    selectedPTypes, setSelectedPTypes, customProgrammes, setCustomProgrammes,
    newFocusTags, setNewFocusTags, newNotes, setNewNotes,
    pendingFiles, setPendingFiles, autoAI, setAutoAI,
    addError, setAddError, calcTotalAsk,
  } = wiz;

  // Wizard reset/submit wrappers — close the modal (transient) + clear the
  // inline custom-focus input, then delegate to the hook.
  const resetWizard = () => { wiz.resetWizard(); setCustomFocusInput(""); setShowAdd(false); };
  const addGrantEnhanced = (runAI = false) => {
    if (wiz.addGrantEnhanced(runAI)) { setCustomFocusInput(""); setShowAdd(false); }
  };

  // Note: team lookup, debounced search, market/archived counts, the
  // filtered/sorted/personEntries memos, ownerNames, funderSuggestions, CSV
  // export, Score-All and URL-extract all live in usePipelineView; the wizard
  // (fields, calcTotalAsk, buildPtypeNotes, submit) lives in useGrantWizard.

  const handleDrop = (stageId) => {
    if (!dragId) return;
    const g = grants.find(x => x.id === dragId);
    if (g && g.stage !== stageId) {
      onUpdateGrant(dragId, { stage: stageId, log: [...(g.log || []), { d: td(), t: `Moved to ${stageId}` }] });
    }
    setDragId(null);
  };

  const activeStages = STAGES.filter(s => !CLOSED_STAGES.includes(s.id));

  return (
    <div style={{ padding: "16px 16px", height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Row 1: Title + Market tabs + Add */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.dark, letterSpacing: -0.5 }}>Pipeline</div>
          <div style={{ display: "flex", gap: 3 }}>
            {[
              { id: "all", label: "All", count: grants.length },
              { id: "sa", label: "\uD83C\uDDFF\uD83C\uDDE6", count: marketCounts.sa.count },
              { id: "global", label: "\uD83C\uDF0D", count: marketCounts.global.count },
            ].map(tab => (
              <button key={tab.id} onClick={() => setMarket(tab.id)} style={{
                padding: "3px 10px", fontSize: 12, fontWeight: 600, fontFamily: FONT,
                borderRadius: 6, border: `1px solid ${market === tab.id ? C.primary : C.line}`,
                background: market === tab.id ? C.primarySoft : C.white,
                color: market === tab.id ? C.primary : C.t3,
                cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 5,
              }}>
                {tab.label}
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "0px 5px", borderRadius: 10,
                  background: market === tab.id ? C.primary : C.raised,
                  color: market === tab.id ? C.white : C.t4,
                }}>{tab.count}</span>
              </button>
            ))}
          </div>
        </div>
        {grants.length > 0 && (
          <Btn onClick={() => setShowAdd(!showAdd)} v="primary" style={{ fontSize: 12, padding: "6px 14px" }}>+ Add</Btn>
        )}
      </div>

      {/* Row 2: Search + Filters + View */}
      {grants.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          <input value={q} onChange={e => handleSearchChange(e.target.value)} placeholder="Search..."
            style={{ padding: "7px 12px", fontSize: 13, border: `1px solid ${C.line}`, borderRadius: 8, width: 160, fontFamily: FONT, outline: "none", transition: "border-color 0.15s" }}
            onFocus={e => e.target.style.borderColor = C.primary}
            onBlur={e => e.target.style.borderColor = C.line}
          />
          <select value={sf} onChange={e => setSf(e.target.value)}
            style={{ padding: "7px 10px", fontSize: 12, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: FONT, background: C.white, cursor: "pointer" }}>
            <option value="all">🔽 Filters</option>
            {(funderTypes || []).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={pView} onChange={e => setPView(e.target.value)}
            style={{ padding: "7px 10px", fontSize: 12, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: FONT, background: C.white, cursor: "pointer" }}>
            <option value="list">View: List</option>
            <option value="kanban">View: Board</option>
            <option value="person">View: Person</option>
          </select>

          <div style={{ flex: 1 }} />

          {/* Right side: Sort + actions */}
          <span style={{ fontSize: 12, color: C.t3 }}>Sort by:</span>
          <select value={pSort} onChange={e => setPSort(e.target.value)}
            style={{ padding: "7px 10px", fontSize: 12, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: FONT, background: C.white, fontWeight: 600, cursor: "pointer" }}>
            <option value="default">Deadline</option>
            <option value="ask">Amount</option>
            <option value="priority">Priority</option>
            <option value="fit">Fit score</option>
          </select>

          <div data-tour="scout-button" style={{ display: "flex", alignItems: "center", gap: 0, borderRadius: 8, overflow: "hidden", border: `1px solid ${C.primary}40` }}>
            <button onClick={() => scoutRef.current?.aiScout()} disabled={isScouting} style={{
              padding: "7px 14px", fontSize: 12, fontWeight: 700, fontFamily: FONT,
              background: isScouting ? C.primarySoft : C.primary,
              color: isScouting ? C.primary : C.white,
              border: "none", cursor: isScouting ? "wait" : "pointer",
            }}>{isScouting ? "Scouting..." : "☀ Scout"}</button>
            <select value={scoutRef.current?.scoutMarket || "both"} onChange={e => scoutRef.current?.setScoutMarket(e.target.value)}
              style={{ padding: "7px 6px", fontSize: 11, fontWeight: 600, fontFamily: FONT, border: "none", borderLeft: `1px solid ${C.primary}30`, background: C.primarySoft, color: C.primary, cursor: "pointer", outline: "none" }}>
              <option value="both">🌐 All</option>
              <option value="sa">🇿🇦 SA</option>
              <option value="global">🌍 Global</option>
            </select>
          </div>
          {onRunAI && <Btn onClick={() => setShowUrlTool(!showUrlTool)} v="ghost" style={{ fontSize: 12, padding: "6px 12px", color: C.blue, borderColor: C.blue + "30" }}>🔗 URL</Btn>}
          {onRunAI && (
            <Btn onClick={scoreAllGrants} disabled={scoringAll} v="ghost" style={{
              fontSize: 12, padding: "6px 12px",
              color: scoringAll ? C.primary : C.amber,
              borderColor: (scoringAll ? C.primary : C.amber) + "30",
              animation: scoringAll ? "ge-pulse 1.4s ease-in-out infinite" : "none",
            }}>
              {scoringAll ? `${scoreProgress.done}/${scoreProgress.total}` : "⚡ Score All"}
            </Btn>
          )}
          <Btn onClick={exportCSV} v="ghost" style={{ fontSize: 12, padding: "6px 12px", color: C.t4 }}>CSV</Btn>
          <Btn onClick={() => { if (batchAction) { setBatchAction(null); setSelectedIds(new Set()); } else { setBatchAction("select"); } }}
            v="ghost" style={{ fontSize: 12, padding: "6px 12px", color: batchAction ? C.primary : C.t4, borderColor: batchAction ? C.primary + "30" : undefined }}>
            {batchAction ? "Done" : "Select"}
          </Btn>
          {/* Status pills — inline with actions */}
        </div>
      )}

      {/* Unified filter bar */}
      {grants.length > 0 && (() => {
        const now = new Date();
        const openCount = grants.filter(g => !CLOSED_STAGES.includes(g.stage) && (!g.deadline || new Date(g.deadline) >= now)).length;
        const dueSoonCount = grants.filter(g => { const d = dL(g.deadline); return d !== null && d >= 0 && d <= 7 && !CLOSED_STAGES.includes(g.stage); }).length;
        const awaitingCount = grants.filter(g => g.stage === "submitted" || g.stage === "awaiting").length;
        const missedCount = grants.filter(g => { const d = dL(g.deadline); return d !== null && d < 0 && !CLOSED_STAGES.includes(g.stage) && g.stage !== "submitted" && g.stage !== "awaiting"; }).length;
        const toggleFilter = (f) => setActiveFilters(prev => { const n = new Set(prev); n.has(f) ? n.delete(f) : n.add(f); return n; });
        const pillStyle = (f, color, bg) => ({
          padding: "5px 12px", borderRadius: 100, fontSize: 11, fontWeight: 600,
          cursor: "pointer", fontFamily: FONT, transition: "all 0.15s ease", border: "none",
          background: activeFilters.has(f) ? color : bg,
          color: activeFilters.has(f) ? "#fff" : color,
        });
        const chipStyle = (f) => ({
          padding: "4px 10px", borderRadius: 100, fontSize: 11, fontWeight: 600,
          cursor: "pointer", fontFamily: FONT, transition: "all 0.15s ease",
          border: `1px solid ${activeFilters.has(f) ? C.primary : C.line}`,
          background: activeFilters.has(f) ? C.primarySoft : C.white,
          color: activeFilters.has(f) ? C.primary : C.t3,
        });
        return (
          <div data-tour="pipeline-filters" style={{
            display: "flex", alignItems: "center", gap: 6, marginBottom: 10,
            padding: "8px 14px", background: C.white, borderRadius: 10,
            border: `1px solid ${C.line}`, flexWrap: "wrap",
          }}>
            {/* Status pills */}
            <button onClick={() => toggleFilter("open-only")} style={pillStyle("open-only", C.ok, C.okSoft)}>● Open {openCount}</button>
            <button onClick={() => toggleFilter("due-week")} style={pillStyle("due-week", C.amber, C.amberSoft)}>● Due soon {dueSoonCount}</button>
            {awaitingCount > 0 && <button onClick={() => toggleFilter("awaiting")} style={pillStyle("awaiting", "#0891B2", "#ECFEFF")}>● Awaiting {awaitingCount}</button>}
            {missedCount > 0 && <button onClick={() => toggleFilter("missed")} style={pillStyle("missed", C.red, C.redSoft)}>● Missed {missedCount}</button>}
            {missedCount > 0 && (
              <button
                onClick={() => {
                  if (!window.confirm(`Archive all ${missedCount} missed opportunities? They'll move to "Not Relevant" and can be restored later.`)) return;
                  const missed = grants.filter(g => { const d = dL(g.deadline); return d !== null && d < 0 && !CLOSED_STAGES.includes(g.stage) && g.stage !== "submitted" && g.stage !== "awaiting"; });
                  for (const g of missed) onUpdateGrant(g.id, { stage: "archived" });
                  onToast?.(`Archived ${missed.length} missed opportunit${missed.length === 1 ? "y" : "ies"}`);
                }}
                title="Bulk-archive every grant whose deadline has passed and is still in an early stage"
                style={{
                  padding: "4px 10px", borderRadius: 100, fontSize: 11, fontWeight: 600,
                  cursor: "pointer", fontFamily: FONT,
                  border: `1px solid ${C.red}40`, background: C.white, color: C.red,
                }}
              >Archive all</button>
            )}

            <div style={{ width: 1, height: 20, background: C.line, margin: "0 4px", flexShrink: 0 }} />

            {/* Quick filters */}
            <button onClick={() => toggleFilter("new-week")} style={chipStyle("new-week")}>New this week</button>
            <button onClick={() => toggleFilter("due-month")} style={chipStyle("due-month")}>Due this month</button>
            <button onClick={() => toggleFilter("no-deadline")} style={chipStyle("no-deadline")}>No deadline</button>
            <button onClick={() => toggleFilter("no-draft")} style={chipStyle("no-draft")}>No draft</button>
            <button onClick={() => toggleFilter("unassigned")} style={chipStyle("unassigned")}>Unassigned</button>

            {archivedCount > 0 && (
              <button onClick={() => setShowArchived(!showArchived)} style={{
                padding: "4px 10px", borderRadius: 100, fontSize: 11, fontWeight: 600,
                cursor: "pointer", fontFamily: FONT,
                border: `1px solid ${showArchived ? "#9CA3AF" : C.line}`,
                background: showArchived ? "#F3F4F6" : C.white,
                color: showArchived ? "#6B7280" : C.t4,
              }}>🚫 {archivedCount} not relevant</button>
            )}

            <div style={{ flex: 1 }} />

            {/* Team avatars — pushed to the right, never wrap */}
            <div style={{ display: "flex", gap: 4, alignItems: "center", flexShrink: 0 }}>
            {ownerNames.map(oid => {
              const m = getMember(oid);
              const active = activeFilters.has(`owner:${oid}`);
              const cIdx = m?.name ? m.name.charCodeAt(0) % AVATAR_COLORS.length : AVATAR_COLORS.length - 1;
              const ac = AVATAR_COLORS[cIdx];
              return (
                <button key={oid} onClick={() => toggleFilter(`owner:${oid}`)} title={m?.name || oid}
                  style={{
                    width: 28, height: 28, borderRadius: "50%", padding: 0,
                    border: active ? `2px solid ${C.dark}` : `2px solid transparent`,
                    background: ac.accent,
                    color: "#fff",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 700, fontFamily: FONT, transition: "all 0.15s",
                    opacity: active ? 1 : 0.5,
                    boxShadow: active ? `0 0 0 2px ${C.white}, 0 0 0 4px ${ac.accent}` : "none",
                  }}>
                  {m?.initials || (m?.name ? m.name.slice(0, 2).toUpperCase() : oid.slice(0, 2).toUpperCase())}
                </button>
              );
            })}
            </div>

            {activeFilters.size > 0 && (
              <>
                <div style={{ flex: 1 }} />
                <button onClick={() => setActiveFilters(new Set())} style={{
                  padding: "4px 10px", borderRadius: 100, fontSize: 11, fontWeight: 600,
                  cursor: "pointer", fontFamily: FONT, border: `1px solid ${C.red}30`,
                  background: C.redSoft, color: C.red,
                }}>Clear all</button>
              </>
            )}
          </div>
        );
      })()}

      {/* Batch action bar */}
      {selectedIds.size > 0 && (
        <div style={{
          display: "flex", gap: 8, alignItems: "center", marginBottom: 10,
          padding: "8px 14px", background: `linear-gradient(135deg, ${C.primarySoft} 0%, ${C.white} 100%)`,
          borderRadius: 10, border: `1px solid ${C.primary}20`,
          boxShadow: C.cardShadow,
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.primary }}>{selectedIds.size} selected</span>
          <div style={{ width: 1, height: 20, background: C.line }} />
          <span style={{ fontSize: 11, color: C.t3, fontWeight: 600 }}>Move to:</span>
          {STAGES.filter(s => !CLOSED_STAGES.includes(s.id)).map(s => (
            <button key={s.id} onClick={() => {
              for (const id of selectedIds) onUpdateGrant(id, { stage: s.id });
              setSelectedIds(new Set());
            }}
              style={{
                padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                background: s.bg || C.bg, color: s.c, border: `1px solid ${s.c}30`,
                cursor: "pointer", fontFamily: FONT,
              }}>{s.label}</button>
          ))}
          <div style={{ width: 1, height: 20, background: C.line }} />
          <span style={{ fontSize: 11, color: C.t3, fontWeight: 600 }}>Assign:</span>
          <select onChange={e => {
            if (!e.target.value) return;
            for (const id of selectedIds) onUpdateGrant(id, { owner: e.target.value });
            setSelectedIds(new Set());
            e.target.value = "";
          }} style={{ padding: "3px 8px", fontSize: 11, border: `1px solid ${C.line}`, borderRadius: 6, fontFamily: FONT }}>
            <option value="">Pick...</option>
            {(team || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div style={{ width: 1, height: 20, background: C.line }} />
          {/* Bulk archive — moves selected grants to "Not Relevant".
              Reversible: archived grants can be restored via the showArchived
              toggle + stage change. Confirmation prompt to prevent fat-finger. */}
          <button onClick={() => {
            const n = selectedIds.size;
            if (!window.confirm(`Archive ${n} grant${n === 1 ? "" : "s"} to "Not Relevant"? They'll still be searchable and you can restore them later.`)) return;
            for (const id of selectedIds) {
              const g = grants.find(x => x.id === id);
              onUpdateGrant(id, { stage: "archived", _archivedFrom: g?.stage || null });
            }
            setSelectedIds(new Set());
          }}
            style={{
              padding: "3px 12px", borderRadius: 6, fontSize: 11, fontWeight: 700,
              background: C.t4, color: C.white, border: "none",
              cursor: "pointer", fontFamily: FONT,
            }}
            title="Move selected grants to Not Relevant (archived, but searchable)">
            ▤ Archive
          </button>
          <div style={{ marginLeft: "auto" }} />
          <button onClick={() => setSelectedIds(new Set())}
            style={{ fontSize: 11, color: C.t4, background: "none", border: "none", cursor: "pointer", fontFamily: FONT, fontWeight: 600 }}>Cancel</button>
        </div>
      )}

      {/* Score All progress bar */}
      {scoringAll && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", marginBottom: 14,
          background: `linear-gradient(135deg, ${C.amberSoft}60 0%, ${C.white} 100%)`,
          borderRadius: 10, border: `1px solid ${C.amber}20`, boxShadow: C.cardShadow,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
            background: C.amberSoft, color: C.amber, fontSize: 14, fontWeight: 700, flexShrink: 0,
            animation: "ge-pulse 1.4s ease-in-out infinite",
          }}>⚡</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>Scoring all grants</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.amber, fontFamily: MONO }}>{scoreProgress.done}/{scoreProgress.total}</span>
            </div>
            <div style={{ height: 4, background: C.line, borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 2, transition: "width 0.3s ease",
                background: `linear-gradient(90deg, ${C.amber}, ${C.ok})`,
                width: `${scoreProgress.total > 0 ? (scoreProgress.done / scoreProgress.total * 100) : 0}%`,
              }} />
            </div>
            {scoreProgress.current && (
              <div style={{ fontSize: 11, color: C.t3, marginTop: 3 }}>Scoring fit for {scoreProgress.current}...</div>
            )}
          </div>
        </div>
      )}

      {/* URL Extract tool — paste a grant URL to auto-create */}
      {showUrlTool && onRunAI && (
        <div style={{
          display: "flex", gap: 8, marginBottom: 14, alignItems: "center",
          padding: "10px 14px", background: `linear-gradient(135deg, ${C.blueSoft}40 0%, ${C.white} 100%)`,
          borderRadius: 10, boxShadow: C.cardShadow, border: `1px solid ${C.blue}15`,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
            background: C.blueSoft, color: C.blue, fontSize: 13, fontWeight: 700, flexShrink: 0,
            animation: urlBusy ? "ge-pulse 1.4s ease-in-out infinite" : "none",
          }}>{urlBusy ? "\u2026" : "\uD83D\uDD17"}</div>
          <input
            value={urlInput} onChange={e => setUrlInput(e.target.value)}
            placeholder="Paste a grant URL to auto-fill details..."
            style={{
              flex: 1, padding: "8px 12px", fontSize: 13, border: `1px solid ${C.line}`,
              borderRadius: 8, fontFamily: FONT, background: C.white,
            }}
            onKeyDown={e => {
              if (e.key === "Enter" && urlInput.trim() && !urlBusy) {
                e.preventDefault();
                extractFromUrl(urlInput.trim()).then(ok => {
                  if (ok) { setUrlInput(""); setShowUrlTool(false); }
                });
              }
            }}
          />
          <Btn
            onClick={() => {
              if (!urlInput.trim() || urlBusy) return;
              extractFromUrl(urlInput.trim()).then(ok => {
                if (ok) { setUrlInput(""); setShowUrlTool(false); }
              });
            }}
            disabled={!urlInput.trim() || urlBusy}
            style={{ fontSize: 12, padding: "6px 14px", background: C.blue, borderColor: C.blue }}
          >{urlBusy ? "Extracting..." : "Extract"}</Btn>
          <Btn onClick={() => { setShowUrlTool(false); setUrlInput(""); }} v="ghost" style={{ fontSize: 12, padding: "6px 10px" }}>Cancel</Btn>
        </div>
      )}

      {/* Add grant inline */}
      {showAdd && (
        <div style={{ marginBottom: 14, background: C.white, borderRadius: 10, boxShadow: C.cardShadow, overflow: "hidden" }}>
          {/* Step indicator */}
          <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.line}` }}>
            {[{ n: 1, l: "Grant & Funder" }, { n: 2, l: "Programme & Ask" }, { n: 3, l: "AI Actions" }].map(s => (
              <div key={s.n} onClick={() => { if (s.n < wizStep) setWizStep(s.n); }} style={{
                flex: 1, padding: "10px 16px", fontSize: 11, fontWeight: 700,
                color: wizStep === s.n ? C.primary : wizStep > s.n ? C.ok : C.t4,
                borderBottom: wizStep === s.n ? `2px solid ${C.primary}` : "2px solid transparent",
                textAlign: "center", letterSpacing: 0.5, cursor: s.n < wizStep ? "pointer" : "default",
              }}>{s.n}. {s.l}</div>
            ))}
          </div>

          <div style={{ padding: "14px 18px" }}>
            {/* ── Step 1: Grant & Funder ── */}
            {wizStep === 1 && (
              <div>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Grant name" autoFocus
                    style={{ flex: 2, padding: "8px 12px", fontSize: 13, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: FONT }} />
                  <input value={newFunder} onChange={e => setNewFunder(e.target.value)} placeholder="Funder name"
                    list="funder-suggestions"
                    style={{ flex: 1.5, padding: "8px 12px", fontSize: 13, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: FONT }} />
                  <datalist id="funder-suggestions">
                    {funderSuggestions.map(f => <option key={f} value={f} />)}
                  </datalist>
                </div>
                <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                  <select value={newType} onChange={e => setNewType(e.target.value)}
                    style={{ padding: "8px 12px", fontSize: 11, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: FONT, flex: 1, minWidth: 120 }}>
                    {(funderTypes || []).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input type="date" value={newDeadline} onChange={e => setNewDeadline(e.target.value)}
                    style={{ padding: "8px 12px", fontSize: 11, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: FONT, width: 140 }} />
                  <select value={newRel} onChange={e => setNewRel(e.target.value)}
                    style={{ padding: "8px 12px", fontSize: 11, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: FONT, width: 90 }}>
                    <option value="Cold">Cold</option>
                    <option value="Warm">Warm</option>
                    <option value="Hot">Hot</option>
                  </select>
                  <div style={{ display: "flex", gap: 0, borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
                    {[{ id: "sa", l: "\uD83C\uDDFF\uD83C\uDDE6 SA" }, { id: "global", l: "\uD83C\uDF0D Global" }].map(m => (
                      <button key={m.id} onClick={() => setNewMarket(m.id)} style={{
                        padding: "6px 12px", fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer",
                        background: newMarket === m.id ? C.primary : C.white, color: newMarket === m.id ? C.white : C.t3,
                      }}>{m.l}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <select value={newSource} onChange={e => setNewSource(e.target.value)}
                    style={{ padding: "8px 12px", fontSize: 12, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: FONT, color: C.t2, background: "white" }}>
                    {GRANT_SOURCES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                  <input value={newApplyUrl} onChange={e => setNewApplyUrl(e.target.value)} placeholder="Application URL (optional)"
                    style={{ flex: 1, padding: "8px 12px", fontSize: 12, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: FONT, color: C.t2 }} />
                  <Btn onClick={() => { if (newName?.trim() && newFunder?.trim()) setWizStep(2); else setAddError("Name and funder required"); }}
                    disabled={!newName?.trim() || !newFunder?.trim()}
                    style={{ fontSize: 12, padding: "8px 18px" }}>Next</Btn>
                  <Btn onClick={resetWizard} v="ghost" style={{ fontSize: 12 }}>Cancel</Btn>
                </div>
                {addError && <div style={{ fontSize: 11, color: C.red, marginTop: 6 }}>{addError}</div>}
              </div>
            )}

            {/* ── Step 2: Programme & Ask ── */}
            {wizStep === 2 && (
              <div>
                <div style={{ fontSize: 12, color: C.t3, marginBottom: 10 }}>
                  Select programme types for <strong style={{ color: C.dark }}>{newName}</strong> ({newFunder}) — select one or more
                </div>

                {/* Multi-select programme grid */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  {Object.entries(PTYPES).map(([num, pt]) => {
                    const isSelected = selectedPTypes.has(num);
                    const cohorts = selectedPTypes.get(num)?.cohorts || 1;
                    return (
                      <div key={num} onClick={() => {
                          const next = new Map(selectedPTypes);
                          if (isSelected) next.delete(num); else next.set(num, { cohorts: 1 });
                          setSelectedPTypes(next); setNewAsk("");
                        }}
                        style={{
                          padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                          border: isSelected ? `2px solid ${C.primary}` : `1px solid ${C.line}`,
                          background: isSelected ? C.primarySoft : C.white,
                          transition: "all 0.15s ease",
                        }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                          <span style={{
                            width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 10, fontWeight: 800, fontFamily: MONO,
                            background: isSelected ? C.primary : C.raised, color: isSelected ? C.white : C.t3,
                          }}>T{num}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.dark, flex: 1 }}>{pt.label.split(" — ")[0]}</span>
                        </div>
                        <div style={{ fontSize: 10, color: C.t3, marginBottom: 4 }}>{pt.label.split(" — ")[1] || ""}</div>
                        <div style={{ display: "flex", gap: 8, fontSize: 10, color: C.t2 }}>
                          {pt.cost && <span style={{ fontWeight: 700, fontFamily: MONO, color: isSelected ? C.primary : C.t1 }}>R{(pt.cost * cohorts).toLocaleString()}</span>}
                          {pt.students && <span>{pt.students} students</span>}
                          <span>{pt.duration}</span>
                        </div>
                        {/* Inline cohort multiplier when selected */}
                        {isSelected && pt.cost && (
                          <div style={{ display: "flex", gap: 4, marginTop: 6 }} onClick={e => e.stopPropagation()}>
                            {[1, 2, 3, 5].map(n => (
                              <button key={n} onClick={() => {
                                  const next = new Map(selectedPTypes);
                                  next.set(num, { cohorts: n });
                                  setSelectedPTypes(next); setNewAsk("");
                                }}
                                style={{
                                  padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, fontFamily: MONO,
                                  background: cohorts === n ? C.primary : C.white, color: cohorts === n ? C.white : C.t3,
                                  border: `1px solid ${cohorts === n ? C.primary : C.line}`, cursor: "pointer",
                                }}>{n}x</button>
                            ))}
                            <span style={{ fontSize: 10, fontWeight: 700, color: C.primary, marginLeft: "auto", fontFamily: MONO }}>
                              R{(pt.cost * cohorts).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Custom programme */}
                {customProgrammes.map((cp, i) => (
                  <div key={cp.id} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                    <input placeholder="Programme name" value={cp.name} onChange={e => {
                        const next = [...customProgrammes]; next[i] = { ...next[i], name: e.target.value }; setCustomProgrammes(next);
                      }}
                      style={{ flex: 2, padding: "6px 10px", fontSize: 12, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: FONT }} />
                    <input placeholder="Cost (R)" type="number" value={cp.cost || ""} onChange={e => {
                        const next = [...customProgrammes]; next[i] = { ...next[i], cost: parseInt(e.target.value) || 0 }; setCustomProgrammes(next); setNewAsk("");
                      }}
                      style={{ width: 100, padding: "6px 10px", fontSize: 12, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: MONO }} />
                    <button onClick={() => {
                        const next = new Map(selectedPTypes);
                        if (next.has(cp.id)) next.delete(cp.id); else next.set(cp.id, { cohorts: 1 });
                        setSelectedPTypes(next); setNewAsk("");
                      }}
                      style={{
                        padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer",
                        background: selectedPTypes.has(cp.id) ? C.primary : C.raised,
                        color: selectedPTypes.has(cp.id) ? C.white : C.t3,
                        border: `1px solid ${selectedPTypes.has(cp.id) ? C.primary : C.line}`,
                      }}>{selectedPTypes.has(cp.id) ? "\u2713 Selected" : "Select"}</button>
                    <button onClick={() => {
                        setCustomProgrammes(prev => prev.filter((_, j) => j !== i));
                        const next = new Map(selectedPTypes); next.delete(cp.id); setSelectedPTypes(next); setNewAsk("");
                      }}
                      style={{ background: "none", border: "none", color: C.t4, cursor: "pointer", fontSize: 14 }}>{"\u00D7"}</button>
                  </div>
                ))}
                <button onClick={() => setCustomProgrammes(prev => [...prev, { id: `custom-${prev.length}`, name: "", cost: 0 }])}
                  style={{ background: "none", border: `1px dashed ${C.line}`, borderRadius: 8, padding: "6px 14px",
                    fontSize: 11, fontWeight: 600, color: C.t3, cursor: "pointer", fontFamily: FONT, marginBottom: 12, width: "100%" }}>
                  + Custom Programme
                </button>

                {/* Ask breakdown */}
                {selectedPTypes.size > 0 && (() => {
                  const baseCost = calcTotalAsk(selectedPTypes, customProgrammes, false);
                  const orgCost = Math.round(baseCost * 0.3);
                  const totalAsk = baseCost + orgCost;
                  return (
                    <div style={{ padding: "10px 14px", background: C.warm100, borderRadius: 8, marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: C.t3, marginBottom: 4 }}>
                        Programme: <strong style={{ fontFamily: MONO }}>R{baseCost.toLocaleString()}</strong>
                        {" + "}30% org: <strong style={{ fontFamily: MONO }}>R{orgCost.toLocaleString()}</strong>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: C.primary, fontFamily: MONO }}>
                        Total ask: R{totalAsk.toLocaleString()}
                      </div>
                    </div>
                  );
                })()}

                {/* Custom ask override */}
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontSize: 11, color: C.t3, fontWeight: 600 }}>Override ask:</span>
                  <input value={newAsk} onChange={e => setNewAsk(e.target.value)}
                    placeholder="R amount" type="number"
                    style={{ width: 120, padding: "6px 10px", fontSize: 13, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: MONO }} />
                </div>

                {/* Focus tags */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.t3, marginBottom: 4 }}>Focus areas</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {COMMON_FOCUS.map(tag => {
                      const sel = newFocusTags.includes(tag);
                      return (
                        <button key={tag} onClick={() => setNewFocusTags(prev => sel ? prev.filter(t => t !== tag) : [...prev, tag])}
                          style={{
                            padding: "3px 10px", fontSize: 10, fontWeight: 600, borderRadius: 20, cursor: "pointer", fontFamily: FONT,
                            background: sel ? C.primary + "18" : C.raised, color: sel ? C.primary : C.t3,
                            border: `1px solid ${sel ? C.primary + "50" : C.line}`,
                          }}>{tag}</button>
                      );
                    })}
                    <input value={customFocusInput} onChange={e => setCustomFocusInput(e.target.value)}
                      placeholder="+ custom" onKeyDown={e => {
                        if (e.key === "Enter" && customFocusInput.trim()) {
                          setNewFocusTags(prev => [...prev, customFocusInput.trim()]);
                          setCustomFocusInput("");
                        }
                      }}
                      style={{ width: 80, padding: "3px 8px", fontSize: 10, border: `1px solid ${C.line}`, borderRadius: 20, fontFamily: FONT }} />
                  </div>
                </div>

                {/* Context & Attachments */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.t3, marginBottom: 4 }}>Context & direction</div>
                  <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)}
                    placeholder={"Paste funder guidelines, application requirements, strategic notes, or any context that should inform the AI when researching and drafting...\n\nExamples:\n• \"Returning funder — focus on continuity and outcomes from last cycle\"\n• \"They want a focus on rural youth and digital skills\"\n• \"Max 10 pages, must include theory of change\""}
                    style={{ width: "100%", minHeight: 90, padding: "10px 12px", fontSize: 12, lineHeight: 1.5,
                      border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: FONT, resize: "vertical",
                      boxSizing: "border-box", background: C.bg }} />

                  {/* File attachments */}
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <label style={{
                        display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px",
                        fontSize: 11, fontWeight: 600, color: C.t3, background: C.raised,
                        borderRadius: 6, cursor: "pointer", border: `1px solid ${C.line}`,
                        transition: "all 0.15s",
                      }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = C.primary; e.currentTarget.style.color = C.primary; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.color = C.t3; }}
                      >
                        <span style={{ fontSize: 13 }}>+</span> Attach files
                        <input type="file" multiple
                          accept=".pdf,.doc,.docx,.xlsx,.xls,.csv,.txt,.md,.jpg,.jpeg,.png,.gif,.webp"
                          style={{ display: "none" }}
                          onChange={e => {
                            if (e.target.files.length) setPendingFiles(prev => [...prev, ...Array.from(e.target.files)]);
                            e.target.value = "";
                          }} />
                      </label>
                      <span style={{ fontSize: 10, color: C.t4 }}>
                        Funder docs, RFPs, guidelines — uploaded after grant is created
                      </span>
                    </div>

                    {pendingFiles.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {pendingFiles.map((f, i) => (
                          <div key={i} style={{
                            display: "flex", alignItems: "center", gap: 6, padding: "4px 10px",
                            background: C.white, border: `1px solid ${C.line}`, borderRadius: 6, fontSize: 11,
                          }}>
                            <span style={{ fontWeight: 600, color: C.dark, maxWidth: 180, overflow: "hidden",
                              textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                            <span style={{ color: C.t4, fontSize: 10 }}>
                              {f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(0)}KB` : `${(f.size / (1024 * 1024)).toFixed(1)}MB`}
                            </span>
                            <button onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}
                              style={{ background: "none", border: "none", color: C.t4, cursor: "pointer",
                                fontSize: 13, padding: "0 2px", lineHeight: 1 }}
                              onMouseEnter={e => { e.currentTarget.style.color = C.red; }}
                              onMouseLeave={e => { e.currentTarget.style.color = C.t4; }}
                            >×</button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Btn v="ghost" onClick={() => setWizStep(1)} style={{ fontSize: 12 }}>Back</Btn>
                  <Btn onClick={() => setWizStep(3)} style={{ fontSize: 12, padding: "8px 18px" }}>Next</Btn>
                  <Btn onClick={resetWizard} v="ghost" style={{ fontSize: 12 }}>Cancel</Btn>
                </div>
                {addError && <div style={{ fontSize: 11, color: C.red, marginTop: 6 }}>{addError}</div>}
              </div>
            )}

            {/* ── Step 3: AI Actions ── */}
            {wizStep === 3 && (
              <div>
                {/* Summary */}
                <div style={{ padding: "10px 14px", background: C.warm100, borderRadius: 8, marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>{newName}</div>
                  <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
                    {newFunder} {"\u00B7"} {newType} {"\u00B7"} {newRel} {"\u00B7"} {newMarket === "global" ? "\uD83C\uDF0D Global" : "\uD83C\uDDFF\uD83C\uDDE6 SA"}
                    {newDeadline && ` \u00B7 Due ${new Date(newDeadline + "T00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`}
                  </div>
                  {(() => {
                    const enteredAsk = parseInt(String(newAsk).replace(/[,\s]/g, "")) || 0;
                    const calcAsk = calcTotalAsk(selectedPTypes, customProgrammes, true);
                    const finalAsk = enteredAsk || calcAsk;
                    return finalAsk > 0 ? (
                      <div style={{ fontSize: 14, fontWeight: 800, color: C.primary, fontFamily: MONO, marginTop: 4 }}>R{finalAsk.toLocaleString()}</div>
                    ) : null;
                  })()}
                  {selectedPTypes.size > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                      {[...selectedPTypes.entries()].map(([k, v]) => (
                        <span key={k} style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: C.primarySoft, color: C.primary }}>
                          {k.startsWith("custom-") ? customProgrammes.find(c => c.id === k)?.name || "Custom" : `Type ${k}`}
                          {v.cohorts > 1 ? ` \u00D7${v.cohorts}` : ""}
                        </span>
                      ))}
                    </div>
                  )}
                  {newFocusTags.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 6 }}>
                      {newFocusTags.map(t => <span key={t} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: C.raised, color: C.t3 }}>{t}</span>)}
                    </div>
                  )}
                  {(newNotes.trim() || pendingFiles.length > 0) && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, alignItems: "center" }}>
                      {newNotes.trim() && (
                        <span style={{ fontSize: 10, color: C.t3 }}>
                          Context: {newNotes.trim().length > 60 ? newNotes.trim().slice(0, 60) + "..." : newNotes.trim()}
                        </span>
                      )}
                      {pendingFiles.length > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 600, color: C.blue, background: C.blueSoft || C.primarySoft, padding: "2px 8px", borderRadius: 4 }}>
                          {pendingFiles.length} file{pendingFiles.length > 1 ? "s" : ""} attached
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* AI action toggles */}
                <div style={{ fontSize: 10, fontWeight: 700, color: C.t4, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
                  Auto-run after creation
                </div>
                {[
                  { key: "fitscore", label: "Fit Score", desc: "Assess alignment with the organisation's strengths" },
                  { key: "research", label: "Funder Research", desc: "Research funder priorities, history, requirements", locked: autoAI.draft },
                  { key: "draft", label: "Draft Proposal", desc: "Research runs first to tailor the proposal to the funder" },
                ].map(action => (
                  <label key={action.key} onClick={() => {
                      if (action.locked) return; // research is locked on when draft is enabled
                      setAutoAI(prev => {
                        const next = { ...prev, [action.key]: !prev[action.key] };
                        // Enabling draft forces research on
                        if (action.key === "draft" && next.draft) next.research = true;
                        return next;
                      });
                    }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                      borderRadius: 8, marginBottom: 4, cursor: action.locked ? "default" : "pointer",
                      background: autoAI[action.key] ? C.primarySoft : C.white,
                      border: `1px solid ${autoAI[action.key] ? C.primary + "50" : C.line}`,
                      transition: "all 0.15s", opacity: action.locked ? 0.7 : 1,
                    }}>
                    <span style={{
                      width: 18, height: 18, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 800,
                      background: autoAI[action.key] ? C.primary : C.white,
                      color: autoAI[action.key] ? C.white : C.t4,
                      border: `1px solid ${autoAI[action.key] ? C.primary : C.line}`,
                    }}>{autoAI[action.key] ? "\u2713" : ""}</span>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.dark }}>
                        {action.label}{action.locked ? " (required for draft)" : ""}
                      </div>
                      <div style={{ fontSize: 10, color: C.t3 }}>{action.desc}</div>
                    </div>
                  </label>
                ))}

                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
                  <Btn v="ghost" onClick={() => setWizStep(2)} style={{ fontSize: 12 }}>Back</Btn>
                  <Btn onClick={() => addGrantEnhanced(true)} style={{ fontSize: 12, padding: "8px 18px" }}>
                    {Object.values(autoAI).some(Boolean) ? "Add & Run AI" : "Add to Pipeline"}
                  </Btn>
                  <Btn onClick={() => addGrantEnhanced(false)} v="ghost" style={{ fontSize: 12 }}>Just Add</Btn>
                  <Btn onClick={resetWizard} v="ghost" style={{ fontSize: 12 }}>Cancel</Btn>
                </div>
                {addError && <div style={{ fontSize: 11, color: C.red, marginTop: 6 }}>{addError}</div>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scout Panel — loader, results, and empty-state onboarding */}
      <ScoutPanel
        ref={scoutRef}
        orgContext={orgContext}
        grants={grants}
        onAddGrant={onAddGrant}
        onShowAdd={() => setShowAdd(true)}
        onShowUrlTool={onRunAI ? () => setShowUrlTool(true) : null}
        onScoutingChange={setIsScouting}
        api={api}
      />

      {/* Empty state — search/filter yielded no results */}
      {grants.length > 0 && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: C.t3 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.t2, marginBottom: 4 }}>No matching grants</div>
          <div style={{ fontSize: 13, color: C.t4 }}>
            {q ? `No results for "${q}"` : activeFilters.size > 0 ? "No grants match your active filters" : `No ${sf} grants found`}
            {" · "}
            <button onClick={() => { handleSearchChange(""); setSf("all"); setActiveFilters(new Set()); setMarket("all"); }} style={{ color: C.primary, background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: FONT, fontSize: 13 }}>Clear all filters</button>
          </div>
          <div style={{ fontSize: 11, color: C.t4, marginTop: 4 }}>Try removing filters or broadening your search</div>
        </div>
      )}

      {/* Kanban view — stage-colored columns and cards */}
      {pView === "kanban" && filtered.length > 0 && (
        <div style={{ display: "flex", gap: 10, flex: 1, overflowX: "auto", paddingBottom: 10 }}>
          {[...activeStages, ...(showArchived ? [{ id: "archived", label: "Not Relevant", c: "#9CA3AF", bg: "#F3F4F6" }] : [])].map(stage => {
            const stageGrants = sorted.filter(g => g.stage === stage.id);
            const stageTotal = stageGrants.reduce((s, g) => s + effectiveAsk(g), 0);
            return (
              <div key={stage.id}
                onDragOver={e => e.preventDefault()}
                onDrop={() => handleDrop(stage.id)}
                style={{
                  minWidth: 220, maxWidth: 280, flex: 1, display: "flex", flexDirection: "column",
                  background: (stage.bg || C.bg) + "40", borderRadius: 10, padding: 8,
                  border: `1px solid ${stage.c}30`,
                }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: stage.c }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.t2, textTransform: "uppercase", letterSpacing: 0.5 }}>{stage.label}</span>
                    <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>({stageGrants.length})</span>
                  </div>
                  <span style={{ fontSize: 10, color: C.t4, fontFamily: MONO }}>{fmtK(stageTotal)}</span>
                </div>
                <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                  {stageGrants.map(g => {
                    const d = dL(g.deadline);
                    const m = getMember(g.owner);
                    const isSelected = selectedIds.has(g.id);
                    return (
                      <div key={g.id} draggable onDragStart={() => setDragId(g.id)}
                        onClick={(e) => {
                          if (batchAction) {
                            e.stopPropagation();
                            setSelectedIds(prev => { const n = new Set(prev); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n; });
                          } else {
                            onSelectGrant(g.id);
                          }
                        }}
                        style={{
                          background: isSelected ? `${C.primary}08` : C.white, borderRadius: 8, padding: "8px 10px",
                          border: `1px solid ${isSelected ? C.primary : stage.c}30`,
                          cursor: "pointer",
                          boxShadow: C.cardShadow,
                          transition: "box-shadow 0.15s, transform 0.15s",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.boxShadow = C.cardShadowHover; e.currentTarget.style.transform = "translateY(-1px)"; }}
                        onMouseLeave={e => { e.currentTarget.style.boxShadow = C.cardShadow; e.currentTarget.style.transform = "none"; }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          {batchAction && (
                            <div style={{
                              width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 1,
                              border: `1px solid ${isSelected ? C.primary : C.line}`,
                              background: isSelected ? C.primary : "transparent",
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              {isSelected && <span style={{ color: C.white, fontSize: 10, fontWeight: 700 }}>{"\u2713"}</span>}
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.dark, marginBottom: 4, lineHeight: 1.3, display: "flex", alignItems: "center", gap: 6 }}>
                              {g.name}
                              {g.stage === "scouted" && g.log?.[0]?.d && ((Date.now() - new Date(g.log[0].d).getTime()) < 7 * 86400000) && (
                                <span style={{ fontSize: 8, fontWeight: 800, padding: "1px 5px", borderRadius: 4, background: C.primary, color: C.white, letterSpacing: 0.8, lineHeight: "14px", flexShrink: 0 }}>NEW</span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: C.t3, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                              {g.funder}{g.market === "global" ? " \uD83C\uDF0D" : ""}
                              {g.source && g.source !== "scout" && (
                                <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 4, background: C.warm200, color: C.t3 }}>
                                  {g.source}
                                </span>
                              )}
                              {g.applyUrl && (
                                <a href={g.applyUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                  style={{ fontSize: 9, fontWeight: 700, color: C.blue, background: C.blue + "12", padding: "1px 6px", borderRadius: 4, textDecoration: "none", whiteSpace: "nowrap" }}
                                  title={g.applyUrl}
                                >{"\u2197"} Apply</a>
                              )}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <Avatar member={m} size={20} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: g.ask > 0 ? C.t2 : C.t4, fontFamily: MONO }}>{g.ask > 0 ? fmtK(g.ask) : g.funderBudget ? `~${fmtK(g.funderBudget)}` : "TBD"}</span>
                          </div>
                          <DeadlineBadge d={d} deadline={g.deadline} stage={g.stage} />
                        </div>
                        {!["won", "lost", "deferred", "archived"].includes(g.stage) && (() => {
                          const r = grantReadiness(g, complianceDocs);
                          return r.missing.length > 0 ? <ReadinessChips missing={r.missing} /> : null;
                        })()}
                        {!CLOSED_STAGES.includes(g.stage) && <GateIndicator stage={g.stage} ownerRole={m.role} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List view — clean rows with status badges */}
      {pView === "list" && filtered.length > 0 && (
        <div style={{ background: C.white, borderRadius: 12, overflow: "hidden", boxShadow: C.cardShadow, border: `1px solid ${C.line}` }}>
          {/* Sort bar */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "8px 16px", borderBottom: `1px solid ${C.line}`, background: C.bg,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: C.t3 }}>
              <span style={{ fontWeight: 600 }}>Sort by:</span>
              <select value={pSort} onChange={e => setPSort(e.target.value)}
                style={{ fontSize: 12, fontWeight: 600, fontFamily: FONT, border: "none", background: "transparent", color: C.dark, cursor: "pointer", outline: "none" }}>
                <option value="default">Deadline</option>
                <option value="ask">Amount</option>
                <option value="priority">Priority</option>
                <option value="fit">Fit score</option>
              </select>
            </div>
          </div>
          {sorted.map((g, idx) => {
            const d = dL(g.deadline);
            const m = getMember(g.owner);
            const stg = STAGES.find(s => s.id === g.stage);
            const ask = effectiveAsk(g);
            const isOverdue = d !== null && d < 0;
            const isDueSoon = d !== null && d >= 0 && d <= 7;
            const isClosed = CLOSED_STAGES.includes(g.stage);
            // Status badge
            let statusText = null, statusColor = C.t4, statusBg = C.raised;
            if (g.stage === "submitted" || g.stage === "awaiting") { statusText = g.stage === "submitted" ? "Submitted" : "Awaiting"; statusColor = "#0891B2"; statusBg = "#ECFEFF"; }
            else if (isOverdue) { statusText = `Missed by ${Math.abs(d)}d`; statusColor = C.red; statusBg = C.redSoft; }
            else if (isDueSoon) { statusText = d === 0 ? "Due today" : `Due in ${d} day${d !== 1 ? "s" : ""}`; statusColor = C.amber; statusBg = C.amberSoft; }
            else if (g.deadline && d !== null) { statusText = `${d}d left`; statusColor = C.t3; statusBg = C.raised; }
            else if (isClosed) { statusText = stg?.label || g.stage; statusColor = stg?.c || C.t4; statusBg = stg?.bg || C.raised; }

            return (
              <div key={g.id} onClick={() => {
                  // In batch mode, clicking the row toggles selection instead of
                  // opening the grant. The entire row is the hit target so users
                  // don't have to aim for the small checkbox.
                  if (batchAction) {
                    setSelectedIds(prev => { const n = new Set(prev); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n; });
                  } else {
                    onSelectGrant(g.id);
                  }
                }}
                {...(idx === 0 ? { "data-tour": "grant-card" } : {})}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "12px 16px", borderBottom: `1px solid ${C.line}`,
                  cursor: "pointer", transition: "background 0.15s",
                  background: batchAction && selectedIds.has(g.id) ? `${C.primary}10` : "transparent",
                }}
                onMouseEnter={e => { if (!(batchAction && selectedIds.has(g.id))) e.currentTarget.style.background = C.hover; }}
                onMouseLeave={e => { e.currentTarget.style.background = batchAction && selectedIds.has(g.id) ? `${C.primary}10` : "transparent"; }}>

                {/* Select checkbox (batch mode) */}
                {batchAction && (
                  <input type="checkbox" checked={selectedIds.has(g.id)} readOnly
                    style={{ cursor: "pointer", flexShrink: 0, pointerEvents: "none" }} />
                )}

                {/* Owner avatar */}
                <Avatar member={m} size={32} />

                {/* Grant name + funder (stacked) */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {g.name}
                  </div>
                  <div style={{ fontSize: 12, color: C.t3, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {g.funder}
                  </div>
                </div>

                {/* Ask amount */}
                <div style={{ flexShrink: 0, textAlign: "right", minWidth: 80 }}>
                  <span style={{
                    fontSize: 13, fontWeight: 700, fontFamily: MONO,
                    color: ask > 0 ? C.dark : C.t4,
                    background: ask > 0 ? C.raised : "transparent",
                    padding: ask > 0 ? "2px 8px" : 0, borderRadius: 6,
                  }}>
                    {ask > 0 ? fmtK(ask) : g.funderBudget ? `~${fmtK(g.funderBudget)}` : "TBD"}
                  </span>
                </div>

                {/* Status badge */}
                <div style={{ flexShrink: 0, minWidth: 110, textAlign: "right" }}>
                  {statusText && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 100,
                      color: statusColor, background: statusBg,
                      whiteSpace: "nowrap",
                    }}>
                      {isOverdue ? "● " : isDueSoon ? "● " : ""}{statusText}
                    </span>
                  )}
                </div>

                {/* Assigned to */}
                <div style={{ flexShrink: 0, minWidth: 130, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                  {m.id !== "team" && m.name !== "Unassigned" ? (
                    <>
                      <span style={{ fontSize: 12, color: C.t3 }}>Assigned to <b style={{ color: C.t1 }}>{m.name}</b></span>
                      <Avatar member={m} size={24} />
                    </>
                  ) : (
                    <span style={{ fontSize: 12, color: C.t4, fontStyle: "italic" }}>Unassigned</span>
                  )}
                </div>

                {/* Arrow */}
                <span style={{ fontSize: 14, color: C.t4, flexShrink: 0 }}>›</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Person view — grouped by team member */}
      {pView === "person" && filtered.length > 0 && (() => {
        return (
          <div style={{ display: "flex", gap: 10, flex: 1, overflowX: "auto", paddingBottom: 10 }}>
            {personEntries.map(([ownerId, ownerGrants]) => {
              const m = getMember(ownerId);
              const total = ownerGrants.reduce((s, g) => s + effectiveAsk(g), 0);
              const cIdx = m.name ? m.name.charCodeAt(0) % AVATAR_COLORS.length : AVATAR_COLORS.length - 1;
              const ac = AVATAR_COLORS[cIdx];

              return (
                <div key={ownerId} style={{
                  minWidth: 240, maxWidth: 300, flex: 1, display: "flex", flexDirection: "column",
                  background: ac.bg + "30", borderRadius: 10, padding: 8,
                  border: `1px solid ${ac.accent}30`,
                }}>
                  {/* Person header */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 8px 6px", marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar member={m} size={28} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, lineHeight: 1.2 }}>{m.name}</div>
                        {m.role && m.role !== "none" && (
                          <div style={{ fontSize: 10, fontWeight: 600, color: C.t4, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 1 }}>
                            {m.role === "director" ? "Director" : m.role === "hop" ? "Head of Prog" : m.role === "pm" ? "Prog Manager" : m.role}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.t3 }}>{ownerGrants.length}</div>
                      <div style={{ fontSize: 9, color: C.t4, fontFamily: MONO }}>{fmtK(total)}</div>
                    </div>
                  </div>

                  {/* Grants */}
                  <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                    {ownerGrants.map(g => {
                      const d = dL(g.deadline);
                      const stg = STAGES.find(s => s.id === g.stage);
                      return (
                        <div key={g.id} draggable onDragStart={() => setDragId(g.id)}
                          onClick={() => onSelectGrant(g.id)}
                          style={{
                            background: C.white, borderRadius: 8, padding: "8px 10px",
                            border: `1px solid ${(stg?.c || C.t4)}30`,
                            cursor: "pointer", boxShadow: C.cardShadow,
                            transition: "box-shadow 0.15s, transform 0.15s",
                          }}
                          onMouseEnter={e => { e.currentTarget.style.boxShadow = C.cardShadowHover; e.currentTarget.style.transform = "translateY(-1px)"; }}
                          onMouseLeave={e => { e.currentTarget.style.boxShadow = C.cardShadow; e.currentTarget.style.transform = "none"; }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: stg?.c || C.t4, flexShrink: 0 }} />
                            <span style={{ fontSize: 10, fontWeight: 600, color: stg?.c || C.t3, textTransform: "uppercase", letterSpacing: 0.3 }}>{stg?.label || g.stage}</span>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.dark, marginBottom: 4, lineHeight: 1.3 }}>{g.name}</div>
                          <div style={{ fontSize: 11, color: C.t3, marginBottom: 6 }}>{g.funder}</div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: g.ask > 0 ? C.t2 : C.t4, fontFamily: MONO }}>{g.ask > 0 ? fmtK(g.ask) : g.funderBudget ? `~${fmtK(g.funderBudget)}` : "TBD"}</span>
                            <DeadlineBadge d={d} deadline={g.deadline} stage={g.stage} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
