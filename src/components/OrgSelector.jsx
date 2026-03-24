import { useState, useEffect } from "react";
import { C, FONT, MONO } from "../theme";
import { Btn } from "./index";
import { getOrgs, createNewOrg, deleteOrg } from "../api";
import NorthernLights from "./NorthernLights";
import dlabLogo from "../dlab.png";
import geLogo from "../grants-engine-logo.png";
import geIcon from "../ge-icon.png";

/* ── Shared avatar ── */
function OrgAvatar({ name, logoUrl, slug, size = 40, radius = 10, fontSize = 16 }) {
  const [imgErr, setImgErr] = useState(false);
  // Use dlab.png for d-lab org when no logo_url is set
  const effectiveLogo = logoUrl || (slug === "dlab" ? dlabLogo : null);
  if (effectiveLogo && !imgErr) {
    return (
      <img src={effectiveLogo} alt=""
        onError={() => setImgErr(true)}
        style={{ width: size, height: size, borderRadius: radius, objectFit: "contain", flexShrink: 0, background: "rgba(255,255,255,0.05)" }} />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0,
      background: `linear-gradient(135deg, ${C.primary} 0%, ${C.primaryDark} 100%)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize, fontWeight: 800, color: C.white, fontFamily: MONO,
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
  const [logoPreview, setLogoPreview] = useState(null); // data URL from file upload

  // Super-admin mode
  const [adminMode, setAdminMode] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null); // org to delete
  const [confirmSlug, setConfirmSlug] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState("");

  useEffect(() => {
    getOrgs().then(o => { setOrgs(o); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const autoSlug = (n) => {
    setName(n);
    if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")) {
      setSlug(n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
    }
  };

  // Step 1: validate form → always show logo step
  const handleCreateClick = (e) => {
    e.preventDefault();
    if (!name || !slug) return;
    setLogoStep(true);
    setFaviconLoaded(false);
    setFaviconFailed(false);
  };

  // Step 2: actually create the org (with or without logo_url)
  const doCreate = async (logoUrl) => {
    setCreating(true); setErr("");
    try {
      const payload = { name, slug, website };
      if (logoUrl) payload.logo_url = logoUrl;
      const org = await createNewOrg(payload, adminKey);
      onSelect(org.slug, true);
    } catch (ex) {
      setErr(ex.message);
      setLogoStep(false);
    }
    setCreating(false);
  };

  const doDelete = async () => {
    if (confirmSlug !== deleteTarget.slug) return;
    setDeleting(true); setDeleteErr("");
    try {
      await deleteOrg(deleteTarget.slug, adminKey);
      setOrgs(prev => prev.filter(o => o.slug !== deleteTarget.slug));
      setDeleteTarget(null); setConfirmSlug("");
    } catch (ex) {
      setDeleteErr(ex.message);
    }
    setDeleting(false);
  };

  const fav = faviconUrl(website);

  // ── Header (shared across views) ──
  const header = (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, height: 80, zIndex: 10,
      background: "rgba(0,0,0,0.5)", backdropFilter: "blur(16px)",
      display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px",
      boxShadow: "0 2px 12px rgba(0, 0, 0, 0.3)", pointerEvents: "auto",
    }}>
      {/* Grants Engine logo — left */}
            <img src={geLogo} alt="Grants Engine" style={{ height: 50, objectFit: "contain" }} />
    </div>
  );

  // ── Logo step UI ──
  if (logoStep) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", background: "#000", fontFamily: FONT, position: "relative" }}>
        <div style={{ position: "fixed", inset: 0, zIndex: 0 }}><NorthernLights /></div>
        <div style={{ position: "relative", zIndex: 1, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, pointerEvents: "none", padding: "100px 0 40px" }}>
        {header}
        <div style={{ width: "90%", maxWidth: 420, background: "rgba(255,255,255,0.08)", borderRadius: 14, padding: "28px 24px", boxShadow: "0 8px 32px rgba(0,0,0,0.4)", textAlign: "center", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.12)", pointerEvents: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Almost Done</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 6 }}>Add Company Logo</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 28 }}>Upload a logo for <strong>{name}</strong></div>

          {/* Logo preview / upload area */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
            <label style={{
              width: 100, height: 100, borderRadius: 16, overflow: "hidden",
              border: "2px dashed rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(255,255,255,0.05)", cursor: "pointer", transition: "all 0.2s",
              flexDirection: "column", gap: 4,
            }}>
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" style={{ width: 92, height: 92, objectFit: "contain", borderRadius: 14 }} />
              ) : fav && !faviconFailed ? (
                <img src={fav} alt="Logo"
                  onLoad={() => setFaviconLoaded(true)}
                  onError={() => setFaviconFailed(true)}
                  style={{ width: 92, height: 92, objectFit: "contain", borderRadius: 14 }} />
              ) : (
                <>
                  <span style={{ fontSize: 28, color: "rgba(255,255,255,0.3)" }}>+</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>Upload</span>
                </>
              )}
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => setLogoPreview(reader.result);
                reader.readAsDataURL(file);
              }} />
            </label>
          </div>

          {fav && faviconLoaded && !faviconFailed && !logoPreview && (
            <div style={{ fontSize: 12, color: "#4ADE80", fontWeight: 600, marginBottom: 12 }}>Found logo from website</div>
          )}

          {fav && !faviconLoaded && !faviconFailed && !logoPreview && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "transparent", borderRadius: "50%", animation: "ge-spin 0.8s linear infinite" }} />
              Checking website for a logo...
            </div>
          )}

          {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{err}</div>}

          <Btn onClick={() => doCreate(logoPreview || (faviconLoaded && !faviconFailed ? fav : null))} disabled={creating} style={{ width: "100%", marginBottom: 10 }}>
            {creating ? "Creating..." : "Create Organisation"}
          </Btn>
          <button onClick={() => { setLogoStep(false); setLogoPreview(null); setErr(""); }}
            style={{
              fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.4)", background: "none",
              border: "none", cursor: "pointer", padding: "8px 16px", fontFamily: FONT,
            }}>Back</button>
        </div>
        </div>
      </div>
    );
  }

  // ── Delete confirmation modal ──
  const deleteModal = deleteTarget && (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(55, 65, 81, 0.5)", zIndex: 9999, pointerEvents: "auto",
      display: "flex", alignItems: "center", justifyContent: "center", fontFamily: FONT,
    }} onClick={() => { if (!deleting) { setDeleteTarget(null); setConfirmSlug(""); setDeleteErr(""); } }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 420, background: C.white, borderRadius: 14, padding: 28, boxShadow: C.cardShadowLg,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: C.redSoft,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18,
          }}>🗑</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: C.dark }}>Delete Organisation</div>
            <div style={{ fontSize: 12, color: C.t3 }}>This action is permanent and cannot be undone</div>
          </div>
        </div>

        <div style={{
          background: C.redSoft, border: `1px solid ${C.red}30`, borderRadius: 8, padding: "12px 16px",
          marginBottom: 20, fontSize: 13, color: C.red, lineHeight: 1.5,
        }}>
          This will permanently delete <strong>{deleteTarget.name}</strong> and all its data including grants, proposals, team members, documents, and settings.
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.t3, marginBottom: 4 }}>
            Type <span style={{ fontFamily: MONO, background: C.raised, padding: "1px 6px", borderRadius: 4 }}>{deleteTarget.slug}</span> to confirm
          </label>
          <input value={confirmSlug} onChange={e => setConfirmSlug(e.target.value)} autoFocus
            placeholder={deleteTarget.slug}
            style={{
              width: "100%", padding: "8px 12px", fontSize: 14, fontFamily: MONO,
              border: `1px solid ${confirmSlug === deleteTarget.slug ? C.primary : C.line}`,
              borderRadius: 8, boxSizing: "border-box",
            }} />
        </div>

        {deleteErr && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{deleteErr}</div>}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={doDelete}
            disabled={deleting || confirmSlug !== deleteTarget.slug}
            style={{
              flex: 1, padding: "10px 16px", fontSize: 14, fontWeight: 600, fontFamily: FONT,
              background: confirmSlug === deleteTarget.slug ? C.primary : C.raised,
              color: confirmSlug === deleteTarget.slug ? C.white : C.t4,
              border: "none", borderRadius: 8, cursor: confirmSlug === deleteTarget.slug ? "pointer" : "not-allowed",
              transition: "all 0.2s",
            }}>
            {deleting ? "Deleting..." : "Delete Forever"}
          </button>
          <button onClick={() => { setDeleteTarget(null); setConfirmSlug(""); setDeleteErr(""); }}
            disabled={deleting}
            style={{
              padding: "10px 16px", fontSize: 14, fontWeight: 600, fontFamily: FONT,
              background: "none", color: C.t3, border: `1px solid ${C.line}`, borderRadius: 8,
              cursor: "pointer",
            }}>Cancel</button>
        </div>
      </div>
    </div>
  );

  // ── Main selector UI ──
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", background: "#000", fontFamily: FONT, position: "relative" }}>
      <div style={{ position: "fixed", inset: 0, zIndex: 0 }}><NorthernLights /></div>
      {header}
      {deleteModal}
      <div style={{ position: "relative", zIndex: 1, width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, pointerEvents: "none", padding: "100px 0 40px" }}>

      <div style={{ width: "90%", maxWidth: 500, background: "rgba(255,255,255,0.08)", borderRadius: 14, padding: "28px 24px", boxShadow: "0 8px 32px rgba(0,0,0,0.4)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.12)", pointerEvents: "auto" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.45)", letterSpacing: 2, textTransform: "uppercase", marginBottom: 8 }}>Grants Engine</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 4 }}>Select Organisation</div>
          <div style={{ width: 28, height: 3, background: "#4ADE80", borderRadius: 2, margin: "8px auto 0" }} />
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.55)", marginTop: 10 }}>Choose an org to manage or create a new one</div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", color: C.t3, padding: 40 }}>Loading...</div>
        ) : (
          <>
            {/* Admin mode: enter key to unlock delete buttons */}
            {adminMode && !adminKey && (
              <div style={{ marginBottom: 20, padding: 16, background: C.redSoft, borderRadius: 8, border: `1px solid ${C.red}30` }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.red, marginBottom: 8 }}>Super Admin Mode</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="password" placeholder="Enter admin key"
                    onKeyDown={e => { if (e.key === "Enter" && e.target.value) setAdminKey(e.target.value); }}
                    style={{
                      flex: 1, padding: "8px 12px", fontSize: 13, fontFamily: MONO,
                      border: `1px solid ${C.red}30`, borderRadius: 8, boxSizing: "border-box",
                    }} />
                  <button onClick={e => {
                    const input = e.target.parentElement.querySelector("input");
                    if (input.value) setAdminKey(input.value);
                  }} style={{
                    padding: "8px 14px", fontSize: 13, fontWeight: 600, fontFamily: FONT,
                    background: C.primary, color: C.white, border: "none", borderRadius: 8, cursor: "pointer",
                  }}>Unlock</button>
                  <button onClick={() => setAdminMode(false)} style={{
                    padding: "8px 12px", fontSize: 13, fontFamily: FONT,
                    background: "none", color: C.t3, border: `1px solid ${C.line}`, borderRadius: 8, cursor: "pointer",
                  }}>Cancel</button>
                </div>
              </div>
            )}

            {adminMode && adminKey && (
              <div style={{
                marginBottom: 16, padding: "8px 14px", background: C.redSoft, borderRadius: 10,
                display: "flex", alignItems: "center", justifyContent: "space-between",
                border: `1px solid ${C.red}30`,
              }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: C.red }}>🔓 Admin mode — click ✕ to delete orgs</span>
                <button onClick={() => { setAdminMode(false); setAdminKey(""); }} style={{
                  background: "none", border: "none", color: C.red, cursor: "pointer",
                  fontSize: 12, fontWeight: 600, fontFamily: FONT, textDecoration: "underline",
                }}>Exit</button>
              </div>
            )}

            {orgs.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                {orgs.map(org => (
                  <div key={org.id} style={{ display: "flex", alignItems: "center", gap: 0 }}>
                    <button onClick={() => onSelect(org.slug, false)}
                      style={{
                        display: "flex", alignItems: "center", gap: 14, padding: "14px 18px",
                        background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: adminMode && adminKey ? "10px 0 0 10px" : 10,
                        boxShadow: "none", flex: 1,
                        cursor: "pointer", textAlign: "left", fontFamily: FONT,
                        transition: "all 0.25s ease",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.borderColor = "rgba(74,222,128,0.4)"; e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.3)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.transform = "none"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; e.currentTarget.style.boxShadow = "none"; }}
                    >
                      <OrgAvatar name={org.name} logoUrl={org.logo_url} slug={org.slug} />
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>{org.name}</div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>/{org.slug} {org.industry && `\u00b7 ${org.industry}`}</div>
                      </div>
                    </button>
                    {adminMode && adminKey && (
                      <button onClick={() => { setDeleteTarget(org); setConfirmSlug(""); setDeleteErr(""); }}
                        title={`Delete ${org.name}`}
                        style={{
                          width: 44, height: "100%", minHeight: 56,
                          background: C.redSoft, border: `1px solid ${C.red}30`, borderLeft: "none",
                          borderRadius: "0 10px 10px 0", cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 16, color: C.red, transition: "all 0.2s",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = C.redSoft; }}
                        onMouseLeave={e => { e.currentTarget.style.background = C.redSoft; }}
                      >✕</button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              {!showCreate ? (
                <>
                  <button onClick={() => setShowCreate(true)} style={{
                    flex: 1, padding: "12px 16px", fontSize: 13, fontWeight: 600, fontFamily: FONT,
                    borderRadius: 8, border: "1px solid rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.08)",
                    color: "#fff", cursor: "pointer", transition: "all 0.2s",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.15)"; e.currentTarget.style.borderColor = "rgba(74,222,128,0.5)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; }}
                  >
                    + Create New Organisation
                  </button>
                  {!adminMode && (
                    <button onClick={() => setAdminMode(true)}
                      title="Super Admin"
                      style={{
                        width: 36, height: 36, borderRadius: 8, border: `1px solid ${C.line}`,
                        background: C.white, cursor: "pointer", fontSize: 14,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: C.t4, transition: "all 0.2s",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = C.primary + "40"; e.currentTarget.style.color = C.t2; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.color = C.t4; }}
                    >⚙</button>
                  )}
                </>
              ) : (
                <form onSubmit={handleCreateClick} style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 20, width: "100%" }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#fff", marginBottom: 16 }}>New Organisation</div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>Name</label>
                    <input value={name} onChange={e => autoSlug(e.target.value)} placeholder="e.g. StrideShift" autoFocus className="ge-dark-input"
                      style={{ width: "100%", padding: "8px 12px", fontSize: 14, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, fontFamily: FONT, boxSizing: "border-box", background: "rgba(255,255,255,0.1)", color: "#fff", caretColor: "#fff" }} />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>URL slug</label>
                    <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="strideshift" className="ge-dark-input"
                      style={{ width: "100%", padding: "8px 12px", fontSize: 14, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, fontFamily: MONO, boxSizing: "border-box", background: "rgba(255,255,255,0.1)", color: "#fff", caretColor: "#fff" }} />
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>URL will be: /org/{slug || "..."}</div>
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>Website (optional)</label>
                    <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://..." className="ge-dark-input"
                      style={{ width: "100%", padding: "8px 12px", fontSize: 14, border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, fontFamily: FONT, boxSizing: "border-box", background: "rgba(255,255,255,0.1)", color: "#fff", caretColor: "#fff" }} />
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
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
