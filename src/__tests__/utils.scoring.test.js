// Characterization tests for the remaining PURE scoring helpers in src/utils.js:
// readabilityScore, validateProposalBreaks, grantReadiness.
//
// Added during cleanup (Phase 1 safety net). These drive UI feedback and workflow nudges
// (readiness score, "next action", readability gate, wall-of-text warnings). They are pure
// given their inputs (grantReadiness also reads the DOCS/DOC_MAP/GATES data constants).
// We pin current behaviour before extraction. Exact numbers below reflect what the code
// produces TODAY — a failure is a signal to investigate, not to blindly re-baseline.

import { describe, it, expect } from "vitest";
import {
  readabilityScore,
  validateProposalBreaks,
  grantReadiness,
} from "../utils";

// ── Flesch reading-ease ──
describe("readabilityScore", () => {
  it("returns null for too-short / non-string input", () => {
    expect(readabilityScore(null)).toBe(null);
    expect(readabilityScore(42)).toBe(null);
    expect(readabilityScore("Too short to score.")).toBe(null); // < 100 chars after cleaning
  });

  it("clamps to the 0..100 range and returns an integer", () => {
    const text =
      "The organisation delivers accredited digital skills training to unemployed young people across three provinces. " +
      "Graduates complete a nine month programme and most find work within three months. " +
      "The model is simple, proven, and ready to scale to new regions with local partners.";
    const s = readabilityScore(text);
    expect(typeof s).toBe("number");
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
    expect(Number.isInteger(s)).toBe(true);
  });

  it("scores plain prose higher than dense, multi-syllable prose", () => {
    const plain =
      "We train young people in digital skills. They learn fast. Most of them find good jobs soon after. " +
      "The cost is low and the results are strong. We do this work in many towns across the country every year.";
    const dense =
      "The organisation's multidimensional capacitation methodology facilitates the systematic institutionalisation " +
      "of competency-based pedagogical interventions, thereby operationalising sustainable socioeconomic transformation " +
      "through the comprehensive implementation of accreditation-aligned curricular infrastructure across heterogeneous communities.";
    expect(readabilityScore(plain)).toBeGreaterThan(readabilityScore(dense));
  });
});

// ── Visual-breaks / wall-of-text checker ──
describe("validateProposalBreaks", () => {
  it("returns a perfect score for empty or very short text", () => {
    expect(validateProposalBreaks("")).toEqual({ issues: [], score: 100 });
    expect(validateProposalBreaks(null)).toEqual({ issues: [], score: 100 });
    expect(validateProposalBreaks("A short paragraph well under two hundred words.")).toEqual({ issues: [], score: 100 });
  });

  it("flags a long unbroken wall of prose (no table/stat/header/breaks)", () => {
    const wall = ("word ".repeat(600)).trim(); // 600 words, single paragraph, no breaks
    const result = validateProposalBreaks(wall);
    // no-table (>=300) + no-stat (>=600) + no-headers (>=400) + unbroken-run (>400) = 4 issues
    expect(result.issues.length).toBe(4);
    expect(result.score).toBe(40); // 100 - 4*15
  });

  it("a well-structured doc scores better than a wall of the same length", () => {
    const wall = ("word ".repeat(600)).trim();
    const structured =
      "## Overview\n\n" +
      "word ".repeat(80) + "\n\n" +
      "| Item | Cost |\n| --- | --- |\n| Coaches | 200000 |\n\n" +
      "[STAT: 92% | completion rate]\n\n" +
      "## Impact\n\n" +
      "word ".repeat(80) + "\n\n" +
      "## Budget\n\n" +
      "word ".repeat(80);
    expect(validateProposalBreaks(structured).score).toBeGreaterThan(validateProposalBreaks(wall).score);
  });
});

// ── Grant readiness score + next-action ──
describe("grantReadiness", () => {
  it("pins the empty-grant baseline (docScore defaults to full when no doc requirements)", () => {
    const r = grantReadiness({});
    expect(r.score).toBe(40); // docScore 1*40 + aiScore 0 + metaScore 0
    expect(r.nextAction).toBe("Assign an owner to start qualifying");
    expect(r.missing).toEqual(["No fit score", "No research", "No draft", "No deadline", "Unassigned", "No budget"]);
  });

  it("scores a fully-worked grant at 100 with no missing items", () => {
    const r = grantReadiness({
      aiFitscore: "SCORE: 80",
      aiResearch: "research blob",
      aiDraft: "draft blob",
      deadline: "2026-01-01",
      owner: "alice",
      ask: 500000,
      stage: "drafting",
    });
    expect(r.score).toBe(100);
    expect(r.missing).toEqual([]);
    expect(r.nextAction).toBe("Submit draft for review");
  });

  it("treats owner 'team' as unassigned", () => {
    const r = grantReadiness({ owner: "team", deadline: "2026-01-01", ask: 100000 });
    expect(r.missing).toContain("Unassigned");
  });
});
