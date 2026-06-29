import { useState } from "react";
import { isLoggedIn, getAuth, getCurrentMember, login, setPassword, memberLogin, loginWithEmail } from "@/api";

/**
 * Auth/org session state + login handlers, extracted from App.jsx. The
 * cross-cutting teardown on logout (clearing grants/org/team/theme/uploads cache,
 * resetting the view) stays in App's resetSession — this hook exposes
 * `clearAuthState()` for App to compose into it, plus `goBackToOrgSelect()` for
 * the login screen's Back action. App keeps the render branching.
 *
 * @returns { authed, orgSlug, currentMember, needsPassword, loggingIn, selectingOrg,
 *            resetParams, handleOrgSelect, handleLogin, handleMemberLogin,
 *            goBackToOrgSelect, clearAuthState }
 */
export default function useSession() {
  const params = new URLSearchParams(window.location.search);
  // Password-reset deep link: ?reset=<token>&slug=<org> — auto-select org + go to login
  const resetParams = params.get("reset") && params.get("slug")
    ? { token: params.get("reset"), slug: params.get("slug") }
    : null;

  const [authed, setAuthed] = useState(isLoggedIn());
  const [orgSlug, setOrgSlug] = useState(getAuth().slug || (resetParams ? resetParams.slug : null));
  const [currentMember, setCurrentMember] = useState(getCurrentMember());
  // Default to the email-login screen; the org/member picker is now a dormant
  // fallback (reached only via the Login screen's "Back to organisations" action —
  // no longer linked from the login screen, and logout returns here to login).
  const [selectingOrg, setSelectingOrg] = useState(false);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [loggingIn, setLoggingIn] = useState(!!resetParams);

  const handleOrgSelect = (slug, isNew) => {
    setOrgSlug(slug);
    setNeedsPassword(isNew);
    setLoggingIn(true);
    setSelectingOrg(false);
  };

  const handleLogin = async (password) => {
    if (needsPassword) {
      await setPassword(orgSlug, password);
    } else {
      await login(orgSlug, password);
    }
    setCurrentMember(null); // legacy shared-password login — no member identity
    setAuthed(true);
    setLoggingIn(false);
    setNeedsPassword(false);
  };

  const handleMemberLogin = async (memberId, password) => {
    const data = await memberLogin(orgSlug, memberId, password);
    setCurrentMember(data.member);
    setAuthed(true);
    setLoggingIn(false);
    setNeedsPassword(false);
  };

  // Primary path: email + password → server resolves the org. loginWithEmail has
  // already persisted token+slug+member to localStorage; mirror that into state.
  const handleEmailLogin = async (email, password) => {
    const data = await loginWithEmail(email, password);
    setOrgSlug(data.slug || data.org?.slug || null);
    setCurrentMember(data.member || null);
    // Clear any login-screen state so a successful login can't be overridden by a
    // stale selectingOrg/loggingIn flag (matches handleLogin/handleMemberLogin).
    setSelectingOrg(false);
    setLoggingIn(false);
    setAuthed(true);
    return data;
  };

  const goBackToOrgSelect = () => {
    setSelectingOrg(true);
    setLoggingIn(false);
  };

  // Reset ONLY the auth atoms. Logout lands on the email-login screen (the primary
  // path) — NOT the org picker — so selectingOrg is cleared, not set.
  const clearAuthState = () => {
    setAuthed(false);
    setCurrentMember(null);
    setSelectingOrg(false);
    setLoggingIn(false);
  };

  return {
    authed, orgSlug, currentMember, needsPassword, loggingIn, selectingOrg, resetParams,
    handleOrgSelect, handleLogin, handleMemberLogin, handleEmailLogin,
    goBackToOrgSelect, clearAuthState,
  };
}
