import { useState, useEffect } from "react";
import { getTeamPublic, requestPasswordReset, resetPasswordWithToken } from "@/api";
import useAsyncAction from "@/hooks/useAsyncAction";

const ROLE_ORDER = { director: 0, hop: 1, pm: 2, board: 3, none: 9 };

/**
 * Login screen view-model, extracted from Login.jsx. Owns the step state machine
 * (pick → password → setup → forgot → sent → reset), the selected member, the
 * reset-token captured from the URL on mount, the public member list (loaded +
 * role-sorted), and the three submit flows (member sign-in, send reset link,
 * reset-from-token). The component renders from this and keeps only the transient
 * password input text it is typing.
 *
 * Submit flows go through useAsyncAction so busy/error follow the shared
 * "set busy / try / catch (ex.message) / clear busy" pattern. Validation that
 * must short-circuit BEFORE going busy (reset-password length / match checks)
 * runs in the handler ahead of `run`.
 *
 * NOTE on the reset deep-link: on mount we read `?reset=<token>&slug=<org>` from
 * the URL and, when both are present, capture the token + jump to the `reset`
 * step. The token's `slug` is NOT compared against the `slug` prop and the prop
 * is what `resetPasswordWithToken` is later called with — this mirrors the
 * original component exactly and is preserved deliberately (do not "fix").
 *
 * @param slug          the org slug (component prop) — used for the reset/forgot API calls
 * @param onMemberLogin (memberId, password) => Promise — member sign-in callback
 * @returns step state machine + handlers + the member list (see return block)
 */
export default function useLoginFlow({ slug, onMemberLogin }) {
  const [step, setStep] = useState("pick"); // pick | password | setup | forgot | sent | reset
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [resetToken, setResetToken] = useState(null);

  // Check URL for reset token on mount. The token's slug is intentionally NOT
  // reconciled against the `slug` prop — preserves the original behaviour.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("reset");
    const tokenSlug = params.get("slug");
    if (token && tokenSlug) {
      setResetToken(token);
      setStep("reset");
      // Clean up URL
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Load public team list
  useEffect(() => {
    if (!slug) return;
    getTeamPublic(slug).then(t => {
      setMembers(t.sort((a, b) => (ROLE_ORDER[a.role] || 9) - (ROLE_ORDER[b.role] || 9)));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [slug]);

  // ── Submit flows ──────────────────────────────────────────────────────────
  // useAsyncAction sets the error from `ex.message` on throw, matching the
  // original inline try/catch. We surface its error into `err` via onError so
  // the component keeps reading a single `err` value (validation errors are set
  // on `err` directly, before going busy).

  const memberSignIn = useAsyncAction(
    (password) => onMemberLogin(selected.id, password),
    { onError: (ex) => setErr(ex?.message ?? String(ex)) }
  );

  const sendReset = useAsyncAction(
    () => requestPasswordReset(slug, selected.id),
    { onSuccess: () => setStep("sent"), onError: (ex) => setErr(ex?.message ?? String(ex)) }
  );

  const resetWithToken = useAsyncAction(
    (password) => resetPasswordWithToken(slug, resetToken, password).then(() => {
      // Auto-login: reload the app since auth is now set in localStorage.
      window.location.href = window.location.pathname;
    }),
    { onError: (ex) => setErr(ex?.message ?? String(ex)) }
  );

  const pickMember = (m) => {
    setSelected(m);
    setErr("");
    // First-time members set their password via an emailed link, not inline
    // (prevents anyone from claiming a passwordless account).
    setStep(m.hasPassword ? "password" : "setup");
  };

  const submitPassword = async (e, password) => {
    e.preventDefault();
    if (!password) return;
    setErr("");
    await memberSignIn.run(password);
  };

  const sendResetLink = async () => {
    setErr("");
    await sendReset.run();
  };

  const submitResetPassword = async (e, password, password2) => {
    e.preventDefault();
    if (!password || password.length < 6) { setErr("Password must be at least 6 characters"); return; }
    if (password !== password2) { setErr("Passwords don't match"); return; }
    setErr("");
    await resetWithToken.run(password);
  };

  const goToForgot = () => { setErr(""); setStep("forgot"); };
  const backToPassword = () => { setErr(""); setStep("password"); };
  const goBack = () => { setErr(""); setStep("pick"); };

  const busy = memberSignIn.busy || sendReset.busy || resetWithToken.busy;

  return {
    step, members, selected, loading, resetToken,
    err, busy,
    pickMember, submitPassword, sendResetLink, submitResetPassword,
    goToForgot, backToPassword, goBack,
  };
}
