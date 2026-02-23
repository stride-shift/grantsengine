import { useState, useMemo } from "react";
import { C, FONT, MONO } from "../theme";
import { fmtK, effectiveAsk } from "../utils";
import { Btn, TypeBadge } from "./index";
import { funderStrategy, isFunderReturning, PTYPES } from "../data/funderStrategy";
import { CAD, FTYPES } from "../data/constants";

/* ── Relationship badge ── */
const RelBadge = ({ rel, returning }) => {
  const c = returning ? "#059669" : rel === "Hot" ? C.primary : rel === "Warm" ? C.amber : rel === "Cold" ? C.blue : C.t4;
  const bg = returning ? "#ECFDF5" : rel === "Hot" ? C.primarySoft : rel === "Warm" ? C.amberSoft : rel === "Cold" ? C.blueSoft : C.warm200;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 100,
      color: c, background: bg, letterSpacing: 0.3,
    }}>{returning ? "Returning" : rel || "New"}</span>
  );
};

/* ── Cadence timeline ── */
const CadenceTimeline = ({ type }) => {
  const cad = CAD[type];
  if (!cad || cad.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, marginTop: 8 }}>
      {cad.map((step, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center" }}>
          <div style={{
            padding: "4px 10px", borderRadius: 8, fontSize: 10, fontWeight: 600,
            background: step.t === "status" ? C.blueSoft : step.t === "update" ? "#ECFDF5" : C.amberSoft,
            color: step.t === "status" ? C.blue : step.t === "update" ? "#059669" : C.amber,
            whiteSpace: "nowrap",
          }}>
            <span style={{ fontFamily: MONO, marginRight: 4 }}>D{step.d}</span>
            {step.l}
          </div>
          {i < cad.length - 1 && (
            <div style={{ width: 16, height: 1.5, background: C.line, flexShrink: 0 }} />
          )}
        </div>
      ))}
    </div>
  );
};

/* ── Strategy Panel ── */
const StrategyPanel = ({ grant }) => {
  const fs = funderStrategy(grant);
  if (!fs) return null;
  return (
    <div style={{
      padding: "14px 16px", background: C.warm100, borderRadius: 10,
      border: `1px solid ${C.line}`, marginTop: 10,
    }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.t4, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 }}>Lead Angle</div>
          <div style={{ fontSize: 12, color: C.t1, lineHeight: 1.4 }}>{fs.lead}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.t4, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 }}>Hook</div>
          <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.4 }}>{(fs.hook || "").slice(0, 120)}...</div>
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.t4, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 }}>Language</div>
          <div style={{ fontSize: 11, color: C.t2 }}>{fs.lang}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.t4, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 }}>Structure</div>
          <div style={{ fontSize: 11, color: C.t2 }}>{(fs.structure || []).slice(0, 4).join(" / ")}</div>
        </div>
      </div>
    </div>
  );
};

