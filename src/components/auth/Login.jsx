import { useState } from "react";
import { C, FONT } from "@/theme";
import { Btn, Avatar, RoleBadge } from "@/components/ui";
import useLoginFlow from "@/hooks/useLoginFlow";
import CheckEmailScreen from "@/components/auth/CheckEmailScreen";
import NorthernLights from "@/components/chrome/NorthernLights";
import geLogo from "@/grants-engine-logo.png";
import dlabLogo from "@/dlab.png";
import geIcon from "@/ge-icon.png";

// ── Shared layout components (defined outside to prevent remounting) ──

const Header = ({ onLogoClick }) => (
  <div style={{
    position: "fixed", top: 0, left: 0, right: 0, height: 80, zIndex: 10,
    background: "rgba(0,0,0,0.5)", backdropFilter: "blur(16px)",
    display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px",
    boxShadow: "0 2px 12px rgba(0, 0, 0, 0.3)", pointerEvents: "auto",
  }}>
    <div onClick={onLogoClick} style={{ display: "flex", alignItems: "center", gap: 10, cursor: onLogoClick ? "pointer" : "default", transition: "opacity 0.2s" }}
      onMouseEnter={e => { if (onLogoClick) e.currentTarget.style.opacity = "0.8"; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
    >
            <img src={geLogo} alt="Grants Engine" style={{ height: 50, objectFit: "contain" }} />
    </div>
  </div>
);

const Card = ({ children, width = 420 }) => (
  <div style={{ width: "90%", maxWidth: width, background: "rgba(255,255,255,0.08)", borderRadius: 14, padding: "24px 20px", boxShadow: "0 8px 32px rgba(0,0,0,0.4)", marginTop: 24, backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.12)", pointerEvents: "auto" }}>
    {children}
  </div>
);

const Title = ({ slug, sub }) => (
  <div style={{ textAlign: "center", marginBottom: 24 }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>Grants Engine</div>
    <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>{slug}</div>
    <div style={{ width: 28, height: 3, background: "#4ADE80", borderRadius: 2, margin: "10px auto 0" }} />
    {sub && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 10 }}>{sub}</div>}
  </div>
);

const BackLink = ({ onClick, label }) => (
  <div style={{ textAlign: "center", marginTop: 18 }}>
    <button onClick={onClick} style={{
      background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer", fontFamily: FONT,
      transition: "color 0.15s",
    }}
      onMouseEnter={e => e.currentTarget.style.color = "#4ADE80"}
      onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.4)"}
    >{label}</button>
  </div>
);

const inputStyle = {
  width: "100%", padding: "10px 14px", fontSize: 15, border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 8, outline: "none", fontFamily: FONT, boxSizing: "border-box",
  transition: "border-color 0.15s", background: "rgba(255,255,255,0.1)", color: "#fff", caretColor: "#fff",
};
const inputClassName = "ge-dark-input";

// Shared style for the back-arrow buttons on the password / setup / forgot steps.
const backButtonStyle = {
  background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "rgba(255,255,255,0.5)", padding: 0,
};

const focusBorder = (e) => e.target.style.borderColor = "#4ADE80";
const blurBorder = (e) => e.target.style.borderColor = "rgba(255,255,255,0.15)";

const Page = ({ children, onLogoClick }) => (
  <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", background: "#030712", fontFamily: FONT, position: "relative" }}>
    <div style={{ position: "fixed", inset: 0, zIndex: 0 }}><NorthernLights /></div>
    <Header onLogoClick={onLogoClick} />
    <div style={{ position: "relative", zIndex: 1, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, pointerEvents: "none", padding: "100px 0 40px" }}>
      {children}
    </div>
  </div>
);

export default function Login({ slug, onLogin, onMemberLogin, onBack, needsPassword }) {
  // Transient input text stays in the component; everything else is the view-model.
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");

  const {
    step, members, selected, loading,
    err, busy,
    pickMember, submitPassword, sendResetLink, submitResetPassword,
    goToForgot, backToPassword, goBack: goBackToPick,
  } = useLoginFlow({ slug, onMemberLogin });

  // Pure render helper — masks an email for display.
  const maskEmail = (email) => {
    if (!email) return null;
    const [local, domain] = email.split("@");
    if (!domain) return email;
    return local[0] + "***" + (local.length > 1 ? local[local.length - 1] : "") + "@" + domain;
  };

  // Wrap hook handlers that also need to clear the locally-owned input text,
  // preserving the original behaviour (pick / goBack both reset pw + pw2).
  const onPickMember = (m) => { setPw(""); setPw2(""); pickMember(m); };
  const goBack = () => { setPw(""); setPw2(""); goBackToPick(); };

  return (
    <Page onLogoClick={onBack}>
      {/* ── Step 1: Pick your name ── */}
      {step === "pick" && (
        <Card width={420}>
          <Title slug={slug} sub="Who's signing in?" />
          {loading ? (
            <div style={{ textAlign: "center", padding: 20, color: "rgba(255,255,255,0.4)", fontSize: 13 }}>Loading team...</div>
          ) : members.length === 0 ? (
            <div style={{ textAlign: "center", padding: 20 }}>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginBottom: 12 }}>No team members found.</div>
              <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>Contact your admin to be added to the team.</div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: "calc(100vh - 320px)", overflowY: "auto", scrollbarWidth: "none", msOverflowStyle: "none" }}>
                {members.map(m => (
                  <button
                    key={m.id}
                    onClick={() => onPickMember(m)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "8px 12px",
                      borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)",
                      cursor: "pointer", fontFamily: FONT, width: "100%", textAlign: "left",
                      transition: "all 0.25s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(74,222,128,0.4)"; e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.transform = "none"; }}
                  >
                    <Avatar member={m} size={36} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{m.name}</div>
                      <RoleBadge role={m.role} />
                    </div>
                    {!m.hasPassword && (
                      <span style={{ fontSize: 11, color: "#4ADE80", background: "rgba(74,222,128,0.1)", padding: "2px 8px", borderRadius: 6 }}>
                        New
                      </span>
                    )}
                    <span style={{ fontSize: 14, color: "rgba(255,255,255,0.35)" }}>{"\u2192"}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 16 }}>
            <BackLink onClick={onBack} label="Back to organisations" />
          </div>
        </Card>
      )}

      {/* ── Step 2: Enter password ── */}
      {step === "password" && selected && (
        <Card width={380}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <button onClick={() => goBack()} style={backButtonStyle}>{"\u2190"}</button>
            <Avatar member={selected} size={38} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{selected.name}</div>
              <RoleBadge role={selected.role} />
            </div>
          </div>
          <form onSubmit={(e) => submitPassword(e, pw)}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 6, letterSpacing: 0.5 }}>
              Your password
            </label>
            <input
              type="password" value={pw} onChange={e => setPw(e.target.value)}
              placeholder="Enter your password" autoFocus
              className={inputClassName}
              style={{ ...inputStyle, marginBottom: 16 }}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />
            {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{err}</div>}
            <Btn onClick={(e) => submitPassword(e, pw)} disabled={busy || !pw} style={{ width: "100%", padding: "11px 0", fontSize: 14 }}>
              {busy ? "Signing in..." : "Sign In"}
            </Btn>
          </form>
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button onClick={() => { setPw(""); goToForgot(); }} style={{
              background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8,
              color: "rgba(255,255,255,0.4)", fontSize: 13, fontWeight: 500, padding: "8px 20px",
              cursor: "pointer", fontFamily: FONT, transition: "all 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "#4ADE80"; e.currentTarget.style.color = "#4ADE80"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; e.currentTarget.style.color = "rgba(255,255,255,0.4)"; }}
            >Forgot password?</button>
          </div>
        </Card>
      )}

      {/* ── Step 3: Set password (first time) ── */}
      {step === "setup" && selected && (
        <Card width={400}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <button onClick={() => goBack()} style={backButtonStyle}>{"\u2190"}</button>
            <Avatar member={selected} size={38} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{selected.name}</div>
              <div style={{ fontSize: 11, color: "#4ADE80", fontWeight: 600 }}>Set up your login</div>
            </div>
          </div>
          {selected.hasEmail ? (
            <>
              <div style={{
                background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: "14px 16px", marginBottom: 18,
                fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, border: "1px solid rgba(255,255,255,0.08)",
              }}>
                To keep your account secure, we'll email you a one-time link to set your password.
                {(selected.maskedEmail || selected.email) && <> Sent to <strong>{maskEmail(selected.maskedEmail || selected.email)}</strong>.</>}
              </div>
              {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{err}</div>}
              <Btn onClick={sendResetLink} disabled={busy} style={{ width: "100%", padding: "11px 0", fontSize: 14 }}>
                {busy ? "Sending..." : "Email me a setup link"}
              </Btn>
            </>
          ) : (
            <div style={{
              background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: "14px 16px",
              fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, border: "1px solid rgba(255,255,255,0.08)",
            }}>
              There's no email on file for your account yet, so we can't send a setup link.
              Ask a director to set up your login, then come back to sign in.
            </div>
          )}
        </Card>
      )}
      {/* ── Step 4: Forgot password — send reset link ── */}
      {step === "forgot" && selected && (
        <Card width={400}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <button onClick={backToPassword} style={backButtonStyle}>{"\u2190"}</button>
            <Avatar member={selected} size={38} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>{selected.name}</div>
              <div style={{ fontSize: 11, color: "#FBBF24", fontWeight: 600 }}>Reset password</div>
            </div>
          </div>
          <div style={{
            background: "rgba(255,255,255,0.06)", borderRadius: 8, padding: "14px 16px", marginBottom: 18,
            fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, border: "1px solid rgba(255,255,255,0.08)",
          }}>
            We'll send a password reset link to your email{selected.hasEmail ? ": " : "."}
            {selected.hasEmail && <strong>{maskEmail(selected.maskedEmail || selected.email)}</strong>}
          </div>
          {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{err}</div>}
          <Btn onClick={sendResetLink} disabled={busy} style={{ width: "100%", padding: "11px 0", fontSize: 14 }}>
            {busy ? "Sending..." : "Send Reset Link"}
          </Btn>
        </Card>
      )}

      {/* ── Step 4b: Reset link sent ── */}
      {step === "sent" && (
        <Card width={400}>
          <CheckEmailScreen onBack={goBack} backLabel="Back to sign in" />
        </Card>
      )}

      {/* ── Step 5: Reset password from email link ── */}
      {step === "reset" && (
        <Card width={380}>
          <Title slug={slug || "Grants Engine"} sub="Choose a new password" />
          <form onSubmit={(e) => submitResetPassword(e, pw, pw2)}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 6, letterSpacing: 0.5 }}>
              New password
            </label>
            <input
              type="password" value={pw} onChange={e => setPw(e.target.value)}
              placeholder="At least 6 characters" autoFocus
              className={inputClassName}
              style={{ ...inputStyle, marginBottom: 14 }}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginBottom: 6, letterSpacing: 0.5 }}>
              Confirm new password
            </label>
            <input
              type="password" value={pw2} onChange={e => setPw2(e.target.value)}
              placeholder="Type it again"
              className={inputClassName}
              style={{ ...inputStyle, marginBottom: 16 }}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />
            {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{err}</div>}
            <Btn onClick={(e) => submitResetPassword(e, pw, pw2)} disabled={busy || !pw || !pw2} style={{ width: "100%", padding: "11px 0", fontSize: 14 }}>
              {busy ? "Resetting..." : "Reset Password & Sign In"}
            </Btn>
          </form>
        </Card>
      )}
    </Page>
  );
}
