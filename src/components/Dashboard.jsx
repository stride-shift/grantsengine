import { useMemo, useState } from "react";
import { C, FONT, MONO } from "../theme";
import { fmt, dL, deadlineCtx, effectiveAsk } from "../utils";
import { Num, Timeline, Label, Btn, CopyBtn, stripMd } from "./index";

const CLOSED_STAGES = ["won", "lost", "deferred"];
const PRE_SUBMISSION = ["scouted", "qualifying", "drafting", "review"];

const DASH_TABS = [
  { id: "overview", label: "Overview", icon: "\u25A6" },
  { id: "analytics", label: "Analytics", icon: "\uD83D\uDCCA" },
  { id: "insights", label: "Insights", icon: "\uD83D\uDCA1" },
  { id: "strategy", label: "Strategy", icon: "\uD83C\uDFAF" },
];

/* ═══ Inline Chart Components ═══ */

const EmptyState = ({ icon, title, sub }) => (
  <div style={{
    padding: "48px 32px", textAlign: "center",
    background: C.warm100, borderRadius: 16, border: `1.5px dashed ${C.line}`,
  }}>
    <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
    <div style={{ fontSize: 15, fontWeight: 700, color: C.t2, marginBottom: 6 }}>{title}</div>
    <div style={{ fontSize: 13, color: C.t3, maxWidth: 340, margin: "0 auto" }}>{sub}</div>
  </div>
);

const HBar = ({ items, maxVal, colorFn, showPct, suffix = "" }) => {
  const mx = maxVal || Math.max(...items.map(i => i.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 100, fontSize: 11, fontWeight: 600, color: C.t2, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.label}</div>
          <div style={{ flex: 1, height: 18, background: C.raised, borderRadius: 9, overflow: "hidden", position: "relative" }}>
            <div style={{
              height: "100%", borderRadius: 9, minWidth: item.value > 0 ? 12 : 0,
              width: `${Math.max(0, (item.value / mx) * 100)}%`,
              background: colorFn ? colorFn(item, i) : C.primary,
              transition: "width 0.4s ease",
            }} />
          </div>
          <div style={{ width: 48, fontSize: 11, fontWeight: 700, color: C.t1, fontFamily: MONO, textAlign: "right" }}>
            {showPct ? `${Math.round(item.value)}%` : `${item.value}${suffix}`}
          </div>
        </div>
      ))}
    </div>
  );
};

const MiniDonut = ({ items, size = 100 }) => {
  const total = items.reduce((s, i) => s + i.value, 0) || 1;
  let acc = 0;
  const COLORS = [C.primary, C.blue, C.purple, C.amber, C.ok, C.navy, "#EC4899", "#14B8A6"];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <svg width={size} height={size} viewBox="0 0 36 36">
        {items.map((item, i) => {
          const pct = (item.value / total) * 100;
          const offset = 100 - acc;
          acc += pct;
          return (
            <circle key={i} cx="18" cy="18" r="15.9" fill="none"
              stroke={item.color || COLORS[i % COLORS.length]}
              strokeWidth="3.5" strokeDasharray={`${pct} ${100 - pct}`}
              strokeDashoffset={offset} strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: item.color || COLORS[i % COLORS.length] }} />
            <span style={{ color: C.t2, fontWeight: 500 }}>{item.label}</span>
            <span style={{ color: C.t4, fontFamily: MONO, fontWeight: 600 }}>{Math.round((item.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const VertBars = ({ items, height = 120, barColor }) => {
  const mx = Math.max(...items.map(i => i.value), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height }}>
      {items.map((item, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.t2, fontFamily: MONO }}>{item.value}</div>
          <div style={{
            width: "100%", maxWidth: 40, borderRadius: "6px 6px 0 0",
            height: `${Math.max(4, (item.value / mx) * (height - 30))}px`,
            background: barColor || C.primary, opacity: 0.75 + (item.value / mx) * 0.25,
            transition: "height 0.4s ease",
          }} />
          <div style={{ fontSize: 9, fontWeight: 600, color: C.t3, textAlign: "center", whiteSpace: "nowrap" }}>{item.label}</div>
        </div>
      ))}
    </div>
  );
};

/* ═══ Section Card wrapper ═══ */
const Section = ({ title, sub, children, style: sx }) => (
  <div style={{
    padding: "20px 24px", background: C.white, borderRadius: 16,
    boxShadow: C.cardShadow, border: `1.5px solid ${C.line}`, ...sx,
  }}>
    {title && <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, marginBottom: sub ? 2 : 12 }}>{title}</div>}
    {sub && <div style={{ fontSize: 11, color: C.t3, marginBottom: 12 }}>{sub}</div>}
    {children}
  </div>
);

