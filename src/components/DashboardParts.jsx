import { useState } from "react";
import { C, MONO, FONT } from "../theme";
import { dL, fmtK, effectiveAsk } from "../utils";
import { Btn, CopyBtn, stripMd, TypeBadge } from "./index";

/* Presentational primitives lifted verbatim from Dashboard.jsx (Phase 4.5, move-only).
   These close over no Dashboard state — pure render helpers — so the lift is behaviour-
   preserving; the Dashboard render-net snapshot proves the DOM is unchanged.

   FunderIntelCards (Phase 4.6) is a larger lift: a self-contained section body whose two
   pieces of UI state (expandedFunder / showFullIntel) were used ONLY inside this block, so
   they move with it. Defined at module scope (stable identity → no remount → state survives
   exactly as before); it takes funders / stages / onSelectGrant as props. The render-net
   snapshot guards the DOM; the Funder Intelligence interaction tests guard the handlers. */

/* Relationship status → accent colour. Single source of truth shared by Dashboard (Row C)
   and FunderIntelCards below. */
export const REL_COLORS = { Hot: C.primary, Warm: C.amber, Cold: C.blue, New: C.purple };

/* ═══ Micro chart components — zero dependencies ═══ */

export const Bar = ({ pct, color, h = 6 }) => (
  <div style={{ flex: 1, height: h, background: C.raised, borderRadius: h / 2, overflow: "hidden" }}>
    <div style={{ width: `${Math.max(pct > 0 ? 3 : 0, pct)}%`, height: "100%", borderRadius: h / 2, background: color, transition: "width 0.5s ease" }} />
  </div>
);

