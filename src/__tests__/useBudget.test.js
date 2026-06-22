// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useBudget from "@/hooks/useBudget";
import { PTYPES } from "@/data/funderStrategy";

const ITEMS_T1 = PTYPES[1].table.filter(([l]) => l !== "TOTAL").length;

describe("useBudget", () => {
  it("auto-detects type (by ask) and cohorts (from notes) on mount", () => {
    const { result } = renderHook(() => useBudget({ id: "g1", ask: 516000, notes: "" }, vi.fn()));
    expect(result.current.typeNum).toBe(1);

    const { result: r2 } = renderHook(() => useBudget({ id: "g2", notes: "3 × type 2 cohorts" }, vi.fn()));
    expect(r2.current.typeNum).toBe(2);
    expect(r2.current.cohorts).toBe(3);
  });

  it("selectType loads PTYPES line items and enters edit mode", () => {
    const { result } = renderHook(() => useBudget({ id: "g1", notes: "" }, vi.fn()));
    act(() => { result.current.selectType(1); });
    expect(result.current.items).toHaveLength(ITEMS_T1);
    expect(result.current.items.every((it) => !it.isCustom)).toBe(true);
    expect(result.current.editing).toBe(true);
    expect(result.current.collapsed).toBe(false);
    // Type 1 line items sum to its R516,000 total
    expect(result.current.calcs.total).toBe(516000);
  });

  it("applies cohorts, years, and the 30% org contribution to the total", () => {
    const { result } = renderHook(() => useBudget({ id: "g1", notes: "" }, vi.fn()));
    act(() => { result.current.selectType(1); });
    act(() => { result.current.setCohorts(2); result.current.setYears(1); });
    expect(result.current.calcs.subtotal).toBe(1032000);
    act(() => { result.current.setOrgContrib(true); });
    // 1,032,000 + round(30%) = 1,032,000 + 309,600
    expect(result.current.calcs.total).toBe(1341600);
  });

  it("addItem appends a custom line; removeItem drops it", () => {
    const { result } = renderHook(() => useBudget({ id: "g1", notes: "" }, vi.fn()));
    act(() => { result.current.selectType(1); });
    const base = result.current.calcs.itemTotal;
    act(() => { result.current.addItem("Extra coaching", 1000); });
    expect(result.current.items).toHaveLength(ITEMS_T1 + 1);
    expect(result.current.calcs.itemTotal).toBe(base + 1000);
    act(() => { result.current.removeItem(result.current.items.length - 1); });
    expect(result.current.items).toHaveLength(ITEMS_T1);
    expect(result.current.calcs.itemTotal).toBe(base);
  });

  it("addItem ignores a blank label", () => {
    const { result } = renderHook(() => useBudget({ id: "g1", notes: "" }, vi.fn()));
    act(() => { result.current.selectType(1); });
    let ok;
    act(() => { ok = result.current.addItem("   ", 50); });
    expect(ok).toBe(false);
    expect(result.current.items).toHaveLength(ITEMS_T1);
  });

  it("saveBudget persists the table + ask via onUpdate", () => {
    const onUpdate = vi.fn();
    const { result } = renderHook(() => useBudget({ id: "g7", notes: "" }, onUpdate));
    act(() => { result.current.selectType(1); });
    act(() => { result.current.saveBudget(); });

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const [id, changes] = onUpdate.mock.calls[0];
    expect(id).toBe("g7");
    expect(changes.ask).toBe(516000);
    expect(changes.askSource).toBe("budget-builder");
    expect(changes.budgetTable.total).toBe(516000);
    expect(changes.askYears).toBe(null);
    expect(result.current.editing).toBe(false);
  });

  it("clearBudget resets state and clears the saved table", () => {
    const onUpdate = vi.fn();
    const { result } = renderHook(() => useBudget({ id: "g1", notes: "" }, onUpdate));
    act(() => { result.current.selectType(1); });
    act(() => { result.current.clearBudget(); });
    expect(result.current.typeNum).toBe(null);
    expect(result.current.items).toEqual([]);
    expect(onUpdate).toHaveBeenLastCalledWith("g1", { budgetTable: null, askYears: null });
  });
});
