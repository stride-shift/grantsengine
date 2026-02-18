import { useMemo, useState } from "react";
import { C, FONT, MONO } from "../theme";
import { fmt, fmtK, dL, urgC, deadlineCtx, cp, effectiveAsk } from "../utils";
import { Num, CalendarStrip, DeadlineBadge, TypeBadge, Avatar, Label, Btn, CopyBtn } from "./index";

const CLOSED_STAGES = ["won", "lost", "deferred"];
const PRE_SUBMISSION = ["scouted", "qualifying", "drafting", "review"];

export default function Dashboard({ grants, team, stages, onSelectGrant, onNavigate, onRunBrief, onRunReport, orgName }) {
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefResult, setBriefResult] = useState(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportResult, setReportResult] = useState(null);
  const [showAllAlerts, setShowAllAlerts] = useState(false);
  const [showAllDeadlines, setShowAllDeadlines] = useState(false);

  const pipe = useMemo(() => {
    // Single pass: classify grants by stage and accumulate values
    const act = [], won = [], lost = [], submitted = [], drafting = [];
    const needsAction = [], expired = [], approaching = [];
    const stageCounts = new Map();
    const stageAskTotals = new Map();
    const weights = { submitted: 0.6, awaiting: 0.6, review: 0.5, drafting: 0.3, qualifying: 0.15, scouted: 0.05 };
    let totalAsk = 0, wonV = 0, weightedVal = 0;

    for (const g of grants) {
      const ask = effectiveAsk(g);
      stageCounts.set(g.stage, (stageCounts.get(g.stage) || 0) + 1);

      if (g.stage === "won") { won.push(g); wonV += ask; continue; }
      if (g.stage === "lost") { lost.push(g); continue; }
      if (CLOSED_STAGES.includes(g.stage)) continue;

      act.push(g);
      totalAsk += ask;
      weightedVal += ask * (weights[g.stage] || 0.1);
      stageAskTotals.set(g.stage, (stageAskTotals.get(g.stage) || 0) + ask);

      if (g.stage === "drafting") drafting.push(g);
      if (["submitted", "awaiting"].includes(g.stage)) submitted.push(g);

      // Deadline classification
      const d = dL(g.deadline);
      if (d === null) continue;
      const ctx = deadlineCtx(d, g.stage);
      if (ctx.severity === "expired") expired.push(g);
      else if (ctx.severity === "missed") needsAction.push(g);
      else if (ctx.severity === "critical" && PRE_SUBMISSION.includes(g.stage)) needsAction.push(g);
      if (d > 0 && d <= 14 && PRE_SUBMISSION.includes(g.stage)) approaching.push(g);
    }

    const stageValues = (stages || []).filter(s => !CLOSED_STAGES.includes(s.id))
      .map(s => stageAskTotals.get(s.id) || 0);
    const wonValues = won.map(g => g.ask || 0).sort((a, b) => a - b);
    const wonCum = []; let wc = 0; for (const v of wonValues) { wc += v; wonCum.push(wc); }
    const closed = won.length + lost.length;

    return {
      act, won, lost,
      ask: totalAsk, wonV,
      stages: (stages || []).map(s => ({ ...s, n: stageCounts.get(s.id) || 0 })),
      sparkPipeline: stageValues.length > 1 ? stageValues : null,
      sparkWon: wonCum.length > 1 ? wonCum : null,
      submitted, drafting, needsAction, expired, approaching,
      winRate: closed > 0 ? Math.round((won.length / closed) * 100) : null,
      weightedVal, closed,
    };
  }, [grants, stages]);

  const notifs = useMemo(() => {
    const n = [];
    grants.forEach(g => {
      if (CLOSED_STAGES.includes(g.stage)) return;
      const d = dL(g.deadline);
      if (d === null) return;
      const ctx = deadlineCtx(d, g.stage);
      // Post-submission grants — deadline is met, no alert needed
      if (!PRE_SUBMISSION.includes(g.stage)) return;
      // Stage-aware alerts
      if (ctx.severity === "missed") {
        n.push({ id: `ms-${g.id}`, ty: "warn", gid: g.id, tx: `${g.name} — missed deadline by ${Math.abs(d)} days (${g.stage})` });
      } else if (ctx.severity === "expired") {
        n.push({ id: `ex-${g.id}`, ty: "info", gid: g.id, tx: `${g.name} — window closed ${Math.abs(d)} days ago` });
      } else if (ctx.severity === "critical") {
        n.push({ id: `cr-${g.id}`, ty: "urgent", gid: g.id, tx: `${g.name} — ${d === 0 ? "due today!" : `only ${d} days left`}` });
      } else if (ctx.severity === "urgent") {
        n.push({ id: `ur-${g.id}`, ty: "urgent", gid: g.id, tx: `${g.name} — deadline in ${d} days` });
      } else if (ctx.severity === "soon") {
        n.push({ id: `sn-${g.id}`, ty: "warn", gid: g.id, tx: `${g.name} — deadline in ${d} days` });
      }
    });
    // Sort: critical first, then urgent, then warn, then info
    const order = { urgent: 0, warn: 1, info: 2 };
    n.sort((a, b) => (order[a.ty] ?? 3) - (order[b.ty] ?? 3));
    return n;
  }, [grants]);

  const getMember = (id) => team.find(t => t.id === id) || team.find(t => t.id === "team") || { name: "Unassigned", initials: "\u2014" };

  return (
    <div style={{ padding: "32px 36px", maxWidth: 1200 }}>
      {/* Header with red accent bar */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: C.dark, marginBottom: 6, letterSpacing: -0.5 }}>{orgName || "Dashboard"}</div>
        <div style={{ width: 40, height: 4, background: C.primary, borderRadius: 2, marginBottom: 8 }} />
        <div style={{ fontSize: 14, color: C.t3, fontWeight: 400 }}>Pipeline overview {"\u00b7"} {new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
      </div>

      {/* AI Tools row: Daily Brief + Quarterly Report */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {/* Daily Brief */}
        {onRunBrief && (
          <div style={{
            flex: 1, minWidth: 280, padding: "16px 20px",
            background: briefResult ? `linear-gradient(135deg, ${C.purpleSoft}40 0%, ${C.white} 100%)` : C.white,
            borderRadius: 16, boxShadow: C.cardShadow,
            border: briefResult ? `1.5px solid ${C.purple}15` : `1.5px solid ${C.line}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: briefResult ? 12 : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
                  background: briefResult ? C.purpleSoft : `linear-gradient(135deg, ${C.purple} 0%, ${C.blue}CC 100%)`,
                  color: briefResult ? C.purple : "#fff", fontSize: 14, fontWeight: 700,
                  animation: briefBusy ? "ge-pulse 1.4s ease-in-out infinite" : "none",
                }}>{briefBusy ? "\u2026" : briefResult ? "\u2713" : "\u2609"}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>Daily Brief</div>
                  <div style={{ fontSize: 11, color: C.t3 }}>{briefResult ? "Today's priority actions" : "AI-generated action list"}</div>
                </div>
              </div>
              <Btn
                v={briefResult ? "ghost" : "primary"}
                onClick={async () => {
                  setBriefBusy(true);
                  try {
                    const r = await onRunBrief();
                    setBriefResult(r);
                  } catch (e) { setBriefResult(`Error: ${e.message}`); }
                  setBriefBusy(false);
                }}
                disabled={briefBusy}
                style={{ fontSize: 12, padding: "6px 14px" }}
              >{briefBusy ? "Thinking..." : briefResult ? "\u21bb Refresh" : "Generate"}</Btn>
            </div>
            {briefResult && (
              <div style={{
                padding: "14px 16px", background: C.white, borderRadius: 12,
                border: `1px solid ${C.line}`, fontSize: 13, lineHeight: 1.8,
                color: C.t1, whiteSpace: "pre-wrap", position: "relative",
              }}>
                {briefResult}
                <CopyBtn text={briefResult} style={{ position: "absolute", top: 8, right: 8 }} />
              </div>
            )}
          </div>
        )}
        {/* Quarterly Report */}
        {onRunReport && (
          <div style={{
            flex: 1, minWidth: 280, padding: "16px 20px",
            background: reportResult ? `linear-gradient(135deg, ${C.blueSoft}40 0%, ${C.white} 100%)` : C.white,
            borderRadius: 16, boxShadow: C.cardShadow,
            border: reportResult ? `1.5px solid ${C.blue}15` : `1.5px solid ${C.line}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: reportResult ? 12 : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
                  background: reportResult ? C.blueSoft : `linear-gradient(135deg, ${C.blue} 0%, ${C.navy}CC 100%)`,
                  color: reportResult ? C.blue : "#fff", fontSize: 14, fontWeight: 700,
                  animation: reportBusy ? "ge-pulse 1.4s ease-in-out infinite" : "none",
                }}>{reportBusy ? "\u2026" : reportResult ? "\u2713" : "\uD83D\uDCCA"}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>Quarterly Report</div>
                  <div style={{ fontSize: 11, color: C.t3 }}>{reportResult ? "Report ready" : "AI-generated funder report"}</div>
                </div>
              </div>
              <Btn
                v={reportResult ? "ghost" : "primary"}
                onClick={async () => {
                  setReportBusy(true);
                  try {
                    const r = await onRunReport();
                    setReportResult(r);
                  } catch (e) { setReportResult(`Error: ${e.message}`); }
                  setReportBusy(false);
                }}
                disabled={reportBusy}
                style={{ fontSize: 12, padding: "6px 14px", background: reportResult ? undefined : C.blue, borderColor: reportResult ? undefined : C.blue }}
              >{reportBusy ? "Writing..." : reportResult ? "\u21bb Refresh" : "Generate"}</Btn>
            </div>
            {reportResult && (
              <div style={{
                padding: "14px 16px", background: C.white, borderRadius: 12,
                border: `1px solid ${C.line}`, fontSize: 13, lineHeight: 1.8,
                color: C.t1, whiteSpace: "pre-wrap", maxHeight: 300, overflow: "auto",
                position: "relative",
              }}>
                {reportResult}
                <CopyBtn text={reportResult} style={{ position: "absolute", top: 8, right: 8 }} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hero metric + pipeline health */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div className="ge-hover-lift" style={{
          flex: 1, minWidth: 200, padding: "22px 26px",
          background: `linear-gradient(135deg, ${C.primarySoft} 0%, ${C.white} 100%)`,
          borderRadius: 16, border: `1.5px solid ${C.primary}25`,
          boxShadow: C.cardShadow,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.t3, marginBottom: 12, letterSpacing: 1.2, textTransform: "uppercase" }}>Active Pipeline</div>
          <div style={{ fontSize: 40, fontWeight: 800, color: C.primary, letterSpacing: -2, fontFamily: MONO, lineHeight: 1 }}>{fmt(pipe.ask)}</div>
          <div style={{ fontSize: 12, color: C.t3, marginTop: 10, fontWeight: 500 }}>
            {pipe.act.length} grants in progress
            {(() => { const tbd = pipe.act.filter(g => !g.ask || g.ask === 0).length; return tbd > 0 ? <span style={{ color: C.t4, marginLeft: 4 }}>· {tbd} TBD</span> : null; })()}
          </div>
        </div>
        {/* Weighted pipeline — probability-adjusted */}
        <Num
          label="Weighted"
          value={fmt(pipe.weightedVal)}
          sub="Probability-adjusted"
          accent={C.navy}
          color={C.navy}
        />
        <Num label="Won" value={pipe.won.length > 0 ? fmt(pipe.wonV) : "\u2014"} sub={pipe.won.length > 0 ? `${pipe.won.length} grants` : "No grants won yet"} color={C.ok} accent={C.ok} sparkData={pipe.sparkWon} sparkColor={C.ok} />
        <Num label="Grants" value={grants.length} sub={`${pipe.act.length} active`} accent={C.blue} />
      </div>

      {/* Pipeline Health bar — visual funnel */}
      <div style={{
        display: "flex", gap: 12, marginBottom: 24, padding: "16px 20px",
        background: C.white, borderRadius: 16, boxShadow: C.cardShadow,
        alignItems: "center",
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, letterSpacing: 0.8, textTransform: "uppercase", whiteSpace: "nowrap" }}>Health</div>
        <div style={{ flex: 1, display: "flex", gap: 4, alignItems: "center" }}>
          {pipe.stages.filter(s => !CLOSED_STAGES.includes(s.id) && s.n > 0).map(s => {
            const pct = Math.max(8, Math.min(100, (s.n / Math.max(1, pipe.act.length)) * 100));
            return (
              <div key={s.id} style={{ flex: pct, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div className="ge-hover-bar" style={{
                  width: "100%", height: 8, borderRadius: 4,
                  background: s.c, opacity: 0.8,
                }}
                />
                <div style={{ fontSize: 9, fontWeight: 700, color: s.c }}>{s.n}</div>
                <div style={{ fontSize: 8, color: C.t4, fontWeight: 600 }}>{s.label}</div>
              </div>
            );
          })}
          {/* Won / Lost indicator at end */}
          {(pipe.won.length > 0 || pipe.lost.length > 0) && (
            <>
              <div style={{ fontSize: 10, color: C.t4, padding: "0 4px" }}>{"\u2192"}</div>
              {pipe.won.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{ width: 24, height: 8, borderRadius: 4, background: C.ok }} />
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.ok }}>{pipe.won.length}</div>
                  <div style={{ fontSize: 8, color: C.t4, fontWeight: 600 }}>Won</div>
                </div>
              )}
              {pipe.lost.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{ width: 16, height: 8, borderRadius: 4, background: C.red, opacity: 0.4 }} />
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.red }}>{pipe.lost.length}</div>
                  <div style={{ fontSize: 8, color: C.t4, fontWeight: 600 }}>Lost</div>
                </div>
              )}
            </>
          )}
        </div>
        {/* Win rate badge */}
        {pipe.winRate !== null && (
          <div style={{
            padding: "6px 14px", borderRadius: 10,
            background: pipe.winRate >= 50 ? C.okSoft : pipe.winRate >= 25 ? C.amberSoft : C.redSoft,
            color: pipe.winRate >= 50 ? C.ok : pipe.winRate >= 25 ? C.amber : C.red,
            fontSize: 12, fontWeight: 700, fontFamily: MONO, whiteSpace: "nowrap",
          }}>
            {pipe.winRate}% win
          </div>
        )}
        {pipe.needsAction.length > 0 && (
          <div style={{
            padding: "6px 14px", borderRadius: 10,
            background: C.amberSoft, color: C.amber,
            fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
          }}
            title={pipe.needsAction.map(g => `${g.name} (${g.stage})`).join(", ")}
          >
            {pipe.needsAction.length} missed
          </div>
        )}
        {pipe.approaching.length > 0 && (
          <div style={{
            padding: "6px 14px", borderRadius: 10,
            background: C.redSoft, color: C.red,
            fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
          }}
            title={pipe.approaching.map(g => `${g.name} — ${dL(g.deadline)}d left`).join(", ")}
          >
            {pipe.approaching.length} due soon
          </div>
        )}
        {pipe.expired.length > 0 && (
          <div style={{
            padding: "6px 14px", borderRadius: 10,
            background: C.warm200, color: C.t3,
            fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
          }}
            title={pipe.expired.map(g => g.name).join(", ")}
          >
            {pipe.expired.length} expired
          </div>
        )}
      </div>

      {/* Calendar */}
      <CalendarStrip grants={grants} onClickGrant={onSelectGrant} C={C} />

      {/* Notifications — stage-aware deadline alerts */}
      {notifs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <Label>Deadline Alerts</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(showAllAlerts ? notifs : notifs.slice(0, 4)).map(n => {
              const borderColor = n.ty === "urgent" ? C.red : n.ty === "warn" ? C.amber : C.t4;
              const icon = n.ty === "urgent" ? "\u26a0" : n.ty === "warn" ? "!" : "\u25cb";
              return (
                <div key={n.id} className="ge-hover-nudge" onClick={() => onSelectGrant(n.gid)}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
                    background: C.white,
                    borderRadius: 12, cursor: "pointer", fontSize: 13, color: C.t1,
                    border: `1.5px solid ${borderColor}30`,
                    boxShadow: C.cardShadow,
                    opacity: n.ty === "info" ? 0.7 : 1,
                  }}>
                  <span style={{ fontSize: 14 }}>{icon}</span>
                  <span style={{ flex: 1 }}>{n.tx}</span>
                  <span style={{ fontSize: 14, color: C.t4, flexShrink: 0, transition: "color 0.15s" }}>{"\u2192"}</span>
                </div>
              );
            })}
          </div>
          {notifs.length > 4 && (
            <button onClick={() => setShowAllAlerts(p => !p)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                width: "100%", padding: "10px 0", marginTop: 8,
                background: "none", border: "none", cursor: "pointer",
                fontSize: 12, fontWeight: 600, color: C.t3, fontFamily: FONT,
                transition: "color 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.color = C.primary}
              onMouseLeave={e => e.currentTarget.style.color = C.t3}
            >
              {showAllAlerts ? "Show less" : `View all ${notifs.length} alerts`}
              <span style={{ fontSize: 10, transform: showAllAlerts ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>{"\u25bc"}</span>
            </button>
          )}
        </div>
      )}

      {/* Stage breakdown — 3px top border in stage color */}
      <Label>Pipeline by Stage</Label>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
        {pipe.stages.filter(s => s.n > 0).map(s => (
          <div key={s.id} className="ge-hover-lift" onClick={() => onNavigate?.("pipeline")} style={{
            padding: "14px 22px", background: C.white, borderRadius: 14,
            boxShadow: C.cardShadow, minWidth: 100, textAlign: "center",
            border: `1.5px solid ${s.c}30`, cursor: "pointer",
          }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.c, fontFamily: MONO }}>{s.n}</div>
            <div style={{ fontSize: 11, color: C.t3, fontWeight: 600, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Deadlines table — only pre-submission grants with actionable deadlines */}
      <Label>Upcoming Deadlines</Label>
      <div style={{ background: C.white, borderRadius: 16, overflow: "hidden", boxShadow: C.cardShadow }}>
        {/* Table header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "10px 18px",
          background: C.navy, borderRadius: "16px 16px 0 0",
        }}>
          <div style={{ width: 26 }} />
          <div style={{ flex: 1, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: 0.5, textTransform: "uppercase" }}>Grant</div>
          <div style={{ width: 90, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: 0.5, textTransform: "uppercase" }}>Type</div>
          <div style={{ width: 80, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: 0.5, textTransform: "uppercase", textAlign: "right" }}>Ask</div>
          <div style={{ width: 100, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: 0.5, textTransform: "uppercase" }}>Status</div>
        </div>
        {(() => {
          // Pre-submission grants only — post-submission grants have already met deadline
          const allRows = grants
            .filter(g => g.deadline && PRE_SUBMISSION.includes(g.stage))
            .map(g => ({ ...g, _d: dL(g.deadline), _ctx: deadlineCtx(dL(g.deadline), g.stage) }))
            // Show upcoming first, then recently missed/expired (within 30 days)
            .filter(g => g._d > -30)
            .sort((a, b) => {
              // Upcoming (positive) first sorted ascending, then past (negative) sorted descending
              if (a._d >= 0 && b._d >= 0) return a._d - b._d;
              if (a._d >= 0) return -1;
              if (b._d >= 0) return -1;
              return b._d - a._d; // More recently missed first
            });
          const rows = showAllDeadlines ? allRows : allRows.slice(0, 5);
          if (allRows.length === 0) return (
            <div style={{ padding: "20px 18px", fontSize: 13, color: C.t3, textAlign: "center" }}>
              No upcoming submission deadlines
            </div>
          );
          return (
            <>
              {rows.map((g, idx) => {
                const m = getMember(g.owner);
                const stg = (stages || []).find(s => s.id === g.stage);
                return (
                  <div key={g.id} onClick={() => onSelectGrant(g.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "12px 18px",
                      borderBottom: `1px solid ${C.line}`, cursor: "pointer",
                      background: idx % 2 === 1 ? C.warm100 : "transparent",
                      opacity: g._ctx.severity === "expired" ? 0.6 : 1,
                    }}
                    className="ge-hover-slide">
                    <Avatar member={m} size={26} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {stg && <span style={{ width: 8, height: 8, borderRadius: "50%", background: stg.c, flexShrink: 0 }} />}
                        <span style={{ fontSize: 13, fontWeight: 600, color: C.dark, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.name}</span>
                      </div>
                      <div style={{ fontSize: 11, color: C.t3 }}>{g.funder}</div>
                    </div>
                    <TypeBadge type={g.type} />
                    <div style={{ fontSize: 13, fontWeight: 600, color: g.ask > 0 ? C.t2 : C.t4, fontFamily: MONO, minWidth: 70, textAlign: "right" }}>{g.ask > 0 ? fmtK(g.ask) : g.funderBudget ? `~${fmtK(g.funderBudget)}` : "TBD"}</div>
                    <DeadlineBadge d={g._d} deadline={g.deadline} stage={g.stage} />
                  </div>
                );
              })}
              {allRows.length > 5 && (
                <button onClick={() => setShowAllDeadlines(p => !p)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    width: "100%", padding: "12px 0",
                    background: "none", border: "none", cursor: "pointer",
                    fontSize: 12, fontWeight: 600, color: C.t3, fontFamily: FONT,
                    transition: "color 0.15s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = C.primary}
                  onMouseLeave={e => e.currentTarget.style.color = C.t3}
                >
                  {showAllDeadlines ? "Show less" : `View all ${allRows.length} deadlines`}
                  <span style={{ fontSize: 10, transform: showAllDeadlines ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>{"\u25bc"}</span>
                </button>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}
