// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/api", () => ({ saveGrant: vi.fn() }));
import { saveGrant } from "@/api";
import useSave from "@/hooks/useSave";

describe("useSave", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("debounces ~1s then persists, toggling saveState saving→saved", async () => {
    saveGrant.mockResolvedValue({});
    const { result } = renderHook(() => useSave(vi.fn(), "k"));
    act(() => { result.current.dSave("g1", { id: "g1", x: 1 }); });
    expect(saveGrant).not.toHaveBeenCalled(); // still debounced
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(saveGrant).toHaveBeenCalledWith({ id: "g1", x: 1 });
    expect(result.current.saveState).toBe("saved");
  });

  it("collapses rapid saves for the same id into the latest", async () => {
    saveGrant.mockResolvedValue({});
    const { result } = renderHook(() => useSave(vi.fn(), "k"));
    act(() => {
      result.current.dSave("g1", { id: "g1", v: 1 });
      result.current.dSave("g1", { id: "g1", v: 2 });
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(saveGrant).toHaveBeenCalledTimes(1);
    expect(saveGrant).toHaveBeenCalledWith({ id: "g1", v: 2 });
  });

  it("silent saves persist without touching saveState", async () => {
    saveGrant.mockResolvedValue({});
    const { result } = renderHook(() => useSave(vi.fn(), "k"));
    act(() => { result.current.dSave("g1", { id: "g1" }, { silent: true }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(saveGrant).toHaveBeenCalled();
    expect(result.current.saveState).toBe("idle");
  });

  it("on failure sets error state and toasts the message", async () => {
    saveGrant.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const toast = vi.fn();
    const { result } = renderHook(() => useSave(toast, "k"));
    act(() => { result.current.dSave("g1", { id: "g1" }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(result.current.saveState).toBe("error");
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0][0]).toContain("boom");
  });
});
