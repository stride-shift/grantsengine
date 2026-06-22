// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useEmailLogin from "@/hooks/useEmailLogin";
import { requestPasswordResetByEmail } from "@/api";

vi.mock("@/api", () => ({ requestPasswordResetByEmail: vi.fn() }));

beforeEach(() => { vi.clearAllMocks(); });

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

describe("useEmailLogin — forgot password (email-only)", () => {
  it("prompts for the email and does not call the API when the field is empty", async () => {
    const { result } = renderHook(() => useEmailLogin({ onEmailLogin: vi.fn() }));
    act(() => { result.current.setEmail("  "); });
    await act(async () => { await result.current.requestReset(); });
    expect(requestPasswordResetByEmail).not.toHaveBeenCalled();
    expect(result.current.forgotErr).toContain("email first");
    expect(result.current.forgotSent).toBe(false);
  });

  it("fires an email-only reset with the trimmed email and shows the confirmation", async () => {
    requestPasswordResetByEmail.mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useEmailLogin({ onEmailLogin: vi.fn() }));
    act(() => { result.current.setEmail("  alison@d-lab.co.za "); });
    await act(async () => { await result.current.requestReset(); });
    expect(requestPasswordResetByEmail).toHaveBeenCalledWith("alison@d-lab.co.za");
    expect(result.current.forgotSent).toBe(true);
    expect(result.current.forgotErr).toBe("");
  });

  it("still shows the confirmation on API error (anti-enumeration)", async () => {
    requestPasswordResetByEmail.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useEmailLogin({ onEmailLogin: vi.fn() }));
    act(() => { result.current.setEmail("a@x.com"); });
    await act(async () => { await result.current.requestReset(); });
    expect(result.current.forgotSent).toBe(true);
  });
});
