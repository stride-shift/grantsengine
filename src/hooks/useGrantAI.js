import { useState, useEffect, useCallback, useRef } from "react";
import { td, isAIError, parseStructuredResearch, cleanProposalText } from "@/utils";
import { PTYPES, selectOptimalBudget } from "@/data/funderStrategy";

/**
 * AI orchestration view-model for GrantDetail. Owns the AI result state (`ai`),
 * the per-action busy map (`busy`), the Roll-the-Dice chain state
 * (`rollingDice` / `diceStep`), and every async AI flow that mutates them:
 *   - runFitScore        — score (with history snapshot) + persist + log
 *   - storeResearch      — parse structured research, persist display text
 *   - runResearch        — research from child gates (e.g. ProposalWorkspace)
 *   - rollTheDice        — fit → research → auto-budget → advance-to-draft chain
 *   - aiLog              — append an entry to the grant's activity log
 *   - auto-brief effect  — on-open funder-brief fetch (3s-delayed safety net)
 *   - _pendingAI effect  — runs AI actions queued from the +Add wizard
 *   - grant-switch sync  — resets `ai` when the grant id changes
 *
 * Discrete AI calls are kept as inline try/catch rather than useAsyncAction:
 * each one has bespoke success handling (history snapshots, structured-research
 * parsing, multi-step sequencing) and writes into the shared `ai`/`busy` maps,
 * so wrapping them would not reduce the surface and would risk changing the
 * observable busy/error behaviour. (useAsyncAction remains the right tool for
 * the single-shape AI calls elsewhere; here the flows are heterogeneous.)
 *
 * Known stale-closure behaviour is PRESERVED, not "fixed":
 *  - aiLog reads `grant` from the latest render closure (recreated each render).
 *  - effects key off `grant?.id` only, exactly as before.
 *  - rollTheDice closes over the fitDone/resDone passed in at definition time.
 *
 * @param grant the grant being viewed
 * @param onUpdate (grantId, changes) persistence callback
 * @param onRunAI (action, grant[, extra]) AI proxy returning a string (may be an error string)
 * @param currentMember the acting team member (for aiLog attribution)
 * fitDone/resDone are derived downstream by useGrantReadiness (which needs this
 * hook's `ai`). To avoid the render-order cycle they are fed back in through
 * `statusRef` — a ref the component keeps current each render — and rollTheDice
 * reads them from it at call time (it ran on click, after render, in the
 * original too, so the observable gate is unchanged).
 *
 * @param statusRef ref holding { fitDone, resDone } (component-maintained)
 */
