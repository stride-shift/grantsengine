import { useState } from "react";
import { C, FONT, MONO } from "../theme";
import { Btn } from "./index";

export default function Login({ slug, onLogin, onBack, needsPassword }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!pw) return;
    setBusy(true);
    setErr("");
    try {
      await onLogin(pw);
    } catch (ex) {
      setErr(ex.message);
    }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: FONT }}>
      {/* Branded header strip */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, height: 56,
        background: C.navy, display: "flex", alignItems: "center", padding: "0 24px", gap: 12,
        boxShadow: "0 2px 8px rgba(26, 31, 54, 0.15)",
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8,
          background: `linear-gradient(135deg, ${C.primary} 0%, #E04840 100%)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 800, color: "#fff",
        }}>d</div>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#fff", letterSpacing: -0.3 }}>d-lab Grant Engine</span>
      </div>

      <div style={{ width: 380, background: C.white, borderRadius: 20, padding: 44, boxShadow: C.cardShadowLg, marginTop: 40 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.t4, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>Grant Engine</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: C.dark }}>{slug}</div>
          <div style={{ width: 28, height: 3, background: C.primary, borderRadius: 2, margin: "10px auto 0" }} />
        </div>

        <form onSubmit={submit}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.t3, marginBottom: 6, letterSpacing: 0.5 }}>
            {needsPassword ? "Set a team password" : "Team password"}
          </label>
          <input
            type="password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            placeholder={needsPassword ? "Choose a password" : "Enter password"}
            autoFocus
            style={{
              width: "100%", padding: "10px 14px", fontSize: 15, border: `1.5px solid ${C.line}`,
              borderRadius: 12, outline: "none", fontFamily: FONT, marginBottom: 16,
              boxSizing: "border-box", transition: "border-color 0.15s",
            }}
            onFocus={e => e.target.style.borderColor = C.primary}
            onBlur={e => e.target.style.borderColor = C.line}
          />
          {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{err}</div>}
          <Btn onClick={submit} disabled={busy || !pw} style={{ width: "100%", padding: "11px 0", fontSize: 14 }}>
            {busy ? "Signing in..." : needsPassword ? "Set Password & Enter" : "Sign In"}
          </Btn>
        </form>

        <div style={{ textAlign: "center", marginTop: 20 }}>
          <button onClick={onBack} style={{
            background: "none", border: "none", color: C.t3, fontSize: 13, cursor: "pointer", fontFamily: FONT,
            transition: "color 0.15s",
          }}
            onMouseEnter={e => e.currentTarget.style.color = C.primary}
            onMouseLeave={e => e.currentTarget.style.color = C.t3}
          >
            Back to organisations
          </button>
        </div>
      </div>
    </div>
  );
}
