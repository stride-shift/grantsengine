// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ── Mocks ──
// isAIError: treat anything starting with "Error" / "Rate limit" as an AI error
// (mirrors the real predicate's relevant branches); assembleText / glossary kept
// simple so we can assert observable output deterministically.
// Controllable readability helpers so enforcement-path tests can drive the score.
const u = vi.hoisted(() => ({
  readabilityScore: vi.fn(() => 65),
  worstSentences: vi.fn(() => []),
  spliceSentences: vi.fn((t) => t),
}));
vi.mock("@/utils", () => ({
  isAIError: (r) => !r || (typeof r === "string" && (r.startsWith("Error") || r.startsWith("Rate limit"))),
  cleanProposalText: (t) => `CLEAN:${t}`,
  assembleText: (sections, order) =>
    order.filter((n) => sections[n]?.text).map((n) => `${n}::${sections[n].text}`).join("\n"),
  readabilityScore: u.readabilityScore,
  readabilityLabel: () => ({ tone: "ok", label: "Plain English", note: "" }),
  worstSentences: u.worstSentences,
  spliceSentences: u.spliceSentences,
  effectiveAsk: (g) => g.ask || 0,
}));

vi.mock("@/data/glossary", () => ({
  buildGlossaryAppendix: vi.fn(() => "GLOSSARY-APPENDIX"),
}));

vi.mock("@/editLearner", () => ({
  analyzeEditInBackground: vi.fn(),
}));

vi.mock("@/data/funderStrategy", () => ({
  PTYPES: { 1: { label: "T1" } },
  funderStrategy: () => ({ structure: ["Need", "Budget"] }),
}));

vi.mock("@/theme", () => ({ C: { ok: "#0a0", amber: "#fa0", red: "#a00" } }));

import { buildGlossaryAppendix } from "@/data/glossary";
import { analyzeEditInBackground } from "@/editLearner";
import useProposalSections from "@/hooks/useProposalSections";

const RESEARCH = "research text"; // not an AI error per the mocked predicate

// Build the params object with sensible defaults; override per test.
function setup(grantOverrides = {}, overrides = {}) {
  const onUpdate = vi.fn();
  const onRunAI = vi.fn(async () => "AI body");
  const onRunResearch = vi.fn();
  const setBusy = vi.fn();
  const grant = {
    id: "g1",
    aiResearch: RESEARCH,
    aiSectionsOrder: ["Need", "Budget"],
    aiSections: {},
    stage: "scouted",
    ...grantOverrides,
  };
  const params = {
    grant,
    ai: null,
    onRunAI,
    onRunResearch,
    onUpdate,
    busy: {},
    setBusy,
    ...overrides,
  };
  const hook = renderHook((p) => useProposalSections(p), { initialProps: params });
  return { hook, onUpdate, onRunAI, onRunResearch, setBusy, grant, params };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: well-above-trigger score, no offending sentences (enforcement inert).
  u.readabilityScore.mockReturnValue(65);
  u.worstSentences.mockReturnValue([]);
  u.spliceSentences.mockImplementation((t) => t);
});

describe("useProposalSections — derived state", () => {
  it("computes completed/total/pct and allDone", () => {
    const { hook } = setup({
      aiSections: { Need: { text: "done" }, Budget: { text: "Error: x" } },
    });
    expect(hook.result.current.totalCount).toBe(2);
    expect(hook.result.current.completedCount).toBe(1); // Budget is an AI-error string
    expect(hook.result.current.pct).toBe(50);
    expect(hook.result.current.allDone).toBe(false);
    expect(hook.result.current.pendingCount).toBe(1);
  });

  it("research gate is closed when research is missing/errored", () => {
    const { hook } = setup({ aiResearch: "Error: failed" });
    expect(hook.result.current.researchDone).toBe(false);
  });
});

