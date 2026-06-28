import { useState } from "react";
import useAsyncAction from "@/hooks/useAsyncAction";
import { requestPasswordResetByEmail } from "@/api";

/**
 * View-model for the primary email+password login screen. The org is resolved
 * server-side from the email, so there is no org/member picking here. `onEmailLogin`
 * (email, password) performs the actual sign-in (loginWithEmail + session update);
 * on success the app re-renders to the authed view, so this hook only tracks the
 * inputs, busy, and error.
 *
 * Forgot-password runs inline from the typed email — no org/member selection.
 * `requestReset` prompts if the email is empty, otherwise fires the email-only
 * reset request and shows a single anti-enumeration confirmation (`forgotSent`)
 * regardless of whether the email maps to an account.
 *
 * @param onEmailLogin (email, password) => Promise
 * @returns { email, setEmail, password, setPassword, err, busy, submit,
 *            forgotErr, forgotSent, forgotBusy, requestReset, resetForgot }
 */
export default function useEmailLogin({ onEmailLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [forgotErr, setForgotErr] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

  const login = useAsyncAction(
    (e, p) => onEmailLogin(e, p),
    { onError: (ex) => setErr(ex?.message ?? String(ex)) }
  );

  // Anti-enumeration: show the same confirmation on success OR error.
  const forgot = useAsyncAction(
    (e) => requestPasswordResetByEmail(e),
    { onSuccess: () => setForgotSent(true), onError: () => setForgotSent(true) }
  );

  const submit = async (ev) => {
    ev?.preventDefault?.();
    if (!email.trim() || !password) { setErr("Enter your email and password"); return; }
    setErr("");
    await login.run(email.trim(), password);
  };

  const requestReset = async () => {
    if (!email.trim()) { setForgotErr("Enter your email first"); return; }
    setForgotErr("");
    await forgot.run(email.trim());
  };

  // Return from the "check your email" confirmation back to the sign-in form.
  const resetForgot = () => { setForgotSent(false); setForgotErr(""); };

  return {
    email, setEmail, password, setPassword, err, busy: login.busy, submit,
    forgotErr, forgotSent, forgotBusy: forgot.busy, requestReset, resetForgot,
  };
}
