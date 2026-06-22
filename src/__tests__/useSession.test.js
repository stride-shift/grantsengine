// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@/api", () => ({
  isLoggedIn: vi.fn(() => false),
  getAuth: vi.fn(() => ({})),
  getCurrentMember: vi.fn(() => null),
  login: vi.fn(),
  setPassword: vi.fn(),
  memberLogin: vi.fn(),
  loginWithEmail: vi.fn(),
}));
import { isLoggedIn, getAuth, login, setPassword, memberLogin, loginWithEmail } from "@/api";
import useSession from "@/hooks/useSession";

beforeEach(() => {
  vi.clearAllMocks();
  isLoggedIn.mockReturnValue(false);
  getAuth.mockReturnValue({});
});

describe("useSession", () => {
  it("starts logged-out on the email-login screen (not the org picker)", () => {
    // Primary path is now email+password; the org/member picker is a fallback
    // reached via goToPicker — so selectingOrg defaults to false.
    const { result } = renderHook(() => useSession());
    expect(result.current.authed).toBe(false);
    expect(result.current.selectingOrg).toBe(false);
    expect(result.current.resetParams).toBe(null);
  });

  it("goToPicker switches to the legacy org/member picker", () => {
    const { result } = renderHook(() => useSession());
    act(() => result.current.goToPicker());
    expect(result.current.selectingOrg).toBe(true);
  });

  it("handleEmailLogin authenticates and clears a stale selectingOrg (regression)", async () => {
    // Repro: user had toggled the picker (selectingOrg=true), then signs in by email.
    // The successful login must clear it so the app — not OrgSelector — renders.
    loginWithEmail.mockResolvedValue({ slug: "dlab", member: { id: "alison" } });
    const { result } = renderHook(() => useSession());
    act(() => result.current.goToPicker());
    expect(result.current.selectingOrg).toBe(true);

    await act(async () => { await result.current.handleEmailLogin("alison@d-lab.co.za", "pw"); });

    expect(result.current.authed).toBe(true);
    expect(result.current.orgSlug).toBe("dlab");
    expect(result.current.selectingOrg).toBe(false);
    expect(result.current.loggingIn).toBe(false);
  });

  it("starts authed (with org slug) when already logged in", () => {
    isLoggedIn.mockReturnValue(true);
    getAuth.mockReturnValue({ slug: "dlab" });
    const { result } = renderHook(() => useSession());
    expect(result.current.authed).toBe(true);
    expect(result.current.orgSlug).toBe("dlab");
    expect(result.current.selectingOrg).toBe(false);
  });

  it("handleOrgSelect advances to the login step", () => {
    const { result } = renderHook(() => useSession());
    act(() => result.current.handleOrgSelect("acme", true));
    expect(result.current.orgSlug).toBe("acme");
    expect(result.current.needsPassword).toBe(true);
    expect(result.current.loggingIn).toBe(true);
    expect(result.current.selectingOrg).toBe(false);
  });

  it("handleLogin logs in via login() for an existing password", async () => {
    getAuth.mockReturnValue({ slug: "dlab" });
    login.mockResolvedValue({});
    const { result } = renderHook(() => useSession());
    await act(async () => { await result.current.handleLogin("pw"); });
    expect(login).toHaveBeenCalledWith("dlab", "pw");
    expect(result.current.authed).toBe(true);
    expect(result.current.loggingIn).toBe(false);
  });

  it("handleLogin sets the password when needsPassword (new org)", async () => {
    setPassword.mockResolvedValue({});
    const { result } = renderHook(() => useSession());
    act(() => result.current.handleOrgSelect("acme", true));
    await act(async () => { await result.current.handleLogin("newpw"); });
    expect(setPassword).toHaveBeenCalledWith("acme", "newpw");
    expect(result.current.authed).toBe(true);
  });

  it("handleMemberLogin sets the current member", async () => {
    getAuth.mockReturnValue({ slug: "dlab" });
    memberLogin.mockResolvedValue({ member: { id: "alison" } });
    const { result } = renderHook(() => useSession());
    await act(async () => { await result.current.handleMemberLogin("alison", "pw"); });
    expect(memberLogin).toHaveBeenCalledWith("dlab", "alison", "pw");
    expect(result.current.currentMember).toEqual({ id: "alison" });
    expect(result.current.authed).toBe(true);
  });

  it("clearAuthState resets the auth atoms", () => {
    isLoggedIn.mockReturnValue(true);
    const { result } = renderHook(() => useSession());
    expect(result.current.authed).toBe(true);
    act(() => result.current.clearAuthState());
    expect(result.current.authed).toBe(false);
    expect(result.current.currentMember).toBe(null);
    expect(result.current.selectingOrg).toBe(true);
    expect(result.current.loggingIn).toBe(false);
  });

  it("goBackToOrgSelect returns to the org picker", () => {
    const { result } = renderHook(() => useSession());
    act(() => result.current.handleOrgSelect("acme", false));
    act(() => result.current.goBackToOrgSelect());
    expect(result.current.selectingOrg).toBe(true);
    expect(result.current.loggingIn).toBe(false);
  });
});
