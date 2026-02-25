import { useMemo, useState, useEffect } from "react";
import { C, FONT, MONO } from "../theme";
import { fmt, fmtK, dL, deadlineCtx, effectiveAsk, grantReadiness } from "../utils";
import { Num, Timeline, Label, Btn, CopyBtn, stripMd, TypeBadge, DeadlineBadge, Avatar } from "./index";
import { isFunderReturning } from "../data/funderStrategy";

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
  grants, team, stages, complianceDocs = [], onSelectGrant, onNavigate,
  onRunReport, onRunInsights, onRunStrategy, orgName,
}) {
  const [reportBusy, setReportBusy] = useState(false);
  const [reportResult, setReportResult] = useState(null);
  const [insightsBusy, setInsightsBusy] = useState(false);
  const [insightsResult, setInsightsResult] = useState(null);
  const [strategyBusy, setStrategyBusy] = useState(false);
  const [strategyResult, setStrategyResult] = useState(null);
  const [expandedFunder, setExpandedFunder] = useState(null);
  const [showFullIntel, setShowFullIntel] = useState(false);

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

  /* ── Analytics computations (single-pass where possible) ── */
  const ana = useMemo(() => {
    if (grants.length < 3) return null;

    // Single pass: categorise grants and collect all aggregates at once
    const act = [], won = [], lost = [];
    const asks = [];
    const tm = new Map();   // funder types
    const rm = new Map();   // relationships
    const om = new Map();   // owner workload
    const fm = new Map();   // focus tags
    const dm = new Map();   // deadline months
    const wf = new Map(), lf = new Map(); // win/loss factors
    let aiD = 0, aiR = 0, aiF = 0, noDL = 0;
    // Ask histogram bins — single-pass bucketing
    const histCounts = [0, 0, 0, 0, 0];
    const histThresholds = [250000, 500000, 1000000, 2000000];
    const histLabels = ["<250K", "250-500K", "500K-1M", "1-2M", "2M+"];

    // Build team lookup once
    const teamById = new Map();
    if (team) for (const t of team) teamById.set(t.id, t);

    for (const g of grants) {
      const ask = effectiveAsk(g);
      const isWon = g.stage === "won";
      const isLost = g.stage === "lost";
      const isActive = !CLOSED.includes(g.stage);

      // Categorise
      if (isWon) won.push(g);
      else if (isLost) lost.push(g);
      else if (isActive) act.push(g);

      // Ask stats
      if (ask > 0) {
        asks.push(ask);
        // Histogram bucketing
        let bucket = 4; // "2M+" default
        for (let i = 0; i < histThresholds.length; i++) {
          if (ask < histThresholds[i]) { bucket = i; break; }
        }
        histCounts[bucket]++;
      }

      // Funder types
      const ft = g.type || "Unknown";
      if (!tm.has(ft)) tm.set(ft, { n: 0, won: 0, lost: 0, ask: 0 });
      const te = tm.get(ft); te.n++; te.ask += ask;
      if (isWon) te.won++; if (isLost) te.lost++;

      // Relationships
      const rel = g.rel || "Unknown";
      if (!rm.has(rel)) rm.set(rel, { n: 0, won: 0, lost: 0 });
      const re = rm.get(rel); re.n++;
      if (isWon) re.won++; if (isLost) re.lost++;

      // Team workload (active only)
      if (isActive) {
        const oid = g.owner || "team";
        const m = teamById.get(oid);
        const name = m ? m.name : oid === "team" ? "Unassigned" : oid;
        om.set(name, (om.get(name) || 0) + 1);
        if (!g.deadline) noDL++;
      }

      // Focus tags
      if (g.focus) for (const tag of g.focus) fm.set(tag, (fm.get(tag) || 0) + 1);

      // Deadline months
      if (g.deadline) {
        const d = new Date(g.deadline);
        if (!isNaN(d.getTime())) {
          const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          if (!dm.has(k)) dm.set(k, { label: d.toLocaleDateString("en-ZA", { month: "short" }), value: 0 });
          dm.get(k).value++;
        }
      }

      // AI coverage
      const ai = tryParse(g.ai_data);
      if (g.aiDraft || ai?.aiDraft) aiD++;
      if (g.aiResearch || ai?.aiResearch) aiR++;
      if (g.aiFitscore || ai?.aiFitscore) aiF++;

      // Win/loss factors
      if (isWon) for (const fac of (g.on || "").split(",").map(s => s.trim()).filter(Boolean)) wf.set(fac, (wf.get(fac) || 0) + 1);
      if (isLost) for (const fac of (g.of || []).flat().filter(s => typeof s === "string" && s)) lf.set(fac, (lf.get(fac) || 0) + 1);
    }

    const closed = won.length + lost.length;

    // Ask stats
    const avgAsk = asks.length ? asks.reduce((s, v) => s + v, 0) / asks.length : 0;
    const sorted = [...asks].sort((a, b) => a - b);
    const medianAsk = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
    const askHist = histLabels.map((label, i) => ({ label, value: histCounts[i] }));

    const fTypes = [...tm.entries()].map(([label, v]) => ({
      label, n: v.n, won: v.won, lost: v.lost, ask: v.ask,
      wr: v.won + v.lost > 0 ? Math.round((v.won / (v.won + v.lost)) * 100) : null,
    })).sort((a, b) => b.n - a.n);

    const rels = [...rm.entries()].map(([label, v]) => ({
      label, n: v.n,
      wr: v.won + v.lost > 0 ? Math.round((v.won / (v.won + v.lost)) * 100) : null,
    })).sort((a, b) => b.n - a.n);

    const workload = [...om.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    const tags = [...fm.entries()].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n);
    const months = [...dm.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v).slice(-8);
    const aiPct = grants.length > 0 ? Math.round(((aiD + aiR + aiF) / (grants.length * 3)) * 100) : 0;
    const winF = [...wf.entries()].map(([l, v]) => ({ label: l, value: v })).sort((a, b) => b.value - a.value).slice(0, 6);
    const lossF = [...lf.entries()].map(([l, v]) => ({ label: l, value: v })).sort((a, b) => b.value - a.value).slice(0, 6);

    return {
      avgAsk, medianAsk, aiPct, noDL, askHist, fTypes, rels, workload, tags, months,
      aiD, aiR, aiF, winF, lossF,
      wr: closed > 0 ? Math.round((won.length / closed) * 100) : null,
    };
  }, [grants, team]);

  /* ── Funder Intelligence aggregation ── */
  const funders = useMemo(() => {
    if (grants.length < 2) return [];
    const fm = new Map();
    for (const g of grants) {
      const name = g.funder || "Unknown";
      if (!fm.has(name)) fm.set(name, {
        name, type: g.type, grants: [], active: 0, won: 0, lost: 0,
        totalAsk: 0, wonVal: 0, activeAsk: 0,
        stages: new Map(), rels: new Set(), focus: new Set(),
        hasResearch: false, hasDraft: false, hasFitscore: false,
        latestResearchSnippet: null, latestResearchAt: null,
        returning: isFunderReturning(name),
        latestActivity: null, nextDeadline: null,
      });
      const f = fm.get(name);
      // Update type if better match (non-null)
      if (g.type && !f.type) f.type = g.type;
      f.grants.push(g);
      const ask = effectiveAsk(g);
      f.totalAsk += ask;
      if (g.stage === "won") { f.won++; f.wonVal += ask; }
      else if (g.stage === "lost") { f.lost++; }
      else if (!CLOSED.includes(g.stage)) { f.active++; f.activeAsk += ask; }
      f.stages.set(g.stage, (f.stages.get(g.stage) || 0) + 1);
      if (g.rel) f.rels.add(g.rel);
      for (const tag of (g.focus || [])) f.focus.add(tag);

      // AI coverage
      const ai = tryParse(g.ai_data);
      if (g.aiResearch || ai?.aiResearch) {
        f.hasResearch = true;
        const res = g.aiResearch || ai?.aiResearch;
        const resAt = g.aiResearchAt || ai?.aiResearchAt;
        if (res && (!f.latestResearchAt || (resAt && resAt > f.latestResearchAt))) {
          f.latestResearchAt = resAt;
          f.latestResearchSnippet = typeof res === "string" ? res.slice(0, 300) : null;
        }
      }
      if (g.aiDraft || ai?.aiDraft) f.hasDraft = true;
      if (g.aiFitscore || ai?.aiFitscore) f.hasFitscore = true;

      // Latest activity from log
      const log = Array.isArray(g.log) ? g.log : [];
      for (const entry of log) {
        if (entry.d && (!f.latestActivity || entry.d > f.latestActivity)) f.latestActivity = entry.d;
      }

      // Next deadline (earliest future deadline)
      if (g.deadline && !CLOSED.includes(g.stage)) {
        const days = dL(g.deadline);
        if (days !== null && days >= 0) {
          if (!f.nextDeadline || g.deadline < f.nextDeadline) f.nextDeadline = g.deadline;
        }
      }
    }

    return [...fm.values()]
      .filter(f => f.name !== "Unknown")
      .sort((a, b) => {
        // Sort: active grants first (by active ask), then by total value
        if (a.active > 0 && b.active === 0) return -1;
        if (b.active > 0 && a.active === 0) return 1;
        return b.totalAsk - a.totalAsk;
      });
  }, [grants]);

  const canInsights = grants.length >= 5 && new Set(grants.map(g => g.stage)).size >= 2;
  const canStrategy = grants.length >= 5 && (pipe.won.length > 0 || pipe.lost.length > 0);

  const runAI = (setter, busySetter, handler) => async () => {
    busySetter(true);
    try { const r = await handler(); setter(r); }
    catch (e) { setter(`Error: ${e.message}`); }
    busySetter(false);
  };

  /* ── Build urgent/action items for Today view ── */
  const teamById = useMemo(() => {
    const m = new Map();
    if (team) for (const t of team) m.set(t.id, t);
    return m;
  }, [team]);

  const urgentGrants = useMemo(() => {
    const items = [];
    // 1. Overdue / needs action
    for (const g of pipe.needsAction) {
      const d = dL(g.deadline);
      items.push({ g, reason: d < 0 ? `${Math.abs(d)}d overdue` : `${d}d left`, severity: d < 0 ? 0 : 1, color: C.red });
    }
    // 2. Approaching deadlines (within 14 days)
    for (const g of pipe.approaching) {
      if (!items.find(i => i.g.id === g.id)) {
        const d = dL(g.deadline);
        items.push({ g, reason: `${d}d to deadline`, severity: 2, color: C.amber });
      }
    }
    // 3. Active grants with no deadline set (top 5)
    const noDL = pipe.act.filter(g => !g.deadline && !items.find(i => i.g.id === g.id)).slice(0, 3);
    for (const g of noDL) {
      items.push({ g, reason: "No deadline set", severity: 3, color: C.t4 });
    }
    // 4. Unassigned active grants (top 3)
    const unassigned = pipe.act.filter(g => (!g.owner || g.owner === "team") && !items.find(i => i.g.id === g.id)).slice(0, 3);
    for (const g of unassigned) {
      items.push({ g, reason: "Unassigned", severity: 4, color: C.purple });
    }
    return items.sort((a, b) => a.severity - b.severity).slice(0, 8);
  }, [pipe]);

  return (
    <div style={{ padding: "32px 36px", maxWidth: 1200 }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: C.dark, letterSpacing: -0.5 }}>Today</div>
        <div style={{ width: 36, height: 3, background: C.primary, borderRadius: 2, marginTop: 6, marginBottom: 6 }} />
        <div style={{ fontSize: 13, color: C.t4, fontWeight: 400 }}>
          {new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          {orgName && <span style={{ marginLeft: 8, color: C.t3, fontWeight: 500 }}>{orgName}</span>}
        </div>
      </div>

      {/* ═══════════ EMPTY STATE — onboarding ═══════════ */}
      {grants.length === 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 420 }}>
          <div style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
            <div style={{
              width: 72, height: 72, borderRadius: 20, margin: "0 auto 24px",
              background: `linear-gradient(135deg, ${C.purpleSoft} 0%, ${C.blueSoft} 100%)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: `1.5px solid ${C.purple}15`,
            }}>
              <span style={{ fontSize: 32 }}>☉</span>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.dark, marginBottom: 8, letterSpacing: -0.3 }}>
              Welcome to Grant Engine
            </div>
            <div style={{ fontSize: 14, color: C.t3, lineHeight: 1.6, maxWidth: 400, margin: "0 auto 28px" }}>
              Start by scouting for grant opportunities. AI will find funders matched to your organisation profile.
            </div>
            <button onClick={() => onNavigate?.("pipeline")} style={{
              fontSize: 15, padding: "12px 32px", borderRadius: 12, border: "none",
              background: `linear-gradient(135deg, ${C.purple} 0%, ${C.blue}DD 100%)`,
              color: "#fff", fontWeight: 700, cursor: "pointer", fontFamily: FONT,
              boxShadow: `0 4px 14px ${C.purple}30`,
            }}>
              Go to Pipeline →
            </button>
          </div>
        </div>
      )}

      {/* ═══════════ 1. URGENT ACTION CARDS ═══════════ */}
      {grants.length > 0 && urgentGrants.length > 0 && (
        <>
          <Hd>Needs Attention</Hd>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10, marginBottom: 8 }}>
            {urgentGrants.map(({ g, reason, color }) => {
              const stg = (stages || []).find(s => s.id === g.stage);
              const m = teamById.get(g.owner);
              const r = grantReadiness(g, complianceDocs);
              return (
                <div key={g.id} onClick={() => onSelectGrant?.(g.id)}
                  className="ge-hover-lift"
                  style={{
                    padding: "14px 18px", background: C.white, borderRadius: 14,
                    border: `1.5px solid ${color}25`, boxShadow: C.cardShadow,
                    cursor: "pointer", borderLeft: `4px solid ${color}`,
                  }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{g.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: color + "15", color, flexShrink: 0, marginLeft: 8 }}>{reason}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: C.t3 }}>{g.funder}</span>
                    <span style={{ width: 4, height: 4, borderRadius: 2, background: C.t4 }} />
                    <span style={{ fontSize: 11, color: stg?.c || C.t4, fontWeight: 600 }}>{stg?.label}</span>
                    <span style={{ width: 4, height: 4, borderRadius: 2, background: C.t4 }} />
                    <span style={{ fontSize: 11, fontWeight: 600, fontFamily: MONO, color: C.t2 }}>{g.ask > 0 ? fmtK(g.ask) : "TBD"}</span>
                  </div>
                  {/* Readiness + quick actions */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {m && <Avatar member={m} size={18} />}
                    <div style={{ flex: 1, height: 4, borderRadius: 2, background: C.line, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${r.score}%`, background: r.score >= 80 ? C.ok : r.score >= 50 ? C.amber : C.red, borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: MONO, color: r.score >= 80 ? C.ok : r.score >= 50 ? C.amber : C.red }}>{r.score}%</span>
                  </div>
                  {r.nextAction && (
                    <div style={{ fontSize: 10, color: C.t3, marginTop: 6, fontWeight: 500 }}>Next: {r.nextAction}</div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {grants.length > 0 && (<>
      {/* ═══════════ 2. COMPACT PIPELINE SUMMARY ═══════════ */}
      <Hd right={
        <button onClick={() => onNavigate?.("pipeline")} style={{
          background: "none", border: "none", fontSize: 11, color: C.primary, fontWeight: 600,
          cursor: "pointer", fontFamily: FONT,
        }}>View Pipeline {"\u2192"}</button>
      }>Pipeline</Hd>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <Card accent={C.primary} className="ge-hover-lift" style={{ flex: "1.4 1 200px", display: "flex", alignItems: "center", gap: 16 }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.t4, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Active Pipeline</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: C.primary, fontFamily: MONO, letterSpacing: -2, lineHeight: 1 }}>{fmt(pipe.ask)}</div>
            <div style={{ fontSize: 11, color: C.t3, marginTop: 6, fontWeight: 500 }}>{pipe.act.length} grants</div>
          </div>
          {pipe.sparkPipeline && <Spark data={pipe.sparkPipeline} color={C.primary} w={60} h={28} />}
        </Card>
        <Num label="Weighted" value={fmt(pipe.weightedVal)} sub="Probability-adjusted" accent={C.navy} color={C.navy} />
        <Num label="Won" value={pipe.won.length > 0 ? fmt(pipe.wonV) : "\u2014"} sub={pipe.won.length > 0 ? `${pipe.won.length} grant${pipe.won.length !== 1 ? "s" : ""}` : "No wins yet"} color={C.ok} accent={C.ok} sparkData={pipe.sparkWon} sparkColor={C.ok} />
        {pipe.winRate !== null && (
          <Num label="Win Rate" value={`${pipe.winRate}%`} sub={`${pipe.won.length}W / ${pipe.lost.length}L`} accent={pipe.winRate >= 50 ? C.ok : C.amber} color={pipe.winRate >= 50 ? C.ok : C.amber} />
        )}
      </div>

      {/* Funnel bar */}
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
      </Card>

      {/* ── Submission Timeline ── */}
      <Timeline grants={grants} stages={stages} team={team} onClickGrant={onSelectGrant} />

      {/* ═══════════ 3b. UPCOMING FOLLOW-UPS ═══════════ */}
      {(() => {
        const now = new Date().toISOString().slice(0, 10);
        const upcoming = [];
        for (const g of grants) {
          if (!g.fups || !Array.isArray(g.fups)) continue;
          for (const fup of g.fups) {
            if (fup.done) continue;
            const daysUntil = Math.ceil((new Date(fup.date) - new Date()) / 864e5);
            if (daysUntil >= -7 && daysUntil <= 30) {
              upcoming.push({ grant: g, fup, daysUntil });
            }
          }
        }
        upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
        if (upcoming.length === 0) return null;
        return (
          <>
            <Hd>Upcoming Follow-ups</Hd>
            <Card style={{ marginBottom: 8, padding: "14px 18px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {upcoming.slice(0, 6).map((item, i) => {
                  const isOverdue = item.daysUntil < 0;
                  const isToday = item.daysUntil === 0;
                  const isSoon = item.daysUntil > 0 && item.daysUntil <= 7;
                  const c = isOverdue ? C.red : isToday ? C.amber : isSoon ? C.amber : C.t3;
                  const stg = (stages || []).find(s => s.id === item.grant.stage);
                  return (
                    <div key={`${item.grant.id}-${i}`}
                      onClick={() => onSelectGrant?.(item.grant.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                        borderRadius: 8, cursor: "pointer", transition: "background 0.1s",
                        borderLeft: `3px solid ${c}`,
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = C.hover}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <div style={{
                        fontSize: 10, fontWeight: 700, fontFamily: MONO, minWidth: 50,
                        color: c,
                      }}>
                        {isOverdue ? `${Math.abs(item.daysUntil)}d ago` : isToday ? "Today" : `${item.daysUntil}d`}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {item.fup.label}
                        </div>
                        <div style={{ fontSize: 10, color: C.t3, marginTop: 1 }}>
                          {item.grant.name} — {item.grant.funder}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                        background: (stg?.c || C.t4) + "15", color: stg?.c || C.t4,
                      }}>{stg?.label || item.grant.stage}</span>
                    </div>
                  );
                })}
                {upcoming.length > 6 && (
                  <div style={{ fontSize: 11, color: C.t4, textAlign: "center", paddingTop: 4 }}>+{upcoming.length - 6} more follow-ups</div>
                )}
              </div>
            </Card>
          </>
        );
      })()}

      {/* ═══════════ 4. AI TOOLS (Report, Insights, Strategy) ═══════════ */}
      <Hd>AI Tools</Hd>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 8 }}>
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

          {/* Row B: Funder types */}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
            <Card style={{ flex: 1, minWidth: 300 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.dark, marginBottom: 4 }}>Funder Types</div>
              <div style={{ fontSize: 10, color: C.t4, marginBottom: 14 }}>{ana.fTypes.length} types across {grants.length} grants</div>
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <MiniDonut items={ana.fTypes.map((f, i) => ({ label: f.label.replace("Corporate ", "").replace("Government/", "Gov/"), value: f.n, color: FTYPE_COLORS[i % 5] }))} />
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
          </div>

          {/* ═══════════ FUNDER INTELLIGENCE CARDS (collapsed by default) ═══════════ */}
          {funders.length > 0 && (
            <>
              <Hd right={
                <button onClick={() => setShowFullIntel(!showFullIntel)} style={{
                  background: "none", border: "none", fontSize: 11, color: C.primary, fontWeight: 600,
                  cursor: "pointer", fontFamily: FONT,
                }}>{showFullIntel ? "Collapse" : `Show all ${funders.length} funders`}</button>
              }>
                Funder Intelligence
              </Hd>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12, marginBottom: 20 }}>
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
                        background: C.white, borderRadius: 14,
                        boxShadow: isExpanded ? C.cardShadowHover : C.cardShadow,
                        border: isExpanded ? `1.5px solid ${C.primary}30` : `1px solid ${C.line}`,
                        cursor: "pointer", transition: "all 0.2s ease",
                        overflow: "hidden",
                      }}>
                      {/* ── Card Header ── */}
                      <div style={{ padding: "16px 20px 12px" }}>
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
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
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
                          borderTop: `1px solid ${C.line}`, padding: "14px 20px 18px",
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
          )}

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
                {(() => {
                  const mx = Math.max(...ana.askHist.map(x => x.value), 1);
                  return ana.askHist.map((b, i) => (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                      {b.value > 0 && <div style={{ fontSize: 10, fontWeight: 700, color: C.t1, fontFamily: MONO }}>{b.value}</div>}
                      <div style={{
                        width: "100%", maxWidth: 36, borderRadius: "5px 5px 0 0",
                        height: `${Math.max(3, (b.value / mx) * 70)}px`,
                        background: C.navy, opacity: 0.2 + (b.value / mx) * 0.8,
                      }} />
                      <div style={{ fontSize: 9, fontWeight: 600, color: C.t4, textAlign: "center" }}>{b.label}</div>
                    </div>
                  ));
                })()}
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
                  {(() => {
                    const mx = Math.max(...ana.months.map(x => x.value), 1);
                    return ana.months.map((m, i) => (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                        {m.value > 0 && <div style={{ fontSize: 10, fontWeight: 700, fontFamily: MONO, color: C.t1 }}>{m.value}</div>}
                        <div style={{
                          width: "100%", maxWidth: 32, borderRadius: "4px 4px 0 0",
                          height: `${Math.max(3, (m.value / mx) * 50)}px`,
                          background: C.primary, opacity: 0.3 + (m.value / mx) * 0.7,
                        }} />
                        <div style={{ fontSize: 9, fontWeight: 600, color: C.t4 }}>{m.label}</div>
                      </div>
                    ));
                  })()}
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
      </>)}

      {/* Minimum-data nudge */}
      {!ana && grants.length > 0 && (
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
