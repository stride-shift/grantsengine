// Prompt builders extracted move-only from src/hooks/useAI.js (Phase 3). Each takes a context
// bag (the locals runAI assembles) and returns { system, user, search, maxTokens } — or { result }
// for a precomputed early return. Pure: no I/O. Pinned byte-for-byte by useAI.prompts.snapshot.test.js.

import { dL, effectiveAsk } from "../utils";
import { detectType, PTYPES } from "../data/funderStrategy";

const P = (system, user, search, maxTokens) => ({ system, user, search, maxTokens });

export const buildBriefPrompt = (ctx) => {
  const { type, grant, orgName, orgCtx, factGuard, budgetInfo, perStudentStr, costHook, priorResearch, priorFitScore, grants, team, stages } = ctx;
      // Single pass to categorise grants for brief
      const overdue = [], urgent = [], drafting = [], submitted = [];
      for (const g of grants) {
        if (g.stage === "drafting") drafting.push(g);
        if (g.stage === "submitted" || g.stage === "awaiting") submitted.push(g);
        if (["won","lost","deferred","archived"].includes(g.stage)) continue;
        const dd = dL(g.deadline);
        if (dd === null) continue;
        if (dd < 0) overdue.push(g);
        else if (dd <= 14) urgent.push(g);
      }
      return P(
        `You are the grant operations manager for ${orgName}. Produce a daily action list — the 5-8 things that will move the pipeline forward TODAY.

RULES:
- Each item: a specific, actionable task for a specific grant
- Order by urgency: overdue first, then deadlines within 14 days, then drafting priorities, then follow-ups
- Be blunt: "OVERDUE" or "X days left" where relevant
- Include the owner name where assigned
- No preamble, no markdown headers — just the action items, one per line
- End with a one-line pipeline health summary`,
        `Today: ${new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
Overdue (${overdue.length}): ${overdue.map(g => `${g.name} (${Math.abs(dL(g.deadline))}d overdue, owner: ${team.find(t=>t.id===g.owner)?.name || "Unassigned"})`).join("; ") || "None"}
Urgent <14d (${urgent.length}): ${urgent.map(g => `${g.name} (${dL(g.deadline)}d left, owner: ${team.find(t=>t.id===g.owner)?.name || "Unassigned"})`).join("; ") || "None"}
In drafting (${drafting.length}): ${drafting.map(g => `${g.name} for ${g.funder} (R${effectiveAsk(g).toLocaleString()})`).join("; ") || "None"}
Submitted/Awaiting (${submitted.length}): ${submitted.map(g => `${g.name} from ${g.funder}`).join("; ") || "None"}
Total pipeline: ${grants.filter(g => !["won","lost","deferred","archived"].includes(g.stage)).length} grants, R${grants.filter(g => !["won","lost","deferred","archived"].includes(g.stage)).reduce((s,g) => s+effectiveAsk(g), 0).toLocaleString()}`,
        false, 1000
      );
};

export const buildWinLossPrompt = (ctx) => {
  const { type, grant, orgName, orgCtx, factGuard, budgetInfo, perStudentStr, costHook, priorResearch, priorFitScore, grants, team, stages } = ctx;
      // priorResearch carries the outcome ("won" or "lost") and any user notes
      const outcome = priorResearch || "unknown";
      return P(
        `You are a grants strategist analysing a ${outcome === "won" ? "successful" : "unsuccessful"} grant application.

Provide a brief analysis in this format:

${outcome === "won" ? `WHAT WORKED:
- [2-3 specific factors that likely contributed to the win]

LEVERAGE OPPORTUNITIES:
- [How to use this win for future applications — reference funders, renewals, case studies]

NEXT STEPS:
- [2-3 concrete actions — reporting requirements, relationship building, renewal timeline]` : `LIKELY REASONS:
- [2-3 specific factors that may have contributed to the loss]

LESSONS:
- [What to do differently next time with similar funders]

RECOVERY OPTIONS:
- [Alternative funders to approach, or whether to reapply next cycle]`}

Keep it concise and specific to this grant. No generic advice.${grant.funderFeedback ? "\n\nACTUAL FUNDER FEEDBACK is provided below. This is the most important input — ground your analysis in what they actually said, not speculation." : ""}`,
        `Organisation:\n${orgCtx}\n\nGrant: ${grant.name}\nFunder: ${grant.funder}\nType: ${grant.type}\nAsk: R${grant.ask?.toLocaleString()}\nRelationship: ${grant.rel}\nFocus: ${(Array.isArray(grant.focus) ? grant.focus : []).join(", ")}\nNotes: ${grant.notes || "None"}\nOutcome: ${outcome}${grant.funderFeedback ? `\n\n=== ACTUAL FUNDER FEEDBACK ===\n${grant.funderFeedback}` : ""}`,
        false, 1000
      );
};