describe("useProposalSections — generateSection", () => {
  it("writes the correct section shape via onUpdate (cleaned text, history, flags)", async () => {
    const { hook, onUpdate, onRunAI } = setup();
    await act(async () => { await hook.result.current.generateSection("Need", "be punchy"); });

    expect(onRunAI).toHaveBeenCalledWith("sectionDraft", expect.objectContaining({ id: "g1" }), expect.objectContaining({
      sectionName: "Need", sectionIndex: 0, totalSections: 2, customInstructions: "be punchy",
    }), null);

    const lastSectionsCall = onUpdate.mock.calls.map((c) => c[1]).reverse()
      .find((c) => c.aiSections);
    const sec = lastSectionsCall.aiSections.Need;
    expect(sec.text).toBe("CLEAN:AI body");
    expect(sec.isManualEdit).toBe(false);
    expect(sec.customInstructions).toBe("be punchy");
    expect(sec.editedAt).toBe(null);
    expect(Array.isArray(sec.history)).toBe(true);
    expect(sec.history).toHaveLength(0); // no prior real text to push
    expect(lastSectionsCall.aiSectionsOrder).toEqual(["Need", "Budget"]);
  });

  it("runs research instead of generating when the gate is closed", async () => {
    const { hook, onRunAI, onRunResearch } = setup({ aiResearch: null });
    await act(async () => { await hook.result.current.generateSection("Need"); });
    expect(onRunResearch).toHaveBeenCalledTimes(1);
    expect(onRunAI).not.toHaveBeenCalled();
  });

  it("stores an AI-error result verbatim without cleaning", async () => {
    const onRunAI = vi.fn(async () => "Error: model exploded");
    const { hook, onUpdate } = setup({}, { onRunAI });
    await act(async () => { await hook.result.current.generateSection("Need"); });
    const call = onUpdate.mock.calls.map((c) => c[1]).reverse().find((c) => c.aiSections);
    expect(call.aiSections.Need.text).toBe("Error: model exploded");
  });
});

describe("useProposalSections — readability enforcement", () => {
  it("rewrites the worst sentences and records the change-set when the score improves", async () => {
    u.readabilityScore.mockReturnValueOnce(30).mockReturnValueOnce(55); // before, after
    u.worstSentences.mockReturnValue([{ text: "a hard sentence", start: 0, end: 5 }]);
    u.spliceSentences.mockReturnValue("SPLICED");
    const onRunAI = vi.fn(async (kind) => kind === "rewriteForReadability" ? '["a clearer sentence"]' : "AI body");
    const { hook, onUpdate } = setup({}, { onRunAI });

    await act(async () => { await hook.result.current.generateSection("Need"); });

    expect(onRunAI).toHaveBeenCalledWith("rewriteForReadability", expect.any(Object), expect.objectContaining({ sentences: ["a hard sentence"] }));
    const sec = onUpdate.mock.calls.map((c) => c[1]).reverse().find((c) => c.aiSections).aiSections.Need;
    expect(sec.text).toBe("CLEAN:SPLICED");      // spliced + cleaned
    expect(sec.readability).toBe(55);
    expect(sec.readabilityBefore).toBe(30);
    expect(sec.readabilityChanges).toEqual([{ before: "a hard sentence", after: "a clearer sentence" }]);
  });

  it("keeps the original text when the rewrite does not improve the score (guard)", async () => {
    u.readabilityScore.mockReturnValueOnce(30).mockReturnValueOnce(30); // before, after — no gain
    u.worstSentences.mockReturnValue([{ text: "a hard sentence", start: 0, end: 5 }]);
    u.spliceSentences.mockReturnValue("SPLICED");
    const onRunAI = vi.fn(async (kind) => kind === "rewriteForReadability" ? '["no better"]' : "AI body");
    const { hook, onUpdate } = setup({}, { onRunAI });

    await act(async () => { await hook.result.current.generateSection("Need"); });

    const sec = onUpdate.mock.calls.map((c) => c[1]).reverse().find((c) => c.aiSections).aiSections.Need;
    expect(sec.text).toBe("CLEAN:AI body");       // original cleaned text kept
    expect(sec.readabilityChanges).toBeUndefined();
  });
});