export default function Funders({ grants, team, stages, onSelectGrant, onNavigate }) {
  const [expandedFunder, setExpandedFunder] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [q, setQ] = useState("");

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
      fd = fd.filter(f => f.funder.toLowerCase().includes(lq));
    }
    return fd;
  }, [funderData, filterType, q]);

  // Aggregate stats
  const stats = useMemo(() => {
    const total = funderData.length;
    const returning = funderData.filter(f => f.returning).length;
    const types = {};
    for (const f of funderData) types[f.type] = (types[f.type] || 0) + 1;
    const totalPipeline = grants.filter(g => !["won", "lost", "deferred"].includes(g.stage)).reduce((s, g) => s + effectiveAsk(g), 0);
    const won = grants.filter(g => g.stage === "won");
    const lost = grants.filter(g => g.stage === "lost");
    return { total, returning, types, totalPipeline, wonCount: won.length, lostCount: lost.length, wonVal: won.reduce((s, g) => s + effectiveAsk(g), 0) };
  }, [funderData, grants]);

  const FTYPE_COLORS = { "Corporate CSI": C.primary, "Government/SETA": C.blue, "International": C.purple, "Foundation": C.amber, "Tech Company": "#0891B2" };

  return (
    <div style={{ padding: "28px 32px", height: "100%", overflow: "auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.dark, letterSpacing: -0.5 }}>Funders</div>
          <div style={{ width: 32, height: 4, background: C.purple, borderRadius: 2, marginTop: 4 }} />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search funders..."
            style={{ padding: "6px 12px", fontSize: 13, border: `1.5px solid ${C.line}`, borderRadius: 10, width: 180, fontFamily: FONT }} />
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            style={{ padding: "6px 10px", fontSize: 12, border: `1.5px solid ${C.line}`, borderRadius: 10, fontFamily: FONT, background: C.white }}>
            <option value="all">All types</option>
            {FTYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total Funders", value: stats.total, color: C.dark },
          { label: "Returning", value: stats.returning, color: "#059669" },
          { label: "Active Pipeline", value: fmtK(stats.totalPipeline), color: C.primary },
          { label: "Won", value: `${stats.wonCount} (${fmtK(stats.wonVal)})`, color: "#059669" },
          { label: "Win Rate", value: stats.wonCount + stats.lostCount > 0 ? Math.round(stats.wonCount / (stats.wonCount + stats.lostCount) * 100) + "%" : "--", color: C.blue },
        ].map((s, i) => (
          <div key={i} style={{
            flex: 1, padding: "14px 16px", background: C.white, borderRadius: 12,
            boxShadow: C.cardShadow, border: `1px solid ${C.line}`,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.t4, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: MONO, letterSpacing: -1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Type distribution */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {Object.entries(stats.types).map(([type, count]) => (
          <button key={type} onClick={() => setFilterType(filterType === type ? "all" : type)}
            style={{
              padding: "5px 12px", borderRadius: 100, fontSize: 11, fontWeight: 600,
              background: filterType === type ? (FTYPE_COLORS[type] || C.t4) : (FTYPE_COLORS[type] || C.t4) + "12",
              color: filterType === type ? "#fff" : FTYPE_COLORS[type] || C.t4,
              border: `1.5px solid ${(FTYPE_COLORS[type] || C.t4)}30`,
              cursor: "pointer", fontFamily: FONT, transition: "all 0.15s",
            }}>
            {type} ({count})
          </button>
        ))}
      </div>

      {/* Funder cards grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {filtered.map(fd => {
          const isExpanded = expandedFunder === fd.funder;
          const totalAsk = fd.grants.reduce((s, g) => s + effectiveAsk(g), 0);
          const won = fd.grants.filter(g => g.stage === "won");
          const lost = fd.grants.filter(g => g.stage === "lost");
          const active = fd.grants.filter(g => !["won", "lost", "deferred"].includes(g.stage));
          const bestRel = fd.grants.reduce((best, g) => {
            const relOrder = { "Hot": 3, "Warm": 2, "Cold": 1, "New": 0 };
            return (relOrder[g.rel] || 0) > (relOrder[best] || 0) ? g.rel : best;
          }, "New");
          // Use first active grant for strategy preview
          const stratGrant = active[0] || fd.grants[0];

          return (
            <div key={fd.funder} style={{
              background: C.white, borderRadius: 14, boxShadow: C.cardShadow,
              border: `1px solid ${C.line}`, overflow: "hidden",
              transition: "box-shadow 0.15s",
            }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = C.cardShadowHover}
              onMouseLeave={e => e.currentTarget.style.boxShadow = C.cardShadow}>
              {/* Funder header */}
              <div onClick={() => setExpandedFunder(isExpanded ? null : fd.funder)}
                style={{
                  padding: "16px 18px", cursor: "pointer",
                  borderLeft: `4px solid ${FTYPE_COLORS[fd.type] || C.t4}`,
                }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: (FTYPE_COLORS[fd.type] || C.t4) + "15",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 13, fontWeight: 800, color: FTYPE_COLORS[fd.type] || C.t4, fontFamily: MONO,
                      flexShrink: 0,
                    }}>{fd.funder[0]?.toUpperCase()}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fd.funder}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                        <TypeBadge type={fd.type} />
                        <RelBadge rel={bestRel} returning={fd.returning} />
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, fontFamily: MONO, color: C.dark, letterSpacing: -0.5 }}>{fmtK(totalAsk)}</div>
                    <div style={{ fontSize: 10, color: C.t4, marginTop: 2 }}>
                      {fd.grants.length} grant{fd.grants.length !== 1 ? "s" : ""}{won.length > 0 && <span style={{ color: "#059669", fontWeight: 600 }}> {"\u2022"} {won.length}W</span>}{lost.length > 0 && <span style={{ color: C.red, fontWeight: 600 }}> {"\u2022"} {lost.length}L</span>}
                    </div>
                  </div>
                </div>

                {/* Active grants mini-list */}
                {active.length > 0 && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {active.slice(0, 3).map(g => {
                      const stg = stages?.find(s => s.id === g.stage);
                      return (
                        <span key={g.id} style={{
                          fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                          background: (stg?.bg || C.bg) + "80", color: stg?.c || C.t3,
                          border: `1px solid ${(stg?.c || C.t4)}20`,
                        }}>
                          {g.name.slice(0, 20)}{g.name.length > 20 ? "..." : ""} {"\u2022"} {stg?.label || g.stage}
                        </span>
                      );
                    })}
                    {active.length > 3 && <span style={{ fontSize: 10, color: C.t4, padding: "2px 4px" }}>+{active.length - 3} more</span>}
                  </div>
                )}
              </div>

              {/* Expanded: strategy + cadence + grants */}
              {isExpanded && (
                <div style={{ padding: "0 18px 16px", borderTop: `1px solid ${C.line}` }}>
                  {/* Strategy panel */}
                  {stratGrant && <StrategyPanel grant={stratGrant} />}

                  {/* Follow-up cadence */}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: C.t4, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>Follow-up Cadence</div>
                    <CadenceTimeline type={fd.type} />
                  </div>

                  {/* All grants list */}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: C.t4, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>All Grants</div>
                    {fd.grants.map(g => {
                      const stg = stages?.find(s => s.id === g.stage);
                      return (
                        <div key={g.id} onClick={() => onSelectGrant(g.id)}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={e => e.currentTarget.style.background = C.hover}
                          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: stg?.c || C.t4 }} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: C.dark }}>{g.name}</span>
                            <span style={{ fontSize: 10, color: stg?.c || C.t3, fontWeight: 600 }}>{stg?.label || g.stage}</span>
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 600, fontFamily: MONO, color: g.ask > 0 ? C.t2 : C.t4 }}>
                            {g.ask > 0 ? fmtK(g.ask) : g.funderBudget ? `~${fmtK(g.funderBudget)}` : "TBD"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: C.t3 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.t2, marginBottom: 4 }}>No funders found</div>
          <div style={{ fontSize: 13, color: C.t4 }}>
            {q ? `No results for "${q}"` : `No ${filterType} funders`}
            {" "}
            <button onClick={() => { setQ(""); setFilterType("all"); }} style={{ color: C.primary, background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: FONT, fontSize: 13 }}>Clear filters</button>
          </div>
        </div>
      )}
    </div>
  );
}
