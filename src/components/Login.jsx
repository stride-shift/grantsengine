import { useState, useEffect } from "react";
import { C, FONT } from "../theme";
import { Btn, Avatar, RoleBadge } from "./index";
import { getTeamPublic, forgotPassword } from "../api";

const ROLE_ORDER = { director: 0, hop: 1, pm: 2, board: 3, none: 9 };

// ── Shared layout components (defined outside to prevent remounting) ──

const Header = () => (
  <div style={{
    position: "fixed", top: 0, left: 0, right: 0, height: 56,
    background: C.navy, display: "flex", alignItems: "center", padding: "0 24px", gap: 12,
    boxShadow: "0 2px 8px rgba(26, 31, 54, 0.15)", zIndex: 10,
  }}>
    <div style={{
      width: 32, height: 32, borderRadius: 8,
      background: `linear-gradient(135deg, ${C.primary} 0%, #E04840 100%)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 14, fontWeight: 800, color: "#fff",
    }}>d</div>
    <span style={{ fontSize: 15, fontWeight: 700, color: "#fff", letterSpacing: -0.3 }}>d-lab Grant Engine</span>
  </div>
);

const Card = ({ children, width = 420 }) => (
  <div style={{ width, background: C.white, borderRadius: 14, padding: "28px 32px", boxShadow: C.cardShadowLg, marginTop: 40 }}>
    {children}
  </div>
);

const Title = ({ slug, sub }) => (
  <div style={{ textAlign: "center", marginBottom: 24 }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: C.t4, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>Grant Engine</div>
    <div style={{ fontSize: 20, fontWeight: 700, color: C.dark }}>{slug}</div>
    <div style={{ width: 28, height: 3, background: C.primary, borderRadius: 2, margin: "10px auto 0" }} />
    {sub && <div style={{ fontSize: 13, color: C.t3, marginTop: 10 }}>{sub}</div>}
  </div>
);

const BackLink = ({ onClick, label }) => (
  <div style={{ textAlign: "center", marginTop: 18 }}>
    <button onClick={onClick} style={{
      background: "none", border: "none", color: C.t3, fontSize: 13, cursor: "pointer", fontFamily: FONT,
      transition: "color 0.15s",
    }}
      onMouseEnter={e => e.currentTarget.style.color = C.primary}
      onMouseLeave={e => e.currentTarget.style.color = C.t3}
    >{label}</button>
  </div>
);

const inputStyle = {
  width: "100%", padding: "10px 14px", fontSize: 15, border: `1px solid ${C.line}`,
  borderRadius: 8, outline: "none", fontFamily: FONT, boxSizing: "border-box",
  transition: "border-color 0.15s",
};

const focusBorder = (e) => e.target.style.borderColor = C.primary;
const blurBorder = (e) => e.target.style.borderColor = C.line;

const Page = ({ children }) => (
  <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: FONT }}>
    <Header />
    {children}
  </div>
);

export default function Login({ slug, onLogin, onMemberLogin, onBack, needsPassword }) {
  const [step, setStep] = useState("pick"); // pick | password | set-password | forgot
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load public team list
  useEffect(() => {
    if (!slug) return;
    getTeamPublic(slug).then(t => {
      setMembers(t.sort((a, b) => (ROLE_ORDER[a.role] || 9) - (ROLE_ORDER[b.role] || 9)));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [slug]);

  const pickMember = (m) => {
    setSelected(m);
    setPw("");
    setPw2("");
    setErr("");
    setStep(m.hasPassword ? "password" : "set-password");
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    if (!pw) return;
    setBusy(true);
    setErr("");
    try {
      await onMemberLogin(selected.id, pw);
    } catch (ex) {
      setErr(ex.message);
    }
    setBusy(false);
  };

  const submitSetPassword = async (e) => {
    e.preventDefault();
    if (!pw || pw.length < 6) { setErr("Password must be at least 6 characters"); return; }
    if (pw !== pw2) { setErr("Passwords don't match"); return; }
    setBusy(true);
    setErr("");
    try {
      await onMemberLogin(selected.id, pw, true); // true = set password first
    } catch (ex) {
      setErr(ex.message);
    }
    setBusy(false);
  };

  const submitForgotPassword = async (e) => {
    e.preventDefault();
    if (!adminKey) { setErr("Recovery key is required"); return; }
    if (!pw || pw.length < 6) { setErr("New password must be at least 6 characters"); return; }
    if (pw !== pw2) { setErr("Passwords don't match"); return; }
    setBusy(true);
    setErr("");
    try {
      await forgotPassword(slug, selected.id, adminKey, pw);
    } catch (ex) {
      setErr(ex.message);
    }
    setBusy(false);
  };

  const goBack = () => {
    setPw("");
    setPw2("");
    setAdminKey("");
    setErr("");
    setStep("pick");
  };

  return (
    <Page>
      {/* ── Step 1: Pick your name ── */}
      {step === "pick" && (
        <Card width={420}>
          <Title slug={slug} sub="Who's signing in?" />
          {loading ? (
            <div style={{ textAlign: "center", padding: 20, color: C.t3, fontSize: 13 }}>Loading team...</div>
          ) : members.length === 0 ? (
            <div style={{ textAlign: "center", padding: 20 }}>
              <div style={{ color: C.t3, fontSize: 13, marginBottom: 12 }}>No team members found.</div>
              <div style={{ color: C.t4, fontSize: 12 }}>Contact your admin to be added to the team.</div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {members.map(m => (
                  <button
                    key={m.id}
                    onClick={() => pickMember(m)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                      borderRadius: 8, border: `1px solid ${C.line}`, background: C.white,
                      cursor: "pointer", fontFamily: FONT, width: "100%", textAlign: "left",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = C.primary; e.currentTarget.style.background = C.primarySoft; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.background = C.white; }}
                  >
                    <Avatar member={m} size={36} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.dark }}>{m.name}</div>
                      <RoleBadge role={m.role} />
                    </div>
                    {!m.hasPassword && (
                      <span style={{ fontSize: 11, color: C.t4, background: C.warm200, padding: "2px 8px", borderRadius: 6 }}>
                        New
                      </span>
                    )}
                    <span style={{ fontSize: 14, color: C.t4 }}>{"\u2192"}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          <BackLink onClick={onBack} label="Back to organisations" />
        </Card>
      )}

      {/* ── Step 2: Enter password ── */}
      {step === "password" && selected && (
        <Card width={380}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <button onClick={() => goBack()} style={{
              background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.t3, padding: 0,
            }}>{"\u2190"}</button>
            <Avatar member={selected} size={38} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.dark }}>{selected.name}</div>
              <RoleBadge role={selected.role} />
            </div>
          </div>
          <form onSubmit={submitPassword}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.t3, marginBottom: 6, letterSpacing: 0.5 }}>
              Your password
            </label>
            <input
              type="password" value={pw} onChange={e => setPw(e.target.value)}
              placeholder="Enter your password" autoFocus
              style={{ ...inputStyle, marginBottom: 16 }}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />
            {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{err}</div>}
            <Btn onClick={submitPassword} disabled={busy || !pw} style={{ width: "100%", padding: "11px 0", fontSize: 14 }}>
              {busy ? "Signing in..." : "Sign In"}
            </Btn>
          </form>
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button onClick={() => { setPw(""); setErr(""); setStep("forgot"); }} style={{
              background: "none", border: "none", color: C.t4, fontSize: 12, cursor: "pointer",
              fontFamily: FONT, textDecoration: "underline", transition: "color 0.15s",
            }}
              onMouseEnter={e => e.currentTarget.style.color = C.primary}
              onMouseLeave={e => e.currentTarget.style.color = C.t4}
            >Forgot password?</button>
          </div>
        </Card>
      )}

      {/* ── Step 3: Set password (first time) ── */}
      {step === "set-password" && selected && (
        <Card width={380}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <button onClick={() => goBack()} style={{
              background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.t3, padding: 0,
            }}>{"\u2190"}</button>
            <Avatar member={selected} size={38} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.dark }}>{selected.name}</div>
              <div style={{ fontSize: 11, color: C.primary, fontWeight: 600 }}>Set up your login</div>
            </div>
          </div>
          <form onSubmit={submitSetPassword}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.t3, marginBottom: 6 }}>
              Choose a password
            </label>
            <input
              type="password" value={pw} onChange={e => setPw(e.target.value)}
              placeholder="At least 6 characters" autoFocus
              style={{ ...inputStyle, marginBottom: 12 }}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.t3, marginBottom: 6 }}>
              Confirm password
            </label>
            <input
              type="password" value={pw2} onChange={e => setPw2(e.target.value)}
              placeholder="Type it again"
              style={{ ...inputStyle, marginBottom: 16 }}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />
            {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{err}</div>}
            <Btn onClick={submitSetPassword} disabled={busy || !pw || !pw2} style={{ width: "100%", padding: "11px 0", fontSize: 14 }}>
              {busy ? "Setting up..." : "Set Password & Sign In"}
            </Btn>
          </form>
        </Card>
      )}
      {/* ── Step 4: Forgot password (admin key recovery) ── */}
      {step === "forgot" && selected && (
        <Card width={400}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <button onClick={() => { setPw(""); setPw2(""); setAdminKey(""); setErr(""); setStep("password"); }} style={{
              background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.t3, padding: 0,
            }}>{"\u2190"}</button>
            <Avatar member={selected} size={38} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.dark }}>{selected.name}</div>
              <div style={{ fontSize: 11, color: C.amber, fontWeight: 600 }}>Reset password</div>
            </div>
          </div>
          <div style={{
            background: C.warm100, borderRadius: 8, padding: "10px 14px", marginBottom: 18,
            fontSize: 12, color: C.t3, lineHeight: 1.5,
          }}>
            Enter the admin recovery key to reset your password. Ask your director or check your team's records for the key.
          </div>
          <form onSubmit={submitForgotPassword}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.t3, marginBottom: 6, letterSpacing: 0.5 }}>
              Recovery key
            </label>
            <input
              type="password" value={adminKey} onChange={e => setAdminKey(e.target.value)}
              placeholder="Admin recovery key" autoFocus
              style={{ ...inputStyle, marginBottom: 14 }}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.t3, marginBottom: 6, letterSpacing: 0.5 }}>
              New password
            </label>
            <input
              type="password" value={pw} onChange={e => setPw(e.target.value)}
              placeholder="At least 6 characters"
              style={{ ...inputStyle, marginBottom: 14 }}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.t3, marginBottom: 6, letterSpacing: 0.5 }}>
              Confirm new password
            </label>
            <input
              type="password" value={pw2} onChange={e => setPw2(e.target.value)}
              placeholder="Type it again"
              style={{ ...inputStyle, marginBottom: 16 }}
              onFocus={focusBorder}
              onBlur={blurBorder}
            />
            {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{err}</div>}
            <Btn onClick={submitForgotPassword} disabled={busy || !adminKey || !pw || !pw2} style={{ width: "100%", padding: "11px 0", fontSize: 14 }}>
              {busy ? "Resetting..." : "Reset Password & Sign In"}
            </Btn>
          </form>
        </Card>
      )}
    </Page>
  );
}
