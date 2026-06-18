import { describe, it, expect } from "vitest";
import { fmtTs, extractAskFromDraft, calcTotalAsk, buildPtypeNotes } from "../utils";
import { PTYPES } from "../data/funderStrategy";

// These tests pin the CURRENT behaviour of four helpers that were lifted
// verbatim out of GrantDetail.jsx and Pipeline.jsx into src/utils.js.

describe("fmtTs", () => {
  it("formats a valid ISO timestamp to an en-ZA date+time string", () => {
    const out = fmtTs("2026-03-15T14:30:00Z");
    // Pin shape, not exact locale punctuation (depends on ICU): day, short month,
    // and a HH:mm time component must all be present.
    expect(typeof out).toBe("string");
    expect(out).toMatch(/15/);          // day: numeric
    expect(out).toMatch(/Mar/i);        // month: short
    expect(out).toMatch(/\d{2}:\d{2}/); // hour:minute, 2-digit
  });

  it("returns null for falsy input (empty string)", () => {
    expect(fmtTs("")).toBe(null);
  });

  it("returns null for undefined input", () => {
    expect(fmtTs(undefined)).toBe(null);
  });
});

describe("extractAskFromDraft", () => {
  it("parses a structured ASK_RECOMMENDATION line with years (match)", () => {
    const draft = "Some preamble.\nASK_RECOMMENDATION: Type 3, 2 cohort(s), 3 year(s), R7,416,000\nMore text.";
    const result = extractAskFromDraft(draft);
    expect(result).toEqual({ ask: 7416000, typeNum: 3, mcCount: 2, years: 3 });
  });

  it("defaults years to 1 when the years group is absent in the structured line", () => {
    const draft = "ASK_RECOMMENDATION: Type 1, 1 cohort(s), R516000";
    const result = extractAskFromDraft(draft);
    expect(result).toEqual({ ask: 516000, typeNum: 1, mcCount: 1, years: 1 });
  });

  it("falls back to scanning the body for a Type and multi-cohort count", () => {
    const draft = "We propose 2 x Type 3 cohort to serve more youth.";
    const result = extractAskFromDraft(draft);
    expect(result).toEqual({
      ask: PTYPES[3].cost * 2,
      typeNum: 3,
      mcCount: 2,
      years: 1,
    });
  });

  it("returns null when no Type is mentioned at all (no-match)", () => {
    const draft = "This is a generic proposal with no programme classification.";
    expect(extractAskFromDraft(draft)).toBe(null);
  });

  it("returns null when the detected Type has no cost (e.g. Type 6)", () => {
    // PTYPES[6] has cost: null
    const draft = "We recommend a Type 6 short course.";
    expect(extractAskFromDraft(draft)).toBe(null);
  });
});

describe("calcTotalAsk", () => {
  it("sums programme-type costs with the 30% org-cost uplift by default", () => {
    const ptypes = new Map([["1", { cohorts: 2 }]]);
    const expected = Math.round(PTYPES[1].cost * 2 * 1.3);
    expect(calcTotalAsk(ptypes, [])).toBe(expected);
  });

  it("omits the org-cost uplift when includeOrgCost is false", () => {
    const ptypes = new Map([["1", { cohorts: 2 }]]);
    expect(calcTotalAsk(ptypes, [], false)).toBe(PTYPES[1].cost * 2);
  });

  it("includes custom programme costs by id", () => {
    const ptypes = new Map([["custom-1", { cohorts: 3 }]]);
    const customs = [{ id: "custom-1", name: "Bespoke", cost: 100000 }];
    expect(calcTotalAsk(ptypes, customs, false)).toBe(300000);
  });

  it("returns 0 for an empty programme map", () => {
    expect(calcTotalAsk(new Map(), [])).toBe(0);
  });
});

describe("buildPtypeNotes", () => {
  it("builds a notes string for a single-cohort type and appends user notes", () => {
    const ptypes = new Map([["3", { cohorts: 1 }]]);
    const out = buildPtypeNotes(ptypes, [], "Returning funder.");
    expect(out).toBe("Type 3\nReturning funder.");
  });

  it("annotates multi-cohort counts and joins multiple programmes with ' + '", () => {
    const ptypes = new Map([
      ["3", { cohorts: 2 }],
      ["1", { cohorts: 1 }],
    ]);
    const out = buildPtypeNotes(ptypes, [], "");
    expect(out).toBe("Type 3 (2 cohorts) + Type 1");
  });

  it("formats custom programmes with name and per-cohort cost", () => {
    const ptypes = new Map([["custom-1", { cohorts: 1 }]]);
    const customs = [{ id: "custom-1", name: "Bespoke", cost: 250000 }];
    const out = buildPtypeNotes(ptypes, customs, "");
    expect(out).toBe("Custom: Bespoke R250,000/cohort");
  });

  it("returns an empty string when there are no programmes and no user notes", () => {
    expect(buildPtypeNotes(new Map(), [], "")).toBe("");
  });
});