describe("useProposalSections — history ring buffer", () => {
  it("caps history at 3 entries across regenerations", async () => {
    // Start with a section that already has 3 history entries + current real text.
    const { hook, onUpdate } = setup({
      aiSections: {
        Need: {
          text: "v-current",
          generatedAt: "2020-01-01T00:00:00.000Z",
          history: [
            { ts: "t1", text: "h1" },
            { ts: "t2", text: "h2" },
            { ts: "t3", text: "h3" },
          ],
        },
      },
    });
    await act(async () => { await hook.result.current.generateSection("Need"); });

    const call = onUpdate.mock.calls.map((c) => c[1]).reverse().find((c) => c.aiSections);
    const hist = call.aiSections.Need.history;
    expect(hist).toHaveLength(3); // capped — oldest dropped
    expect(hist.map((h) => h.text)).toEqual(["h2", "h3", "v-current"]); // ring shifted
  });
});

describe("useProposalSections — saveSectionEdit / restoreSection", () => {
  it("saveSectionEdit marks manual edit, pushes history, learns, and updates aiDraft", () => {
    const { hook, onUpdate } = setup({
      aiSections: { Need: { text: "original", generatedAt: "2020-01-01T00:00:00.000Z", history: [] } },
    });
    act(() => { hook.result.current.saveSectionEdit("Need", "my new text"); });

    const [, changes] = onUpdate.mock.calls[0];
    expect(changes.aiSections.Need.text).toBe("my new text");
    expect(changes.aiSections.Need.isManualEdit).toBe(true);
    expect(changes.aiSections.Need.history).toHaveLength(1); // prior "original" pushed
    expect(changes.aiSections.Need.history[0].text).toBe("original");
    expect(changes.aiDraft).toContain("Need::my new text"); // assembleText backward-compat
    expect(analyzeEditInBackground).toHaveBeenCalledWith("Need", "original", "my new text");
  });

  it("restoreSection swaps in the chosen history text", () => {
    const { hook, onUpdate } = setup({
      aiSections: { Need: { text: "current", history: [{ ts: "t1", text: "old version" }] } },
    });
    act(() => { hook.result.current.restoreSection("Need", 0); });
    const [, changes] = onUpdate.mock.calls[0];
    expect(changes.aiSections.Need.text).toBe("old version");
    expect(changes.aiSections.Need.isManualEdit).toBe(true);
  });
});

describe("useProposalSections — assembled text + glossary + readability", () => {
  it("includes the glossary appendix only when includeGlossary is on", () => {
    const sections = { Need: { text: "n" }, Budget: { text: "b" } };
    const { hook: off } = setup({ aiSections: sections, includeGlossary: false });
    expect(off.result.current.assembledText).toBe("Need::n\nBudget::b");
    expect(off.result.current.assembledText).not.toContain("GLOSSARY-APPENDIX");

    const { hook: on } = setup({ aiSections: sections, includeGlossary: true });
    expect(on.result.current.assembledText).toContain("GLOSSARY-APPENDIX");
    expect(buildGlossaryAppendix).toHaveBeenCalled();
  });

  it("exposes a readability badge for long proposals", () => {
    const long = "x".repeat(600);
    const { hook } = setup({ aiSections: { Need: { text: long } } });
    expect(hook.result.current.readabilityBadgeProps).toMatchObject({ score: 65 });
    expect(hook.result.current.readabilityBadgeProps.meta.label).toBe("Plain English");
  });

  it("returns no readability badge for short proposals", () => {
    const { hook } = setup({ aiSections: { Need: { text: "short" } } });
    expect(hook.result.current.readabilityBadgeProps).toBe(null);
  });
});

