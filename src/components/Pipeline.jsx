import { useState, useMemo, useRef, useCallback } from "react";
import { C, FONT, MONO } from "../theme";
import { fmtK, dL, uid, td, effectiveAsk, grantReadiness, isAIError, parseFitScore } from "../utils";
import { Btn, DeadlineBadge, TypeBadge, Avatar, Label } from "./index";
import { detectType } from "../data/funderStrategy";
import ScoutPanel from "./ScoutPanel";
import { ReadinessChips, GateIndicator } from "./PipelineParts";
import AddGrantWizard from "./AddGrantWizard";

const VIEW_OPTIONS = [["kanban", "Board"], ["list", "List"], ["person", "Person"]];
const CLOSED_STAGES = ["won", "lost", "deferred", "archived"];
const AVATAR_COLORS = [
  { bg: C.primarySoft, accent: C.primary },
  { bg: C.blueSoft, accent: C.blue },
  { bg: C.amberSoft, accent: C.amber },
  { bg: C.emeraldSoft, accent: C.emerald },
  { bg: C.tealSoft, accent: C.teal },
  { bg: C.purpleSoft, accent: C.purple },
];

export default function Pipeline({ grants, team, stages, funderTypes, complianceDocs = [], orgContext = "", onSelectGrant, onUpdateGrant, onAddGrant, onRunAI, api, onToast, onLaunchTour }) {
  const [pView, setPView] = useState("list");
  const [q, setQ] = useState("");
  const [sf, setSf] = useState("all");
  const [pSort, setPSort] = useState("default");
  const [market, setMarket] = useState("all"); // "all" | "sa" | "global"
  const scoutRef = useRef(null);
  const [isScouting, setIsScouting] = useState(false); // mirrors ScoutPanel scouting state for toolbar button
  const [dragId, setDragId] = useState(null);
  const [showAdd, setShowAdd] = useState(false); // add-grant wizard visibility (form state lives in AddGrantWizard)
  const [urlInput, setUrlInput] = useState("");
  const [urlBusy, setUrlBusy] = useState(false);
  const [showUrlTool, setShowUrlTool] = useState(false);
  const [activeFilters, setActiveFilters] = useState(new Set()); // "due-week", "due-month", "no-deadline", "no-draft", "unassigned", owner ids
  const [selectedIds, setSelectedIds] = useState(new Set()); // batch operations
  const [batchAction, setBatchAction] = useState(null); // "stage" | "owner" | "priority"
  const [scoringAll, setScoringAll] = useState(false);
  const [scoreProgress, setScoreProgress] = useState({ done: 0, total: 0, current: "" });
  const [showArchived, setShowArchived] = useState(false);

  const STAGES = stages || [];

  // Build team lookup once per team change (avoids O(n) find per grant card)
  const teamById = useMemo(() => {
    const m = new Map();
    if (team) for (const t of team) m.set(t.id, t);
    return m;
  }, [team]);
  const fallbackMember = teamById.get("team") || { name: "Unassigned", initials: "\u2014" };
  const getMember = (id) => teamById.get(id) || fallbackMember;

  // Debounced search — immediate typing, delayed filtering (150ms)
  const [debouncedQ, setDebouncedQ] = useState("");
  const debounceRef = useRef(null);
  const handleSearchChange = useCallback((val) => {
    setQ(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(val), 150);
  }, []);

  // Market counts (computed before filtering)
  const marketCounts = useMemo(() => {
    const sa = grants.filter(g => (g.market || "sa") === "sa");
    const gl = grants.filter(g => g.market === "global");
    return {
      sa: { count: sa.length, ask: sa.reduce((s, g) => s + (effectiveAsk(g) || 0), 0) },
      global: { count: gl.length, ask: gl.reduce((s, g) => s + (effectiveAsk(g) || 0), 0) },
    };
  }, [grants]);

  const archivedCount = useMemo(() => grants.filter(g => g.stage === "archived").length, [grants]);

  const filtered = useMemo(() => {
    let gs = [...grants];
    // Hide archived unless explicitly toggled on
    if (!showArchived) gs = gs.filter(g => g.stage !== "archived");
    if (market !== "all") gs = gs.filter(g => (g.market || "sa") === market);
    if (debouncedQ) {
      const lq = debouncedQ.toLowerCase();
      gs = gs.filter(g => {
        // Search across all text fields — name, funder, notes, stage, type, owner, focus tags, AI content
        if (g.name?.toLowerCase().includes(lq)) return true;
        if (g.funder?.toLowerCase().includes(lq)) return true;
        if (g.notes?.toLowerCase().includes(lq)) return true;
        if (g.stage?.toLowerCase().includes(lq)) return true;
        if (g.type?.toLowerCase().includes(lq)) return true;
        if (g.market?.toLowerCase().includes(lq)) return true;
        if (g.rel?.toLowerCase().includes(lq)) return true;
        // Owner name lookup
        if (g.owner) {
          const ownerName = getMember(g.owner)?.name?.toLowerCase() || "";
          if (ownerName.includes(lq)) return true;
        }
        // Focus tags
        if (Array.isArray(g.focus) && g.focus.some(f => f.toLowerCase().includes(lq))) return true;
        // Geo tags
        if (Array.isArray(g.geo) && g.geo.some(f => f.toLowerCase().includes(lq))) return true;
        // AI research summary (first 500 chars — avoid deep search of megabytes)
        if (g.aiResearch?.slice(0, 500).toLowerCase().includes(lq)) return true;
        // Ask amount — allow searching by number
        if (g.ask && String(g.ask).includes(lq)) return true;
        return false;
      });
    }
    if (sf !== "all") gs = gs.filter(g => g.type === sf);
    if (activeFilters.size > 0) {
      // Separate owner filters (OR logic) from other filters (AND logic)
      const ownerFilters = [...activeFilters].filter(f => f.startsWith("owner:") || f === "unassigned");
      const otherFilters = [...activeFilters].filter(f => !f.startsWith("owner:") && f !== "unassigned");
      gs = gs.filter(g => {
        // AND logic for non-owner filters
        for (const f of otherFilters) {
          if (f === "new-week") { const created = g.log?.[0]?.d; if (!created || (Date.now() - new Date(created).getTime()) > 7 * 86400000) return false; }
          else if (f === "due-week") { const d = dL(g.deadline); if (d === null || d > 7 || d < 0) return false; }
          else if (f === "due-month") { const d = dL(g.deadline); if (d === null || d > 30 || d < 0) return false; }
          else if (f === "no-deadline") { if (g.deadline) return false; }
          else if (f === "no-draft") { if (g.aiDraft) return false; }
          else if (f === "open-only") { if (g.deadline && new Date(g.deadline) < new Date() && !["submitted","awaiting","won","lost","deferred","archived"].includes(g.stage)) return false; }
          else if (f === "awaiting") { if (g.stage !== "submitted" && g.stage !== "awaiting") return false; }
          else if (f === "missed") { const dl = dL(g.deadline); if (dl === null || dl >= 0 || ["submitted","awaiting","won","lost","deferred","archived"].includes(g.stage)) return false; }
        }
        // OR logic for owner/unassigned filters — grant matches if it belongs to ANY selected person
        if (ownerFilters.length > 0) {
          const matchesAny = ownerFilters.some(f => {
            if (f === "unassigned") return !g.owner || g.owner === "team";
            return g.owner === f.slice(6);
          });
          if (!matchesAny) return false;
        }
        return true;
      });
    }
    return gs;
  }, [grants, debouncedQ, sf, market, activeFilters, showArchived]);

  const sorted = useMemo(() => {
    let gs = [...filtered];
    if (pSort === "ask") gs.sort((a, b) => (b.ask || 0) - (a.ask || 0));
    else if (pSort === "priority") gs.sort((a, b) => (b.pri || 0) - (a.pri || 0));
    else if (pSort === "fit") {
      // Extract numeric score from AI fit score text (SCORE: XX)
      const getFit = g => parseFitScore(g.aiFitscore).score ?? -1;
      gs.sort((a, b) => getFit(b) - getFit(a));
    }
    else /* default + deadline */ gs.sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
    return gs;
  }, [filtered, pSort]);

  // Pre-compute person groups from sorted grants (avoids rebuild on every render)
  const personEntries = useMemo(() => {
    const map = new Map();
    sorted.forEach(g => {
      const ownerId = g.owner || "team";
      if (!map.has(ownerId)) map.set(ownerId, []);
      map.get(ownerId).push(g);
    });
    return [...map.entries()].sort((a, b) => {
      if (a[0] === "team") return 1;
      if (b[0] === "team") return -1;
      return b[1].length - a[1].length;
    });
  }, [sorted]);

  // Memoized owner names for filter chips
  const ownerNames = useMemo(() =>
    [...new Set(grants.map(g => g.owner).filter(o => o && o !== "team"))],
    [grants]
  );

  // Memoized funder list for datalist suggestions
  const funderSuggestions = useMemo(() =>
    [...new Set(grants.map(g => g.funder).filter(Boolean))],
    [grants]
  );

  const handleDrop = (stageId) => {
    if (!dragId) return;
    const g = grants.find(x => x.id === dragId);
    if (g && g.stage !== stageId) {
      onUpdateGrant(dragId, { stage: stageId, log: [...(g.log || []), { d: td(), t: `Moved to ${stageId}` }] });
    }
    setDragId(null);
  };

  /* ── CSV Export ── */
  const exportCSV = () => {
    const escCSV = (v) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const headers = ["Name", "Funder", "Type", "Stage", "Ask (R)", "Deadline", "Owner", "Relationship", "Priority", "Source", "Market", "Apply URL", "Created"];
    const ownerName = (id) => team.find(t => t.id === id)?.name || id;
    const stageLabel = (id) => stages.find(s => s.id === id)?.label || id;
    const rows = filtered.map(g => [
      g.name, g.funder, g.type, stageLabel(g.stage), g.ask || 0, g.deadline || "",
      ownerName(g.owner), g.rel, g.pri, g.source || "scout", g.market || "sa", g.applyUrl || "",
      g.log?.[0]?.d || "",
    ].map(escCSV).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `grants-pipeline-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  /* ── Score All: batch AI fit score for every active grant ── */
  const scoreAllGrants = async () => {
    const active = grants.filter(g => !CLOSED_STAGES.includes(g.stage));
    if (active.length === 0) return;
    setScoringAll(true);
    setScoreProgress({ done: 0, total: active.length, current: "" });
    let ok = 0, failed = 0;
    for (let i = 0; i < active.length; i++) {
      const g = active[i];
      setScoreProgress({ done: i, total: active.length, current: g.funder });
      try {
        const r = await onRunAI("fitscore", g);
        if (r && !isAIError(r)) {
          onUpdateGrant(g.id, { aiFitscore: r, aiFitscoreAt: new Date().toISOString() });
          ok++;
        } else {
          failed++;
          console.warn(`Fit score failed for ${g.name}:`, r);
        }
      } catch (e) {
        failed++;
        console.error(`Fit score failed for ${g.name}:`, e);
      }
    }
    setScoreProgress({ done: active.length, total: active.length, current: "" });
    setScoringAll(false);
    onToast?.(`Scored ${ok} of ${active.length}${failed ? ` (${failed} failed)` : ""}`, { type: failed ? "error" : "success" });
  };

  const activeStages = STAGES.filter(s => !CLOSED_STAGES.includes(s.id));
  const closedStages = STAGES.filter(s => CLOSED_STAGES.includes(s.id));

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
                (async () => {
                  setUrlBusy(true);
                  try {
                    const r = await onRunAI("urlextract", { name: "", funder: "", type: "", ask: 0, focus: [], geo: [], rel: "Cold", notes: "", deadline: null, stage: "scouted" }, urlInput.trim());
                    if (isAIError(r)) { onToast?.(r, { type: "error" }); setUrlBusy(false); return; }
                    const parsed = JSON.parse(r);
                    const fBudget = parsed.ask || 0;
                    const g = {
                      id: uid(), name: parsed.name || "Untitled Grant", funder: parsed.funder || "",
                      type: parsed.type || "Foundation", stage: "scouted",
                      ask: 0, funderBudget: fBudget, askSource: null, aiRecommendedAsk: null,
                      deadline: parsed.deadline || null,
                      focus: parsed.focus || [], geo: [], rel: "Cold", pri: 3, hrs: 0,
                      notes: parsed.notes || "", applyUrl: parsed.applyUrl || urlInput.trim(),
                      log: [{ d: td(), t: `Created from URL · funder budget R${fBudget.toLocaleString()} · ask TBD` }],
                      market: parsed.type === "International" ? "global" : "sa",
                      source: "website",
                      on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null,
                    };
                    onAddGrant(g);
                    setUrlInput("");
                    setShowUrlTool(false);
                  } catch (e) {
                    onToast?.("Could not parse grant from URL. Try adding manually.", { type: "error" });
                  }
                  setUrlBusy(false);
                })();
              }
            }}
          />
          <Btn
            onClick={async () => {
              if (!urlInput.trim() || urlBusy) return;
              setUrlBusy(true);
              try {
                const r = await onRunAI("urlextract", { name: "", funder: "", type: "", ask: 0, focus: [], geo: [], rel: "Cold", notes: "", deadline: null, stage: "scouted" }, urlInput.trim());
                if (isAIError(r)) { onToast?.(r, { type: "error" }); setUrlBusy(false); return; }
                const parsed = JSON.parse(r);
                const fBudget = parsed.ask || 0;
                const g = {
                  id: uid(), name: parsed.name || "Untitled Grant", funder: parsed.funder || "",
                  type: parsed.type || "Foundation", stage: "scouted",
                  ask: 0, funderBudget: fBudget, askSource: null, aiRecommendedAsk: null,
                  deadline: parsed.deadline || null,
                  focus: parsed.focus || [], geo: [], rel: "Cold", pri: 3, hrs: 0,
                  notes: parsed.notes || "", applyUrl: parsed.applyUrl || urlInput.trim(),
                  log: [{ d: td(), t: `Created from URL · funder budget R${fBudget.toLocaleString()} · ask TBD` }],
                  market: parsed.type === "International" ? "global" : "sa",
                  source: "website",
                  on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null,
                };
                onAddGrant(g);
                setUrlInput("");
                setShowUrlTool(false);
              } catch (e) {
                alert("Could not parse grant from URL. Try adding manually.");
              }
              setUrlBusy(false);
            }}
            disabled={!urlInput.trim() || urlBusy}
            style={{ fontSize: 12, padding: "6px 14px", background: C.blue, borderColor: C.blue }}
          >{urlBusy ? "Extracting..." : "Extract"}</Btn>
          <Btn onClick={() => { setShowUrlTool(false); setUrlInput(""); }} v="ghost" style={{ fontSize: 12, padding: "6px 10px" }}>Cancel</Btn>
        </div>
      )}

      {/* Add grant wizard — owns its multi-step form state (Phase 4.6 extraction) */}
      <AddGrantWizard
        open={showAdd}
        onClose={() => setShowAdd(false)}
        funderTypes={funderTypes}
        funderSuggestions={funderSuggestions}
        onAddGrant={onAddGrant}
        onSelectGrant={onSelectGrant}
      />

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
            <button onClick={() => { setQ(""); setSf("all"); setActiveFilters(new Set()); setMarket("all"); }} style={{ color: C.primary, background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: FONT, fontSize: 13 }}>Clear all filters</button>
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
            // Closed date display
            const closedDaysAgo = g.log?.slice().reverse().find(l => l.t?.toLowerCase().includes("closed") || l.t?.toLowerCase().includes("archived"));

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
