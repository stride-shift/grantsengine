import { useState, useEffect } from "react";
import { C, FONT } from "../theme";
import { Btn, Avatar, RoleBadge } from "./index";
import { getTeamPublic } from "../api";

const ROLE_ORDER = { director: 0, hop: 1, pm: 2, none: 9 };

export default function Login({ slug, onLogin, onMemberLogin, onBack, needsPassword }) {
  const [step, setStep] = useState("pick"); // pick | password | set-password
  const [members, setMembers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
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

  // Legacy shared-password flow
  const [showLegacy, setShowLegacy] = useState(false);
  const submitLegacy = async (e) => {
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
    <div style={{ width, background: C.white, borderRadius: 20, padding: "36px 40px", boxShadow: C.cardShadowLg, marginTop: 40 }}>
      {children}
    </div>
  );

  const Title = ({ sub }) => (
    <div style={{ textAlign: "center", marginBottom: 28 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.t4, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>Grant Engine</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: C.dark }}>{slug}</div>
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

  // ── Handle first-time org setup (needsPassword = true, no team yet) ──
  if (needsPassword) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: FONT }}>
        <Header />
        <Card width={380}>
          <Title sub="Set your team password to get started" />
          <form onSubmit={async (e) => { e.preventDefault(); if (!pw) return; setBusy(true); setErr(""); try { await onLogin(pw); } catch (ex) { setErr(ex.message); } setBusy(false); }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.t3, marginBottom: 6, letterSpacing: 0.5 }}>
              Set a team password
            </label>
            <input
              type="password" value={pw} onChange={e => setPw(e.target.value)}
              placeholder="Choose a password" autoFocus
              style={{
                width: "100%", padding: "10px 14px", fontSize: 15, border: `1.5px solid ${C.line}`,
                borderRadius: 12, outline: "none", fontFamily: FONT, marginBottom: 16, boxSizing: "border-box",
                transition: "border-color 0.15s",
              }}
              onFocus={e => e.target.style.borderColor = C.primary}
              onBlur={e => e.target.style.borderColor = C.line}
            />
            {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{err}</div>}
            <Btn onClick={() => {}} disabled={busy || !pw} style={{ width: "100%", padding: "11px 0", fontSize: 14 }}>
              {busy ? "Setting up..." : "Set Password & Enter"}
            </Btn>
          </form>
          <BackLink onClick={onBack} label="Back to organisations" />
        </Card>
      </div>
    );
  }

  // ── Legacy shared password ──
  if (showLegacy) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: FONT }}>
        <Header />
        <Card width={380}>
          <Title sub="Shared team password" />
          <form onSubmit={submitLegacy}>
            <input
              type="password" value={pw} onChange={e => setPw(e.target.value)}
              placeholder="Enter team password" autoFocus
              style={{
                width: "100%", padding: "10px 14px", fontSize: 15, border: `1.5px solid ${C.line}`,
                borderRadius: 12, outline: "none", fontFamily: FONT, marginBottom: 16, boxSizing: "border-box",
              }}
              onFocus={e => e.target.style.borderColor = C.primary}
              onBlur={e => e.target.style.borderColor = C.line}
            />
            {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{err}</div>}
            <Btn onClick={submitLegacy} disabled={busy || !pw} style={{ width: "100%", padding: "11px 0", fontSize: 14 }}>
              {busy ? "Signing in..." : "Sign In"}
            </Btn>
          </form>
          <BackLink onClick={() => { setShowLegacy(false); setErr(""); setPw(""); }} label="← Back to team login" />
        </Card>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: FONT }}>
      <Header />

      {/* ── Step 1: Pick your name ── */}
      {step === "pick" && (
        <Card width={420}>
          <Title sub="Who's signing in?" />
          {loading ? (
            <div style={{ textAlign: "center", padding: 20, color: C.t3, fontSize: 13 }}>Loading team...</div>
          ) : members.length === 0 ? (
            <div style={{ textAlign: "center", padding: 20 }}>
              <div style={{ color: C.t3, fontSize: 13, marginBottom: 12 }}>No team members found.</div>
              <div style={{ color: C.t4, fontSize: 12 }}>Use the shared team password to sign in and add team members in Settings.</div>
              <div style={{ marginTop: 16 }}>
                <Btn onClick={() => { setShowLegacy(true); setPw(""); setErr(""); }} v="secondary" style={{ fontSize: 13 }}>
                  Use team password
                </Btn>
              </div>
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
                      borderRadius: 12, border: `1.5px solid ${C.line}`, background: C.white,
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
                    <span style={{ fontSize: 14, color: C.t4 }}>→</span>
                  </button>
                ))}
              </div>
              <BackLink onClick={() => { setShowLegacy(true); setPw(""); setErr(""); }} label="Use shared team password instead" />
            </>
          )}
          <BackLink onClick={onBack} label="Back to organisations" />
        </Card>
      )}

      {/* ── Step 2: Enter password ── */}
      {step === "password" && selected && (
        <Card width={380}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <button onClick={() => { setStep("pick"); setErr(""); }} style={{
              background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.t3, padding: 0,
            }}>←</button>
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
              style={{
                width: "100%", padding: "10px 14px", fontSize: 15, border: `1.5px solid ${C.line}`,
                borderRadius: 12, outline: "none", fontFamily: FONT, marginBottom: 16, boxSizing: "border-box",
                transition: "border-color 0.15s",
              }}
              onFocus={e => e.target.style.borderColor = C.primary}
              onBlur={e => e.target.style.borderColor = C.line}
            />
            {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{err}</div>}
            <Btn onClick={submitPassword} disabled={busy || !pw} style={{ width: "100%", padding: "11px 0", fontSize: 14 }}>
              {busy ? "Signing in..." : "Sign In"}
            </Btn>
          </form>
        </Card>
      )}

      {/* ── Step 3: Set password (first time) ── */}
      {step === "set-password" && selected && (
        <Card width={380}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <button onClick={() => { setStep("pick"); setErr(""); }} style={{
              background: "none", border: "none", cursor: "pointer", fontSize: 18, color: C.t3, padding: 0,
            }}>←</button>
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
              style={{
                width: "100%", padding: "10px 14px", fontSize: 15, border: `1.5px solid ${C.line}`,
                borderRadius: 12, outline: "none", fontFamily: FONT, marginBottom: 12, boxSizing: "border-box",
              }}
              onFocus={e => e.target.style.borderColor = C.primary}
              onBlur={e => e.target.style.borderColor = C.line}
            />
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.t3, marginBottom: 6 }}>
              Confirm password
            </label>
            <input
              type="password" value={pw2} onChange={e => setPw2(e.target.value)}
              placeholder="Type it again"
              style={{
                width: "100%", padding: "10px 14px", fontSize: 15, border: `1.5px solid ${C.line}`,
                borderRadius: 12, outline: "none", fontFamily: FONT, marginBottom: 16, boxSizing: "border-box",
              }}
              onFocus={e => e.target.style.borderColor = C.primary}
              onBlur={e => e.target.style.borderColor = C.line}
            />
            {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{err}</div>}
            <Btn onClick={submitSetPassword} disabled={busy || !pw || !pw2} style={{ width: "100%", padding: "11px 0", fontSize: 14 }}>
              {busy ? "Setting up..." : "Set Password & Sign In"}
            </Btn>
          </form>
        </Card>
      )}
    </div>
  );
}
