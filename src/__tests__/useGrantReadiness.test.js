// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import useGrantReadiness from "@/hooks/useGrantReadiness";

// A "Tech Credit" type has no DOCS requirement, so docScore is always full —
// keeps the readiness arithmetic predictable and isolates the AI/meta factors.
const baseGrant = (over = {}) => ({
  id: "g1",
  type: "Tech Credit",
  stage: "scouted",
  owner: "team",
  ...over,
});

describe("useGrantReadiness", () => {
  it("returns a readiness object with score / missing / nextAction", () => {
    const { result } = renderHook(() => useGrantReadiness(baseGrant(), [], {}));
    const r = result.current.readiness;
    expect(r).not.toBeNull();
    expect(typeof r.score).toBe("number");
    expect(Array.isArray(r.missing)).toBe(true);
    expect(typeof r.nextAction).toBe("string");
  });

  it("scouted + unassigned suggests assigning an owner; bare grant scores low", () => {
    const { result } = renderHook(() =>
      useGrantReadiness(baseGrant({ stage: "scouted", owner: "team" }), [], {})
    );
    expect(result.current.readiness.nextAction).toMatch(/assign an owner/i);
    // No AI, no deadline, no owner, no budget → only docScore(full) contributes.
    expect(result.current.readiness.score).toBeLessThan(60);
  });

  it("a fully-prepared grant scores higher than a bare one", () => {
    const bare = renderHook(() => useGrantReadiness(baseGrant(), [], {}));
    const ready = renderHook(() =>
      useGrantReadiness(
        baseGrant({
          stage: "drafting",
          owner: "alison",
          deadline: "2026-12-01",
          aiFitscore: "SCORE: 80",
          aiResearch: "Funder likes youth skills",
          aiDraft: "A full draft",
          budgetTable: { total: 1200000 },
        }),
        [],
        {}
      )
    );
    expect(ready.result.current.readiness.score).toBeGreaterThan(
      bare.result.current.readiness.score
    );
    expect(ready.result.current.readiness.score).toBe(100);
  });

  it("parses fit score number + verdict from valid AI text", () => {
    const ai = { fitscore: "SCORE: 72\nVERDICT: Strong strategic fit" };
    const { result } = renderHook(() => useGrantReadiness(baseGrant(), [], ai));
    expect(result.current.fitDone).toBeTruthy();
    expect(result.current.fitScoreNum).toBe(72);
    expect(result.current.fitVerdict).toBe("Strong strategic fit");
    expect(result.current.fitError).toBeNull();
  });

  it("treats an AI-error string as not-done and surfaces it as fitError", () => {
    const ai = { fitscore: "Error: rate limited" };
    const { result } = renderHook(() => useGrantReadiness(baseGrant(), [], ai));
    expect(result.current.fitDone).toBeFalsy();
    expect(result.current.fitScoreNum).toBeNull();
    expect(result.current.fitError).toBe("Error: rate limited");
  });

  it("derives resDone / draftDone from ai text and aiSections", () => {
    const ai = { research: "Real research", draft: "A draft" };
    const { result } = renderHook(() => useGrantReadiness(baseGrant(), [], ai));
    expect(result.current.resDone).toBeTruthy();
    expect(result.current.draftDone).toBeTruthy();

    // hasSections path: sections with valid text count as a draft even with no ai.draft
    const withSections = renderHook(() =>
      useGrantReadiness(
        baseGrant({ aiSections: { intro: { text: "Intro body" } } }),
        [],
        {}
      )
    );
    expect(withSections.result.current.hasSections).toBeTruthy();
    expect(withSections.result.current.draftDone).toBeTruthy();
  });

  it("guards a throwing grantReadiness call by returning null readiness", () => {
    // Passing null grant makes grantReadiness throw (reads g.type); the hook's
    // try/catch must swallow it and yield readiness === null without crashing.
    const { result } = renderHook(() => useGrantReadiness(null, [], {}));
    expect(result.current.readiness).toBeNull();
  });
});
