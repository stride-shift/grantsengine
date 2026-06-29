import { useState } from "react";
import { FONT } from "@/theme";
import { Btn } from "@/components/ui";
import NorthernLights from "@/components/chrome/NorthernLights";
import { superAdminLogin } from "@/api";

/* Standalone super-admin login screen (reached via ?superadmin). Mirrors
   EmailLogin's NorthernLights + glass-card styling. On success it stores the
   dedicated super-admin session token (ge_sa_token) and calls onAuthed(). */
export default function SuperAdminLogin({ onAuthed }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await superAdminLogin(email.trim(), password);
      onAuthed?.();
    } catch (ex) {
      setErr(ex.message || "Login failed");
    } finally {
      setBusy(false);
    }
  };

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

      <form onSubmit={submit} style={cardStyle}>
        <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: -0.3 }}>Super Admin</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 4, marginBottom: 22 }}>
          Platform administration. Sign in with your super-admin credentials.
        </div>

        <label style={label}>Email
          <input type="email" autoComplete="username" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="you@platform.com"
            autoFocus style={inputStyle} />
        </label>

        <div style={{ marginTop: 16 }}>
          <label style={label}>Password
            <input type="password" autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
              style={inputStyle} />
          </label>
        </div>

        {err && <div style={{ fontSize: 12, color: "#F87171", marginTop: 12 }}>{err}</div>}

        <Btn v="primary" type="submit" disabled={busy}
          style={{ width: "100%", marginTop: 22, padding: "11px 0", fontSize: 14, justifyContent: "center" }}>
          {busy ? "Signing in…" : "Sign in"}
        </Btn>
      </form>
    </div>
  );
}