export default function Dashboard({
  grants, team, stages, onSelectGrant, onNavigate,
  onRunBrief, onRunReport, onRunInsights, onRunStrategy, orgName,
}) {
  const [tab, setTab] = useState("overview");
  const [briefBusy, setBriefBusy] = useState(false);
  const [briefResult, setBriefResult] = useState(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportResult, setReportResult] = useState(null);
  const [insightsBusy, setInsightsBusy] = useState(false);
  const [insightsResult, setInsightsResult] = useState(null);
  const [strategyBusy, setStrategyBusy] = useState(false);
  const [strategyResult, setStrategyResult] = useState(null);

  /* ── Pipeline computations (shared) ── */
  const pipe = useMemo(() => {
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

  /* ── Analytics computations (for analytics tab) ── */
  const analytics = useMemo(() => {
    if (grants.length < 3) return null;
    const act = grants.filter(g => !CLOSED_STAGES.includes(g.stage));
    const won = grants.filter(g => g.stage === "won");
    const lost = grants.filter(g => g.stage === "lost");
    const closed = won.length + lost.length;

    // Ask distribution
    const asks = grants.map(g => effectiveAsk(g)).filter(a => a > 0);
    const avgAsk = asks.length ? asks.reduce((s, v) => s + v, 0) / asks.length : 0;
    const sortedAsks = [...asks].sort((a, b) => a - b);
    const medianAsk = sortedAsks.length ? sortedAsks[Math.floor(sortedAsks.length / 2)] : 0;

    // Ask size histogram
    const askBuckets = [
      { label: "<R250K", min: 0, max: 250000 },
      { label: "R250K–500K", min: 250000, max: 500000 },
      { label: "R500K–1M", min: 500000, max: 1000000 },
      { label: "R1M–2M", min: 1000000, max: 2000000 },
      { label: "R2M+", min: 2000000, max: Infinity },
    ];
    const askDist = askBuckets.map(b => ({
      label: b.label,
      value: asks.filter(a => a >= b.min && a < b.max).length,
    }));

    // Funder type breakdown
    const typeMap = new Map();
    for (const g of grants) {
      const t = g.type || "Unknown";
      if (!typeMap.has(t)) typeMap.set(t, { total: 0, won: 0, lost: 0, ask: 0 });
      const e = typeMap.get(t);
      e.total++;
      e.ask += effectiveAsk(g);
      if (g.stage === "won") e.won++;
      if (g.stage === "lost") e.lost++;
    }
    const funderTypes = [...typeMap.entries()].map(([label, v]) => ({
      label, value: v.total, won: v.won, lost: v.lost, ask: v.ask,
      winRate: v.won + v.lost > 0 ? Math.round((v.won / (v.won + v.lost)) * 100) : null,
    })).sort((a, b) => b.value - a.value);

    // Relationship breakdown with win rates
    const relMap = new Map();
    for (const g of grants) {
      const r = g.rel || "Unknown";
      if (!relMap.has(r)) relMap.set(r, { total: 0, won: 0, lost: 0 });
      const e = relMap.get(r);
      e.total++;
      if (g.stage === "won") e.won++;
      if (g.stage === "lost") e.lost++;
    }
    const relationships = [...relMap.entries()].map(([label, v]) => ({
      label, value: v.total,
      winRate: v.won + v.lost > 0 ? Math.round((v.won / (v.won + v.lost)) * 100) : null,
    })).sort((a, b) => b.value - a.value);

    // Team workload
    const ownerMap = new Map();
    for (const g of act) {
      const owner = g.owner || "team";
      const member = team?.find(t => t.id === owner);
      const name = member ? member.name : (owner === "team" ? "Unassigned" : owner);
      ownerMap.set(name, (ownerMap.get(name) || 0) + 1);
    }
    const teamWorkload = [...ownerMap.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

    // Focus area tag cloud
    const focusMap = new Map();
    for (const g of grants) {
      for (const tag of (g.focus || [])) {
        focusMap.set(tag, (focusMap.get(tag) || 0) + 1);
      }
    }
    const focusTags = [...focusMap.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count);

    // Deadline distribution by month
    const monthMap = new Map();
    for (const g of grants) {
      if (!g.deadline) continue;
      const d = new Date(g.deadline);
      if (isNaN(d.getTime())) continue;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-ZA", { month: "short", year: "2-digit" });
      if (!monthMap.has(key)) monthMap.set(key, { label, value: 0 });
      monthMap.get(key).value++;
    }
    const deadlinesByMonth = [...monthMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, v]) => v).slice(-12);

    // AI coverage
    const withDraft = grants.filter(g => g.aiDraft || (g.ai_data && JSON.parse(g.ai_data || "{}").draft)).length;
    const withResearch = grants.filter(g => g.aiResearch || (g.ai_data && JSON.parse(g.ai_data || "{}").research)).length;
    const withFit = grants.filter(g => g.aiFitscore || (g.ai_data && JSON.parse(g.ai_data || "{}").fitscore)).length;
    const aiCoverage = grants.length > 0 ? Math.round(((withDraft + withResearch + withFit) / (grants.length * 3)) * 100) : 0;
    const aiUsage = [
      { label: "Drafts", value: withDraft },
      { label: "Research", value: withResearch },
      { label: "Fit Scores", value: withFit },
    ];

    // No-deadline count
    const noDeadline = act.filter(g => !g.deadline).length;

    // Win/loss factors
    const winFactors = new Map();
    const lossFactors = new Map();
    for (const g of won) {
      for (const f of (g.on || "").split(",").map(s => s.trim()).filter(Boolean)) {
        winFactors.set(f, (winFactors.get(f) || 0) + 1);
      }
    }
    for (const g of lost) {
      for (const f of (g.of || []).flat().map(s => typeof s === "string" ? s : "").filter(Boolean)) {
        lossFactors.set(f, (lossFactors.get(f) || 0) + 1);
      }
    }
    const winFactorItems = [...winFactors.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
    const lossFactorItems = [...lossFactors.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);

    return {
      avgAsk, medianAsk, winRate: closed > 0 ? Math.round((won.length / closed) * 100) : null,
      aiCoverage, noDeadline,
      funderTypes, askDist, relationships, teamWorkload,
      focusTags, deadlinesByMonth, aiUsage,
      winFactorItems, lossFactorItems,
      hasFactors: winFactorItems.length > 0 || lossFactorItems.length > 0,
    };
  }, [grants, team]);

  // Thresholds for AI tabs
  const uniqueStages = new Set(grants.map(g => g.stage));
  const canInsights = grants.length >= 5 && uniqueStages.size >= 2;
  const canStrategy = grants.length >= 5 && (pipe.won.length > 0 || pipe.lost.length > 0);

  /* ═══ Tab pill bar ═══ */
  const tabBar = (
    <div style={{
      display: "inline-flex", gap: 4, padding: 4, marginBottom: 24,
      background: C.raised, borderRadius: 14,
    }}>
      {DASH_TABS.map(t => (
        <button key={t.id} onClick={() => setTab(t.id)} style={{
          padding: "8px 18px", borderRadius: 10, border: "none", cursor: "pointer",
          fontFamily: FONT, fontSize: 13, fontWeight: tab === t.id ? 700 : 500,
          background: tab === t.id ? C.white : "transparent",
          color: tab === t.id ? C.primary : C.t3,
          boxShadow: tab === t.id ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
          transition: "all 0.2s ease",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ fontSize: 14 }}>{t.icon}</span>
          {t.label}
        </button>
      ))}
    </div>
  );

  /* ═══ AI card helper (shared for insights + strategy) ═══ */
  const AICard = ({ gradient, icon, title, sub, busy, result, onRun, busyText, emptyText, disabled }) => (
    <div style={{
      padding: "20px 24px",
      background: result ? `linear-gradient(135deg, ${gradient}40 0%, ${C.white} 100%)` : C.white,
      borderRadius: 16, boxShadow: C.cardShadow,
      border: result ? `1.5px solid ${gradient}15` : `1.5px solid ${C.line}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: result ? 16 : 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
            background: result ? `${gradient}30` : `linear-gradient(135deg, ${gradient} 0%, ${C.blue}CC 100%)`,
            color: result ? C.dark : "#fff", fontSize: 16, fontWeight: 700,
            animation: busy ? "ge-pulse 1.4s ease-in-out infinite" : "none",
          }}>{busy ? "\u2026" : result ? "\u2713" : icon}</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>{title}</div>
            <div style={{ fontSize: 11, color: C.t3 }}>{result ? sub : emptyText}</div>
          </div>
        </div>
        <Btn
          v={result ? "ghost" : "primary"}
          onClick={onRun}
          disabled={busy || disabled}
          style={{ fontSize: 12, padding: "7px 16px" }}
        >{busy ? busyText : result ? "\u21bb Refresh" : "Generate"}</Btn>
      </div>
      {result && (
        <div style={{
          padding: "16px 18px", background: C.white, borderRadius: 12,
          border: `1px solid ${C.line}`, fontSize: 13, lineHeight: 1.85,
          color: C.t1, whiteSpace: "pre-wrap", maxHeight: 500, overflow: "auto",
          position: "relative",
        }}>
          {stripMd(result)}
          <CopyBtn text={result} style={{ position: "absolute", top: 8, right: 8 }} />
        </div>
      )}
    </div>
  );

  return (
    <div style={{ padding: "32px 36px", maxWidth: 1200 }}>
      {/* Header with red accent bar */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: C.dark, marginBottom: 6, letterSpacing: -0.5 }}>{orgName || "Dashboard"}</div>
        <div style={{ width: 40, height: 4, background: C.primary, borderRadius: 2, marginBottom: 8 }} />
        <div style={{ fontSize: 14, color: C.t3, fontWeight: 400 }}>Pipeline overview {"\u00b7"} {new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
      </div>

      {/* Tab bar */}
      {tabBar}

      {/* ═══════════════════════ OVERVIEW TAB ═══════════════════════ */}
      {tab === "overview" && (
        <>
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
                    {stripMd(briefResult)}
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
                    {stripMd(reportResult)}
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
                {(() => { const tbd = pipe.act.filter(g => !g.ask || g.ask === 0).length; return tbd > 0 ? <span style={{ color: C.t4, marginLeft: 4 }}>{"\u00b7"} {tbd} TBD</span> : null; })()}
              </div>
            </div>
            <Num label="Weighted" value={fmt(pipe.weightedVal)} sub="Probability-adjusted" accent={C.navy} color={C.navy} />
            <Num label="Won" value={pipe.won.length > 0 ? fmt(pipe.wonV) : "\u2014"} sub={pipe.won.length > 0 ? `${pipe.won.length} grants` : "No grants won yet"} color={C.ok} accent={C.ok} sparkData={pipe.sparkWon} sparkColor={C.ok} />
            <Num label="Grants" value={grants.length} sub={`${pipe.act.length} active`} accent={C.blue} />
          </div>

          {/* Pipeline Health bar */}
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
                    <div className="ge-hover-bar" style={{ width: "100%", height: 8, borderRadius: 4, background: s.c, opacity: 0.8 }} />
                    <div style={{ fontSize: 9, fontWeight: 700, color: s.c }}>{s.n}</div>
                    <div style={{ fontSize: 8, color: C.t4, fontWeight: 600 }}>{s.label}</div>
                  </div>
                );
              })}
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

          {/* Submission Timeline */}
          <Timeline grants={grants} stages={stages} team={team} onClickGrant={onSelectGrant} />

          {/* Stage breakdown */}
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
        </>
      )}

      {/* ═══════════════════════ ANALYTICS TAB ═══════════════════════ */}
      {tab === "analytics" && (
        <>
          {!analytics ? (
            <EmptyState
              icon="\uD83D\uDCCA"
              title="Not enough data yet"
              sub="Add at least 3 grants to your pipeline to unlock analytics. Start scouting opportunities to build your dataset."
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Row 1: KPI cards */}
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <Num label="Avg Ask" value={fmt(analytics.avgAsk)} sub={`Median: ${fmt(analytics.medianAsk)}`} accent={C.primary} />
                <Num label="Win Rate" value={analytics.winRate !== null ? `${analytics.winRate}%` : "\u2014"} sub={analytics.winRate !== null ? `${pipe.won.length}W / ${pipe.lost.length}L` : "No closed grants"} accent={analytics.winRate !== null && analytics.winRate >= 50 ? C.ok : analytics.winRate !== null ? C.amber : C.t4} color={analytics.winRate !== null && analytics.winRate >= 50 ? C.ok : analytics.winRate !== null ? C.amber : C.t4} />
                <Num label="AI Coverage" value={`${analytics.aiCoverage}%`} sub="Drafts + Research + Fit" accent={C.purple} color={C.purple} />
                <Num label="No Deadline" value={analytics.noDeadline} sub={analytics.noDeadline > 0 ? "Need dates set" : "All deadlines set"} accent={analytics.noDeadline > 0 ? C.amber : C.ok} color={analytics.noDeadline > 0 ? C.amber : C.ok} />
              </div>

              {/* Row 2: Funder Type + Ask Distribution */}
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <Section title="Funder Type Breakdown" sub={`${analytics.funderTypes.length} types across ${grants.length} grants`} style={{ flex: 1, minWidth: 300 }}>
                  <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <HBar items={analytics.funderTypes} colorFn={(item, i) => [C.primary, C.blue, C.purple, C.amber, C.ok][i % 5]} />
                    </div>
                    <MiniDonut items={analytics.funderTypes.map((f, i) => ({ ...f, color: [C.primary, C.blue, C.purple, C.amber, C.ok][i % 5] }))} />
                  </div>
                </Section>
                <Section title="Ask Size Distribution" sub="Number of grants by ask range" style={{ flex: 1, minWidth: 280 }}>
                  <VertBars items={analytics.askDist} barColor={C.blue} />
                </Section>
              </div>

              {/* Row 3: Relationship + Team Workload */}
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                <Section title="Relationship Status" sub="Win rate by relationship type" style={{ flex: 1, minWidth: 280 }}>
                  <HBar
                    items={analytics.relationships.map(r => ({
                      ...r,
                      label: `${r.label}${r.winRate !== null ? ` (${r.winRate}%)` : ""}`,
                    }))}
                    colorFn={(item) => {
                      const r = analytics.relationships.find(rel => item.label.startsWith(rel.label));
                      if (!r || r.winRate === null) return C.t4;
                      return r.winRate >= 60 ? C.ok : r.winRate >= 30 ? C.amber : C.red;
                    }}
                  />
                </Section>
                <Section title="Team Workload" sub="Active grants per team member" style={{ flex: 1, minWidth: 280 }}>
                  {analytics.teamWorkload.length > 0 ? (
                    <HBar items={analytics.teamWorkload} colorFn={() => C.navy} />
                  ) : (
                    <div style={{ fontSize: 12, color: C.t3, padding: 16, textAlign: "center" }}>No active grants assigned</div>
                  )}
                </Section>
              </div>

              {/* Row 4: Focus Area Tag Cloud */}
              {analytics.focusTags.length > 0 && (
                <Section title="Focus Areas" sub="Most common funding themes">
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {analytics.focusTags.map(({ tag, count }) => {
                      const maxCount = analytics.focusTags[0]?.count || 1;
                      const scale = 0.7 + (count / maxCount) * 0.5;
                      return (
                        <span key={tag} style={{
                          padding: "5px 14px", borderRadius: 20,
                          background: count === maxCount ? C.primarySoft : C.raised,
                          color: count === maxCount ? C.primary : C.t2,
                          fontSize: Math.round(12 * scale), fontWeight: count === maxCount ? 700 : 500,
                          border: `1px solid ${count === maxCount ? C.primary + "30" : C.line}`,
                        }}>
                          {tag} <span style={{ fontFamily: MONO, fontSize: 10, opacity: 0.7 }}>{count}</span>
                        </span>
                      );
                    })}
                  </div>
                </Section>
              )}

              {/* Row 5: Deadline Distribution + AI Usage */}
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                {analytics.deadlinesByMonth.length > 0 && (
                  <Section title="Deadline Distribution" sub="Grants due by month" style={{ flex: 1, minWidth: 280 }}>
                    <VertBars items={analytics.deadlinesByMonth} barColor={C.primary} />
                  </Section>
                )}
                <Section title="AI Tool Usage" sub="Grants with AI-generated content" style={{ flex: 1, minWidth: 280 }}>
                  <HBar items={analytics.aiUsage} colorFn={() => C.purple} />
                </Section>
              </div>

              {/* Row 6: Win/Loss Factor Analysis */}
              {analytics.hasFactors && (
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                  {analytics.winFactorItems.length > 0 && (
                    <Section title="\u2705 Win Factors" sub="What's working" style={{ flex: 1, minWidth: 280 }}>
                      <HBar items={analytics.winFactorItems} colorFn={() => C.ok} />
                    </Section>
                  )}
                  {analytics.lossFactorItems.length > 0 && (
                    <Section title="\u274C Loss Factors" sub="Areas to improve" style={{ flex: 1, minWidth: 280 }}>
                      <HBar items={analytics.lossFactorItems} colorFn={() => C.red} />
                    </Section>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════ INSIGHTS TAB ═══════════════════════ */}
      {tab === "insights" && (
        <>
          {!canInsights ? (
            <EmptyState
              icon="\uD83D\uDCA1"
              title="Need more pipeline data"
              sub="Add at least 5 grants across 2+ stages to unlock AI-powered insights. The more data, the deeper the analysis."
            />
          ) : (
            <AICard
              gradient={C.purple}
              icon="\uD83D\uDCA1"
              title="Pipeline Insights"
              sub="Non-obvious patterns, risks, and opportunities"
              busy={insightsBusy}
              result={insightsResult}
              busyText="Analysing..."
              emptyText="AI analysis of your pipeline data"
              onRun={async () => {
                setInsightsBusy(true);
                try {
                  const r = await onRunInsights();
                  setInsightsResult(r);
                } catch (e) { setInsightsResult(`Error: ${e.message}`); }
                setInsightsBusy(false);
              }}
            />
          )}
        </>
      )}

      {/* ═══════════════════════ STRATEGY TAB ═══════════════════════ */}
      {tab === "strategy" && (
        <>
          {!canStrategy ? (
            <EmptyState
              icon="\uD83C\uDFAF"
              title="Need outcome data"
              sub="Win or lose at least 1 grant (with 5+ total) to unlock strategic recommendations. The AI needs outcome signals to reason about strategy."
            />
          ) : (
            <AICard
              gradient={C.blue}
              icon="\uD83C\uDFAF"
              title="Strategic Recommendations"
              sub="Align programmes with funding patterns"
              busy={strategyBusy}
              result={strategyResult}
              busyText="Thinking strategically..."
              emptyText="AI strategic advice for programme-funder alignment"
              onRun={async () => {
                setStrategyBusy(true);
                try {
                  const r = await onRunStrategy();
                  setStrategyResult(r);
                } catch (e) { setStrategyResult(`Error: ${e.message}`); }
                setStrategyBusy(false);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
