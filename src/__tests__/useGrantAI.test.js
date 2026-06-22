// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ── Mocks ──────────────────────────────────────────────────────────────────
// Deterministic utils so we assert on exact persisted shapes (no glossary
// rewriting / banned-phrase stripping noise from the real cleanProposalText).
vi.mock("@/utils", () => ({
  td: () => "2026-06-22",
  isAIError: (r) => !r || (typeof r === "string" && r.startsWith("Error")),
  cleanProposalText: (t) => t,
  parseStructuredResearch: () => null, // force the "displayText = rawResult" path
}));
vi.mock("@/data/funderStrategy", () => ({
  PTYPES: {
    1: { label: "Type 1 — Standard", duration: "9 months", students: 20, table: [["Stipends", "300,000"], ["Laptops", "216,000"], ["TOTAL", "516,000"]] },
  },
  selectOptimalBudget: () => ({ typeNum: 1, cohorts: 1 }),
}));

import useGrantAI from "@/hooks/useGrantAI";

// A grant with a funderBrief > 50 chars so the on-open auto-brief effect
// early-returns — keeps onRunAI call counts attributable to the action tests.
const baseGrant = (over = {}) => ({
  id: "g1",
  funder: "Acme Foundation",
  stage: "scouted",
  funderBrief: "This funder already has a brief on file long enough to skip auto-fetch.",
  log: [],
  ...over,
});

const makeProps = (over = {}) => ({
  grant: baseGrant(over.grant),
  onUpdate: vi.fn(),
  onRunAI: vi.fn(async () => "AI RESULT"),
  currentMember: { id: "alison" },
  statusRef: { current: { fitDone: false, resDone: false } },
  ...over,
});

beforeEach(() => { vi.clearAllMocks(); });

