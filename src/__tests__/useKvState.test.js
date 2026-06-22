// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/api", () => ({ kvGet: vi.fn(), kvSet: vi.fn() }));
import { kvGet, kvSet } from "@/api";
import useKvState from "@/hooks/useKvState";

describe("useKvState", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("loads the stored value on mount", async () => {
    kvGet.mockResolvedValue({ a: 1 });
    const { result } = renderHook(() => useKvState("owners", {}));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(kvGet).toHaveBeenCalledWith("owners");
    expect(result.current.value).toEqual({ a: 1 });
  });

  it("keeps initialValue when stored is empty/missing", async () => {
    kvGet.mockResolvedValue({});
    const { result } = renderHook(() => useKvState("owners", { fallback: true }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.value).toEqual({ fallback: true });
  });

  it("persists on setValue (value form and updater form)", async () => {
    kvGet.mockResolvedValue(null);
    kvSet.mockResolvedValue({});
    const { result } = renderHook(() => useKvState("owners", { n: 0 }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.setValue({ n: 1 }); });
    expect(kvSet).toHaveBeenCalledWith("owners", { n: 1 });
    expect(result.current.value).toEqual({ n: 1 });

    await act(async () => { await result.current.setValue((prev) => ({ n: prev.n + 1 })); });
    expect(kvSet).toHaveBeenLastCalledWith("owners", { n: 2 });
    expect(result.current.value).toEqual({ n: 2 });
  });
});
