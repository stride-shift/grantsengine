import { useMemo, useState } from "react";
import { C, FONT, MONO } from "../theme";
import { fmt, dL, deadlineCtx, effectiveAsk } from "../utils";
import { Num, Timeline, Label, Btn, CopyBtn, stripMd } from "./index";

const CLOSED = ["won", "lost", "deferred"];
const PRE_SUB = ["scouted", "qualifying", "drafting", "review"];
const FTYPE_COLORS = [C.primary, C.blue, C.purple, C.amber, C.ok];
const REL_COLORS = { Hot: C.primary, Warm: C.amber, Cold: C.blue, New: C.purple };

/* ═══ Micro chart components — zero dependencies ═══ */

const Bar = ({ pct, color, h = 6 }) => (
  <div style={{ flex: 1, height: h, background: C.raised, borderRadius: h / 2, overflow: "hidden" }}>
    <div style={{ width: `${Math.max(pct > 0 ? 3 : 0, pct)}%`, height: "100%", borderRadius: h / 2, background: color, transition: "width 0.5s ease" }} />
  </div>
);

const Spark = ({ data, color = C.primary, w = 80, h = 28 }) => {
  if (!data || data.length < 2) return null;
  const mn = Math.min(...data), mx = Math.max(...data), range = mx - mn || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - mn) / range) * (h - 4) - 2}`).join(" ");
  return <svg width={w} height={h} style={{ display: "block" }}><polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
};

/* Section divider with optional right-side element */
const Hd = ({ children, right, mb = 20 }) => (
  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: mb, marginTop: 36 }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, letterSpacing: 1.4, textTransform: "uppercase" }}>{children}</div>
    {right}
  </div>
);

/* Card with optional accent stripe */
const Card = ({ children, accent, pad = "20px 24px", style: sx, className }) => (
  <div className={className} style={{
    padding: pad, background: C.white, borderRadius: 14,
    boxShadow: C.cardShadow,
    borderTop: accent ? `3px solid ${accent}` : undefined,
    border: accent ? undefined : `1px solid ${C.line}`,
    ...sx,
  }}>
    {children}
  </div>
);

/* Stat cell — big number with label and optional micro detail */
const Stat = ({ label, value, sub, color = C.dark, small }) => (
  <div style={{ minWidth: small ? 80 : 110 }}>
    <div style={{ fontSize: 10, fontWeight: 600, color: C.t4, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: small ? 22 : 28, fontWeight: 800, color, fontFamily: MONO, letterSpacing: -1.5, lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: C.t3, marginTop: 6, fontWeight: 500 }}>{sub}</div>}
  </div>
);

/* Horizontal bar row — compact */
const HRow = ({ label, value, max, color, suffix = "", w = 90 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26 }}>
    <div style={{ width: w, fontSize: 11, fontWeight: 600, color: C.t2, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
    <Bar pct={(value / (max || 1)) * 100} color={color} />
    <div style={{ width: 36, fontSize: 11, fontWeight: 700, color: C.t1, fontFamily: MONO, textAlign: "right" }}>{value}{suffix}</div>
  </div>
);

/* AI output block — shared for all AI sections */
const AIBlock = ({ label, sub, busy, result, onRun, btnLabel, busyLabel, accentColor }) => (
  <Card accent={accentColor} style={{ flex: 1, minWidth: 340, display: "flex", flexDirection: "column" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: result ? 14 : 0 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>{label}</div>
        <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>{sub}</div>
      </div>
      <Btn
        v={result ? "ghost" : "primary"}
        onClick={onRun} disabled={busy}
        style={{
          fontSize: 12, padding: "6px 14px",
          ...(accentColor && !result ? { background: accentColor, borderColor: accentColor } : {}),
        }}
      >{busy ? busyLabel : result ? "\u21bb Refresh" : btnLabel || "Generate"}</Btn>
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

export default function Dashboard({
  grants, team, stages, onSelectGrant, onNavigate,
  onRunBrief, onRunReport, onRunInsights, onRunStrategy, orgName,
}) {
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefResult, setBriefResult] = useState(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportResult, setReportResult] = useState(null);
  const [insightsBusy, setInsightsBusy] = useState(false);
  const [insightsResult, setInsightsResult] = useState(null);
  const [strategyBusy, setStrategyBusy] = useState(false);
  const [strategyResult, setStrategyResult] = useState(null);

  /* ── Core pipeline numbers ── */
  const pipe = useMemo(() => {
    const act = [], won = [], lost = [], submitted = [], drafting = [];
    const needsAction = [], expired = [], approaching = [];
    const stageCounts = new Map(), stageAskTotals = new Map();
    const weights = { submitted: 0.6, awaiting: 0.6, review: 0.5, drafting: 0.3, qualifying: 0.15, scouted: 0.05 };
    let totalAsk = 0, wonV = 0, weightedVal = 0;

    for (const g of grants) {
      const ask = effectiveAsk(g);
      stageCounts.set(g.stage, (stageCounts.get(g.stage) || 0) + 1);
      if (g.stage === "won") { won.push(g); wonV += ask; continue; }
      if (g.stage === "lost") { lost.push(g); continue; }
      if (CLOSED.includes(g.stage)) continue;
      act.push(g); totalAsk += ask;
      weightedVal += ask * (weights[g.stage] || 0.1);
      stageAskTotals.set(g.stage, (stageAskTotals.get(g.stage) || 0) + ask);
      if (g.stage === "drafting") drafting.push(g);
      if (["submitted", "awaiting"].includes(g.stage)) submitted.push(g);
      const d = dL(g.deadline);
      if (d === null) continue;
      const ctx = deadlineCtx(d, g.stage);
      if (ctx.severity === "expired") expired.push(g);
      else if (ctx.severity === "missed") needsAction.push(g);
      else if (ctx.severity === "critical" && PRE_SUB.includes(g.stage)) needsAction.push(g);
      if (d > 0 && d <= 14 && PRE_SUB.includes(g.stage)) approaching.push(g);
    }
    const stageValues = (stages || []).filter(s => !CLOSED.includes(s.id)).map(s => stageAskTotals.get(s.id) || 0);
    const wonValues = won.map(g => g.ask || 0).sort((a, b) => a - b);
    const wonCum = []; let wc = 0; for (const v of wonValues) { wc += v; wonCum.push(wc); }
    const closed = won.length + lost.length;
    return {
      act, won, lost, ask: totalAsk, wonV,
      stages: (stages || []).map(s => ({ ...s, n: stageCounts.get(s.id) || 0 })),
      sparkPipeline: stageValues.length > 1 ? stageValues : null,
      sparkWon: wonCum.length > 1 ? wonCum : null,
      submitted, drafting, needsAction, expired, approaching,
      winRate: closed > 0 ? Math.round((won.length / closed) * 100) : null,
      weightedVal, closed,
    };
  }, [grants, stages]);

  /* ── Analytics computations ── */
  const ana = useMemo(() => {
    if (grants.length < 3) return null;
    const act = grants.filter(g => !CLOSED.includes(g.stage));
    const won = grants.filter(g => g.stage === "won");
    const lost = grants.filter(g => g.stage === "lost");
    const closed = won.length + lost.length;

    // Ask stats
    const asks = grants.map(g => effectiveAsk(g)).filter(a => a > 0);
    const avgAsk = asks.length ? asks.reduce((s, v) => s + v, 0) / asks.length : 0;
    const sorted = [...asks].sort((a, b) => a - b);
    const medianAsk = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;

    // Ask histogram
    const bins = [
      { label: "<250K", min: 0, max: 250000 },
      { label: "250-500K", min: 250000, max: 500000 },
      { label: "500K-1M", min: 500000, max: 1000000 },
      { label: "1-2M", min: 1000000, max: 2000000 },
      { label: "2M+", min: 2000000, max: Infinity },
    ];
    const askHist = bins.map(b => ({ label: b.label, value: asks.filter(a => a >= b.min && a < b.max).length }));

    // Funder types
    const tm = new Map();
    for (const g of grants) {
      const t = g.type || "Unknown";
      if (!tm.has(t)) tm.set(t, { n: 0, won: 0, lost: 0, ask: 0 });
      const e = tm.get(t); e.n++; e.ask += effectiveAsk(g);
      if (g.stage === "won") e.won++; if (g.stage === "lost") e.lost++;
    }
    const fTypes = [...tm.entries()].map(([label, v]) => ({
      label, n: v.n, won: v.won, lost: v.lost, ask: v.ask,
      wr: v.won + v.lost > 0 ? Math.round((v.won / (v.won + v.lost)) * 100) : null,
    })).sort((a, b) => b.n - a.n);

    // Relationships
    const rm = new Map();
    for (const g of grants) {
      const r = g.rel || "Unknown";
      if (!rm.has(r)) rm.set(r, { n: 0, won: 0, lost: 0 });
      const e = rm.get(r); e.n++;
      if (g.stage === "won") e.won++; if (g.stage === "lost") e.lost++;
    }
    const rels = [...rm.entries()].map(([label, v]) => ({
      label, n: v.n,
      wr: v.won + v.lost > 0 ? Math.round((v.won / (v.won + v.lost)) * 100) : null,
    })).sort((a, b) => b.n - a.n);

    // Team workload
    const om = new Map();
    for (const g of act) {
      const o = g.owner || "team";
      const m = team?.find(t => t.id === o);
      const name = m ? m.name : o === "team" ? "Unassigned" : o;
      om.set(name, (om.get(name) || 0) + 1);
    }
    const workload = [...om.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

    // Focus tags
    const fm = new Map();
    for (const g of grants) for (const tag of (g.focus || [])) fm.set(tag, (fm.get(tag) || 0) + 1);
    const tags = [...fm.entries()].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n);

    // Deadlines by month
    const dm = new Map();
    for (const g of grants) {
      if (!g.deadline) continue;
      const d = new Date(g.deadline); if (isNaN(d.getTime())) continue;
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const l = d.toLocaleDateString("en-ZA", { month: "short" });
      if (!dm.has(k)) dm.set(k, { label: l, value: 0 }); dm.get(k).value++;
    }
    const months = [...dm.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v).slice(-8);

    // AI coverage
    const aiD = grants.filter(g => g.aiDraft || (tryParse(g.ai_data)?.draft)).length;
    const aiR = grants.filter(g => g.aiResearch || (tryParse(g.ai_data)?.research)).length;
    const aiF = grants.filter(g => g.aiFitscore || (tryParse(g.ai_data)?.fitscore)).length;
    const aiPct = grants.length > 0 ? Math.round(((aiD + aiR + aiF) / (grants.length * 3)) * 100) : 0;

    const noDL = act.filter(g => !g.deadline).length;

    // Win/loss factors
    const wf = new Map(), lf = new Map();
    for (const g of won) for (const f of (g.on || "").split(",").map(s => s.trim()).filter(Boolean)) wf.set(f, (wf.get(f) || 0) + 1);
    for (const g of lost) for (const f of (g.of || []).flat().map(s => typeof s === "string" ? s : "").filter(Boolean)) lf.set(f, (lf.get(f) || 0) + 1);
    const winF = [...wf.entries()].map(([l, v]) => ({ label: l, value: v })).sort((a, b) => b.value - a.value).slice(0, 6);
    const lossF = [...lf.entries()].map(([l, v]) => ({ label: l, value: v })).sort((a, b) => b.value - a.value).slice(0, 6);

    // Stage velocity — avg days in each stage (approximation from log)
    // Top funders by value
    const funderVal = new Map();
    for (const g of grants) { const f = g.funder || "Unknown"; funderVal.set(f, (funderVal.get(f) || 0) + effectiveAsk(g)); }
    const topFunders = [...funderVal.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 6);

    return {
      avgAsk, medianAsk, aiPct, noDL, askHist, fTypes, rels, workload, tags, months,
      aiD, aiR, aiF, winF, lossF, topFunders,
      wr: closed > 0 ? Math.round((won.length / closed) * 100) : null,
    };
  }, [grants, team]);

  const canInsights = grants.length >= 5 && new Set(grants.map(g => g.stage)).size >= 2;
  const canStrategy = grants.length >= 5 && (pipe.won.length > 0 || pipe.lost.length > 0);

  const runAI = (setter, busySetter, handler) => async () => {
    busySetter(true);
    try { const r = await handler(); setter(r); }
    catch (e) { setter(`Error: ${e.message}`); }
    busySetter(false);
  };

  return (
    <div style={{ padding: "32px 36px", maxWidth: 1200 }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: C.dark, letterSpacing: -0.5 }}>{orgName || "Dashboard"}</div>
        <div style={{ width: 36, height: 3, background: C.primary, borderRadius: 2, marginTop: 6, marginBottom: 6 }} />
        <div style={{ fontSize: 13, color: C.t4, fontWeight: 400 }}>
          {new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </div>
      </div>

      {/* ═══════════ 1. HEADLINE NUMBERS ═══════════ */}
      <Hd>Pipeline</Hd>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
        {/* Big hero — active pipeline */}
        <Card accent={C.primary} className="ge-hover-lift" style={{ flex: "1.4 1 220px", display: "flex", alignItems: "center", gap: 20 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.t4, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Active Pipeline</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: C.primary, fontFamily: MONO, letterSpacing: -2, lineHeight: 1 }}>{fmt(pipe.ask)}</div>
            <div style={{ fontSize: 11, color: C.t3, marginTop: 8, fontWeight: 500 }}>
              {pipe.act.length} grants in progress
              {(() => { const tbd = pipe.act.filter(g => !g.ask || g.ask === 0).length; return tbd > 0 ? ` / ${tbd} TBD` : ""; })()}
            </div>
          </div>
          {pipe.sparkPipeline && <Spark data={pipe.sparkPipeline} color={C.primary} w={70} h={32} />}
        </Card>
        <Num label="Weighted" value={fmt(pipe.weightedVal)} sub="Probability-adjusted" accent={C.navy} color={C.navy} />
        <Num label="Won" value={pipe.won.length > 0 ? fmt(pipe.wonV) : "\u2014"} sub={pipe.won.length > 0 ? `${pipe.won.length} grant${pipe.won.length !== 1 ? "s" : ""}` : "No wins yet"} color={C.ok} accent={C.ok} sparkData={pipe.sparkWon} sparkColor={C.ok} />
        <Num label="Grants" value={grants.length} sub={`${pipe.act.length} active`} accent={C.blue} />
      </div>

      {/* ── Pipeline health bar ── */}
      <Card style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.t4, letterSpacing: 0.8, textTransform: "uppercase", whiteSpace: "nowrap" }}>Funnel</div>
        <div style={{ flex: 1, display: "flex", gap: 3, alignItems: "center" }}>
          {pipe.stages.filter(s => !CLOSED.includes(s.id) && s.n > 0).map(s => {
            const pct = Math.max(8, Math.min(100, (s.n / Math.max(1, pipe.act.length)) * 100));
            return (
              <div key={s.id} style={{ flex: pct, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                <div className="ge-hover-bar" style={{ width: "100%", height: 7, borderRadius: 4, background: s.c, opacity: 0.8 }} />
                <div style={{ fontSize: 9, fontWeight: 700, color: s.c }}>{s.n}</div>
                <div style={{ fontSize: 8, color: C.t4, fontWeight: 600 }}>{s.label}</div>
              </div>
            );
          })}
          {(pipe.won.length > 0 || pipe.lost.length > 0) && (
            <>
              <div style={{ fontSize: 9, color: C.t4, padding: "0 3px" }}>{"\u2192"}</div>
              {pipe.won.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{ width: 20, height: 7, borderRadius: 4, background: C.ok }} />
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.ok }}>{pipe.won.length}</div>
                  <div style={{ fontSize: 8, color: C.t4, fontWeight: 600 }}>Won</div>
                </div>
              )}
              {pipe.lost.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{ width: 14, height: 7, borderRadius: 4, background: C.red, opacity: 0.4 }} />
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.red }}>{pipe.lost.length}</div>
                  <div style={{ fontSize: 8, color: C.t4, fontWeight: 600 }}>Lost</div>
                </div>
              )}
            </>
          )}
        </div>
        {/* Status badges */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {pipe.winRate !== null && (
            <div style={{
              padding: "4px 10px", borderRadius: 8,
              background: pipe.winRate >= 50 ? C.okSoft : pipe.winRate >= 25 ? C.amberSoft : C.redSoft,
              color: pipe.winRate >= 50 ? C.ok : pipe.winRate >= 25 ? C.amber : C.red,
              fontSize: 11, fontWeight: 700, fontFamily: MONO,
            }}>{pipe.winRate}% win</div>
          )}
          {pipe.approaching.length > 0 && (
            <div style={{ padding: "4px 10px", borderRadius: 8, background: C.redSoft, color: C.red, fontSize: 11, fontWeight: 700 }}
              title={pipe.approaching.map(g => `${g.name} \u2014 ${dL(g.deadline)}d`).join(", ")}
            >{pipe.approaching.length} due soon</div>
          )}
          {pipe.needsAction.length > 0 && (
            <div style={{ padding: "4px 10px", borderRadius: 8, background: C.amberSoft, color: C.amber, fontSize: 11, fontWeight: 700 }}
              title={pipe.needsAction.map(g => `${g.name} (${g.stage})`).join(", ")}
            >{pipe.needsAction.length} overdue</div>
          )}
        </div>
      </Card>

      {/* ── Submission Timeline ── */}
      <Timeline grants={grants} stages={stages} team={team} onClickGrant={onSelectGrant} />

      {/* ── Stage breakdown — compact row ── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4, marginBottom: 8 }}>
        {pipe.stages.filter(s => s.n > 0).map(s => (
          <div key={s.id} className="ge-hover-lift" onClick={() => onNavigate?.("pipeline")} style={{
            padding: "10px 18px", background: C.white, borderRadius: 12,
            boxShadow: C.cardShadow, minWidth: 80, textAlign: "center",
            borderTop: `3px solid ${s.c}`, cursor: "pointer",
          }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: s.c, fontFamily: MONO }}>{s.n}</div>
            <div style={{ fontSize: 10, color: C.t3, fontWeight: 600, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ═══════════ 2. AI COMMAND CENTRE ═══════════ */}
      <Hd>AI Command Centre</Hd>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 8 }}>
        {onRunBrief && (
          <AIBlock
            label="Daily Brief"
            sub="Priority actions for today"
            accentColor={C.purple}
            busy={briefBusy} result={briefResult}
            btnLabel="Generate" busyLabel="Thinking..."
            onRun={runAI(setBriefResult, setBriefBusy, onRunBrief)}
          />
        )}
        {onRunReport && (
          <AIBlock
            label="Quarterly Report"
            sub="Funder-ready impact summary"
            accentColor={C.blue}
            busy={reportBusy} result={reportResult}
            btnLabel="Generate" busyLabel="Writing..."
            onRun={runAI(setReportResult, setReportBusy, onRunReport)}
          />
        )}
      </div>

      {/* ═══════════ 3. PIPELINE INTELLIGENCE ═══════════ */}
      {ana && (
        <>
          <Hd>Pipeline Intelligence</Hd>

          {/* Row A: Secondary KPIs */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
            <Card style={{ flex: 1, minWidth: 140 }}>
              <Stat label="Avg Ask" value={fmt(ana.avgAsk)} sub={`Median ${fmt(ana.medianAsk)}`} color={C.primary} small />
            </Card>
            <Card style={{ flex: 1, minWidth: 140 }}>
              <Stat label="Win Rate" value={ana.wr !== null ? `${ana.wr}%` : "\u2014"} sub={ana.wr !== null ? `${pipe.won.length}W / ${pipe.lost.length}L` : "No outcomes yet"} color={ana.wr !== null && ana.wr >= 50 ? C.ok : C.amber} small />
            </Card>
            <Card style={{ flex: 1, minWidth: 140 }}>
              <Stat label="AI Coverage" value={`${ana.aiPct}%`} sub={`${ana.aiD} drafted / ${ana.aiR} researched / ${ana.aiF} scored`} color={C.purple} small />
            </Card>
            <Card style={{ flex: 1, minWidth: 140 }}>
              <Stat label="No Deadline" value={ana.noDL} sub={ana.noDL > 0 ? "Need dates" : "All set"} color={ana.noDL > 0 ? C.amber : C.ok} small />
            </Card>
          </div>

          {/* Row B: Funder types + Top funders by value */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
            <Card style={{ flex: 1.2, minWidth: 300 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.dark, marginBottom: 4 }}>Funder Types</div>
              <div style={{ fontSize: 10, color: C.t4, marginBottom: 14 }}>{ana.fTypes.length} types across {grants.length} grants</div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {/* Donut */}
                <MiniDonut items={ana.fTypes.map((f, i) => ({ label: f.label.replace("Corporate ", "").replace("Government/", "Gov/"), value: f.n, color: FTYPE_COLORS[i % 5] }))} />
                {/* Win rate table */}
                <div style={{ flex: 1, minWidth: 140 }}>
                  {ana.fTypes.map((f, i) => (
                    <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: i < ana.fTypes.length - 1 ? `1px solid ${C.raised}` : "none" }}>
                      <div style={{ width: 6, height: 6, borderRadius: 3, background: FTYPE_COLORS[i % 5] }} />
                      <div style={{ flex: 1, fontSize: 11, fontWeight: 500, color: C.t2 }}>{f.label}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, fontFamily: MONO, color: C.t1 }}>{f.n}</div>
                      {f.wr !== null && <div style={{ fontSize: 10, fontWeight: 600, color: f.wr >= 50 ? C.ok : C.t4, fontFamily: MONO }}>{f.wr}%w</div>}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
            <Card style={{ flex: 1, minWidth: 260 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.dark, marginBottom: 4 }}>Top Funders by Value</div>
              <div style={{ fontSize: 10, color: C.t4, marginBottom: 14 }}>Pipeline exposure</div>
              {ana.topFunders.map((f, i) => (
                <HRow key={i} label={f.label} value={fmt(f.value)} max={ana.topFunders[0]?.value} color={FTYPE_COLORS[i % 5]} w={100} />
              ))}
            </Card>
          </div>

          {/* Row C: Relationships + Ask distribution */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
            <Card style={{ flex: 1, minWidth: 260 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.dark, marginBottom: 4 }}>Relationships</div>
              <div style={{ fontSize: 10, color: C.t4, marginBottom: 14 }}>Conversion by status</div>
              {ana.rels.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 70, fontSize: 11, fontWeight: 600, color: C.t2, textAlign: "right" }}>{r.label}</div>
                  <Bar pct={(r.n / (ana.rels[0]?.n || 1)) * 100} color={REL_COLORS[r.label] || C.t4} h={8} />
                  <div style={{ fontSize: 11, fontWeight: 700, fontFamily: MONO, color: C.t1, width: 24, textAlign: "right" }}>{r.n}</div>
                  {r.wr !== null && <div style={{ fontSize: 10, padding: "2px 6px", borderRadius: 6, background: r.wr >= 50 ? C.okSoft : C.raised, color: r.wr >= 50 ? C.ok : C.t3, fontWeight: 600, fontFamily: MONO }}>{r.wr}%</div>}
                </div>
              ))}
            </Card>
            <Card style={{ flex: 1, minWidth: 260 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.dark, marginBottom: 4 }}>Ask Distribution</div>
              <div style={{ fontSize: 10, color: C.t4, marginBottom: 14 }}>Grants by ask range</div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 100 }}>
                {ana.askHist.map((b, i) => {
                  const mx = Math.max(...ana.askHist.map(x => x.value), 1);
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      {b.value > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: C.t1, fontFamily: MONO }}>{b.value}</div>}
                      <div style={{
                        width: "100%", maxWidth: 36, borderRadius: "5px 5px 0 0",
                        height: `${Math.max(3, (b.value / mx) * 70)}px`,
                        background: C.navy, opacity: 0.2 + (b.value / mx) * 0.8,
                      }} />
                      <div style={{ fontSize: 9, fontWeight: 600, color: C.t4, textAlign: "center" }}>{b.label}</div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* Row D: Team workload + Deadline months */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
            {ana.workload.length > 0 && (
              <Card style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.dark, marginBottom: 4 }}>Team Workload</div>
                <div style={{ fontSize: 10, color: C.t4, marginBottom: 14 }}>Active grants per person</div>
                {ana.workload.map((w, i) => (
                  <HRow key={i} label={w.label} value={w.value} max={ana.workload[0]?.value} color={C.navy} w={80} />
                ))}
              </Card>
            )}
            {ana.months.length > 0 && (
              <Card style={{ flex: 1, minWidth: 240 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.dark, marginBottom: 4 }}>Deadline Pressure</div>
                <div style={{ fontSize: 10, color: C.t4, marginBottom: 14 }}>Submissions by month</div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
                  {ana.months.map((m, i) => {
                    const mx = Math.max(...ana.months.map(x => x.value), 1);
                    return (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                        {m.value > 0 && <div style={{ fontSize: 10, fontWeight: 700, fontFamily: MONO, color: C.t1 }}>{m.value}</div>}
                        <div style={{
                          width: "100%", maxWidth: 32, borderRadius: "4px 4px 0 0",
                          height: `${Math.max(3, (m.value / mx) * 50)}px`,
                          background: C.primary, opacity: 0.3 + (m.value / mx) * 0.7,
                        }} />
                        <div style={{ fontSize: 9, fontWeight: 600, color: C.t4 }}>{m.label}</div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>

          {/* Row E: Focus tags */}
          {ana.tags.length > 0 && (
            <Card style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.dark, marginBottom: 12 }}>Focus Areas</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {ana.tags.map(({ tag, n }) => {
                  const mx = ana.tags[0]?.n || 1;
                  const intensity = n / mx;
                  return (
                    <span key={tag} style={{
                      padding: "4px 12px", borderRadius: 16,
                      background: intensity > 0.7 ? C.primarySoft : C.raised,
                      color: intensity > 0.7 ? C.primary : C.t2,
                      fontSize: Math.round(11 + intensity * 3), fontWeight: intensity > 0.7 ? 700 : 500,
                      border: `1px solid ${intensity > 0.7 ? C.primary + "25" : "transparent"}`,
                    }}>
                      {tag} <span style={{ fontFamily: MONO, fontSize: 9, opacity: 0.6 }}>{n}</span>
                    </span>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Row F: Win/loss factors (if any) */}
          {(ana.winF.length > 0 || ana.lossF.length > 0) && (
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
              {ana.winF.length > 0 && (
                <Card accent={C.ok} style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.dark, marginBottom: 12 }}>Win Factors</div>
                  {ana.winF.map((f, i) => <HRow key={i} label={f.label} value={f.value} max={ana.winF[0]?.value} color={C.ok} w={100} />)}
                </Card>
              )}
              {ana.lossF.length > 0 && (
                <Card accent={C.red} style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.dark, marginBottom: 12 }}>Loss Factors</div>
                  {ana.lossF.map((f, i) => <HRow key={i} label={f.label} value={f.value} max={ana.lossF[0]?.value} color={C.red} w={100} />)}
                </Card>
              )}
            </div>
          )}

          {/* AI-generated insights + strategy — side by side */}
          {(canInsights || canStrategy) && (
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
              {canInsights && onRunInsights && (
                <AIBlock
                  label="Pipeline Insights"
                  sub="Patterns, risks and blind spots in your data"
                  accentColor={C.navy}
                  busy={insightsBusy} result={insightsResult}
                  btnLabel="Analyse" busyLabel="Analysing..."
                  onRun={runAI(setInsightsResult, setInsightsBusy, onRunInsights)}
                />
              )}
              {canStrategy && onRunStrategy && (
                <AIBlock
                  label="Strategic Recommendations"
                  sub="Programme-funder alignment and growth plays"
                  accentColor={C.primary}
                  busy={strategyBusy} result={strategyResult}
                  btnLabel="Advise" busyLabel="Thinking..."
                  onRun={runAI(setStrategyResult, setStrategyBusy, onRunStrategy)}
                />
              )}
            </div>
          )}
        </>
      )}

      {/* Minimum-data nudge */}
      {!ana && (
        <div style={{
          marginTop: 36, padding: "32px 28px", textAlign: "center",
          background: C.warm100, borderRadius: 14, border: `1.5px dashed ${C.line}`,
        }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.t2, marginBottom: 6 }}>Intelligence unlocks at 3+ grants</div>
          <div style={{ fontSize: 12, color: C.t3, maxWidth: 380, margin: "0 auto" }}>
            Add more opportunities to your pipeline to see funder analysis, relationship patterns, deadline pressure, and AI-powered strategic advice.
          </div>
        </div>
      )}
    </div>
  );
}

/* Mini donut — inline SVG */
function MiniDonut({ items, size = 90 }) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  let acc = 0;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <svg width={size} height={size} viewBox="0 0 36 36">
        {items.filter(i => i.value > 0).map((item, i) => {
          const pct = (item.value / total) * 100;
          const offset = 100 - acc;
          acc += pct;
          return (
            <circle key={i} cx="18" cy="18" r="14" fill="none"
              stroke={item.color} strokeWidth="4"
              strokeDasharray={`${pct} ${100 - pct}`}
              strokeDashoffset={offset}
            />
          );
        })}
        <text x="18" y="19" textAnchor="middle" dominantBaseline="middle"
          style={{ fontSize: 7, fontWeight: 700, fill: C.t2, fontFamily: MONO }}
        >{total}</text>
      </svg>
    </div>
  );
}

function tryParse(s) { try { return JSON.parse(s || "{}"); } catch { return {}; } }
