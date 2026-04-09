import { useState, useMemo, useEffect, useCallback } from "react";
import { C, FONT, MONO } from "../theme";
import { fmtK, effectiveAsk } from "../utils";
import { Btn, TypeBadge } from "./index";
import { funderStrategy, isFunderReturning, PTYPES } from "../data/funderStrategy";
import { CAD, FTYPES, TEAM } from "../data/constants";
import { kvGet, kvSet } from "../api";

/* ── Relationship owners (from CLAUDE.md Key People) ── */
const REL_OWNERS = {
  "correlation": "alison", "pragma": "alison", "sybrin": "alison", "nedbank": "alison", "dgmt": "alison", "dg murray": "alison",
  "rmb": "barbara", "bii": "barbara", "old mutual": "barbara", "modo": "barbara", "kavod": "barbara", "kagiso": "barbara", "sab foundation": "barbara", "optima": "barbara", "mtm": "barbara",
  "gde": "david", "penreach": "david", "frf": "david", "sap": "david", "scibono": "david", "sci-bono": "david", "mict seta": "david", "idc": "david",
  "act foundation": "nolan", "act ": "nolan", "alt capital": "nolan", "sawabona": "nolan", "mastercard": "nolan", "iq": "nolan", "chartall": "nolan", "harambee": "nolan",
  "get it done": "nolan", "gidf": "nolan", "inkcubeko": "nolan", "ccba": "nolan", "coca-cola": "nolan", "telkom": "nolan", "sage": "nolan", "tk foundation": "nolan",
};

function getRelOwner(funderName) {
  const n = (funderName || "").toLowerCase();
  for (const [key, ownerId] of Object.entries(REL_OWNERS)) {
    if (n.includes(key)) return TEAM.find(t => t.id === ownerId) || null;
  }
  return null;
}