describe("useProposalSections — generateAll", () => {
  it("generates each non-edited section, persists aiDraft, and auto-advances the stage", async () => {
    const onRunAI = vi.fn(async (kind) => kind === "sectionDraft" ? "body" : "research");
    const { hook, onUpdate } = setup({ stage: "scouted" }, { onRunAI });

    await act(async () => { await hook.result.current.generateAll(); });

    // Both sections requested
    const draftCalls = onRunAI.mock.calls.filter((c) => c[0] === "sectionDraft");
    expect(draftCalls).toHaveLength(2);

    // Final update assembles aiDraft + advances stage
    const final = onUpdate.mock.calls.map((c) => c[1]).reverse().find((c) => c.aiSectionsAt);
    expect(final.aiDraft).toContain("Need::CLEAN:body");
    expect(final.stage).toBe("drafting");
  });

  it("skips manually-edited sections", async () => {
    const onRunAI = vi.fn(async () => "body");
    const { hook, onRunAI: _ai } = setup({
      aiSections: { Need: { text: "kept", isManualEdit: true } },
    }, { onRunAI });
    await act(async () => { await hook.result.current.generateAll(); });
    const drafts = onRunAI.mock.calls.filter((c) => c[0] === "sectionDraft");
    expect(drafts.map((c) => c[2].sectionName)).toEqual(["Budget"]); // Need skipped
  });

  it("extracts a recommended ask from the Budget section and sets it when not user-overridden", async () => {
    const onRunAI = vi.fn(async (kind, _g, args) =>
      args?.sectionName === "Budget" ? "RECOMMENDED_ASK: R1,500,000\nASK_REASONING: matched programme type" : "body");
    const { hook, onUpdate } = setup({ stage: "drafting", askSource: "ai-scout" }, { onRunAI });
    await act(async () => { await hook.result.current.generateAll(); });
    const final = onUpdate.mock.calls.map((c) => c[1]).reverse().find((c) => c.aiSectionsAt);
    expect(final.ask).toBe(1500000);
    expect(final.askSource).toBe("ai-draft");
    expect(final.aiRecommendedAsk).toBe(1500000);
  });

  it("does NOT overwrite a user-set ask (budget-builder) but still records the recommendation", async () => {
    const onRunAI = vi.fn(async (kind, _g, args) =>
      args?.sectionName === "Budget" ? "RECOMMENDED_ASK: R2,000,000" : "body");
    const { hook, onUpdate } = setup({ askSource: "budget-builder" }, { onRunAI });
    await act(async () => { await hook.result.current.generateAll(); });
    const final = onUpdate.mock.calls.map((c) => c[1]).reverse().find((c) => c.aiSectionsAt);
    expect(final.aiRecommendedAsk).toBe(2000000);
    expect(final.ask).toBeUndefined(); // respected the override
  });

  it("runs research inline when missing before drafting sections", async () => {
    const onRunAI = vi.fn(async (kind) => kind === "research" ? "fresh research" : "body");
    const { hook, onUpdate } = setup({ aiResearch: null }, { onRunAI });
    await act(async () => { await hook.result.current.generateAll(); });
    expect(onRunAI.mock.calls.some((c) => c[0] === "research")).toBe(true);
    // research persisted before sections
    expect(onUpdate.mock.calls.some((c) => c[1].aiResearch === "CLEAN:fresh research")).toBe(true);
  });

  it("stopGenerateAll cancels the loop so not every section is generated", async () => {
    let calls = 0;
    const onRunAI = vi.fn(async () => {
      calls++;
      if (calls === 1) act(() => hook.result.current.stopGenerateAll());
      return "body";
    });
    let hook;
    const s = setup({ aiSectionsOrder: ["A", "B", "C"], aiSections: {} }, { onRunAI });
    hook = s.hook;
    await act(async () => { await hook.result.current.generateAll(); });
    const drafts = onRunAI.mock.calls.filter((c) => c[0] === "sectionDraft");
    expect(drafts.length).toBeLessThan(3); // cancelled before finishing all 3
  });
});

describe("useProposalSections — migrateToSections", () => {
  it("splits a legacy aiDraft into the section shape", () => {
    const draft = "Need\nThe need body.\nBudget\nThe budget body.";
    const { hook, onUpdate } = setup({ aiDraft: draft, aiSections: undefined });
    expect(hook.result.current.hasLegacyDraft).toBe(true);
    act(() => { hook.result.current.migrateToSections(); });
    const [, changes] = onUpdate.mock.calls[0];
    expect(changes.aiSections.Need.text).toBe("The need body.");
    expect(changes.aiSections.Budget.text).toBe("The budget body.");
    expect(changes.aiSections.Need.isManualEdit).toBe(false);
  });
});
