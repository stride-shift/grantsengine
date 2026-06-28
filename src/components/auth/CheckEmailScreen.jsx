import { FONT } from "@/theme";

/* Shared "Check your email" confirmation shown after a password-reset request.
   Used by the primary email-login screen and the legacy member-picker flow so the
   wording + styling stay identical. Renders inner content only — the host supplies
   the surrounding card/page chrome. `onBack` (optional) renders a back link whose
   label + target the host controls (e.g. "Back to sign in"). Render-only. */
export default function CheckEmailScreen({ onBack, backLabel = "Back to sign in" }) {
  return (
    <div style={{ textAlign: "center", padding: "12px 0" }}>
      <div style={{ fontSize: 36, marginBottom: 16 }}>{"✉️"}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 10 }}>Check your email</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", lineHeight: 1.6, marginBottom: 24 }}>
        If an account exists, we've sent a reset link. Check your inbox and click the link to set a new password.
      </div>
      {onBack && (
        <button onClick={onBack} style={{
          background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 13,
          cursor: "pointer", fontFamily: FONT, transition: "color 0.15s",
        }}
          onMouseEnter={e => e.currentTarget.style.color = "#4ADE80"}
          onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.4)"}
        >{backLabel}</button>
      )}
    </div>
  );
}
