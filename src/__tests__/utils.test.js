import { describe, it, expect } from "vitest";
import {
  parseStructuredResearch,
  cleanProposalText,
  fmt,
  fmtK,
  effectiveAsk,
  isAIError,
  assembleText,
  scoreSentence,
  splitProseSentences,
  worstSentences,
  spliceSentences,
  applyLinkBadge,
} from "@/utils";

describe("applyLinkBadge", () => {
  it("maps each known kind to an icon + tone, and null for unknown/absent", () => {
    expect(applyLinkBadge("apply-page")).toMatchObject({ icon: "✓", tone: "ok" });
    expect(applyLinkBadge("homepage-only")).toMatchObject({ icon: "⚠", tone: "amber" });
    expect(applyLinkBadge("dead")).toMatchObject({ icon: "✕", tone: "red" });
    expect(applyLinkBadge("unknown")).toBe(null);
    expect(applyLinkBadge(undefined)).toBe(null);
  });
});

// ── Readability enforcement helpers ──
describe("scoreSentence", () => {
  it("scores a long, complex sentence lower than a short, plain one", () => {
    const hard = "The implementation of the aforementioned multidimensional intervention necessitates substantial interdepartmental collaboration notwithstanding considerable resource constraints.";
    const easy = "We train youth in digital skills. They find jobs.";
    expect(scoreSentence(hard)).toBeLessThan(scoreSentence(easy));
  });
  it("returns null for fragments too short to judge", () => {
    expect(scoreSentence("Too short.")).toBe(null);
  });
});

describe("splitProseSentences", () => {
  it("returns sentence cores with offsets that index back into the original text", () => {
    const text = "We train youth. They get jobs.";
    const sents = splitProseSentences(text);
    expect(sents.map(s => s.text)).toEqual(["We train youth.", "They get jobs."]);
    for (const s of sents) expect(text.slice(s.start, s.end)).toBe(s.text);
  });
  it("skips table rows, [STAT:] callout lines and headings", () => {
    const text = "## Heading\nReal prose sentence here.\n| col | col |\n[STAT: 92% | completion]";
    expect(splitProseSentences(text).map(s => s.text)).toEqual(["Real prose sentence here."]);
  });
});

describe("spliceSentences", () => {
  it("replaces sentences by offset without disturbing the rest (round-trip)", () => {
    const text = "We train youth. They get jobs.";
    const [first] = splitProseSentences(text);
    const out = spliceSentences(text, [{ start: first.start, end: first.end, after: "We teach skills." }]);
    expect(out).toBe("We teach skills. They get jobs.");
  });
});

describe("worstSentences", () => {
  it("returns only sub-target sentences, worst first, capped", () => {
    const hard = "The implementation of the aforementioned multidimensional intervention necessitates substantial interdepartmental collaboration notwithstanding considerable resource constraints and persistent structural impediments.";
    const easy = "We train youth in digital skills so they can find good work.";
    const text = `${easy} ${hard}`;
    const worst = worstSentences(text, 50, 6);
    expect(worst.length).toBeGreaterThanOrEqual(1);
    expect(worst[0].text).toContain("implementation"); // the hard one ranks worst
    expect(worst.every(w => w.score < 50)).toBe(true);
  });
});

// ── parseStructuredResearch ──
describe("parseStructuredResearch", () => {
  it("returns null for non-string input", () => {
    expect(parseStructuredResearch(null)).toBe(null);
    expect(parseStructuredResearch(undefined)).toBe(null);
    expect(parseStructuredResearch(42)).toBe(null);
  });

  it("parses raw JSON with rawText field", () => {
    const json = JSON.stringify({ rawText: "summary", priorities: "youth" });
    const result = parseStructuredResearch(json);
    expect(result).not.toBe(null);
    expect(result.rawText).toBe("summary");
    expect(result.priorities).toBe("youth");
  });

  it("parses fenced JSON", () => {
    const raw = 'Some text\n```json\n{"rawText":"hello","budgetRange":"R1M"}\n```\nMore text';
    const result = parseStructuredResearch(raw);
    expect(result.rawText).toBe("hello");
    expect(result.budgetRange).toBe("R1M");
  });

  it("extracts JSON from surrounding text", () => {
    const raw = 'Here are the results: {"rawText":"found it","contacts":"John"} end of response';
    const result = parseStructuredResearch(raw);
    expect(result.rawText).toBe("found it");
  });

  it("synthesizes rawText from research fields when rawText is absent", () => {
    const json = JSON.stringify({ priorities: "youth", contacts: "John" });
    const result = parseStructuredResearch(json);
    expect(result).not.toBe(null);
    expect(result.priorities).toBe("youth");
    expect(result.rawText).toContain("youth");
    expect(result.rawText).toContain("John");
  });

  it("returns null when object has no research fields", () => {
    const json = JSON.stringify({ foo: "bar", baz: 1 });
    expect(parseStructuredResearch(json)).toBe(null);
  });

  it("returns null for malformed JSON", () => {
    expect(parseStructuredResearch("{broken json")).toBe(null);
    expect(parseStructuredResearch("just plain text")).toBe(null);
  });
});

