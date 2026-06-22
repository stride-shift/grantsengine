import { useState, useMemo, useCallback } from "react";
import { effectiveAsk } from "@/utils";
import { isFunderReturning } from "@/data/funderStrategy";
import useKvState from "@/hooks/useKvState";

/**
 * Funders view-model. Owns the grant→funder grouping (primary-type inference,
 * returning-first sort), the search/type filter, the aggregate stats, and the
 * funder-owner KV store (load/assign/persist via useKvState).
 *
 * The component renders from this and keeps only transient UI state of its own
 * (card expand, owner-dropdown open/close). The search text + type filter live
 * here so the derived memos can read them; the component drives them through
 * the returned setters.
 *
 * @param grants the full grant list
 * @returns { funderData, filtered, stats, owners, assignOwner,
 *            q, setQ, filterType, setFilterType, clearFilters }
 */
export default function useFunders(grants) {
  const [filterType, setFilterType] = useState("all");
  const [q, setQ] = useState("");

  // Funder-owner KV store: { "Funder Name": "ownerId" }
  const { value: owners, setValue: setOwners } = useKvState("funder_owners", {});

  const assignOwner = useCallback((funderName, ownerId) => {
    setOwners((prev) => {
      const updated = { ...prev, [funderName]: ownerId || null };
      if (!ownerId) delete updated[funderName];
      return updated;
    });
  }, [setOwners]);

  // Group grants by funder
  const funderData = useMemo(() => {
    const map = new Map();
    for (const g of grants) {
      const key = (g.funder || "Unknown").trim();
      if (!map.has(key)) map.set(key, { funder: key, grants: [], type: g.type, returning: isFunderReturning(key) });
      map.get(key).grants.push(g);
      // Use most common type
      if (!map.get(key).typeCount) map.get(key).typeCount = {};
      const tc = map.get(key).typeCount;
      tc[g.type] = (tc[g.type] || 0) + 1;
    }
    // Determine primary type for each funder
    for (const [, v] of map) {
      if (v.typeCount) {
        v.type = Object.entries(v.typeCount).sort((a, b) => b[1] - a[1])[0]?.[0] || v.type;
      }
    }
    return [...map.values()].sort((a, b) => {
      // Sort: returning first, then by total ask descending
      if (a.returning !== b.returning) return a.returning ? -1 : 1;
      const aVal = a.grants.reduce((s, g) => s + effectiveAsk(g), 0);
      const bVal = b.grants.reduce((s, g) => s + effectiveAsk(g), 0);
      return bVal - aVal;
    });
  }, [grants]);

  // Filter
  const filtered = useMemo(() => {
    let fd = funderData;
    if (filterType !== "all") fd = fd.filter(f => f.type === filterType);
    if (q) {
      const lq = q.toLowerCase();
      fd = fd.filter(f =>
        f.funder.toLowerCase().includes(lq) ||
        f.grants.some(g => g.name?.toLowerCase().includes(lq) || g.stage?.toLowerCase().includes(lq) || g.notes?.toLowerCase().includes(lq))
      );
    }
    return fd;
  }, [funderData, filterType, q]);

  // Aggregate stats
  const stats = useMemo(() => {
    const total = funderData.length;
    const returning = funderData.filter(f => f.returning).length;
    const types = {};
    for (const f of funderData) types[f.type] = (types[f.type] || 0) + 1;
    const totalPipeline = grants.filter(g => !["won", "lost", "deferred", "archived"].includes(g.stage)).reduce((s, g) => s + effectiveAsk(g), 0);
    const won = grants.filter(g => g.stage === "won");
    const lost = grants.filter(g => g.stage === "lost");
    return { total, returning, types, totalPipeline, wonCount: won.length, lostCount: lost.length, wonVal: won.reduce((s, g) => s + effectiveAsk(g), 0) };
  }, [funderData, grants]);

  const clearFilters = useCallback(() => { setQ(""); setFilterType("all"); }, []);

  return {
    funderData, filtered, stats,
    owners, assignOwner,
    q, setQ, filterType, setFilterType, clearFilters,
  };
}
