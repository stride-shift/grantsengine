import { useState } from "react";
import useAsyncAction from "@/hooks/useAsyncAction";

/**
 * View-model for the primary email+password login screen. The org is resolved
 * server-side from the email, so there is no org/member picking here. `onEmailLogin`
 * (email, password) performs the actual sign-in (loginWithEmail + session update);
 * on success the app re-renders to the authed view, so this hook only tracks the
 * inputs, busy, and error.
 *
 * @param onEmailLogin (email, password) => Promise
 * @returns { email, setEmail, password, setPassword, err, busy, submit }
 */
export default function useEmailLogin({ onEmailLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  const login = useAsyncAction(
    (e, p) => onEmailLogin(e, p),
    { onError: (ex) => setErr(ex?.message ?? String(ex)) }
  );

  const submit = async (ev) => {
    ev?.preventDefault?.();
    if (!email.trim() || !password) { setErr("Enter your email and password"); return; }
    setErr("");
    await login.run(email.trim(), password);
  };

  return { email, setEmail, password, setPassword, err, busy: login.busy, submit };
}