// ── cleanProposalText ──
describe("cleanProposalText", () => {
  it("returns non-string input unchanged", () => {
    expect(cleanProposalText(null)).toBe(null);
    expect(cleanProposalText(undefined)).toBe(undefined);
  });

  it("removes sentences starting with banned openers", () => {
    const text = "Imagine a world where youth thrive. D-lab trains 60 students per year.";
    const result = cleanProposalText(text);
    expect(result).not.toContain("Imagine");
    expect(result).toContain("D-lab trains");
  });

  it("removes sentences containing 'imagine' anywhere", () => {
    const text = "We can imagine great outcomes. The programme delivers results.";
    const result = cleanProposalText(text);
    expect(result).not.toContain("imagine");
    expect(result).toContain("programme delivers");
  });

  it("strips banned phrases inline", () => {
    const text = "We believe the programme is effective. Results prove it.";
    const result = cleanProposalText(text);
    expect(result).not.toContain("We believe");
    expect(result).toContain("programme is effective");
  });

  it("strips 'making a difference' and 'beacon of hope'", () => {
    const text = "The org is making a difference and is a beacon of hope for communities.";
    const result = cleanProposalText(text);
    expect(result).not.toContain("making a difference");
    expect(result).not.toContain("beacon of hope");
  });

  it("cleans up double spaces", () => {
    const text = "Hello  world   here.";
    const result = cleanProposalText(text);
    expect(result).not.toContain("  ");
  });
});

// ── fmt / fmtK ──
describe("fmt", () => {
  it("formats millions", () => {
    expect(fmt(1000000)).toBe("R1.0M");
    expect(fmt(1500000)).toBe("R1.5M");
    expect(fmt(4970000)).toBe("R5.0M");
  });

  it("returns dash for falsy", () => {
    expect(fmt(0)).toBe("\u2014");
    expect(fmt(null)).toBe("\u2014");
  });
});

describe("fmtK", () => {
  it("formats millions for >= 1M", () => {
    expect(fmtK(1000000)).toBe("R1.0M");
    expect(fmtK(2500000)).toBe("R2.5M");
  });

  it("formats thousands for < 1M", () => {
    expect(fmtK(500000)).toBe("R500K");
    expect(fmtK(516000)).toBe("R516K");
    expect(fmtK(25800)).toBe("R26K");
  });

  it("returns dash for falsy", () => {
    expect(fmtK(0)).toBe("\u2014");
    expect(fmtK(null)).toBe("\u2014");
  });
});

// ── effectiveAsk ──
describe("effectiveAsk", () => {
  it("returns ask when set", () => {
    expect(effectiveAsk({ ask: 500000, funderBudget: 1000000 })).toBe(500000);
  });

  it("falls back to funderBudget", () => {
    expect(effectiveAsk({ ask: 0, funderBudget: 1000000 })).toBe(1000000);
  });

  it("returns 0 when neither set", () => {
    expect(effectiveAsk({ ask: 0, funderBudget: 0 })).toBe(0);
    expect(effectiveAsk({})).toBe(0);
  });
});

// ── isAIError ──
describe("isAIError", () => {
  it("detects error strings", () => {
    expect(isAIError("Error: API failed")).toBe(true);
    expect(isAIError("Rate limit exceeded")).toBe(true);
    expect(isAIError("Connection refused")).toBe(true);
    expect(isAIError("Request failed with status 500")).toBe(true);
    expect(isAIError("No response from AI")).toBe(true);
    expect(isAIError("The AI service is unavailable")).toBe(true);
  });

  it("detects null/empty", () => {
    expect(isAIError(null)).toBe(true);
    expect(isAIError("")).toBe(true);
    expect(isAIError(undefined)).toBe(true);
  });

  it("returns false for valid content", () => {
    expect(isAIError("SCORE: 75\nVERDICT: Good Fit")).toBe(false);
    expect(isAIError("This is a valid proposal draft.")).toBe(false);
  });
});

// ── assembleText ──
describe("assembleText", () => {
  it("joins sections with headers and separators", () => {
    const sections = {
      "Cover Letter": { text: "Dear Funder..." },
      "Budget": { text: "Total: R516K" },
    };
    const order = ["Cover Letter", "Budget"];
    const result = assembleText(sections, order);
    expect(result).toContain("COVER LETTER");
    expect(result).toContain("Dear Funder...");
    expect(result).toContain("BUDGET");
    expect(result).toContain("Total: R516K");
    expect(result).toContain("=".repeat(60));
  });

  it("skips sections without text", () => {
    const sections = {
      "Cover Letter": { text: "Hello" },
      "Empty Section": { text: null },
      "Budget": { text: "R500K" },
    };
    const order = ["Cover Letter", "Empty Section", "Budget"];
    const result = assembleText(sections, order);
    expect(result).not.toContain("EMPTY SECTION");
    expect(result).toContain("COVER LETTER");
    expect(result).toContain("BUDGET");
  });
});
