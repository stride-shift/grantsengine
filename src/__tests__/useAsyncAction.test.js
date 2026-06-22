// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useAsyncAction from "@/hooks/useAsyncAction";

describe("useAsyncAction", () => {
  it("runs, returns the result, calls onSuccess, and clears busy", async () => {
    const onSuccess = vi.fn();
    const fn = vi.fn().mockResolvedValue("ok");
    const { result } = renderHook(() => useAsyncAction(fn, { onSuccess }));
    expect(result.current.busy).toBe(false);

    let ret;
    await act(async () => { ret = await result.current.run("a", "b"); });

    expect(fn).toHaveBeenCalledWith("a", "b");
    expect(ret).toBe("ok");
    expect(onSuccess).toHaveBeenCalledWith("ok");
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it("captures thrown errors and returns null", async () => {
    const onError = vi.fn();
    const fn = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useAsyncAction(fn, { onError }));

    let ret;
    await act(async () => { ret = await result.current.run(); });

    expect(ret).toBe(null);
    expect(result.current.error).toBe("boom");
    expect(onError).toHaveBeenCalled();
  });

  it("treats an AI-error string result as a failure", async () => {
    const fn = vi.fn().mockResolvedValue("Error: rate limited");
    const { result } = renderHook(() => useAsyncAction(fn));

    let ret;
    await act(async () => { ret = await result.current.run(); });

    expect(ret).toBe(null);
    expect(result.current.error).toBe("Error: rate limited");
  });

  it("reset() clears the error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useAsyncAction(fn));
    await act(async () => { await result.current.run(); });
    expect(result.current.error).toBe("boom");

    act(() => { result.current.reset(); });
    expect(result.current.error).toBe(null);
  });
});
