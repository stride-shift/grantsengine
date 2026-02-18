import { useState, useEffect } from "react";
import { C, FONT, MONO } from "../theme";
import { Btn } from "./index";
import { getOrgs, createNewOrg } from "../api";

/* ── Shared avatar ── */
function OrgAvatar({ name, logoUrl, size = 40, radius = 10, fontSize = 16 }) {
  const [imgErr, setImgErr] = useState(false);
  if (logoUrl && !imgErr) {
    return (
      <img src={logoUrl} alt=""
        onError={() => setImgErr(true)}
        style={{ width: size, height: size, borderRadius: radius, objectFit: "cover", flexShrink: 0 }} />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0,
      background: `linear-gradient(135deg, ${C.primary} 0%, #E04840 100%)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize, fontWeight: 800, color: "#fff", fontFamily: MONO,
    }}>{(name || "?")[0]?.toUpperCase()}</div>
  );
}

export { OrgAvatar };

/* ── Favicon URL from Google ── */
function faviconUrl(website) {
  if (!website) return null;
  try {
    const domain = new URL(website.startsWith("http") ? website : `https://${website}`).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  } catch { return null; }
}

export default function OrgSelector({ onSelect }) {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [website, setWebsite] = useState("");
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);

  // Logo step: shown after form validation, before actual org creation
  const [logoStep, setLogoStep] = useState(false);
  const [faviconLoaded, setFaviconLoaded] = useState(false);
  const [faviconFailed, setFaviconFailed] = useState(false);

  useEffect(() => {
    getOrgs().then(o => { setOrgs(o); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const autoSlug = (n) => {
    setName(n);
    if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")) {
      setSlug(n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
    }
  };

  // Step 1: validate form → show logo step if website provided, otherwise create immediately
  const handleCreateClick = (e) => {
    e.preventDefault();
    if (!name || !slug) return;
    const fav = faviconUrl(website);
    if (fav) {
      setLogoStep(true);
      setFaviconLoaded(false);
      setFaviconFailed(false);
    } else {
      doCreate(null);
    }
  };

  // Step 2: actually create the org (with or without logo_url)
  const doCreate = async (logoUrl) => {
    setCreating(true); setErr("");
    try {
      const payload = { name, slug, website };
      if (logoUrl) payload.logo_url = logoUrl;
      const org = await createNewOrg(payload);
      onSelect(org.slug, true);
    } catch (ex) {
      setErr(ex.message);
      setLogoStep(false);
    }
    setCreating(false);
  };

  const fav = faviconUrl(website);

  // ── Header (shared across views) ──
  const header = (
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
  );

  // ── Logo step UI ──
  if (logoStep) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: FONT }}>
        {header}
        <div style={{ width: 420, background: C.white, borderRadius: 20, padding: 44, boxShadow: C.cardShadowLg, marginTop: 40, textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.t4, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Almost Done</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.dark, marginBottom: 6 }}>Add a Logo</div>
          <div style={{ fontSize: 13, color: C.t3, marginBottom: 28 }}>Give <strong>{name}</strong> a visual identity</div>

          {/* Logo preview */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
            <div style={{
              width: 88, height: 88, borderRadius: 18, overflow: "hidden",
              border: `2px dashed ${C.line}`, display: "flex", alignItems: "center", justifyContent: "center",
              background: C.warm100,
            }}>
              {fav && !faviconFailed ? (
                <img src={fav} alt="Logo"
                  onLoad={() => setFaviconLoaded(true)}
                  onError={() => setFaviconFailed(true)}
                  style={{ width: 80, height: 80, objectFit: "contain", borderRadius: 14 }} />
              ) : (
                <OrgAvatar name={name} size={80} radius={14} fontSize={28} />
              )}
            </div>
          </div>

          {fav && faviconLoaded && !faviconFailed && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: C.ok, fontWeight: 600, marginBottom: 12 }}>Found logo from website</div>
              <Btn onClick={() => doCreate(fav)} disabled={creating} style={{ width: "100%", marginBottom: 8 }}>
                {creating ? "Creating..." : "Use This Logo"}
              </Btn>
            </div>
          )}

          {fav && !faviconLoaded && !faviconFailed && (
            <div style={{ fontSize: 12, color: C.t4, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <span style={{ display: "inline-block", width: 12, height: 12, border: `2px solid ${C.t4}`, borderTopColor: "transparent", borderRadius: "50%", animation: "ge-spin 0.8s linear infinite" }} />
              Checking website for a logo...
            </div>
          )}

          {faviconFailed && (
            <div style={{ fontSize: 12, color: C.t4, marginBottom: 16 }}>No logo found on website</div>
          )}

          {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{err}</div>}

          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button onClick={() => doCreate(null)} disabled={creating}
              style={{
                fontSize: 13, fontWeight: 600, color: C.t3, background: "none",
                border: "none", cursor: "pointer", padding: "8px 16px", fontFamily: FONT,
              }}>{creating ? "Creating..." : "Skip for now"}</button>
            <button onClick={() => { setLogoStep(false); setErr(""); }}
              style={{
                fontSize: 13, fontWeight: 600, color: C.t4, background: "none",
                border: "none", cursor: "pointer", padding: "8px 16px", fontFamily: FONT,
              }}>Back</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main selector UI ──
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: C.bg, fontFamily: FONT }}>
      {header}

      <div style={{ width: 500, background: C.white, borderRadius: 20, padding: 44, boxShadow: C.cardShadowLg, marginTop: 40 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.t4, letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Grant Engine</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: C.dark, marginBottom: 4 }}>Select Organisation</div>
          <div style={{ width: 28, height: 3, background: C.primary, borderRadius: 2, margin: "8px auto 0" }} />
          <div style={{ fontSize: 14, color: C.t3, marginTop: 10 }}>Choose an org to manage or create a new one</div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", color: C.t3, padding: 40 }}>Loading...</div>
        ) : (
          <>
            {orgs.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                {orgs.map(org => (
                  <button key={org.id} onClick={() => onSelect(org.slug, false)}
                    style={{
                      display: "flex", alignItems: "center", gap: 14, padding: "14px 18px",
                      background: C.white, border: `1.5px solid ${C.line}`, borderRadius: 14,
                      boxShadow: C.cardShadow,
                      cursor: "pointer", textAlign: "left", fontFamily: FONT,
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = C.cardShadowHover; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderColor = C.primary + "40"; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = C.cardShadow; e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = C.line; }}
                  >
                    <OrgAvatar name={org.name} logoUrl={org.logo_url} />
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: C.dark }}>{org.name}</div>
                      <div style={{ fontSize: 12, color: C.t3 }}>/{org.slug} {org.industry && `\u00b7 ${org.industry}`}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {!showCreate ? (
              <Btn onClick={() => setShowCreate(true)} v="ghost" style={{ width: "100%" }}>
                + Create New Organisation
              </Btn>
            ) : (
              <form onSubmit={handleCreateClick} style={{ borderTop: `1px solid ${C.line}`, paddingTop: 20 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: C.dark, marginBottom: 16 }}>New Organisation</div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.t3, marginBottom: 4 }}>Name</label>
                  <input value={name} onChange={e => autoSlug(e.target.value)} placeholder="e.g. StrideShift" autoFocus
                    style={{ width: "100%", padding: "8px 12px", fontSize: 14, border: `1.5px solid ${C.line}`, borderRadius: 10, fontFamily: FONT, boxSizing: "border-box" }} />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.t3, marginBottom: 4 }}>URL slug</label>
                  <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="strideshift"
                    style={{ width: "100%", padding: "8px 12px", fontSize: 14, border: `1.5px solid ${C.line}`, borderRadius: 10, fontFamily: MONO, boxSizing: "border-box" }} />
                  <div style={{ fontSize: 11, color: C.t4, marginTop: 3 }}>URL will be: /org/{slug || "..."}</div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.t3, marginBottom: 4 }}>Website (optional)</label>
                  <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://..."
                    style={{ width: "100%", padding: "8px 12px", fontSize: 14, border: `1.5px solid ${C.line}`, borderRadius: 10, fontFamily: FONT, boxSizing: "border-box" }} />
                </div>
                {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{err}</div>}
                <div style={{ display: "flex", gap: 8 }}>
                  <Btn onClick={handleCreateClick} disabled={creating || !name || !slug} style={{ flex: 1 }}>
                    {creating ? "Creating..." : "Create Organisation"}
                  </Btn>
                  <Btn onClick={() => setShowCreate(false)} v="ghost">Cancel</Btn>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
