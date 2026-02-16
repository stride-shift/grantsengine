import { useMemo, useState } from "react";
import { C, FONT, MONO } from "../theme";
import { fmt, fmtK, dL, urgC, cp } from "../utils";
import { Num, CalendarStrip, DeadlineBadge, TypeBadge, Avatar, Label, Btn, CopyBtn } from "./index";

export default function Dashboard({ grants, team, stages, onSelectGrant, onNavigate, onRunBrief, onRunReport, orgName }) {
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefResult, setBriefResult] = useState(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportResult, setReportResult] = useState(null);

  const pipe = useMemo(() => {
    const act = grants.filter(g => !["won", "lost", "deferred"].includes(g.stage));
    const won = grants.filter(g => g.stage === "won");
    const lost = grants.filter(g => g.stage === "lost");
    const stageValues = (stages || []).filter(s => !["won", "lost", "deferred"].includes(s.id))
      .map(s => grants.filter(g => g.stage === s.id).reduce((sum, g) => sum + (g.ask || 0), 0));
    const wonValues = won.map(g => g.ask || 0).sort((a, b) => a - b);
    const wonCum = []; let wc = 0; for (const v of wonValues) { wc += v; wonCum.push(wc); }

    // Pipeline health metrics
    const submitted = grants.filter(g => ["submitted", "awaiting"].includes(g.stage));
    const drafting = grants.filter(g => g.stage === "drafting");
    const overdue = act.filter(g => { const d = dL(g.deadline); return d !== null && d < 0; });
    // Conversion: won / (won + lost) — only meaningful if we have closed grants
    const closed = won.length + lost.length;
    const winRate = closed > 0 ? Math.round((won.length / closed) * 100) : null;
    // Weighted pipeline: submitted at 60%, drafting at 30%, qualifying at 15%, scouted at 5%
    const weights = { submitted: 0.6, awaiting: 0.6, review: 0.5, drafting: 0.3, qualifying: 0.15, scouted: 0.05 };
    const weightedVal = act.reduce((s, g) => s + (g.ask || 0) * (weights[g.stage] || 0.1), 0);

    return {
      act, won, lost,
      ask: act.reduce((s, g) => s + (g.ask || 0), 0),
      wonV: won.reduce((s, g) => s + (g.ask || 0), 0),
      stages: (stages || []).map(s => ({ ...s, n: grants.filter(g => g.stage === s.id).length })),
      sparkPipeline: stageValues.length > 1 ? stageValues : null,
      sparkWon: wonCum.length > 1 ? wonCum : null,
      submitted, drafting, overdue,
      winRate, weightedVal, closed,
    };
  }, [grants, stages]);

  const notifs = useMemo(() => {
    const n = [];
    grants.forEach(g => {
      if (["won", "lost", "deferred"].includes(g.stage)) return;
      const d = dL(g.deadline);
      if (d !== null && d < 0) n.push({ id: `ov-${g.id}`, ty: "urgent", gid: g.id, tx: `${g.name} \u2014 ${Math.abs(d)} days overdue` });
      else if (d !== null && d <= 7) n.push({ id: `ur-${g.id}`, ty: "urgent", gid: g.id, tx: `${g.name} \u2014 deadline in ${d} days` });
      else if (d !== null && d <= 14) n.push({ id: `sn-${g.id}`, ty: "warn", gid: g.id, tx: `${g.name} \u2014 deadline in ${d} days` });
    });
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
        <div style={{
          flex: 1, minWidth: 200, padding: "22px 26px",
          background: `linear-gradient(135deg, ${C.primarySoft} 0%, ${C.white} 100%)`,
          borderRadius: 16, borderLeft: `4px solid ${C.primary}`,
          boxShadow: C.cardShadow, transition: "box-shadow 0.2s ease, transform 0.2s ease",
        }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = C.cardShadowHover; e.currentTarget.style.transform = "translateY(-2px)"; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = C.cardShadow; e.currentTarget.style.transform = "none"; }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: C.t3, marginBottom: 12, letterSpacing: 1.2, textTransform: "uppercase" }}>Active Pipeline</div>
          <div style={{ fontSize: 40, fontWeight: 800, color: C.primary, letterSpacing: -2, fontFamily: MONO, lineHeight: 1 }}>{fmt(pipe.ask)}</div>
          <div style={{ fontSize: 12, color: C.t3, marginTop: 10, fontWeight: 500 }}>{pipe.act.length} grants in progress</div>
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
          {pipe.stages.filter(s => !["won", "lost", "deferred"].includes(s.id) && s.n > 0).map(s => {
            const pct = Math.max(8, Math.min(100, (s.n / Math.max(1, pipe.act.length)) * 100));
            return (
              <div key={s.id} style={{ flex: pct, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div style={{
                  width: "100%", height: 8, borderRadius: 4,
                  background: s.c, opacity: 0.8,
                  transition: "opacity 0.2s",
                }}
                  onMouseEnter={e => e.currentTarget.style.opacity = "1"}
                  onMouseLeave={e => e.currentTarget.style.opacity = "0.8"}
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
        {pipe.overdue.length > 0 && (
          <div style={{
            padding: "6px 14px", borderRadius: 10,
            background: C.redSoft, color: C.red,
            fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
          }}>
            {pipe.overdue.length} overdue
          </div>
        )}
      </div>

      {/* Calendar */}
      <CalendarStrip grants={grants} onClickGrant={onSelectGrant} C={C} />

      {/* Notifications — white bg with colored left border */}
      {notifs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <Label>Alerts</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {notifs.slice(0, 8).map(n => (
              <div key={n.id} onClick={() => onSelectGrant(n.gid)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
                  background: C.white,
                  borderRadius: 12, cursor: "pointer", fontSize: 13, color: C.t1,
                  borderLeft: `4px solid ${n.ty === "urgent" ? C.red : C.amber}`,
                  boxShadow: C.cardShadow,
                  transition: "transform 0.15s ease, box-shadow 0.15s ease",
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateX(4px)"; e.currentTarget.style.boxShadow = C.cardShadowHover; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = C.cardShadow; }}>
                <span style={{ fontSize: 14 }}>{n.ty === "urgent" ? "\u26a0" : "\u23f0"}</span>
                <span style={{ flex: 1 }}>{n.tx}</span>
                <span style={{ fontSize: 14, color: C.t4, flexShrink: 0, transition: "color 0.15s" }}>{"\u2192"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stage breakdown — 3px top border in stage color */}
      <Label>Pipeline by Stage</Label>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
        {pipe.stages.filter(s => s.n > 0).map(s => (
          <div key={s.id} onClick={() => onNavigate?.("pipeline")} style={{
            padding: "14px 22px", background: C.white, borderRadius: 14,
            boxShadow: C.cardShadow, minWidth: 100, textAlign: "center",
            borderTop: `3px solid ${s.c}`, cursor: "pointer",
            transition: "transform 0.15s ease, box-shadow 0.15s ease",
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = C.cardShadowHover; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = C.cardShadow; }}
          >
            <div style={{ fontSize: 28, fontWeight: 800, color: s.c, fontFamily: MONO }}>{s.n}</div>
            <div style={{ fontSize: 11, color: C.t3, fontWeight: 600, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Deadlines table — navy header row */}
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
          <div style={{ width: 90, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: 0.5, textTransform: "uppercase" }}>Deadline</div>
        </div>
        {grants.filter(g => g.deadline && !["won", "lost", "deferred"].includes(g.stage))
          .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
          .slice(0, 10)
          .map((g, idx) => {
            const d = dL(g.deadline);
            const m = getMember(g.owner);
            const stg = (stages || []).find(s => s.id === g.stage);
            return (
              <div key={g.id} onClick={() => onSelectGrant(g.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 18px",
                  borderBottom: `1px solid ${C.line}`, cursor: "pointer",
                  background: idx % 2 === 1 ? C.warm100 : "transparent",
                  transition: "background 0.15s ease, padding-left 0.15s ease",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = C.hover; e.currentTarget.style.paddingLeft = "22px"; }}
                onMouseLeave={e => { e.currentTarget.style.background = idx % 2 === 1 ? C.warm100 : "transparent"; e.currentTarget.style.paddingLeft = "18px"; }}>
                <Avatar member={m} size={26} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {stg && <span style={{ width: 8, height: 8, borderRadius: "50%", background: stg.c, flexShrink: 0 }} />}
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.dark, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.name}</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.t3 }}>{g.funder}</div>
                </div>
                <TypeBadge type={g.type} />
                <div style={{ fontSize: 13, fontWeight: 600, color: C.t2, fontFamily: MONO, minWidth: 70, textAlign: "right" }}>{fmtK(g.ask)}</div>
                <DeadlineBadge d={d} deadline={g.deadline} />
              </div>
            );
          })}
      </div>
    </div>
  );
}
