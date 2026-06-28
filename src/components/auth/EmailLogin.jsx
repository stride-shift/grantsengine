import { FONT } from "@/theme";
import { Btn } from "@/components/ui";
import NorthernLights from "@/components/chrome/NorthernLights";
import CheckEmailScreen from "@/components/auth/CheckEmailScreen";
import useEmailLogin from "@/hooks/useEmailLogin";

/* Primary login: email + password only. The org is resolved server-side from the
   email (no org/member picker). "Forgot password?" is the primary recovery path:
   it fires an email-only reset from the typed email and shows the shared
   "Check your email" confirmation screen, whose "Back to sign in" returns here.
   Render-only. */
export default function EmailLogin({ onLogin }) {
  const {
    email, setEmail, password, setPassword, err, busy, submit,
    forgotErr, forgotSent, forgotBusy, requestReset, resetForgot,
  } = useEmailLogin({ onEmailLogin: onLogin });

  const inputStyle = {
    width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 14,
    fontFamily: FONT, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.06)", color: "#fff", outline: "none", marginTop: 6,
  };
  const label = { fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)" };

  const cardStyle = {
    position: "relative", zIndex: 1, width: 360, maxWidth: "90vw",
    background: "rgba(10,18,32,0.85)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 16, padding: "32px 28px", backdropFilter: "blur(8px)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#030712", fontFamily: FONT, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}><NorthernLights /></div>

      {forgotSent ? (
        <div style={cardStyle}>
          <CheckEmailScreen onBack={resetForgot} backLabel="Back to sign in" />
        </div>
      ) : (
        <form onSubmit={submit} style={cardStyle}>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: -0.3 }}>Sign in</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 4, marginBottom: 22 }}>
            Enter your work email and password.
          </div>

          <label style={label}>Email
            <input type="email" autoComplete="username" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@org.com"
              autoFocus style={inputStyle} />
          </label>

          <div style={{ marginTop: 16 }}>
            <label style={label}>Password
              <input type="password" autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                style={inputStyle} />
            </label>
          </div>

          <div style={{ textAlign: "right", marginTop: 8 }}>
            <button type="button" onClick={requestReset} disabled={forgotBusy}
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)",
                fontSize: 12, fontFamily: FONT, cursor: forgotBusy ? "default" : "pointer", padding: 0 }}>
              {forgotBusy ? "Sending…" : "Forgot password?"}
            </button>
          </div>

          {forgotErr && <div style={{ fontSize: 12, color: "#FBBF24", marginTop: 8 }}>{forgotErr}</div>}

          {err && <div style={{ fontSize: 12, color: "#F87171", marginTop: 12 }}>{err}</div>}

          <Btn v="primary" type="submit" disabled={busy}
            style={{ width: "100%", marginTop: 22, padding: "11px 0", fontSize: 14, justifyContent: "center" }}>
            {busy ? "Signing in…" : "Sign in"}
          </Btn>
        </form>
      )}
    </div>
  );
}
