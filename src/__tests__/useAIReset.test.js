// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useAIReset, { AI_FIELDS } from "@/hooks/useAIReset";

const AI_KEYS = Object.keys(AI_FIELDS);

describe("useAIReset", () => {
  it("AI_FIELDS clears exactly the AI-content keys (all null)", () => {
    expect(AI_KEYS.sort()).toEqual([
      "aiDraft", "aiDraftAt", "aiFitscore", "aiFitscoreAt", "aiFollowup", "aiFollowupAt",
      "aiRecommendedAsk", "aiResearch", "aiResearchAt", "aiResearchStructured",
      "aiSections", "aiWinloss", "researchHistory",
    ].sort());
    expect(Object.values(AI_FIELDS).every(v => v === null)).toBe(true);
  });

  it("saves each AI-bearing grant cleaned, tracks progress, clears local state, flashes", async () => {
    const withAI = [
      { id: "g1", funder: "A", aiResearch: "x", ask: 500 },
      { id: "g2", funder: "B", aiDraft: "y", notes: "keep" },
    ];
    const onSaveGrant = vi.fn().mockResolvedValue({});
    const onSetGrants = vi.fn();
    const flash = vi.fn();

    const { result } = renderHook(() => useAIReset(withAI, onSaveGrant, onSetGrants, flash, 5));

    await act(async () => { await result.current.reset(); });

    // Each grant persisted with AI fields nulled but other fields preserved
    expect(onSaveGrant).toHaveBeenCalledTimes(2);
    expect(onSaveGrant).toHaveBeenNthCalledWith(1, { ...withAI[0], ...AI_FIELDS });
    expect(onSaveGrant).toHaveBeenNthCalledWith(2, { ...withAI[1], ...AI_FIELDS });
    expect(onSaveGrant.mock.calls[0][0].ask).toBe(500);
    expect(onSaveGrant.mock.calls[0][0].aiResearch).toBe(null);

    // Local state cleared functionally
    expect(onSetGrants).toHaveBeenCalledTimes(1);
    const updater = onSetGrants.mock.calls[0][0];
    expect(updater([{ id: "g9", funder: "Z", aiDraft: "z" }]))
      .toEqual([{ id: "g9", funder: "Z", ...AI_FIELDS }]);

    expect(flash).toHaveBeenCalledWith("AI content cleared from 2 grants");
    expect(result.current.busy).toBe(false);
    expect(result.current.progress).toBe(null);
  });

  it("uses singular grammar for a single grant", async () => {
    const flash = vi.fn();
    const { result } = renderHook(() =>
      useAIReset([{ id: "g1", aiResearch: "x" }], vi.fn().mockResolvedValue({}), vi.fn(), flash, 1));
    await act(async () => { await result.current.reset(); });
    expect(flash).toHaveBeenCalledWith("AI content cleared from 1 grant");
  });

  it("flashes the error and still clears progress when a save fails", async () => {
    const onSaveGrant = vi.fn().mockRejectedValue(new Error("save failed"));
    const onSetGrants = vi.fn();
    const flash = vi.fn();
    const { result } = renderHook(() =>
      useAIReset([{ id: "g1", aiResearch: "x" }], onSaveGrant, onSetGrants, flash, 1));

    await act(async () => { await result.current.reset(); });

    expect(flash).toHaveBeenCalledWith("Error: save failed");
    expect(onSetGrants).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
    expect(result.current.progress).toBe(null);
  });
});
