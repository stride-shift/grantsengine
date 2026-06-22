import { useState, useMemo, useRef, useCallback } from "react";
import { dL, td, uid, effectiveAsk, isAIError } from "@/utils";
import { CLOSED_STAGES } from "@/data/constants";
import useAsyncAction from "@/hooks/useAsyncAction";

/**
 * Pipeline view-model. Owns the search / filter / sort / group logic for the
 * grants list, plus the team lookup the search relies on and the batch-score /
 * URL-extract / CSV-export side effects. The component renders from the derived
 * lists this returns and keeps only transient UI state (view mode, drag-over,
 * modal open/close, input text) of its own.
 *
 * Behaviour is identical to the previous inline implementation: same filter
 * predicates, same sort comparators, same person grouping, same CSV output.
 *
 * @param grants  the grant list
 * @param team    team members (for owner-name search + CSV owner labels)
 * @param stages  pipeline stages (for CSV stage labels)
 * @param deps    { onUpdateGrant, onAddGrant, onRunAI, onToast } persistence/AI callbacks
 */
export default function usePipelineView(grants, team, stages, deps = {}) {
  const { onUpdateGrant, onAddGrant, onRunAI, onToast } = deps;
  const STAGES = stages || [];

  // ── Filter / sort state ──
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [sf, setSf] = useState("all");
  const [pSort, setPSort] = useState("default");
  const [market, setMarket] = useState("all"); // "all" | "sa" | "global"
  const [activeFilters, setActiveFilters] = useState(new Set()); // "due-week", "due-month", "no-deadline", "no-draft", "unassigned", owner ids
  const [showArchived, setShowArchived] = useState(false);

  // Batch-score progress (drives the toolbar button + progress bar)
  const [scoreProgress, setScoreProgress] = useState({ done: 0, total: 0, current: "" });

  // ── Team lookup (search needs owner names; component renders avatars from it) ──
  const teamById = useMemo(() => {
    const m = new Map();
    if (team) for (const t of team) m.set(t.id, t);
    return m;
  }, [team]);
  const fallbackMember = teamById.get("team") || { name: "Unassigned", initials: "—" };
  const getMember = useCallback(
    (id) => teamById.get(id) || fallbackMember,
    [teamById, fallbackMember]
  );

  // ── Debounced search — immediate typing, delayed filtering (150ms) ──
  const debounceRef = useRef(null);
  const handleSearchChange = useCallback((val) => {
    setQ(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(val), 150);
  }, []);

  // ── Market counts (computed before filtering) ──
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
  }, [grants, debouncedQ, sf, market, activeFilters, showArchived, getMember]);

  const sorted = useMemo(() => {
    let gs = [...filtered];
    if (pSort === "ask") gs.sort((a, b) => (b.ask || 0) - (a.ask || 0));
    else if (pSort === "priority") gs.sort((a, b) => (b.pri || 0) - (a.pri || 0));
    else if (pSort === "fit") {
      // Extract numeric score from AI fit score text (SCORE: XX)
      const getFit = g => {
        if (!g.aiFitscore) return -1;
        const m = g.aiFitscore.match(/SCORE:\s*(\d+)/);
        return m ? parseInt(m[1]) : -1;
      };
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

  // ── CSV Export ──
  const exportCSV = useCallback(() => {
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
  }, [filtered, team, stages]);

  // ── Score All: batch AI fit score for every active grant ──
  const scoreAll = useAsyncAction(async () => {
    const active = grants.filter(g => !CLOSED_STAGES.includes(g.stage));
    if (active.length === 0) return;
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
    onToast?.(`Scored ${ok} of ${active.length}${failed ? ` (${failed} failed)` : ""}`, { type: failed ? "error" : "success" });
  });
  const scoreAllGrants = scoreAll.run;
  const scoringAll = scoreAll.busy;

  // ── URL Extract: parse a grant URL into a new grant. Returns true on success
  //    so the component can clear/close its transient input. ──
  const urlExtract = useAsyncAction(async (rawUrl) => {
    const url = (rawUrl || "").trim();
    if (!url) return false;
    let r;
    try {
      r = await onRunAI("urlextract", { name: "", funder: "", type: "", ask: 0, focus: [], geo: [], rel: "Cold", notes: "", deadline: null, stage: "scouted" }, url);
    } catch (e) {
      onToast?.("Could not parse grant from URL. Try adding manually.", { type: "error" });
      return false;
    }
    if (isAIError(r)) { onToast?.(r, { type: "error" }); return false; }
    let parsed;
    try {
      parsed = JSON.parse(r);
    } catch (e) {
      onToast?.("Could not parse grant from URL. Try adding manually.", { type: "error" });
      return false;
    }
    const fBudget = parsed.ask || 0;
    const g = {
      id: uid(), name: parsed.name || "Untitled Grant", funder: parsed.funder || "",
      type: parsed.type || "Foundation", stage: "scouted",
      ask: 0, funderBudget: fBudget, askSource: null, aiRecommendedAsk: null,
      deadline: parsed.deadline || null,
      focus: parsed.focus || [], geo: [], rel: "Cold", pri: 3, hrs: 0,
      notes: parsed.notes || "", applyUrl: parsed.applyUrl || url,
      log: [{ d: td(), t: `Created from URL · funder budget R${fBudget.toLocaleString()} · ask TBD` }],
      market: parsed.type === "International" ? "global" : "sa",
      source: "website",
      on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null,
    };
    onAddGrant(g);
    return true;
  }, { isError: () => false }); // never treat the boolean return as an AI error string
  const extractFromUrl = urlExtract.run;
  const urlBusy = urlExtract.busy;

  return {
    // filter/sort state + setters
    q, debouncedQ, sf, setSf, pSort, setPSort, market, setMarket,
    activeFilters, setActiveFilters, showArchived, setShowArchived,
    handleSearchChange,
    // team lookup
    teamById, getMember,
    // derived lists + counts
    filtered, sorted, personEntries, marketCounts, archivedCount,
    ownerNames, funderSuggestions,
    // actions
    exportCSV,
    scoreAllGrants, scoringAll, scoreProgress,
    extractFromUrl, urlBusy,
  };
}
