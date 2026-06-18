// Characterization tests for the pure research-shaping helpers extracted from useAI.js into
// src/prompts/lib.js (Phase 3 move-only). These were flagged in Phase 1 as "pure logic buried
// in a god file — test as we lift it". They pick which parsed-research fields get fed into a
// prompt for a given proposal section, and truncate to a char budget. Pinning current behaviour.

import { describe, it, expect } from "vitest";
import { getResearchForSection, getResearchForDraft, FACT_GUARD } from "../prompts/lib";

const RESEARCH = {
  rawText: "long blob that should be skipped in section mode",
  priorities: "youth employment",
  contacts: "Jane Doe",
  strategy: "multi-year skilling",
  applicationProcess: "online form",
  recentGrants: "R2m to X",
  budgetRange: "R1m-R5m",
  relationshipLeverage: "board intro",
  doorOpener: "warm referral",
};

describe("getResearchForSection", () => {
  it("returns empty string for falsy research", () => {
    expect(getResearchForSection(null, "Cover Letter")).toBe("");
    expect(getResearchForSection(undefined, "Budget")).toBe("");
  });

  it("always leads with funder priorities (universal baseline)", () => {
    expect(getResearchForSection(RESEARCH, "Impact")).toMatch(/^Funder priorities: youth employment/);
  });

  it("a cover-letter section pulls contacts + strategy + process + grants + relationship", () => {
    const r = getResearchForSection(RESEARCH, "Cover Letter");
    expect(r).toContain("Key contacts: Jane Doe");
    expect(r).toContain("Strategy: multi-year skilling");
    expect(r).toContain("Application process: online form");
    expect(r).toContain("Recent grants: R2m to X");
    expect(r).toContain("Relationship: board intro");
    expect(r).toContain("Door opener: warm referral");
    // cover does NOT include the raw budget range field
    expect(r).not.toContain("Budget range:");
  });

  it("a budget section pulls only budget range + recent grants (plus priorities)", () => {
    const r = getResearchForSection(RESEARCH, "Budget");
    expect(r).toContain("Funder priorities: youth employment");
    expect(r).toContain("Budget range: R1m-R5m");
    expect(r).toContain("Recent grants: R2m to X");
    expect(r).not.toContain("Key contacts:");
    expect(r).not.toContain("Strategy:");
  });

  it("an unrecognised section dumps every field except rawText (humanised keys)", () => {
    const r = getResearchForSection(RESEARCH, "Annexures");
    expect(r).not.toContain("long blob that should be skipped"); // rawText excluded
    // default branch humanises each camelCase key, capitalising every word boundary
    expect(r).toContain("Application Process: online form");
    expect(r).toContain("Door Opener: warm referral");
  });

  it("truncates to the char budget when given", () => {
    const r = getResearchForSection(RESEARCH, "Cover Letter", 20);
    expect(r.length).toBe(20);
  });
});

describe("getResearchForDraft", () => {
  it("returns empty string for falsy research", () => {
    expect(getResearchForDraft(null)).toBe("");
  });

  it("emits all populated fields in the fixed draft order", () => {
    const r = getResearchForDraft(RESEARCH);
    expect(r).toContain("Budget & scale: R1m-R5m");
    expect(r).toContain("Funder priorities: youth employment");
    expect(r).toContain("Door opener: warm referral");
    // order: budget range comes before recent grants
    expect(r.indexOf("Budget & scale")).toBeLessThan(r.indexOf("Recent grants"));
  });

  it("defaults to a 2500-char budget and respects an explicit one", () => {
    const big = { priorities: "x".repeat(5000) };
    expect(getResearchForDraft(big).length).toBe(2500);
    expect(getResearchForDraft(big, 100).length).toBe(100);
  });

  it("skips absent fields silently", () => {
    expect(getResearchForDraft({ contacts: "Jane" })).toBe("Key contacts: Jane");
  });
});

describe("FACT_GUARD", () => {
  it("is a non-empty static anti-hallucination block", () => {
    expect(typeof FACT_GUARD).toBe("string");
    expect(FACT_GUARD).toContain("ZERO TOLERANCE FOR FABRICATION");
    expect(FACT_GUARD).toContain("[Deadline: TBC]");
  });
});