export const buildReportPrompt = (ctx) => {
  const { type, grant, orgName, orgCtx, factGuard, budgetInfo, perStudentStr, costHook, priorResearch, priorFitScore, grants, team, stages } = ctx;
      const act = grants.filter(g => !["won", "lost", "deferred", "archived"].includes(g.stage));
      const won = grants.filter(g => g.stage === "won");
      const lost = grants.filter(g => g.stage === "lost");
      const totalAsk = act.reduce((s, g) => s + effectiveAsk(g), 0);
      const wonVal = won.reduce((s, g) => s + effectiveAsk(g), 0);
      const byStage = stages.filter(s => !["won", "lost", "deferred", "archived"].includes(s.id))
        .map(s => `${s.label}: ${grants.filter(g => g.stage === s.id).length}`)
        .join(", ");
      return P(
        `You write quarterly impact reports for ${orgName}'s funders. Audience: existing funders and board members who want to see progress, outcomes, and pipeline health.

VOICE: Confident, factual. Lead with outcomes, not activities. Show momentum.

STRUCTURE:
1. HEADLINE METRICS (4-5 key numbers — completion rate, employment, pipeline value, student count)
2. PROGRAMME UPDATE (what's active, what's new, 2-3 highlights)
3. FUNDING PIPELINE (won, active, key developments)
4. LOOKING AHEAD (next quarter milestones)
5. THANK YOU (brief, genuine)

One page max. Every sentence earns its place. No hollow phrases. Use the SYSTEM framing: programme types, partner model, AI tools, diversified revenue.${factGuard}`,
        `Organisation:\n${orgCtx}\n\nQ${Math.ceil((new Date().getMonth() + 1) / 3)} ${new Date().getFullYear()} quarterly report.
Pipeline: ${act.length} active grants (R${totalAsk.toLocaleString()}), ${won.length} won (R${wonVal.toLocaleString()}), ${lost.length} lost.
By stage: ${byStage}.
Top grants: ${[...act].sort((a, b) => effectiveAsk(b) - effectiveAsk(a)).slice(0, 5).map(g => `${g.name} (R${effectiveAsk(g).toLocaleString()}, ${g.stage})`).join("; ")}`,
        false, 2000
      );
};

