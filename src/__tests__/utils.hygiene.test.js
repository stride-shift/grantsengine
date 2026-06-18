// Characterization tests for the PURE data-integrity / hygiene helpers in src/utils.js.
//
// Added during the cleanup (Phase 1 safety net). These functions run inside App.jsx's
// background "hygiene" job on every session load — some of them WRITE fields back to grants
// (sanitizeNotes, detectUnsolicited) or decide which duplicate grant to keep
// (normaliseFunder, grantCompleteness). A silent regression here corrupts user data, so we
// pin current behaviour before any of them get extracted/moved.
//
// These assert what the code does TODAY, not what it "should" do. If a future change makes one
// fail, that is the signal to look — don't just update the expectation.

import { describe, it, expect } from "vitest";
import {
  isGroundingRedirect,
  isUsableUrl,
  isHomepageOnly,
  normaliseFunder,
  grantCompleteness,
  sanitizeNotes,
  detectSubmissionMethod,
  detectUnsolicited,
  readabilityLabel,
  urgLabel,
} from "../utils";

// ── URL hygiene gate ──
describe("isGroundingRedirect", () => {
  it("flags Gemini grounding / Google redirect URLs", () => {
    expect(isGroundingRedirect("https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc")).toBe(true);
    expect(isGroundingRedirect("https://example.com/grounding-api-redirect/x")).toBe(true);
    expect(isGroundingRedirect("https://google.com/url?q=https://real.org")).toBe(true);
  });
  it("passes real funder URLs and non-strings", () => {
    expect(isGroundingRedirect("https://realfunder.org/grants/apply")).toBe(false);
    expect(isGroundingRedirect(null)).toBe(false);
    expect(isGroundingRedirect(undefined)).toBe(false);
    expect(isGroundingRedirect(123)).toBe(false);
  });
});

describe("isUsableUrl", () => {
  it("accepts http(s) URLs that are not grounding redirects", () => {
    expect(isUsableUrl("https://realfunder.org/apply")).toBe(true);
    expect(isUsableUrl("http://x.org")).toBe(true);
  });
  it("rejects non-http(s), redirects, and falsy input", () => {
    expect(isUsableUrl("ftp://x.org")).toBe(false);
    expect(isUsableUrl("mailto:a@b.org")).toBe(false);
    expect(isUsableUrl("https://vertexaisearch.cloud.google.com/grounding-api-redirect/x")).toBe(false);
    expect(isUsableUrl("")).toBe(false);
    expect(isUsableUrl(null)).toBe(false);
  });
});

describe("isHomepageOnly", () => {
  it("treats bare-root / known shell paths as homepage-only", () => {
    expect(isHomepageOnly("https://www.nac.org.za/")).toBe(true);
    expect(isHomepageOnly("https://example.org")).toBe(true);
    expect(isHomepageOnly("https://example.org/en")).toBe(true);
    expect(isHomepageOnly("https://example.org/home")).toBe(true);
  });
  it("treats URLs with a real path as NOT homepage-only", () => {
    expect(isHomepageOnly("https://example.org/grants/apply")).toBe(false);
    expect(isHomepageOnly("https://example.org/funding")).toBe(false);
  });
  it("returns false for unparseable / falsy input", () => {
    expect(isHomepageOnly("not a url")).toBe(false);
    expect(isHomepageOnly("")).toBe(false);
    expect(isHomepageOnly(null)).toBe(false);
  });
});

// ── Dedup key + keep-which-duplicate scoring ──
describe("normaliseFunder", () => {
  it("strips decorators/legal suffixes and collapses to a dedup key", () => {
    expect(normaliseFunder("The Vodacom Foundation Trust")).toBe("vodacom");
    expect(normaliseFunder("Coca-Cola Beverages Pty Ltd")).toBe("coca cola beverages");
  });
  it("lowercases and is whitespace-stable", () => {
    expect(normaliseFunder("  GET  IT  DONE  Foundation ")).toBe("get it done");
  });
  it("returns empty string for falsy input", () => {
    expect(normaliseFunder("")).toBe("");
    expect(normaliseFunder(null)).toBe("");
    expect(normaliseFunder(undefined)).toBe("");
  });
});