/* ── Relationship badge ── */
const RelBadge = ({ rel, returning }) => {
  const c = returning ? C.ok : rel === "Hot" ? C.primary : rel === "Warm" ? C.amber : rel === "Cold" ? C.blue : C.t4;
  const bg = returning ? C.okSoft : rel === "Hot" ? C.primarySoft : rel === "Warm" ? C.amberSoft : rel === "Cold" ? C.blueSoft : C.warm200;
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
            background: step.t === "status" ? C.blueSoft : step.t === "update" ? C.okSoft : C.amberSoft,
            color: step.t === "status" ? C.blue : step.t === "update" ? C.ok : C.amber,
            whiteSpace: "nowrap",
          }}>
            <span style={{ fontFamily: MONO, marginRight: 4 }}>D{step.d}</span>
            {step.l}
          </div>
          {i < cad.length - 1 && (
            <div style={{ width: 16, height: 1, background: C.line, flexShrink: 0 }} />
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
  const [funderOwners, setFunderOwners] = useState({}); // { "Funder Name": "ownerId" }

  // Load funder owners from KV store
  useEffect(() => {
    kvGet("funder_owners").then(data => {
      if (data && typeof data === "object") {
        setFunderOwners(data.value || data);
      }
    }).catch(() => {});
  }, []);

  const assignFunderOwner = (funderName, ownerId) => {
    const updated = { ...funderOwners, [funderName]: ownerId || null };
    if (!ownerId) delete updated[funderName];
    setFunderOwners(updated);
    kvSet("funder_owners", updated).catch(() => {});
  };

  // Close owner dropdown when clicking outside or scrolling
  const isAssignDropdownOpen = typeof expandedFunder === "string" && expandedFunder.startsWith("assign-");
  useEffect(() => {
    if (!isAssignDropdownOpen) return;
    const close = () => setExpandedFunder(null);
    window.addEventListener("scroll", close, true);
    const timer = setTimeout(() => document.addEventListener("click", close), 0);
    return () => {
      window.removeEventListener("scroll", close, true);
      clearTimeout(timer);
      document.removeEventListener("click", close);
    };
  }, [isAssignDropdownOpen]);

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

  const FTYPE_COLORS = { "Corporate CSI": C.primary, "Government/SETA": C.blue, "International": C.purple, "Foundation": C.amber, "Tech Company": C.teal, "Partnership": C.purple };

  return (
    <div style={{ padding: "16px 16px", height: "100%", overflow: "auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.dark, letterSpacing: -0.5 }}>Funders</div>
          <div style={{ width: 32, height: 4, background: C.purple, borderRadius: 2, marginTop: 4 }} />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search funders..."
            style={{ padding: "6px 12px", fontSize: 13, border: `1px solid ${C.line}`, borderRadius: 8, width: 180, fontFamily: FONT }} />
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            style={{ padding: "6px 10px", fontSize: 12, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: FONT, background: C.white }}>
            <option value="all">All types</option>
            {FTYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Summary stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total Funders", value: stats.total, color: C.dark },
          { label: "Returning", value: stats.returning, color: C.ok },
          { label: "Active Pipeline", value: fmtK(stats.totalPipeline), color: C.primary },
          { label: "Won", value: `${stats.wonCount} (${fmtK(stats.wonVal)})`, color: C.ok },
          { label: "Win Rate", value: stats.wonCount + stats.lostCount > 0 ? Math.round(stats.wonCount / (stats.wonCount + stats.lostCount) * 100) + "%" : "--", color: C.blue },
        ].map((s, i) => (
          <div key={i} style={{
            flex: 1, padding: "12px 14px", background: C.white, borderRadius: 10,
            boxShadow: C.cardShadow, border: `1px solid ${C.line}`,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.t4, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color, fontFamily: MONO, letterSpacing: -1 }}>{s.value}</div>
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
              border: `1px solid ${(FTYPE_COLORS[type] || C.t4)}30`,
              cursor: "pointer", fontFamily: FONT, transition: "all 0.15s",
            }}>
            {type} ({count})
          </button>
        ))}
      </div>

      {/* Funder cards grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, overflow: "visible" }}>
        {filtered.map(fd => {
          const isExpanded = expandedFunder === fd.funder;
          const totalAsk = fd.grants.reduce((s, g) => s + effectiveAsk(g), 0);
          const won = fd.grants.filter(g => g.stage === "won");
          const lost = fd.grants.filter(g => g.stage === "lost");
          const active = fd.grants.filter(g => !["won", "lost", "deferred", "archived"].includes(g.stage));
          const bestRel = fd.grants.reduce((best, g) => {
            const relOrder = { "Hot": 3, "Warm": 2, "Cold": 1, "New": 0 };
            return (relOrder[g.rel] || 0) > (relOrder[best] || 0) ? g.rel : best;
          }, "New");
          // Use first active grant for strategy preview
          const stratGrant = active[0] || fd.grants[0];

          // Relationship owner: user-assigned takes priority, then hardcoded defaults
          const assignedOwnerId = funderOwners[fd.funder];
          const relOwner = assignedOwnerId
            ? TEAM.find(t => t.id === assignedOwnerId) || null
            : getRelOwner(fd.funder);

          // Last interaction: most recent log entry or submission date across all grants
          const lastDates = fd.grants.flatMap(g => [
            g.subDate,
            ...(g.log || []).map(l => l.d),
          ]).filter(Boolean).sort().reverse();
          const lastInteraction = lastDates[0] || null;
          const daysSinceLast = lastInteraction ? Math.floor((Date.now() - new Date(lastInteraction).getTime()) / 86400000) : null;

          // Next action: nearest deadline or follow-up in active grants
          const now = new Date();
          const upcoming = active.flatMap(g => {
            const items = [];
            if (g.deadline) {
              const dl = new Date(g.deadline);
              if (dl > now) items.push({ date: g.deadline, label: "Deadline", grant: g.name });
            }
            if (Array.isArray(g.fups)) {
              for (const fup of g.fups) {
                if (!fup.done && fup.date && new Date(fup.date) > now) {
                  items.push({ date: fup.date, label: fup.label || "Follow-up", grant: g.name });
                }
              }
            }
            return items;
          }).sort((a, b) => a.date.localeCompare(b.date));
          const nextAction = upcoming[0] || null;
          const nextDaysLeft = nextAction ? Math.ceil((new Date(nextAction.date) - now) / 86400000) : null;

          // Win/loss record
          const winRate = won.length + lost.length > 0 ? Math.round(won.length / (won.length + lost.length) * 100) : null;

          // AI research summary (from most recent grant with research)
          const researchGrant = fd.grants.find(g => g.aiResearchStructured || g.aiResearch);
          const researchSnippet = researchGrant?.aiResearchStructured?.strategy || researchGrant?.aiResearchStructured?.rawText?.slice(0, 150) || null;

          return (
            <div key={fd.funder} style={{
              background: C.white, borderRadius: 10, boxShadow: C.cardShadow,
              border: `1px solid ${C.line}`, overflow: "hidden",
              transition: "box-shadow 0.15s", position: "relative",
            }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = C.cardShadowHover}
              onMouseLeave={e => e.currentTarget.style.boxShadow = C.cardShadow}>
              {/* Funder header */}
              <div onClick={() => setExpandedFunder(isExpanded ? null : fd.funder)}
                style={{
                  padding: "12px 14px", cursor: "pointer",
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
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{fd.funder}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
                        <TypeBadge type={fd.type} />
                        <RelBadge rel={bestRel} returning={fd.returning} />
                        <span style={{ position: "relative", display: "inline-block" }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); setExpandedFunder(expandedFunder === `assign-${fd.funder}` ? null : `assign-${fd.funder}`); }}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 600,
                              color: relOwner ? C.t3 : C.t4, background: relOwner ? C.raised : "transparent",
                              padding: "2px 7px", borderRadius: 100, border: relOwner ? "none" : `1px dashed ${C.t4}`,
                              cursor: "pointer", fontFamily: FONT,
                            }}
                            title="Assign relationship owner"
                          >
                            {relOwner ? (
                              <>
                                <span style={{ width: 12, height: 12, borderRadius: "50%", background: relOwner.c, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700, color: "#fff" }}>{relOwner.ini}</span>
                                {relOwner.name}
                              </>
                            ) : "+ Owner"}
                          </button>
                          {expandedFunder === `assign-${fd.funder}` && (
                            <div style={{
                              position: "fixed", zIndex: 100, marginTop: 4,
                              background: C.white, borderRadius: 8, padding: 6,
                              border: `1px solid ${C.line}`, boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                              width: 180,
                            }} ref={el => {
                              if (el) {
                                const btn = el.parentElement?.querySelector("button");
                                if (btn) {
                                  const r = btn.getBoundingClientRect();
                                  el.style.top = `${r.bottom + 4}px`;
                                  el.style.left = `${r.left}px`;
                                }
                              }
                            }} onClick={e => e.stopPropagation()}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: C.t4, padding: "2px 6px", marginBottom: 4 }}>Assign owner</div>
                              {TEAM.filter(t => t.id !== "team").map(t => (
                                <button key={t.id} onClick={() => { assignFunderOwner(fd.funder, t.id); setExpandedFunder(null); }}
                                  style={{
                                    display: "flex", alignItems: "center", gap: 6, width: "100%",
                                    padding: "5px 6px", fontSize: 11, fontFamily: FONT,
                                    background: (assignedOwnerId || relOwner?.id) === t.id ? C.primarySoft : "none",
                                    border: "none", cursor: "pointer", borderRadius: 4, textAlign: "left",
                                    color: C.t1,
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = C.hover}
                                  onMouseLeave={e => e.currentTarget.style.background = (assignedOwnerId || relOwner?.id) === t.id ? C.primarySoft : "transparent"}
                                >
                                  <span style={{ width: 16, height: 16, borderRadius: "50%", background: t.c, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: "#fff" }}>{t.ini}</span>
                                  {t.name}
                                  {t.title && <span style={{ fontSize: 9, color: C.t4, marginLeft: "auto" }}>{t.title.split(" ")[0]}</span>}
                                </button>
                              ))}
                              {(assignedOwnerId || relOwner) && (
                                <button onClick={() => { assignFunderOwner(fd.funder, null); setExpandedFunder(null); }}
                                  style={{
                                    display: "block", width: "100%", padding: "5px 6px", fontSize: 10,
                                    fontFamily: FONT, background: "none", border: "none", cursor: "pointer",
                                    color: C.red, textAlign: "left", borderRadius: 4, marginTop: 2,
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = C.redSoft}
                                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                                >Remove owner</button>
                              )}
                            </div>
                          )}
                        </span>
                        {winRate !== null && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: winRate >= 50 ? C.ok : C.amber, background: (winRate >= 50 ? C.ok : C.amber) + "12", padding: "2px 7px", borderRadius: 100 }}>
                            {won.length}W/{lost.length}L ({winRate}%)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, fontFamily: MONO, color: C.dark, letterSpacing: -0.5 }}>{fmtK(totalAsk)}</div>
                    <div style={{ fontSize: 10, color: C.t4, marginTop: 2 }}>
                      {fd.grants.length} grant{fd.grants.length !== 1 ? "s" : ""}{won.length > 0 && <span style={{ color: C.ok, fontWeight: 600 }}> {"\u2022"} {won.length}W</span>}{lost.length > 0 && <span style={{ color: C.red, fontWeight: 600 }}> {"\u2022"} {lost.length}L</span>}
                    </div>
                    {lastInteraction && (
                      <div style={{ fontSize: 9, color: daysSinceLast > 60 ? C.red : daysSinceLast > 30 ? C.amber : C.t4, marginTop: 2 }}>
                        Last: {daysSinceLast === 0 ? "today" : daysSinceLast === 1 ? "yesterday" : `${daysSinceLast}d ago`}
                      </div>
                    )}
                    {nextAction && (
                      <div style={{ fontSize: 9, color: nextDaysLeft <= 7 ? C.red : C.primary, marginTop: 1, fontWeight: 600 }}>
                        Next: {nextAction.label} in {nextDaysLeft}d
                      </div>
                    )}
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
                          {g.name.slice(0, 30)}{g.name.length > 30 ? "..." : ""} {"\u2022"} {stg?.label || g.stage}
                        </span>
                      );
                    })}
                    {active.length > 3 && <span style={{ fontSize: 10, color: C.t4, padding: "2px 4px" }}>+{active.length - 3} more</span>}
                  </div>
                )}
              </div>

              {/* Expanded: strategy + cadence + grants */}
              {isExpanded && (
                <div style={{ padding: "0 14px 12px", borderTop: `1px solid ${C.line}` }}>
                  {/* Strategy panel */}
                  {stratGrant && <StrategyPanel grant={stratGrant} />}

                  {/* Funder intelligence summary */}
                  {researchSnippet && (
                    <div style={{
                      marginTop: 10, padding: "10px 14px", background: C.blueSoft || C.primarySoft,
                      borderRadius: 8, border: `1px solid ${C.blue}15`,
                    }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: C.blue, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 }}>AI Research Summary</div>
                      <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.5 }}>{researchSnippet.slice(0, 200)}{researchSnippet.length > 200 ? "..." : ""}</div>
                    </div>
                  )}

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
