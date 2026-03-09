import { describe, it, expect } from "vitest";
import {
  isFunderReturning,
  PTYPES,
  detectType,
  multiCohortInfo,
  selectOptimalBudget,
  funderStrategy,
} from "../data/funderStrategy";

// ── isFunderReturning ──
describe("isFunderReturning", () => {
  it("identifies known returning funders", () => {
    expect(isFunderReturning("Get It Done Foundation")).toBe(true);
    expect(isFunderReturning("Telkom Foundation")).toBe(true);
    expect(isFunderReturning("TK Foundation")).toBe(true);
    expect(isFunderReturning("CCBA")).toBe(true);
    expect(isFunderReturning("Inkcubeko")).toBe(true);
    expect(isFunderReturning("Penreach")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isFunderReturning("GET IT DONE")).toBe(true);
    expect(isFunderReturning("telkom")).toBe(true);
    expect(isFunderReturning("Tk")).toBe(true);
  });

  it("matches partial names via substring", () => {
    expect(isFunderReturning("get it done")).toBe(true);
    expect(isFunderReturning("coca-cola beverages")).toBe(true);
  });

  it("returns false for unknown funders", () => {
    expect(isFunderReturning("Google.org")).toBe(false);
    expect(isFunderReturning("Mastercard Foundation")).toBe(false);
  });

  it("treats empty/null as matching (substring edge case)", () => {
    // (null||"") → "" and every string .includes("") → true
    expect(isFunderReturning("")).toBe(true);
    expect(isFunderReturning(null)).toBe(true);
  });
});

// ── PTYPES ──
describe("PTYPES", () => {
  it("has 8 programme types", () => {
    expect(Object.keys(PTYPES)).toHaveLength(8);
  });

  it("Type 1 is partner-funded at R516K", () => {
    expect(PTYPES[1].cost).toBe(516000);
    expect(PTYPES[1].students).toBe(20);
  });

  it("Type 2 includes stipends + laptops at R1.597M", () => {
    expect(PTYPES[2].cost).toBe(1597200);
  });

  it("Type 6 has no fixed cost (per-learner)", () => {
    expect(PTYPES[6].cost).toBe(null);
    expect(PTYPES[6].perStudent).toBe(930);
  });

  it("Type 8 is bespoke corporate at R2.75M", () => {
    expect(PTYPES[8].cost).toBe(2753418);
    expect(PTYPES[8].students).toBe(25);
  });
});

// ── detectType ──
describe("detectType", () => {
  it("detects type from notes (highest priority)", () => {
    expect(detectType({ notes: "Use Type 3 for this grant", ask: 500000 })).toBe(PTYPES[3]);
    expect(detectType({ notes: "(Type 1) delivery", ask: 2000000 })).toBe(PTYPES[1]);
  });

  it("infers Type 7 from small ask (R232K)", () => {
    expect(detectType({ ask: 232000 })).toBe(PTYPES[7]);
  });

  it("infers Type 1 from R516K ask", () => {
    expect(detectType({ ask: 516000 })).toBe(PTYPES[1]);
  });

  it("infers Type 5 from R651K ask", () => {
    expect(detectType({ ask: 651000 })).toBe(PTYPES[5]);
  });

  it("infers Type 4 from R1M ask", () => {
    expect(detectType({ ask: 1080000 })).toBe(PTYPES[4]);
  });

  it("infers Type 3 from R1.2M ask", () => {
    expect(detectType({ ask: 1236000 })).toBe(PTYPES[3]);
  });

  it("infers Type 2 for large asks (R1.6M+)", () => {
    expect(detectType({ ask: 1600000 })).toBe(PTYPES[2]);
  });

  it("returns null when no ask and no notes", () => {
    expect(detectType({ ask: 0 })).toBe(null);
    expect(detectType({})).toBe(null);
  });
});

// ── multiCohortInfo ──
describe("multiCohortInfo", () => {
  it("extracts 'N x Type M' from notes", () => {
    const result = multiCohortInfo({ notes: "3 × type 2 cohorts" });
    expect(result).toEqual({ count: 3, typeNum: 2 });
  });

  it("extracts 'N cohorts' from notes", () => {
    const result = multiCohortInfo({ notes: "2 cohorts in 2026" });
    expect(result).toEqual({ count: 2, typeNum: 1 });
  });

  it("returns null when no pattern found", () => {
    expect(multiCohortInfo({ notes: "Standard programme" })).toBe(null);
    expect(multiCohortInfo({ notes: "" })).toBe(null);
    expect(multiCohortInfo({})).toBe(null);
  });
});

