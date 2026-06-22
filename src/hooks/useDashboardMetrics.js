import { useMemo } from "react";
import { C } from "@/theme";
import { dL, deadlineCtx, effectiveAsk } from "@/utils";
import { isFunderReturning } from "@/data/funderStrategy";

const CLOSED = ["won", "lost", "deferred", "archived"];
const PRE_SUB = ["scouted", "vetting", "qualifying", "drafting", "review"];

/** Safe JSON.parse for the stringified `g.ai_data` column → object (never throws). */
function tryParse(s) {
  try { return JSON.parse(s || "{}"); } catch { return {}; }
}

/**
 * Dashboard analytics view-model. All the pure derived computation that used to
 * live as inline `useMemo`s inside Dashboard.jsx — the component now renders
 * directly from these objects and keeps only its own UI/toggle/AI-result state.
 *
 * Behaviour is byte-for-byte identical to the original inline memos:
 *  - `pipe`    active/won/lost lists, totals, weighted value, stage distribution,
 *              sparklines, funnel counts, win rate.
 *  - `ana`     secondary analytics (null until 3+ grants): ask stats + histogram,
 *              funder-type / relationship / workload / focus-tag / deadline-month
 *              aggregation, AI coverage, win/loss factors.
 *  - `funders` per-funder intelligence ([] until 2+ grants), sorted active-first.
 *  - `urgentGrants` the ≤8 "Needs Attention" items, classified + severity-sorted.
 *
 * `teamById` is built once and shared by `ana` (workload names) and the caller
 * (urgent-card avatars).
 *
 * @param deps { grants, team, stages } — `complianceDocs` is intentionally NOT an
 *   input: it only feeds render-time readiness, not these derived numbers.
 * @returns { pipe, ana, funders, urgentGrants, teamById }
 */
export default function useDashboardMetrics({ grants = [], team = [], stages = [] } = {}) {
  /* ── Team lookup (shared across analytics + urgent items) ── */
  const teamById = useMemo(() => {
    const m = new Map();
    if (team) for (const t of team) m.set(t.id, t);
    return m;
  }, [team]);

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
  }, [grants, team, teamById]);

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

  /* ── Urgent "Needs Attention" items ── */
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

  return { pipe, ana, funders, urgentGrants, teamById };
}
