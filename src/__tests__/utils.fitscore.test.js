// Characterization tests for parseFitScore — the single source of truth for parsing the AI
// fit-score block ("SCORE: NN" / "VERDICT: ...").
//
// Added during cleanup (Phase 1 safety net) alongside extracting this helper out of 7 call
// sites that each carried their own copy of the regex. Those sites had DRIFTED on case
// sensitivity; the extracted helper unifies on case-insensitive (the safe superset). These
// tests pin that unified behaviour so the later call-site swap stays behaviour-preserving for
// real AI output (which always uses the uppercase template).

import { describe, it, expect } from "vitest";
import { parseFitScore } from "../utils";

describe("parseFitScore", () => {
  it("extracts score and verdict from a standard block", () => {
    expect(parseFitScore("SCORE: 75\nVERDICT: Strong fit")).toEqual({ score: 75, verdict: "Strong fit" });
  });

  it("returns numbers for score, trimmed strings for verdict", () => {
    const r = parseFitScore("SCORE:  82  \nVERDICT:   Good alignment  ");
    expect(r.score).toBe(82);
    expect(typeof r.score).toBe("number");
    expect(r.verdict).toBe("Good alignment");
  });

  it("verdict captures only the rest of its line (not following lines)", () => {
    const r = parseFitScore("VERDICT: Promising\nREASONS: many reasons here");
    expect(r.verdict).toBe("Promising");
  });

  it("is case-insensitive (unified behaviour across the old call sites)", () => {
    expect(parseFitScore("score: 60\nverdict: maybe")).toEqual({ score: 60, verdict: "maybe" });
  });

  it("returns nulls when a field is absent", () => {
    expect(parseFitScore("SCORE: 50")).toEqual({ score: 50, verdict: null });
    expect(parseFitScore("VERDICT: Weak")).toEqual({ score: null, verdict: "Weak" });
    expect(parseFitScore("no structured fields here")).toEqual({ score: null, verdict: null });
  });

  it("handles falsy / non-string input", () => {
    expect(parseFitScore(null)).toEqual({ score: null, verdict: null });
    expect(parseFitScore("")).toEqual({ score: null, verdict: null });
    expect(parseFitScore(undefined)).toEqual({ score: null, verdict: null });
  });

  it("accepts a non-string that stringifies (defensive — some sites passed raw fields)", () => {
    expect(parseFitScore({ toString: () => "SCORE: 33" }).score).toBe(33);
  });
});