export default function useGrantAI({ grant, onUpdate, onRunAI, currentMember, statusRef }) {
  const [busy, setBusy] = useState({});
  const [ai, setAi] = useState(() => ({
    research: grant?.aiResearch || null,
    draft: grant?.aiDraft || null,
    followup: grant?.aiFollowup || null,
    fitscore: grant?.aiFitscore || null,
    winloss: grant?.aiWinloss || null,
  }));
  const [rollingDice, setRollingDice] = useState(false);
  const [diceStep, setDiceStep] = useState("");
  const proposalRef = useRef(null);

  // up(field, value) — single-field grant mutation, identical to the component helper.
  const up = useCallback((field, value) => onUpdate(grant.id, { [field]: value }), [onUpdate, grant?.id]);

  // ── Auto-log AI actions to activity feed — Phase 10: include actor attribution ──
  // NOTE: intentionally NOT memoised — it reads `grant` from the live render
  // closure each call, matching the original component behaviour.
  const aiLog = (action) => {
    const prev = grant?.log || [];
    onUpdate(grant.id, { log: [...prev, { d: td(), t: action, by: currentMember?.id || "team" }] });
  };

  // Store research result — parse JSON structure, extract display text, persist both
  const storeResearch = useCallback((grantId, rawResult) => {
    const structured = parseStructuredResearch(rawResult);
    const displayText = structured?.rawText || rawResult;
    const now = new Date().toISOString();
    const updates = { aiResearch: displayText, aiResearchAt: now };
    if (structured) updates.aiResearchStructured = structured;
    setAi(p => ({ ...p, research: displayText }));
    onUpdate(grantId, updates);
  }, [onUpdate]);

  // Run research from child components (e.g. ProposalWorkspace gate)
  const runResearch = useCallback(async () => {
    const g = grant;
    setBusy(p => ({ ...p, research: true }));
    try {
      const r = await onRunAI("research", g);
      if (!isAIError(r)) {
        storeResearch(g.id, cleanProposalText(r));
        const prev = g.log || [];
        onUpdate(g.id, { log: [...prev, { d: td(), t: `AI Funder Research completed for ${g.funder}` }] });
      } else setAi(p => ({ ...p, research: r }));
    } catch (e) {
      setAi(p => ({ ...p, research: `Error: ${e.message}` }));
    }
    setBusy(p => ({ ...p, research: false }));
  }, [grant, onRunAI, onUpdate, storeResearch]);

  const runFitScore = async () => {
    const g = grant;
    setBusy(p => ({ ...p, fitscore: true }));
    try {
      if (ai.fitscore && !isAIError(ai.fitscore)) {
        const prev = g.fitscoreHistory || [];
        const ts = g.aiFitscoreAt || new Date().toISOString();
        onUpdate(g.id, { fitscoreHistory: [...prev, { ts, text: ai.fitscore }].slice(-5) });
      }
      const raw = await onRunAI("fitscore", g);
      const r = isAIError(raw) ? raw : cleanProposalText(raw);
      setAi(p => ({ ...p, fitscore: r }));
      if (!isAIError(r)) {
        const now = new Date().toISOString();
        onUpdate(g.id, { aiFitscore: r, aiFitscoreAt: now });
        aiLog("AI Fit Score calculated");
      }
    } catch (e) { setAi(p => ({ ...p, fitscore: `Error: ${e.message}` })); }
    setBusy(p => ({ ...p, fitscore: false }));
  };

  // ── Roll the Dice — full auto-generate chain ──
  // Lifted to component scope (was recreated every render inside the workflow-strip IIFE).
  const rollTheDice = useCallback(async () => {
    const g = grant;
    const { fitDone, resDone } = statusRef?.current || {};
    setRollingDice(true);

    try {
      // Step 1: Fit Score
      if (!fitDone) {
        setDiceStep("Scoring fit...");
        setBusy(p => ({ ...p, fitscore: true }));
        try {
          const rawFs = await onRunAI("fitscore", g);
          const r = isAIError(rawFs) ? rawFs : cleanProposalText(rawFs);
          setAi(p => ({ ...p, fitscore: r }));
          if (!isAIError(r)) {
            onUpdate(g.id, { aiFitscore: r, aiFitscoreAt: new Date().toISOString() });
            aiLog("AI Fit Score calculated");
          }
        } catch (e) { setAi(p => ({ ...p, fitscore: `Error: ${e.message}` })); }
        setBusy(p => ({ ...p, fitscore: false }));
      }

      // Step 2: Research
      if (!resDone) {
        setDiceStep(`Researching ${g.funder}...`);
        setBusy(p => ({ ...p, research: true }));
        try {
          const r = await onRunAI("research", g);
          if (!isAIError(r)) {
            storeResearch(g.id, cleanProposalText(r));
            aiLog(`AI Funder Research completed for ${g.funder}`);
          } else setAi(p => ({ ...p, research: r }));
        } catch (e) { setAi(p => ({ ...p, research: `Error: ${e.message}` })); }
        setBusy(p => ({ ...p, research: false }));
      }

      // Step 3: Auto-budget (if not already set)
      if (!g.budgetTable) {
        setDiceStep("Building budget...");
        const { typeNum, cohorts } = selectOptimalBudget(g);
        const pt = PTYPES[typeNum];
        if (pt?.table) {
          const parseAmt = s => {
            if (!s || s === "varies") return 0;
            return parseInt(String(s).replace(/[,\s]/g, "")) || 0;
          };
          const items = pt.table
            .filter(([label]) => label !== "TOTAL")
            .map(([label, amount]) => ({ label, amount: parseAmt(amount), isCustom: false }));
          const studentsPerCohort = pt.students || 0;
          const itemTotal = items.reduce((s, it) => s + (it.amount || 0), 0);
          const subtotal = itemTotal * cohorts;
          const total = subtotal;
          const totalStudents = studentsPerCohort * cohorts;
          const perStudent = totalStudents > 0 ? Math.round(total / totalStudents) : 0;
          const budgetTable = {
            typeNum, typeLabel: pt.label || "", cohorts, studentsPerCohort,
            duration: pt.duration || "", items,
            includeOrgContribution: false, subtotal, orgContribution: 0,
            total, perStudent, savedAt: new Date().toISOString(),
          };
          onUpdate(g.id, { budgetTable, ask: total, askSource: "budget-builder", aiRecommendedAsk: total });
          aiLog(`Auto-budget: Type ${typeNum}, ${cohorts} cohort${cohorts > 1 ? "s" : ""}, R${total.toLocaleString()}`);
        }
      }

      // Step 4: Advance stage to drafting (so Proposal Workspace section renders) and trigger auto-generate
      setDiceStep("Writing proposal...");
      if (["scouted", "vetting", "qualifying"].includes(g.stage)) up("stage", "drafting");
      // Scroll to proposal section after a tick
      setTimeout(() => proposalRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      // rollingDice stays true — ProposalWorkspace picks it up via autoGenerate prop

    } catch (e) {
      setDiceStep(`Error: ${e.message}`);
      setRollingDice(false);
    }
    // statusRef is read at call time (post-render). grant/onRunAI/onUpdate/up
    // recreate this on the same cadence the original render-bound callback did.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grant, onRunAI, onUpdate, aiLog, storeResearch, up]);

  // Sync AI state when switching between grants
  useEffect(() => {
    setAi({
      research: grant?.aiResearch || null,
      draft: grant?.aiDraft || null,
      followup: grant?.aiFollowup || null,
      fitscore: grant?.aiFitscore || null,
      winloss: grant?.aiWinloss || null,
    });
  }, [grant?.id]);

  // Auto-fetch funder brief when a grant opens with no brief yet.
  // The background hygiene job (App.jsx) handles the bulk pre-fetch across all
  // grants. This on-open trigger is the safety net for grants opened before the
  // hygiene job got to them, or grants added after it ran.
  //
  // Small delay (3s) before firing so it doesn't race with the hygiene job's
  // first Gemini call and trip rate limits.
  const briefFetchedRef = useRef(new Set());
  const [autoBriefBusy, setAutoBriefBusy] = useState(false);
  useEffect(() => {
    const gid = grant?.id;
    if (!gid) return;
    if (briefFetchedRef.current.has(gid)) return;
    if (grant.funderBrief && grant.funderBrief.trim().length > 50) return; // already on file
    if (!onRunAI || !onUpdate) return;
    briefFetchedRef.current.add(gid);

    const timer = setTimeout(() => {
      setAutoBriefBusy(true);
      (async () => {
        try {
          const raw = await onRunAI("fetchFunderBrief", grant);
          const txt = String(raw || "").replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
          const sIdx = txt.indexOf("{"), eIdx = txt.lastIndexOf("}");
          let parsed = null;
          try { if (sIdx >= 0 && eIdx > sIdx) parsed = JSON.parse(txt.slice(sIdx, eIdx + 1)); } catch {}
          if (parsed?.brief && parsed.brief.length > 100) {
            // Only persist if the box is STILL empty when the fetch returns
            const latestBrief = (grant.funderBrief || "").trim();
            if (latestBrief.length < 50) {
              const note = parsed.sourceUrl ? `\n\n---\nSource: ${parsed.sourceUrl}` : "";
              onUpdate(gid, { funderBrief: parsed.brief + note });
              aiLog(`AI auto-filled funder brief from ${parsed.sourceUrl || "funder site"}`);
            }
          }
        } catch { /* silent — user can still trigger manually via the Re-fetch button */ }
        setAutoBriefBusy(false);
      })();
    }, 3000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grant?.id]);

  // Auto-trigger AI actions queued from +Add wizard (_pendingAI field)
  const pendingHandled = useRef(null); // tracks which grant ID was handled
  useEffect(() => {
    const pending = grant?._pendingAI;
    if (!pending || pendingHandled.current === grant?.id) return;
    pendingHandled.current = grant?.id;
    // Clear the flag immediately
    onUpdate(grant.id, { _pendingAI: null });
    const g = grant;
    const runPending = async () => {
      if (pending.fitscore) {
        setBusy(p => ({ ...p, fitscore: true }));
        try {
          const raw = await onRunAI("fitscore", g);
          const r = isAIError(raw) ? raw : cleanProposalText(raw);
          setAi(p => ({ ...p, fitscore: r }));
          if (!isAIError(r)) onUpdate(g.id, { aiFitscore: r, aiFitscoreAt: new Date().toISOString() });
        } catch (e) { setAi(p => ({ ...p, fitscore: `Error: ${e.message}` })); }
        setBusy(p => ({ ...p, fitscore: false }));
      }
      if (pending.research) {
        setBusy(p => ({ ...p, research: true }));
        try {
          const r = await onRunAI("research", g);
          if (!isAIError(r)) storeResearch(g.id, cleanProposalText(r));
          else setAi(p => ({ ...p, research: r }));
        } catch (e) { setAi(p => ({ ...p, research: `Error: ${e.message}` })); }
        setBusy(p => ({ ...p, research: false }));
      }
      if (pending.draft) {
        // Ensure research is done before drafting — run it now if missing
        const hasResearch = !!(g.aiResearch && !isAIError(g.aiResearch));
        if (!hasResearch && !pending.research) {
          setBusy(p => ({ ...p, research: true }));
          try {
            const r = await onRunAI("research", g);
            if (!isAIError(r)) storeResearch(g.id, cleanProposalText(r));
            else setAi(p => ({ ...p, research: r }));
          } catch (e) { setAi(p => ({ ...p, research: `Error: ${e.message}` })); }
          setBusy(p => ({ ...p, research: false }));
        }
        setBusy(p => ({ ...p, draft: true }));
        try {
          const raw = await onRunAI("draft", g);
          const r = isAIError(raw) ? raw : cleanProposalText(raw);
          setAi(p => ({ ...p, draft: r }));
          if (!isAIError(r)) onUpdate(g.id, { aiDraft: r, aiDraftAt: new Date().toISOString() });
        } catch (e) { setAi(p => ({ ...p, draft: `Error: ${e.message}` })); }
        setBusy(p => ({ ...p, draft: false }));
      }
    };
    runPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grant?.id]);

  return {
    ai, setAi,
    busy, setBusy,
    rollingDice, setRollingDice,
    diceStep, setDiceStep,
    autoBriefBusy,
    proposalRef,
    up,
    aiLog,
    storeResearch,
    runResearch,
    runFitScore,
    rollTheDice,
  };
}
