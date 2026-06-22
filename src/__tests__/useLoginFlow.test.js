// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/api", () => ({
  getTeamPublic: vi.fn(() => Promise.resolve([])),
  requestPasswordReset: vi.fn(),
  resetPasswordWithToken: vi.fn(),
}));
import { getTeamPublic, requestPasswordReset, resetPasswordWithToken } from "@/api";
import useLoginFlow from "@/hooks/useLoginFlow";

const noopEvt = () => ({ preventDefault: vi.fn() });

beforeEach(() => {
  vi.clearAllMocks();
  getTeamPublic.mockResolvedValue([]);
  // Reset the URL between tests so the mount-time reset-token detection is clean.
  window.history.replaceState({}, "", "/");
});

describe("useLoginFlow", () => {
  it("starts on the pick step and loads the member list, role-sorted", async () => {
    getTeamPublic.mockResolvedValue([
      { id: "b", role: "board", hasPassword: true },
      { id: "d", role: "director", hasPassword: true },
      { id: "p", role: "pm", hasPassword: true },
    ]);
    const { result } = renderHook(() => useLoginFlow({ slug: "dlab", onMemberLogin: vi.fn() }));
    expect(result.current.step).toBe("pick");
    expect(result.current.loading).toBe(true);

    await act(async () => { await Promise.resolve(); });

    expect(result.current.loading).toBe(false);
    expect(getTeamPublic).toHaveBeenCalledWith("dlab");
    // Preserves the original (latent) sort: the comparator uses `ROLE_ORDER[role] || 9`,
    // so director (order 0) is treated as 9 and sorts LAST — pm(2) → board(3) → director.
    // Copied verbatim from Login.jsx; not "fixed" during the headless extraction.
    expect(result.current.members.map((m) => m.id)).toEqual(["p", "b", "d"]);
  });

  it("pickMember → password step for a member with a password", () => {
    const { result } = renderHook(() => useLoginFlow({ slug: "dlab", onMemberLogin: vi.fn() }));
    act(() => result.current.pickMember({ id: "alison", hasPassword: true }));
    expect(result.current.step).toBe("password");
    expect(result.current.selected.id).toBe("alison");
  });

  it("pickMember → setup step for a first-time member (no password)", () => {
    const { result } = renderHook(() => useLoginFlow({ slug: "dlab", onMemberLogin: vi.fn() }));
    act(() => result.current.pickMember({ id: "newbie", hasPassword: false }));
    expect(result.current.step).toBe("setup");
  });

  it("submitPassword calls onMemberLogin with the selected id + password", async () => {
    const onMemberLogin = vi.fn().mockResolvedValue({});
    const { result } = renderHook(() => useLoginFlow({ slug: "dlab", onMemberLogin }));
    act(() => result.current.pickMember({ id: "alison", hasPassword: true }));
    await act(async () => { await result.current.submitPassword(noopEvt(), "secret"); });
    expect(onMemberLogin).toHaveBeenCalledWith("alison", "secret");
    expect(result.current.err).toBe("");
  });

  it("submitPassword does nothing on an empty password", async () => {
    const onMemberLogin = vi.fn().mockResolvedValue({});
    const { result } = renderHook(() => useLoginFlow({ slug: "dlab", onMemberLogin }));
    act(() => result.current.pickMember({ id: "alison", hasPassword: true }));
    await act(async () => { await result.current.submitPassword(noopEvt(), ""); });
    expect(onMemberLogin).not.toHaveBeenCalled();
  });

  it("submitPassword surfaces a thrown error into err", async () => {
    const onMemberLogin = vi.fn().mockRejectedValue(new Error("bad password"));
    const { result } = renderHook(() => useLoginFlow({ slug: "dlab", onMemberLogin }));
    act(() => result.current.pickMember({ id: "alison", hasPassword: true }));
    await act(async () => { await result.current.submitPassword(noopEvt(), "nope"); });
    expect(result.current.err).toBe("bad password");
  });

  it("sendResetLink calls requestPasswordReset and advances to the sent step", async () => {
    requestPasswordReset.mockResolvedValue({});
    const { result } = renderHook(() => useLoginFlow({ slug: "dlab", onMemberLogin: vi.fn() }));
    act(() => result.current.pickMember({ id: "alison", hasPassword: false }));
    await act(async () => { await result.current.sendResetLink(); });
    expect(requestPasswordReset).toHaveBeenCalledWith("dlab", "alison");
    expect(result.current.step).toBe("sent");
  });

  it("submitResetPassword validates length and match before calling the api", async () => {
    resetPasswordWithToken.mockResolvedValue({});
    const { result } = renderHook(() => useLoginFlow({ slug: "dlab", onMemberLogin: vi.fn() }));

    await act(async () => { await result.current.submitResetPassword(noopEvt(), "abc", "abc"); });
    expect(result.current.err).toBe("Password must be at least 6 characters");
    expect(resetPasswordWithToken).not.toHaveBeenCalled();

    await act(async () => { await result.current.submitResetPassword(noopEvt(), "abcdef", "xyzzzz"); });
    expect(result.current.err).toBe("Passwords don't match");
    expect(resetPasswordWithToken).not.toHaveBeenCalled();
  });

  it("submitResetPassword calls resetPasswordWithToken with the URL token + slug prop", async () => {
    // Reset deep-link: token from URL, slug from URL — but the API call uses the slug PROP.
    window.history.replaceState({}, "", "/?reset=tok123&slug=urlorg");
    resetPasswordWithToken.mockResolvedValue({});
    const { result } = renderHook(() => useLoginFlow({ slug: "propslug", onMemberLogin: vi.fn() }));

    // Mount-time URL detection jumps to the reset step and captures the token.
    expect(result.current.step).toBe("reset");
    expect(result.current.resetToken).toBe("tok123");

    await act(async () => { await result.current.submitResetPassword(noopEvt(), "abcdef", "abcdef"); });
    // Preserved behaviour: the slug PROP is used, NOT the URL's slug param.
    expect(resetPasswordWithToken).toHaveBeenCalledWith("propslug", "tok123", "abcdef");
  });

  it("step transitions: goToForgot / backToPassword / goBack", () => {
    const { result } = renderHook(() => useLoginFlow({ slug: "dlab", onMemberLogin: vi.fn() }));
    act(() => result.current.pickMember({ id: "alison", hasPassword: true }));
    expect(result.current.step).toBe("password");
    act(() => result.current.goToForgot());
    expect(result.current.step).toBe("forgot");
    act(() => result.current.backToPassword());
    expect(result.current.step).toBe("password");
    act(() => result.current.goBack());
    expect(result.current.step).toBe("pick");
  });
});
