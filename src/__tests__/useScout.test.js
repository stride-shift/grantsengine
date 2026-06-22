// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ── Mocks ──────────────────────────────────────────────────────────────────
vi.mock("@/api", () => ({
  kvGet: vi.fn(),
  kvSet: vi.fn(),
  verifyUrls: vi.fn(),
}));
vi.mock("@/prompts", () => ({
  scoutPrompt: vi.fn((args) => ({ system: "sys", user: `user:${args.market}`, search: true, maxTok: 4096 })),
  scoutBriefPrompt: vi.fn(() => ({ system: "bsys", user: "buser", search: false, maxTok: 800 })),
}));
vi.mock("@/data/constants", () => ({
  CLOSED_STAGES: ["won", "lost", "deferred", "archived"],
}));

import { kvGet, kvSet, verifyUrls } from "@/api";
import { scoutPrompt } from "@/prompts";
import useScout from "@/hooks/useScout";

// A scout result the AI "returns" — used to build api() JSON responses.
const mkResult = (over = {}) => ({
  name: "Acme Skills Grant", funder: "Acme Foundation", type: "Foundation",
  funderBudget: 1000000, deadline: null, fit: "High", reason: "Good fit",
  url: "https://acme.org/apply/skills", focus: ["Youth Employment", "Digital Skills"],
  access: "Open", accessNote: "Apply online", sourceConfidence: "verified",
  ...over,
});

const jsonResponse = (arr) => JSON.stringify(arr);

// Default orgContext is empty so the scout-run tests do NOT trigger the
// auto-brief-generation branch (guarded by `!brief && orgContext`); that keeps
// api() call counts attributable to scout calls only. The brief tests pass an
// explicit orgContext.
const makeProps = (over = {}) => ({
  orgContext: "",
  grants: [],
  onAddGrant: vi.fn(),
  onScoutingChange: vi.fn(),
  api: vi.fn(async () => jsonResponse([mkResult()])),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  kvGet.mockResolvedValue(null);
  kvSet.mockResolvedValue(undefined);
  verifyUrls.mockResolvedValue([]);
});