describe("useGrantAI", () => {
  it("seeds ai state from the grant's persisted AI fields", () => {
    const props = makeProps({
      grant: { aiFitscore: "SCORE: 60", aiResearch: "Prior research" },
    });
    const { result } = renderHook(() => useGrantAI(props));
    expect(result.current.ai.fitscore).toBe("SCORE: 60");
    expect(result.current.ai.research).toBe("Prior research");
  });

  it("runFitScore: calls onRunAI('fitscore'), stores result, persists + logs", async () => {
    const props = makeProps({ onRunAI: vi.fn(async () => "SCORE: 75\nVERDICT: Good") });
    const { result } = renderHook(() => useGrantAI(props));

    await act(async () => { await result.current.runFitScore(); });

    expect(props.onRunAI).toHaveBeenCalledWith("fitscore", expect.objectContaining({ id: "g1" }));
    expect(result.current.ai.fitscore).toBe("SCORE: 75\nVERDICT: Good");
    // Persisted with the right shape
    const fsCall = props.onUpdate.mock.calls.find(([, c]) => "aiFitscore" in c);
    expect(fsCall[0]).toBe("g1");
    expect(fsCall[1].aiFitscore).toBe("SCORE: 75\nVERDICT: Good");
    expect(fsCall[1].aiFitscoreAt).toBeTruthy();
    // Activity log appended for the correct grant
    const logCall = props.onUpdate.mock.calls.find(([, c]) => Array.isArray(c.log));
    expect(logCall[0]).toBe("g1");
    expect(logCall[1].log.at(-1)).toMatchObject({ t: "AI Fit Score calculated", by: "alison" });
  });

  it("runFitScore: an AI-error result is not persisted and not logged", async () => {
    const props = makeProps({ onRunAI: vi.fn(async () => "Error: rate limited") });
    const { result } = renderHook(() => useGrantAI(props));

    await act(async () => { await result.current.runFitScore(); });

    expect(result.current.ai.fitscore).toBe("Error: rate limited");
    expect(props.onUpdate.mock.calls.some(([, c]) => "aiFitscore" in c)).toBe(false);
    expect(props.onUpdate.mock.calls.some(([, c]) => Array.isArray(c.log))).toBe(false);
  });

  it("runResearch: calls onRunAI('research'), persists research + appends log", async () => {
    const props = makeProps({ onRunAI: vi.fn(async () => "Funder loves youth skills") });
    const { result } = renderHook(() => useGrantAI(props));

    await act(async () => { await result.current.runResearch(); });

    expect(props.onRunAI).toHaveBeenCalledWith("research", expect.objectContaining({ id: "g1" }));
    // storeResearch persisted display text
    const resCall = props.onUpdate.mock.calls.find(([, c]) => "aiResearch" in c);
    expect(resCall[1].aiResearch).toBe("Funder loves youth skills");
    expect(resCall[1].aiResearchAt).toBeTruthy();
    // log appended to the right grant mentioning the funder
    const logCall = props.onUpdate.mock.calls.find(([, c]) => Array.isArray(c.log));
    expect(logCall[0]).toBe("g1");
    expect(logCall[1].log.at(-1).t).toMatch(/Acme Foundation/);
  });

  it("rollTheDice: runs fit → research → auto-budget → advance-to-drafting in order", async () => {
    const calls = [];
    const onRunAI = vi.fn(async (action) => {
      calls.push(action);
      return action === "fitscore" ? "SCORE: 80\nVERDICT: Strong" : "Research text";
    });
    const props = makeProps({ onRunAI, statusRef: { current: { fitDone: false, resDone: false } } });
    const { result } = renderHook(() => useGrantAI(props));

    await act(async () => { await result.current.rollTheDice(); });

    // Ordered AI calls: fitscore before research
    expect(calls).toEqual(["fitscore", "research"]);
    // Auto-budget persisted (Type 1 table totals 516,000 at 1 cohort)
    const budgetCall = props.onUpdate.mock.calls.find(([, c]) => "budgetTable" in c);
    expect(budgetCall[1].budgetTable.total).toBe(516000);
    expect(budgetCall[1].ask).toBe(516000);
    expect(budgetCall[1].askSource).toBe("budget-builder");
    // Stage advanced scouted → drafting
    const stageCall = props.onUpdate.mock.calls.find(([, c]) => c.stage === "drafting");
    expect(stageCall).toBeTruthy();
    // rollingDice stays true (ProposalWorkspace picks it up via autoGenerate)
    expect(result.current.rollingDice).toBe(true);
  });

  it("rollTheDice: skips fit + research when statusRef says they are already done", async () => {
    const onRunAI = vi.fn(async () => "ignored");
    const props = makeProps({
      onRunAI,
      grant: baseGrant({ budgetTable: { total: 9 } }), // also skip auto-budget
      statusRef: { current: { fitDone: true, resDone: true } },
    });
    const { result } = renderHook(() => useGrantAI(props));

    await act(async () => { await result.current.rollTheDice(); });

    expect(onRunAI).not.toHaveBeenCalled();
    // Only the stage-advance update should fire
    const stageCall = props.onUpdate.mock.calls.find(([, c]) => c.stage === "drafting");
    expect(stageCall).toBeTruthy();
  });

  it("_pendingAI effect: runs the queued fitscore action once and clears the flag", async () => {
    const onRunAI = vi.fn(async () => "SCORE: 50\nVERDICT: Maybe");
    const props = makeProps({
      onRunAI,
      grant: baseGrant({ _pendingAI: { fitscore: true } }),
    });
    renderHook(() => useGrantAI(props));

    // Flag cleared immediately on mount
    await waitFor(() => {
      expect(props.onUpdate.mock.calls.some(([, c]) => c._pendingAI === null)).toBe(true);
    });
    // Queued fitscore ran
    await waitFor(() => {
      expect(onRunAI).toHaveBeenCalledWith("fitscore", expect.objectContaining({ id: "g1" }));
    });
  });

  it("auto-brief effect: skips when a funderBrief is already on file", async () => {
    vi.useFakeTimers();
    try {
      const onRunAI = vi.fn(async () => "{}");
      const props = makeProps({ onRunAI }); // baseGrant has a long funderBrief
      renderHook(() => useGrantAI(props));
      await act(async () => { vi.advanceTimersByTime(4000); });
      expect(onRunAI).not.toHaveBeenCalledWith("fetchFunderBrief", expect.anything());
    } finally {
      vi.useRealTimers();
    }
  });
});