// ── selectOptimalBudget ──
describe("selectOptimalBudget", () => {
  it("respects explicit type in notes", () => {
    const result = selectOptimalBudget({ notes: "Type 3", funderBudget: 5000000 });
    expect(result.typeNum).toBe(3);
    expect(result.cohorts).toBe(1);
  });

  it("detects bespoke keywords", () => {
    const result = selectOptimalBudget({ notes: "bespoke leadership programme", funderBudget: 3000000 });
    expect(result.typeNum).toBe(8);
  });

  it("prefers corporate types for corporate funders", () => {
    const result = selectOptimalBudget({ type: "Corporate CSI", funderBudget: 3000000, notes: "" });
    // Should prefer Type 8 (R2.75M) for corporate
    expect(result.typeNum).toBe(8);
    expect(result.cohorts).toBe(1);
  });

  it("maximises cohorts within budget", () => {
    // R2.5M budget, Foundation → prefers Type 1 (R516K) → 4 cohorts
    const result = selectOptimalBudget({ type: "Foundation", funderBudget: 2500000, notes: "" });
    expect(result.typeNum).toBe(1);
    expect(result.cohorts).toBe(4);
  });

  it("falls back to Type 1 with 1 cohort for zero budget", () => {
    const result = selectOptimalBudget({ funderBudget: 0, notes: "" });
    expect(result.typeNum).toBe(1);
    expect(result.cohorts).toBe(1);
  });

  it("handles government/SETA preference (Type 4)", () => {
    const result = selectOptimalBudget({ type: "Government/SETA", funderBudget: 2000000, notes: "" });
    expect(result.typeNum).toBe(4);
    expect(result.cohorts).toBe(1);
  });

  it("multi-cohort from notes overrides auto-detection", () => {
    const result = selectOptimalBudget({ notes: "2 cohorts Type 1", funderBudget: 2000000 });
    expect(result.typeNum).toBe(1);
    expect(result.cohorts).toBe(2);
  });
});

// ── funderStrategy ──
describe("funderStrategy", () => {
  it("returns specific strategy for GIDF", () => {
    const result = funderStrategy({ funder: "Get It Done Foundation", type: "Foundation", focus: ["youth-employment"] });
    expect(result.returning).toBe(true);
    expect(result.lead).toContain("continuity");
    expect(result.hook).toContain("R12.8M");
    expect(result.lang).toContain("continuity");
  });

  it("returns specific strategy for TK Foundation", () => {
    const result = funderStrategy({ funder: "TK Foundation", type: "Foundation", focus: [] });
    expect(result.returning).toBe(true);
    expect(result.hook).toContain("3-year commitment");
  });

  it("returns generic fallback for unknown funder", () => {
    const result = funderStrategy({ funder: "Totally Unknown Foundation", type: "Foundation", focus: ["education"] });
    expect(result.returning).toBe(false);
    expect(result.hook).toContain("NO PRE-EXISTING FUNDER INTELLIGENCE");
  });

  it("includes structure matching funder type", () => {
    const corp = funderStrategy({ funder: "Unknown Corp", type: "Corporate CSI", focus: [] });
    expect(corp.structure).toContain("B-BBEE Value Proposition");

    const intl = funderStrategy({ funder: "Unknown Intl", type: "International", focus: [] });
    expect(intl.structure).toContain("Theory of Change");

    const seta = funderStrategy({ funder: "Unknown SETA", type: "Government/SETA", focus: [] });
    expect(seta.structure).toContain("Regulatory Alignment (NQF/SAQA/NSDP)");
  });

  it("detects programme type from grant", () => {
    const result = funderStrategy({ funder: "Test", type: "Foundation", focus: [], ask: 516000 });
    expect(result.pt).toBe(PTYPES[1]);
  });

  it("falls back to Foundation structure for unknown type", () => {
    const result = funderStrategy({ funder: "Test", type: "Random Type", focus: [] });
    expect(result.structure).toContain("The Challenge");
    expect(result.structure).toContain("Our Approach");
  });

  it("returns targetPages from known funder override", () => {
    const dgmt = funderStrategy({ funder: "DG Murray Trust", type: "Foundation", focus: [] });
    expect(dgmt.targetPages).toBe(5);
    expect(dgmt.formatNotes).toContain("5 pages");
  });

  it("returns targetPages from funder type default", () => {
    const corp = funderStrategy({ funder: "Unknown Corp", type: "Corporate CSI", focus: [] });
    expect(corp.targetPages).toBe(8);

    const intl = funderStrategy({ funder: "Unknown Intl", type: "International", focus: [] });
    expect(intl.targetPages).toBe(12);

    const partner = funderStrategy({ funder: "Unknown Partner", type: "Partnership", focus: [] });
    expect(partner.targetPages).toBe(5);
  });

  it("falls back to 8 pages for unknown funder type", () => {
    const result = funderStrategy({ funder: "Test", type: "Random Type", focus: [] });
    expect(result.targetPages).toBe(8);
    expect(result.formatNotes).toBe("");
  });

  it("returns formatNotes for funders with specific requirements", () => {
    const tshik = funderStrategy({ funder: "Tshikululu", type: "Foundation", focus: [] });
    expect(tshik.targetPages).toBe(10);
    expect(tshik.formatNotes).toContain("two-phase");

    const sab = funderStrategy({ funder: "SAB Foundation", type: "Foundation", focus: [] });
    expect(sab.targetPages).toBe(6);

    const mc = funderStrategy({ funder: "Mastercard Foundation", type: "International", focus: [] });
    expect(mc.targetPages).toBe(15);
  });
});