describe("useScout", () => {
  it("runs a single-market scout, scores + sorts results, mirrors busy state", async () => {
    const props = makeProps({
      api: vi.fn(async () => jsonResponse([
        mkResult({ name: "Low fit", funder: "Tiny Co", fit: "Medium", funderBudget: 50000, focus: [], sourceConfidence: "likely" }),
        mkResult({ name: "High fit", funder: "Acme Foundation" }),
      ])),
    });
    const { result } = renderHook(() => useScout(props));

    await act(async () => { await result.current.aiScout({ market: "sa" }); });

    expect(props.api).toHaveBeenCalledTimes(1);
    expect(result.current.scoutResults).toHaveLength(2);
    // Sorted by fitScore desc — the higher-scoring "High fit" comes first.
    expect(result.current.scoutResults[0].name).toBe("High fit");
    expect(result.current.scoutResults[0].fitScore).toBeGreaterThan(result.current.scoutResults[1].fitScore);
    // Busy state mirrored up and reset.
    expect(props.onScoutingChange).toHaveBeenCalledWith(true);
    expect(props.onScoutingChange).toHaveBeenLastCalledWith(false);
    expect(result.current.scouting).toBe(false);
  });

  it("market 'both' fires two sequential AI calls (SA then global) and merges results", async () => {
    const api = vi.fn()
      .mockResolvedValueOnce(jsonResponse([mkResult({ name: "SA grant", funder: "SA Funder" })]))
      .mockResolvedValueOnce(jsonResponse([mkResult({ name: "Global grant", funder: "Global Funder" })]));
    const props = makeProps({ api });
    const { result } = renderHook(() => useScout(props));

    await act(async () => { await result.current.aiScout({ market: "both" }); });

    expect(api).toHaveBeenCalledTimes(2);
    // Prompt built once per market.
    const markets = scoutPrompt.mock.calls.map(c => c[0].market);
    expect(markets).toContain("sa");
    expect(markets).toContain("global");
    const names = result.current.scoutResults.map(s => s.name);
    expect(names).toContain("SA grant");
    expect(names).toContain("Global grant");
  });

  it("dedups by normalised funder + similar title", async () => {
    const api = vi.fn(async () => jsonResponse([
      mkResult({ name: "Acme Skills Grant", funder: "Acme Foundation" }),
      mkResult({ name: "Acme Skills Grant", funder: "The Acme Foundation Trust", url: "https://acme.org/apply/skills2" }),
      mkResult({ name: "Beta Youth Fund", funder: "Beta Trust", url: "https://beta.org/apply" }),
    ]));
    const { result } = renderHook(() => useScout(makeProps({ api })));

    await act(async () => { await result.current.aiScout({ market: "sa" }); });

    // The two Acme variants collapse to one; Beta survives → 2 total.
    expect(result.current.scoutResults).toHaveLength(2);
    const funders = result.current.scoutResults.map(s => s.funder);
    expect(funders).toContain("Beta Trust");
  });

  it("drops results with no URL (hallucination shield)", async () => {
    const api = vi.fn(async () => jsonResponse([
      mkResult({ name: "Has URL", funder: "Acme Foundation" }),
      mkResult({ name: "No URL", funder: "Ghost Co", url: "" }),
    ]));
    const { result } = renderHook(() => useScout(makeProps({ api })));

    await act(async () => { await result.current.aiScout({ market: "sa" }); });

    expect(result.current.scoutResults).toHaveLength(1);
    expect(result.current.scoutResults[0].name).toBe("Has URL");
  });

  it("assigns confidence: verified+open+url+deadline → high; homepage-only → low", async () => {
    const api = vi.fn(async () => jsonResponse([
      mkResult({ name: "Strong", funder: "Acme Foundation", deadline: "2026-12-31" }),
      mkResult({ name: "Weak", funder: "Generic Co", url: "https://generic.org/", sourceConfidence: "uncertain" }),
    ]));
    const { result } = renderHook(() => useScout(makeProps({ api })));

    await act(async () => { await result.current.aiScout({ market: "sa" }); });

    const byName = Object.fromEntries(result.current.scoutResults.map(s => [s.name, s]));
    expect(byName.Strong.confidence).toBe("high");
    expect(byName.Weak.confidence).toBe("low");
    expect(byName.Weak.genericLink).toBe(true);
  });

  it("marks results whose funder is already in the (active) pipeline", async () => {
    const grants = [{ funder: "Acme Foundation", stage: "scouted" }];
    const api = vi.fn(async () => jsonResponse([mkResult({ funder: "Acme Foundation" })]));
    const { result } = renderHook(() => useScout(makeProps({ grants, api })));

    await act(async () => { await result.current.aiScout({ market: "sa" }); });

    expect(result.current.scoutResults[0].inPipeline).toBe(true);
  });

  it("scoutDisplay hides low-confidence by default and filters by fit; rejected sort to bottom", async () => {
    const api = vi.fn(async () => jsonResponse([
      mkResult({ name: "High", funder: "Acme Foundation", deadline: "2026-12-31" }),
      mkResult({ name: "LowConf", funder: "Generic Co", url: "https://generic.org/", sourceConfidence: "uncertain" }),
    ]));
    const { result } = renderHook(() => useScout(makeProps({ api })));
    await act(async () => { await result.current.aiScout({ market: "sa" }); });

    // Default display hides the low-confidence "LowConf".
    let shown = result.current.scoutDisplay();
    expect(shown.map(s => s.name)).toEqual(["High"]);
    expect(result.current.hiddenLowConfCount).toBe(1);

    // Opt in → both appear.
    shown = result.current.scoutDisplay({ showUncertain: true });
    expect(shown).toHaveLength(2);
  });

  it("rejectScoutResult flags the card, persists a rejection, and pushes it to the bottom of display", async () => {
    const api = vi.fn(async () => jsonResponse([
      mkResult({ name: "Keeper", funder: "Acme Foundation", deadline: "2026-12-31" }),
      mkResult({ name: "Reject me", funder: "Bad Co", url: "https://bad.org/apply", deadline: "2026-12-31" }),
    ]));
    const { result } = renderHook(() => useScout(makeProps({ api })));
    await act(async () => { await result.current.aiScout({ market: "sa" }); });

    const target = result.current.scoutResults.find(s => s.name === "Reject me");
    act(() => { result.current.rejectScoutResult(target, "wrong_sector", ""); });

    const rejected = result.current.scoutResults.find(s => s.name === "Reject me");
    expect(rejected.rejected).toBe(true);
    expect(rejected.rejectReason).toBe("wrong_sector");
    // Persisted to KV with the rejection payload.
    expect(kvSet).toHaveBeenCalledWith("scout_rejections", expect.arrayContaining([
      expect.objectContaining({ funder: "Bad Co", reason: "wrong_sector" }),
    ]));
    // Rejected card sorts last in display.
    const shown = result.current.scoutDisplay();
    expect(shown[shown.length - 1].name).toBe("Reject me");
  });

  it("addScoutToPipeline builds the grant payload, calls onAddGrant, and marks the card added", async () => {
    const onAddGrant = vi.fn();
    const api = vi.fn(async () => jsonResponse([mkResult({
      name: "CSI Award", funder: "Big Corp", type: "Corporate CSI",
      funderBudget: 2000000, access: "Open", accessNote: "Apply via portal",
      url: "https://bigcorp.com/csi/apply", reason: "Strong CSI fit",
    })]));
    const { result } = renderHook(() => useScout(makeProps({ api, onAddGrant })));
    await act(async () => { await result.current.aiScout({ market: "sa" }); });

    const s = result.current.scoutResults[0];
    act(() => { result.current.addScoutToPipeline(s); });

    expect(onAddGrant).toHaveBeenCalledTimes(1);
    const g = onAddGrant.mock.calls[0][0];
    expect(g.name).toBe("CSI Award");
    expect(g.funder).toBe("Big Corp");
    expect(g.type).toBe("Corporate CSI"); // mapped from "corporate"/"csi"
    expect(g.stage).toBe("scouted");
    expect(g.ask).toBe(0);
    expect(g.funderBudget).toBe(2000000);
    expect(g.source).toBe("scout");
    expect(g.applyUrl).toBe("https://bigcorp.com/csi/apply");
    expect(g.notes).toContain("Apply: https://bigcorp.com/csi/apply");
    expect(g.notes).toContain("Strong CSI fit");

    // Card flagged as added.
    expect(result.current.scoutResults[0].added).toBe(true);
  });

  it("addScoutToPipeline omits grounding-redirect URLs from applyUrl/notes", async () => {
    const onAddGrant = vi.fn();
    const redirect = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc";
    const api = vi.fn(async () => jsonResponse([mkResult({ funder: "Redir Co", url: redirect })]));
    const { result } = renderHook(() => useScout(makeProps({ api, onAddGrant })));
    await act(async () => { await result.current.aiScout({ market: "sa" }); });

    act(() => { result.current.addScoutToPipeline(result.current.scoutResults[0]); });
    const g = onAddGrant.mock.calls[0][0];
    expect(g.applyUrl).toBe("");
    expect(g.notes).not.toContain("Apply:");
  });

  it("falls back to seed results when the AI returns unparseable text", async () => {
    const api = vi.fn(async () => "Sorry, no JSON here");
    const { result } = renderHook(() => useScout(makeProps({ api })));
    await act(async () => { await result.current.aiScout({ market: "sa" }); });
    // SCOUT_FALLBACK has 10 entries (all with URLs, distinct funders).
    expect(result.current.scoutResults.length).toBeGreaterThan(1);
  });

  it("URL verification resolves grounding redirects and downgrades dead links", async () => {
    const redirect = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/xyz";
    const api = vi.fn(async () => jsonResponse([
      mkResult({ name: "Redirected", funder: "Acme Foundation", url: redirect, deadline: "2026-12-31" }),
      mkResult({ name: "Dead", funder: "Beta Trust", url: "https://beta.org/apply", deadline: "2026-12-31" }),
    ]));
    verifyUrls.mockResolvedValue([
      { url: redirect, ok: true, status: 200, redirect: "https://acme.org/real-apply" },
      { url: "https://beta.org/apply", ok: false, status: 0 },
    ]);
    const { result } = renderHook(() => useScout(makeProps({ api })));
    await act(async () => { await result.current.aiScout({ market: "sa" }); });

    await waitFor(() => {
      const byName = Object.fromEntries(result.current.scoutResults.map(s => [s.name, s]));
      expect(byName.Redirected.url).toBe("https://acme.org/real-apply");
      expect(byName.Redirected.urlStatus).toBe("verified");
      expect(byName.Dead.urlStatus).toBe("dead");
      expect(byName.Dead.confidence).toBe("low");
    });
  });

  it("generateScoutBrief saves a good brief but ignores an API-error string", async () => {
    // First a good brief, then an error string.
    const api = vi.fn()
      .mockResolvedValueOnce("We train unemployed youth in AI-native digital skills.")
      .mockResolvedValueOnce("Error: rate limited");
    const { result } = renderHook(() => useScout(makeProps({ api, orgContext: "d-lab org context" })));

    let brief;
    await act(async () => { brief = await result.current.generateScoutBrief(); });
    expect(brief).toContain("digital skills");
    expect(result.current.scoutBrief).toContain("digital skills");
    expect(kvSet).toHaveBeenCalledWith("scout_brief", expect.stringContaining("digital skills"));

    kvSet.mockClear();
    await act(async () => { brief = await result.current.generateScoutBrief(); });
    expect(brief).toBe("");
    // Error string never persisted.
    expect(kvSet).not.toHaveBeenCalledWith("scout_brief", expect.stringContaining("Error"));
  });

  it("loads a persisted (non-error) brief from KV on mount", async () => {
    kvGet.mockImplementation((k) => Promise.resolve(k === "scout_brief" ? "Stored brief text" : null));
    const { result } = renderHook(() => useScout(makeProps()));
    await waitFor(() => expect(result.current.scoutBrief).toBe("Stored brief text"));
  });
});
