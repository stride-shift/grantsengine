import { useState } from "react";
import { isLoggedIn, getAuth, getCurrentMember, login, setPassword, memberLogin } from "@/api";

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
  const [selectingOrg, setSelectingOrg] = useState(!isLoggedIn() && !resetParams);
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

  const goBackToOrgSelect = () => {
    setSelectingOrg(true);
    setLoggingIn(false);
  };

  // Reset ONLY the auth atoms (matches the auth half of the old resetSession).
  // orgSlug / needsPassword are intentionally left as-is, exactly as before.
  const clearAuthState = () => {
    setAuthed(false);
    setCurrentMember(null);
    setSelectingOrg(true);
    setLoggingIn(false);
  };

  return {
    authed, orgSlug, currentMember, needsPassword, loggingIn, selectingOrg, resetParams,
    handleOrgSelect, handleLogin, handleMemberLogin, goBackToOrgSelect, clearAuthState,
  };
}