describe("grantCompleteness", () => {
  it("returns 0 for null / empty grant", () => {
    expect(grantCompleteness(null)).toBe(0);
    expect(grantCompleteness({})).toBe(0);
  });
  it("penalises archived stage and rewards usable apply URL", () => {
    expect(grantCompleteness({ stage: "archived" })).toBe(-10);
    expect(grantCompleteness({ applyUrl: "https://x.org/grants" })).toBe(10);
  });
  it("scores a richer grant higher than a sparser one", () => {
    const sparse = { stage: "scouted", ask: 5000 };
    const rich = {
      stage: "won",
      ask: 500000,
      deadline: "2026-01-01",
      applyUrl: "https://x.org/apply",
      aiDraft: "x".repeat(300),
    };
    expect(grantCompleteness(rich)).toBeGreaterThan(grantCompleteness(sparse));
  });
  it("pins a known additive combination", () => {
    // deadline (+4) + ask>0 (+4) + scouted stage (+0)
    expect(grantCompleteness({ deadline: "2026-01-01", ask: 5000, stage: "scouted" })).toBe(8);
  });
});

// ── Notes sanitisation (WRITES back to grant.notes) ──
describe("sanitizeNotes", () => {
  it("drops sentences containing internal 'Type N' jargon, keeps the rest", () => {
    expect(sanitizeNotes("We plan a Type 2 cohort here. Contact us at info@x.org."))
      .toBe("Contact us at info@x.org.");
  });
  it("drops 'N x ... cohort' planning shorthand sentences", () => {
    expect(sanitizeNotes("3 x cohort rollout planned. Deadline April 1."))
      .toBe("Deadline April 1.");
  });
  it("leaves clean notes unchanged", () => {
    expect(sanitizeNotes("Submit via the online portal by 30 June."))
      .toBe("Submit via the online portal by 30 June.");
  });
  it("passes non-string input straight through", () => {
    expect(sanitizeNotes(null)).toBe(null);
    expect(sanitizeNotes(undefined)).toBe(undefined);
  });
});

// ── Submission-channel classifier (display) ──
describe("detectSubmissionMethod", () => {
  it("detects invitation-only", () => {
    expect(detectSubmissionMethod({ notes: "Applications are by invitation only." }).method).toBe("invitation");
  });
  it("detects an online form", () => {
    expect(detectSubmissionMethod({ notes: "Apply via our online application form." }).method).toBe("form");
  });
  it("detects a letter of inquiry", () => {
    expect(detectSubmissionMethod({ notes: "Send a letter of inquiry first." }).method).toBe("loi");
  });
  it("detects email submission and extracts the recipient", () => {
    const r = detectSubmissionMethod({ notes: "Email your proposal to grants@foo.org" });
    expect(r.method).toBe("email");
    expect(r.recipient).toBe("grants@foo.org");
  });
  it("returns 'unknown' when there is no signal", () => {
    expect(detectSubmissionMethod({}).method).toBe("unknown");
    expect(detectSubmissionMethod({ notes: "Deadline is in March." }).method).toBe("unknown");
  });
});

// ── Unsolicited-acceptance classifier (WRITES grant.acceptsUnsolicited) ──
describe("detectUnsolicited", () => {
  it("returns 'no' on strong closed-call signals", () => {
    expect(detectUnsolicited({ notes: "This funder is by invitation only." })).toBe("no");
    expect(detectUnsolicited({ notes: "We are not accepting applications at this time." })).toBe("no");
  });
  it("returns 'yes' on strong open-call signals", () => {
    expect(detectUnsolicited({ notes: "Open call for proposals — apply online." })).toBe("yes");
  });
  it("returns 'unknown' on weak / empty signal", () => {
    expect(detectUnsolicited({ notes: "Some neutral text about deadlines." })).toBe("unknown");
    expect(detectUnsolicited({})).toBe("unknown");
  });
});

// ── Pure lookup / label helpers ──
describe("readabilityLabel", () => {
  it("maps score bands to labels (boundaries pinned)", () => {
    expect(readabilityLabel(85).label).toBe("Very easy");
    expect(readabilityLabel(80).label).toBe("Very easy");
    expect(readabilityLabel(60).label).toBe("Plain English");
    expect(readabilityLabel(45).label).toBe("Fairly difficult");
    expect(readabilityLabel(30).label).toBe("Difficult");
    expect(readabilityLabel(10).label).toBe("Very difficult");
  });
  it("returns null for null/undefined", () => {
    expect(readabilityLabel(null)).toBe(null);
    expect(readabilityLabel(undefined)).toBe(null);
  });
});

describe("urgLabel", () => {
  it("pins deadline-urgency wording across the bands", () => {
    expect(urgLabel(null)).toBe(null);
    expect(urgLabel(-2)).toBe("2d overdue");
    expect(urgLabel(0)).toBe("Due today");
    expect(urgLabel(3)).toBe("3d left!");
    expect(urgLabel(10)).toBe("⚠ 10d");
    expect(urgLabel(14)).toBe("⚠ 14d");
    expect(urgLabel(20)).toBe("20d");
  });
});
