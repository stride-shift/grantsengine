// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useEmailLogin from "@/hooks/useEmailLogin";

describe("useEmailLogin", () => {
  it("submits trimmed email + password via onEmailLogin", async () => {
    const onEmailLogin = vi.fn().mockResolvedValue({ slug: "dlab" });
    const { result } = renderHook(() => useEmailLogin({ onEmailLogin }));
    act(() => { result.current.setEmail("  alison@d-lab.co.za "); result.current.setPassword("pw"); });
    await act(async () => { await result.current.submit({ preventDefault() {} }); });
    expect(onEmailLogin).toHaveBeenCalledWith("alison@d-lab.co.za", "pw");
    expect(result.current.err).toBe("");
  });

  it("validates that both fields are present before calling onEmailLogin", async () => {
    const onEmailLogin = vi.fn();
    const { result } = renderHook(() => useEmailLogin({ onEmailLogin }));
    act(() => { result.current.setEmail(""); result.current.setPassword(""); });
    await act(async () => { await result.current.submit({ preventDefault() {} }); });
    expect(onEmailLogin).not.toHaveBeenCalled();
    expect(result.current.err).toContain("email and password");
  });

  it("surfaces the server error message on failure", async () => {
    const onEmailLogin = vi.fn().mockRejectedValue(new Error("Invalid email or password"));
    const { result } = renderHook(() => useEmailLogin({ onEmailLogin }));
    act(() => { result.current.setEmail("a@x.com"); result.current.setPassword("bad"); });
    await act(async () => { await result.current.submit({ preventDefault() {} }); });
    expect(result.current.err).toBe("Invalid email or password");
    expect(result.current.busy).toBe(false);
  });
});