export const Spark = ({ data, color = C.primary, w = 80, h = 28 }) => {
  if (!data || data.length < 2) return null;
  const mn = Math.min(...data), mx = Math.max(...data), range = mx - mn || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - mn) / range) * (h - 4) - 2}`).join(" ");
  return <svg width={w} height={h} style={{ display: "block" }}><polyline points={pts} fill="none" stroke={color} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" /></svg>;
};

/* Section divider with optional right-side element */
export const Hd = ({ children, right, mb = 20 }) => (
  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: mb, marginTop: 24 }}>
    <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, letterSpacing: 1.4, textTransform: "uppercase" }}>{children}</div>
    {right}
  </div>
);

/* Section accent colors — alternating green / blue */
const SECTION_THEMES = {
  "Pipeline":              { accent: "#10B981", bg: "#ECFDF5", border: "#10B98130", icon: "◈" },
  "In Play":               { accent: "#0EA5E9", bg: "#F0F9FF", border: "#0EA5E930", icon: "▶" },
  "Timeline":              { accent: "#059669", bg: "#ECFDF5", border: "#05966930", icon: "◷" },
  "Upcoming Follow-ups":   { accent: "#0284C7", bg: "#F0F9FF", border: "#0284C730", icon: "◉" },
  "AI Tools":              { accent: "#14B8A6", bg: "#F0FDFA", border: "#14B8A630", icon: "✦" },
  "Pipeline Intelligence": { accent: "#3B82F6", bg: "#EFF6FF", border: "#3B82F630", icon: "◆" },
};
const DEFAULT_THEME = { accent: "#10B981", bg: "#F9FAFB", border: "#E5E7EB", icon: "▸" };

/* Collapsible section — click header to toggle */
export const Section = ({ title, right, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const theme = SECTION_THEMES[title] || DEFAULT_THEME;
  return (
    <div style={{ marginTop: 16 }}>
      <div onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", marginBottom: open ? 16 : 0, userSelect: "none",
          padding: "10px 14px", borderRadius: 10,
          background: open ? theme.bg : C.white,
          border: `1px solid ${open ? theme.border : C.line}`,
          transition: "all 0.2s ease",
        }}
        onMouseEnter={e => { if (!open) { e.currentTarget.style.background = theme.bg; e.currentTarget.style.borderColor = theme.border; } }}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.background = C.white; e.currentTarget.style.borderColor = C.line; } }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 24, height: 24, borderRadius: 6,
            background: `${theme.accent}15`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, color: theme.accent, flexShrink: 0,
          }}>{theme.icon}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: open ? theme.accent : C.t2, letterSpacing: 0.5, textTransform: "uppercase", transition: "color 0.2s" }}>{title}</div>
          <span style={{
            fontSize: 9, color: theme.accent, fontWeight: 600,
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.2s", display: "inline-block",
          }}>{"▶"}</span>
        </div>
        <div onClick={e => e.stopPropagation()}>{right}</div>
      </div>
      {open && children}
    </div>
  );
};

/* Card with optional accent stripe */
export const Card = ({ children, accent, pad = "14px 16px", style: sx, className }) => (
  <div className={className} style={{
    padding: pad, background: C.white, borderRadius: 10,
    boxShadow: C.cardShadow,
    borderTop: accent ? `3px solid ${accent}` : undefined,
    border: accent ? undefined : `1px solid ${C.line}`,
    ...sx,
  }}>
    {children}
  </div>
);

/* Stat cell — big number with label and optional micro detail */
export const Stat = ({ label, value, sub, color = C.dark, small }) => (
  <div style={{ minWidth: small ? 80 : 110 }}>
    <div style={{ fontSize: 10, fontWeight: 600, color: C.t4, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: small ? 20 : 22, fontWeight: 800, color, fontFamily: MONO, letterSpacing: -1.5, lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: C.t3, marginTop: 6, fontWeight: 500 }}>{sub}</div>}
  </div>
);

/* Horizontal bar row — compact */
export const HRow = ({ label, value, max, color, suffix = "", w = 90 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26 }}>
    <div style={{ width: w, fontSize: 11, fontWeight: 600, color: C.t2, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
    <Bar pct={(value / (max || 1)) * 100} color={color} />
    <div style={{ width: 36, fontSize: 11, fontWeight: 700, color: C.t1, fontFamily: MONO, textAlign: "right" }}>{value}{suffix}</div>
  </div>
);

/* AI output block — shared for all AI sections */
export const AIBlock = ({ label, sub, busy, result, onRun, btnLabel, busyLabel, accentColor }) => (
  <Card accent={accentColor} style={{ flex: 1, minWidth: 340, display: "flex", flexDirection: "column" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: result ? 14 : 0 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>{label}</div>
        <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>{sub}</div>
      </div>
      <Btn
        v={result ? "ghost" : "primary"}
        onClick={onRun} disabled={busy}
        style={{
          fontSize: 12, padding: "6px 14px",
          ...(accentColor && !result ? { background: accentColor, borderColor: accentColor } : {}),
        }}
      >{busy ? busyLabel : result ? "↻ Refresh" : btnLabel || "Generate"}</Btn>
    </div>
    {busy && (
      <div style={{ height: 3, borderRadius: 2, overflow: "hidden", margin: "12px 0 0" }}>
        <div style={{ height: "100%", background: accentColor || C.primary, animation: "ai-load-bar 2s ease-in-out infinite", borderRadius: 2 }} />
      </div>
    )}
    {result && (
      <div style={{
        padding: "14px 16px", background: C.warm100, borderRadius: 10,
        fontSize: 13, lineHeight: 1.85, color: C.t1,
        whiteSpace: "pre-wrap", maxHeight: 420, overflow: "auto",
        position: "relative", marginTop: 2,
      }}>
        {stripMd(result)}
        <CopyBtn text={result} style={{ position: "absolute", top: 8, right: 8 }} />
      </div>
    )}
  </Card>
);

/* Funder Intelligence cards — collapsed-by-default grid of per-funder summary cards, each
   expandable into a detail panel. Owns its own expand/show-all UI state (local to this block
   in the original Dashboard body). Renders nothing when there are no aggregated funders. */
export function FunderIntelCards({ funders, stages, onSelectGrant }) {
  const [expandedFunder, setExpandedFunder] = useState(null);
  const [showFullIntel, setShowFullIntel] = useState(false);

  if (funders.length === 0) return null;

  return (
    <>
      <Hd right={
        <button onClick={() => setShowFullIntel(!showFullIntel)} style={{
          background: "none", border: "none", fontSize: 11, color: C.primary, fontWeight: 600,
          cursor: "pointer", fontFamily: FONT,
        }}>{showFullIntel ? "Collapse" : `Show all ${funders.length} funders`}</button>
      }>
        Funder Intelligence
      </Hd>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 10, marginBottom: 16 }}>
        {(showFullIntel ? funders : funders.slice(0, 4)).map(f => {
          const isExpanded = expandedFunder === f.name;
          const closed = f.won + f.lost;
          const wr = closed > 0 ? Math.round((f.won / closed) * 100) : null;
          const relArr = [...f.rels];
          const bestRel = relArr.includes("Previous Funder") ? "Previous Funder" : relArr.includes("Warm Intro") ? "Warm Intro" : relArr[0] || "Unknown";
          const dlDays = f.nextDeadline ? dL(f.nextDeadline) : null;
          // Momentum: days since last activity
          const daysSinceActivity = f.latestActivity
            ? Math.floor((Date.now() - new Date(f.latestActivity).getTime()) / 864e5)
            : null;
          const momentum = daysSinceActivity === null ? "new"
            : daysSinceActivity <= 7 ? "hot"
            : daysSinceActivity <= 21 ? "warm"
            : "cold";
          const momentumColor = { hot: C.ok, warm: C.amber, cold: C.t4, new: C.purple }[momentum];
          const maxAsk = funders[0]?.totalAsk || 1;

          return (
            <div key={f.name} onClick={() => setExpandedFunder(isExpanded ? null : f.name)}
              className="ge-hover-lift"
              style={{
                background: C.white, borderRadius: 10,
                boxShadow: isExpanded ? C.cardShadowHover : C.cardShadow,
                border: isExpanded ? `1px solid ${C.primary}30` : `1px solid ${C.line}`,
                cursor: "pointer", transition: "all 0.2s ease",
                overflow: "hidden",
              }}>
              {/* ── Card Header ── */}
              <div style={{ padding: "12px 16px 10px" }}>
                {/* Row 1: Name + badges */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  {/* Momentum dot */}
                  <div style={{
                    width: 8, height: 8, borderRadius: 4, background: momentumColor, flexShrink: 0,
                    boxShadow: momentum === "hot" ? `0 0 6px ${C.ok}60` : "none",
                  }} />
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {f.name}
                  </div>
                  {f.returning && (
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 6, background: C.okSoft, color: C.ok, letterSpacing: 0.3 }}>
                      RETURNING
                    </span>
                  )}
                  {f.type && <TypeBadge type={f.type} />}
                </div>

                {/* Row 2: Value bar + numbers */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <Bar pct={(f.totalAsk / maxAsk) * 100} color={f.won > 0 ? C.ok : C.primary} h={5} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 800, fontFamily: MONO, color: C.dark, letterSpacing: -0.5, whiteSpace: "nowrap" }}>
                    {fmtK(f.totalAsk)}
                  </div>
                </div>

                {/* Row 3: Stats row */}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: C.t3, fontWeight: 600 }}>
                    {f.grants.length} grant{f.grants.length !== 1 ? "s" : ""}
                  </span>
                  {f.active > 0 && (
                    <span style={{ fontSize: 10, color: C.primary, fontWeight: 700, fontFamily: MONO }}>
                      {f.active} active
                    </span>
                  )}
                  {wr !== null && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, fontFamily: MONO,
                      padding: "1px 5px", borderRadius: 4,
                      background: wr >= 50 ? C.okSoft : C.raised,
                      color: wr >= 50 ? C.ok : C.t3,
                    }}>{wr}% win</span>
                  )}
                  {f.won > 0 && (
                    <span style={{ fontSize: 10, color: C.ok, fontWeight: 600 }}>
                      {f.won}W{f.wonVal > 0 ? ` (${fmtK(f.wonVal)})` : ""}
                    </span>
                  )}
                  {f.lost > 0 && (
                    <span style={{ fontSize: 10, color: C.red, fontWeight: 600 }}>{f.lost}L</span>
                  )}
                  {/* AI coverage dots */}
                  <span style={{ display: "flex", gap: 3, alignItems: "center" }}>
                    {[
                      { has: f.hasResearch, label: "R", color: C.blue },
                      { has: f.hasDraft, label: "D", color: C.purple },
                      { has: f.hasFitscore, label: "F", color: C.amber },
                    ].map((dot, i) => (
                      <span key={i} title={`${["Research", "Draft", "Fit Score"][i]}: ${dot.has ? "Done" : "Pending"}`}
                        style={{
                          width: 14, height: 14, borderRadius: 3, fontSize: 8, fontWeight: 700,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          background: dot.has ? dot.color + "18" : C.raised,
                          color: dot.has ? dot.color : C.t4,
                          border: `1px solid ${dot.has ? dot.color + "30" : "transparent"}`,
                        }}>{dot.label}</span>
                    ))}
                  </span>
                  {dlDays !== null && (
                    <span style={{
                      fontSize: 10, fontWeight: 600, fontFamily: MONO,
                      color: dlDays <= 14 ? C.red : dlDays <= 30 ? C.amber : C.t3,
                    }}>
                      {dlDays}d to deadline
                    </span>
                  )}
                </div>

                {/* Row 4: Stage pipeline mini-viz */}
                <div style={{ display: "flex", gap: 2, marginTop: 10 }}>
                  {(stages || []).filter(s => f.stages.has(s.id)).map(s => {
                    const n = f.stages.get(s.id) || 0;
                    return (
                      <div key={s.id} title={`${s.label}: ${n}`}
                        style={{
                          flex: n, height: 4, borderRadius: 2,
                          background: s.c, opacity: 0.7,
                          minWidth: 6,
                        }} />
                    );
                  })}
                </div>
              </div>

              {/* ── Expanded Detail Panel ── */}
              {isExpanded && (
                <div style={{
                  borderTop: `1px solid ${C.line}`, padding: "10px 16px 14px",
                  background: C.warm100,
                  animation: "ai-expand 0.25s ease-out",
                }}>
                  {/* Relationship + Focus */}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6,
                      background: REL_COLORS[bestRel] ? REL_COLORS[bestRel] + "18" : C.raised,
                      color: REL_COLORS[bestRel] || C.t3,
                      border: `1px solid ${(REL_COLORS[bestRel] || C.t4) + "25"}`,
                    }}>{bestRel}</span>
                    {[...f.focus].slice(0, 4).map(tag => (
                      <span key={tag} style={{ fontSize: 10, fontWeight: 500, padding: "3px 8px", borderRadius: 6, background: C.raised, color: C.t2 }}>
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Research snippet */}
                  {f.latestResearchSnippet && (
                    <div style={{
                      fontSize: 11, lineHeight: 1.7, color: C.t2, marginBottom: 12,
                      padding: "10px 12px", background: C.white, borderRadius: 8,
                      border: `1px solid ${C.line}`,
                      maxHeight: 100, overflow: "auto",
                    }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: C.blue, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>Latest Research</div>
                      {stripMd(f.latestResearchSnippet)}...
                    </div>
                  )}

                  {/* Grant list */}
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.t4, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>
                    Grants ({f.grants.length})
                  </div>
                  {f.grants.map(g => {
                    const s = (stages || []).find(st => st.id === g.stage);
                    return (
                      <div key={g.id}
                        onClick={e => { e.stopPropagation(); onSelectGrant?.(g.id); }}
                        className="ge-hover-slide"
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "7px 10px", marginBottom: 2, borderRadius: 6,
                          cursor: "pointer", transition: "all 0.15s ease",
                        }}>
                        <div style={{ width: 6, height: 6, borderRadius: 3, background: s?.c || C.t4, flexShrink: 0 }} />
                        <div style={{ flex: 1, fontSize: 11, fontWeight: 600, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {g.name}
                        </div>
                        <span style={{ fontSize: 10, color: s?.c || C.t3, fontWeight: 600, flexShrink: 0 }}>
                          {s?.label || g.stage}
                        </span>
                        <span style={{ fontSize: 10, fontWeight: 700, fontFamily: MONO, color: C.t2, flexShrink: 0 }}>
                          {fmtK(effectiveAsk(g))}
                        </span>
                      </div>
                    );
                  })}

                  {/* Action hint */}
                  {!f.hasResearch && f.active > 0 && (
                    <div style={{
                      marginTop: 8, padding: "8px 10px", borderRadius: 6,
                      background: C.blueSoft, border: `1px solid ${C.blue}20`,
                      fontSize: 11, color: C.blue, fontWeight: 500,
                    }}>
                      No funder research yet — run Research on any grant to build this profile
                    </div>
                  )}
                  {f.returning && f.active === 0 && (
                    <div style={{
                      marginTop: 8, padding: "8px 10px", borderRadius: 6,
                      background: C.amberSoft, border: `1px solid ${C.amber}20`,
                      fontSize: 11, color: C.amber, fontWeight: 500,
                    }}>
                      Returning funder with no active grants — consider a renewal proposal
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