export const buildInsightsOrStrategyPrompt = (ctx) => {
  const { type, grant, orgName, orgCtx, factGuard, budgetInfo, perStudentStr, costHook, priorResearch, priorFitScore, grants, team, stages } = ctx;
      // Shared single-pass categorisation for insights & strategy
      const act = [], won = [], lost = [];
      const funderTypeMap = {}, relMap = {}, focusMap = {}, ownerMap = {};
      const stageCounts = {};
      let totalAsk = 0, wonVal = 0, withAI = 0;
      let deadlinePressure = 0, overdueCount = 0, noDeadline = 0;

      // Build team lookup once
      const teamById = new Map();
      if (team) for (const t of team) teamById.set(t.id, t);

      for (const g of grants) {
        const ask = effectiveAsk(g);
        const isWon = g.stage === "won";
        const isLost = g.stage === "lost";
        const isActive = !["won", "lost", "deferred", "archived"].includes(g.stage);

        if (isWon) { won.push(g); wonVal += ask; }
        else if (isLost) { lost.push(g); }
        else if (isActive) {
          act.push(g); totalAsk += ask;
          // Deadline stats
          if (!g.deadline) noDeadline++;
          else {
            const dd = dL(g.deadline);
            if (dd !== null && dd < 0) overdueCount++;
            else if (dd !== null && dd >= 0 && dd <= 14) deadlinePressure++;
          }
          // Owner workload
          const oid = g.owner || "team";
          const m = teamById.get(oid);
          const name = m ? m.name : (oid === "team" ? "Unassigned" : oid);
          ownerMap[name] = (ownerMap[name] || 0) + 1;
        }

        // Stage counts
        stageCounts[g.stage] = (stageCounts[g.stage] || 0) + 1;

        // Funder types
        const ft = g.type || "Unknown";
        if (!funderTypeMap[ft]) funderTypeMap[ft] = { total: 0, won: 0, lost: 0, ask: 0 };
        funderTypeMap[ft].total++; funderTypeMap[ft].ask += ask;
        if (isWon) funderTypeMap[ft].won++; if (isLost) funderTypeMap[ft].lost++;

        // Relationships
        const rel = g.rel || "Unknown";
        if (!relMap[rel]) relMap[rel] = { total: 0, won: 0, lost: 0 };
        relMap[rel].total++;
        if (isWon) relMap[rel].won++; if (isLost) relMap[rel].lost++;

        // Focus tags
        for (const tag of (g.focus || [])) focusMap[tag] = (focusMap[tag] || 0) + 1;

        // AI coverage
        if (g.aiDraft || g.aiResearch || g.aiFitscore) withAI++;
      }

      const closed = won.length + lost.length;

    if (type === "insights") {
      const byStage = stages.filter(s => !["won", "lost", "deferred", "archived"].includes(s.id))
        .map(s => ({ stage: s.label, count: stageCounts[s.id] || 0 }))
        .filter(s => s.count > 0);

      return P(
        `You are a sharp-eyed pipeline analyst for ${orgName}. You find the things that busy grant managers miss — the hidden risks, the unexploited patterns, the signals in the noise.

TASK: Produce 5–7 insights from this pipeline data. Each one should make the reader think "I hadn't noticed that."

WHAT TO LOOK FOR:
- Funnel shape: top-heavy with scouted grants that never move? Or bottom-heavy with too few new leads? Where does conversion break down?
- Concentration risk: if one funder type or one large grant accounts for >40% of the pipeline, that's fragile. Name the risk.
- Relationship patterns: which relationship statuses (Hot/Warm/Cold/New) actually convert? Where is effort wasted?
- Timing clusters: are deadlines bunched in one month creating a capacity crunch? How many grants have no deadline at all?
- Ask calibration: is the average ask realistic for the funder types being targeted? Are there outliers?
- Team balance: is one person carrying too much? Is anyone underutilised?
- Revenue gap: what's the gap between pipeline value and realistic revenue (weighted by stage probability)?

FORMAT — for each insight:
- Bold title (no emoji, no numbering)
- 2–3 sentences backed by actual numbers from the data. Name specific grants and funders.
- "This week:" followed by one concrete action.

Be blunt. If something is going well, say so briefly and move on. Spend more words on problems and opportunities.${factGuard}`,
        `Organisation: ${orgName}

PIPELINE SNAPSHOT:
- Total grants: ${grants.length} (${act.length} active, ${won.length} won, ${lost.length} lost)
- Active pipeline value: R${totalAsk.toLocaleString()}
- Won value: R${wonVal.toLocaleString()}
- Win rate: ${closed > 0 ? Math.round((won.length / closed) * 100) + "%" : "No closed grants yet"}

BY STAGE: ${byStage.map(s => `${s.stage}: ${s.count}`).join(", ")}

FUNDER TYPES: ${Object.entries(funderTypeMap).map(([t, v]) => `${t}: ${v.total} grants (${v.won}W/${v.lost}L, R${v.ask.toLocaleString()})`).join("; ")}

RELATIONSHIPS: ${Object.entries(relMap).map(([r, v]) => `${r}: ${v.total} (${v.won}W/${v.lost}L)`).join("; ")}

DEADLINE PRESSURE: ${deadlinePressure} due within 14 days, ${overdueCount} overdue, ${noDeadline} without deadlines

FOCUS AREAS: ${Object.entries(focusMap).sort(([, a], [, b]) => b - a).map(([tag, n]) => `${tag} (${n})`).join(", ")}

TEAM WORKLOAD: ${Object.entries(ownerMap).map(([name, n]) => `${name}: ${n}`).join(", ")}

AI COVERAGE: ${withAI}/${grants.length} grants have some AI-generated content (${Math.round((withAI / Math.max(grants.length, 1)) * 100)}%)

TOP 5 BY ASK: ${[...act].sort((a, b) => effectiveAsk(b) - effectiveAsk(a)).slice(0, 5).map(g => `${g.name} for ${g.funder} (R${effectiveAsk(g).toLocaleString()}, ${g.stage}, rel: ${g.rel})`).join("; ")}`,
        false, 2000
      );
    } // end insights
    if (type === "strategy") {
      // Programme type usage (strategy-specific — not shared with insights)
      const ptypeUsage = {};
      for (const g of grants) {
        const pt = detectType(g);
        const label = pt ? pt.label.split(" — ")[0] : "Unclassified";
        if (!ptypeUsage[label]) ptypeUsage[label] = { total: 0, won: 0, lost: 0, ask: 0 };
        ptypeUsage[label].total++;
        ptypeUsage[label].ask += effectiveAsk(g);
        if (g.stage === "won") ptypeUsage[label].won++;
        if (g.stage === "lost") ptypeUsage[label].lost++;
      }

      // Build programme type reference
      const ptypeRef = Object.entries(PTYPES).map(([num, pt]) =>
        `Type ${num}: ${pt.label} — ${pt.students ? pt.students + " students" : "Scales to any size"}, ${pt.duration}, ${pt.cost ? "R" + pt.cost.toLocaleString() : "R930/learner"}`
      ).join("\n");

      return P(
        `You are a funding strategist for ${orgName}. The organisation's full context is provided below.

TASK: Produce 5–7 strategic recommendations. Each should be a specific, defensible play that ${orgName} can execute — not general advice.

Programme portfolio:
${ptypeRef}

THINK ABOUT:
- Which programme types are being pitched to the wrong funders? Name mismatches between ask amounts and funder capacity.
- Are there scalable or low-cost programme types in the portfolio that could be leveraged for large-reach proposals?
- Which funder types actually convert? If one category wins at 60% but another at 10%, the team should rebalance prospecting time.
- Multi-cohort and multi-year packaging: is anyone packaging smaller programmes into larger, multi-year proposals?
- Are returning funders being actively managed for renewals, or left to chance?
- Geographic plays: are there regions where ${orgName} has no presence but funders are active?
- Revenue concentration: if one grant represents >25% of the pipeline, that's a strategic risk.

FORMAT — for each recommendation:
- Bold title (no numbering, no emoji)
- 3–5 sentences of reasoning with specific numbers, programme costs, and funder names from the data
- "Next 30 days:" followed by one concrete action

Think like a board advisor, not a consultant. Be direct about what's working, what's not, and where the biggest leverage is.${factGuard}`,
        `Organisation: ${orgName}

PIPELINE DATA:
- Total: ${grants.length} grants, ${act.length} active (R${totalAsk.toLocaleString()}), ${won.length} won (R${wonVal.toLocaleString()}), ${lost.length} lost
- Win rate: ${won.length + lost.length > 0 ? Math.round((won.length / (won.length + lost.length)) * 100) + "%" : "No closed grants"}

PROGRAMME TYPE USAGE IN PIPELINE:
${Object.entries(ptypeUsage).map(([label, v]) => `${label}: ${v.total} grants (${v.won}W/${v.lost}L, total ask R${v.ask.toLocaleString()})`).join("\n")}

FUNDER TYPE BREAKDOWN:
${Object.entries(funderTypeMap).map(([t, v]) => `${t}: ${v.total} grants (${v.won}W/${v.lost}L, R${v.ask.toLocaleString()})`).join("\n")}

TOP GRANTS BY VALUE:
${[...grants].sort((a, b) => effectiveAsk(b) - effectiveAsk(a)).slice(0, 8).map(g => `${g.name} — ${g.funder} (${g.type}), R${effectiveAsk(g).toLocaleString()}, ${g.stage}, rel: ${g.rel}`).join("\n")}

WON GRANTS: ${won.map(g => `${g.name} from ${g.funder} (${g.type}, R${effectiveAsk(g).toLocaleString()})`).join("; ") || "None yet"}
LOST GRANTS: ${lost.map(g => `${g.name} from ${g.funder} (${g.type}, R${effectiveAsk(g).toLocaleString()})`).join("; ") || "None yet"}`,
        false, 2500
      );
    } // end strategy
};
