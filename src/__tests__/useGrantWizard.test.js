// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/api", () => ({ uploadFile: vi.fn() }));

import { uploadFile } from "@/api";
import useGrantWizard from "@/hooks/useGrantWizard";
import { PTYPES } from "@/data/funderStrategy";

const T1 = PTYPES[1].cost; // 516000
const T2 = PTYPES[2].cost; // 1597200

const render = (extra = {}) =>
  renderHook(() => useGrantWizard("Foundation", { onAddGrant: vi.fn(), onSelectGrant: vi.fn(), ...extra }));

describe("useGrantWizard", () => {
  beforeEach(() => vi.clearAllMocks());

  it("initialises with the provided default type", () => {
    const { result } = render();
    expect(result.current.newType).toBe("Foundation");
    expect(result.current.wizStep).toBe(1);
  });

  it("calcTotalAsk sums selected programme costs × cohorts and adds 30% org cost", () => {
    const { result } = render();
    const single = new Map([["1", { cohorts: 1 }]]);
    // base 516000 + 30% = 670800
    expect(result.current.calcTotalAsk(single, [], true)).toBe(Math.round(T1 * 1.3));
    // includeOrgCost=false → base only
    expect(result.current.calcTotalAsk(single, [], false)).toBe(T1);
    // multi-cohort + second type
    const multi = new Map([["1", { cohorts: 2 }], ["2", { cohorts: 1 }]]);
    const base = T1 * 2 + T2;
    expect(result.current.calcTotalAsk(multi, [], false)).toBe(base);
    expect(result.current.calcTotalAsk(multi, [], true)).toBe(Math.round(base * 1.3));
  });

  it("calcTotalAsk includes custom programmes by id", () => {
    const { result } = render();
    const customs = [{ id: "custom-0", name: "Bespoke", cost: 100000 }];
    const sel = new Map([["custom-0", { cohorts: 3 }]]);
    expect(result.current.calcTotalAsk(sel, customs, false)).toBe(300000);
  });

  it("addGrantEnhanced validates name and funder before submitting", () => {
    const onAddGrant = vi.fn();
    const { result } = render({ onAddGrant });
    let ok;
    act(() => { ok = result.current.addGrantEnhanced(false); });
    expect(ok).toBe(false);
    expect(result.current.addError).toMatch(/at least 2 characters/);
    expect(onAddGrant).not.toHaveBeenCalled();

    act(() => result.current.setNewName("My Grant"));
    act(() => { ok = result.current.addGrantEnhanced(false); });
    expect(ok).toBe(false);
    expect(result.current.addError).toMatch(/Funder name is required/);
    expect(onAddGrant).not.toHaveBeenCalled();
  });

  it("addGrantEnhanced builds the grant payload with calculated ask, notes, and source", () => {
    const onAddGrant = vi.fn();
    const onSelectGrant = vi.fn();
    const { result } = render({ onAddGrant, onSelectGrant });

    act(() => {
      result.current.setNewName("Youth AI Programme");
      result.current.setNewFunder("Foundation X");
      result.current.setNewType("Foundation");
      result.current.setNewMarket("sa");
      result.current.setNewSource("relationship");
      result.current.setNewFocusTags(["Youth Employment"]);
      result.current.setSelectedPTypes(new Map([["1", { cohorts: 2 }]]));
      result.current.setNewNotes("Returning funder context");
    });

    let ok;
    act(() => { ok = result.current.addGrantEnhanced(false); });
    expect(ok).toBe(true);
    expect(onAddGrant).toHaveBeenCalledTimes(1);

    const g = onAddGrant.mock.calls[0][0];
    expect(g.name).toBe("Youth AI Programme");
    expect(g.funder).toBe("Foundation X");
    expect(g.stage).toBe("scouted");
    // ask = calculated (2 cohorts of Type 1 + 30% org)
    expect(g.ask).toBe(Math.round(T1 * 2 * 1.3));
    expect(g.askSource).toBe("calculated");
    expect(g.source).toBe("relationship");
    expect(g.focus).toEqual(["Youth Employment"]);
    // notes combine the programme summary and the user notes
    expect(g.notes).toContain("Type 1 (2 cohorts)");
    expect(g.notes).toContain("Returning funder context");
    expect(g.owner).toBe("team");
    // runAI=false → no pending AI and no auto-open
    expect(g._pendingAI).toBe(null);
    expect(onSelectGrant).not.toHaveBeenCalled();
  });

  it("manual ask override takes priority over the calculated ask", () => {
    const onAddGrant = vi.fn();
    const { result } = render({ onAddGrant });
    act(() => {
      result.current.setNewName("Manual Ask Grant");
      result.current.setNewFunder("Funder");
      result.current.setSelectedPTypes(new Map([["1", { cohorts: 1 }]]));
      result.current.setNewAsk("750,000");
    });
    act(() => { result.current.addGrantEnhanced(false); });
    const g = onAddGrant.mock.calls[0][0];
    expect(g.ask).toBe(750000);
    expect(g.askSource).toBe("manual");
  });

  it("runAI=true with an enabled action attaches _pendingAI and opens the grant", () => {
    const onAddGrant = vi.fn();
    const onSelectGrant = vi.fn();
    const { result } = render({ onAddGrant, onSelectGrant });
    act(() => {
      result.current.setNewName("AI Grant");
      result.current.setNewFunder("Funder");
      // default autoAI has fitscore: true
    });
    let grantId;
    act(() => { result.current.addGrantEnhanced(true); });
    const g = onAddGrant.mock.calls[0][0];
    grantId = g.id;
    expect(g._pendingAI).toEqual({ fitscore: true, research: false, draft: false });
    expect(onSelectGrant).toHaveBeenCalledWith(grantId);
  });

  it("uploads pending files in the background after creation", async () => {
    uploadFile.mockResolvedValue({});
    const onAddGrant = vi.fn();
    const fileA = { name: "rfp.pdf" };
    const { result } = render({ onAddGrant });
    act(() => {
      result.current.setNewName("Grant With Files");
      result.current.setNewFunder("Funder");
      result.current.setPendingFiles([fileA]);
    });
    let grantId;
    await act(async () => {
      result.current.addGrantEnhanced(false);
      grantId = onAddGrant.mock.calls[0][0].id;
      await Promise.resolve();
    });
    expect(uploadFile).toHaveBeenCalledWith(fileA, grantId, null);
  });

  it("resetWizard clears fields back to defaults", () => {
    const { result } = render();
    act(() => {
      result.current.setNewName("X");
      result.current.setNewFunder("Y");
      result.current.setWizStep(3);
      result.current.setSelectedPTypes(new Map([["1", { cohorts: 1 }]]));
      result.current.setAutoAI({ fitscore: false, research: true, draft: true });
    });
    act(() => result.current.resetWizard());
    expect(result.current.wizStep).toBe(1);
    expect(result.current.selectedPTypes.size).toBe(0);
    expect(result.current.autoAI).toEqual({ fitscore: true, research: false, draft: false });
    // resetWizard does not clear name/funder (matches original behaviour)
  });
});
