import { useState, useEffect } from "react";
import { C, FONT, MONO } from "../theme";
import { Btn } from "./index";
import { getOrgs, createNewOrg } from "../api";

export default function OrgSelector({ onSelect }) {
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [website, setWebsite] = useState("");
  const [err, setErr] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    getOrgs().then(o => { setOrgs(o); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const autoSlug = (n) => {
    setName(n);
    if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")) {
      setSlug(n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
    }
  };

  const create = async (e) => {
    e.preventDefault();
    if (!name || !slug) return;
    setCreating(true); setErr("");
    try {
      const org = await createNewOrg({ name, slug, website });
      onSelect(org.slug, true);
    } catch (ex) {
      setErr(ex.message);
    }
    setCreating(false);
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
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: `linear-gradient(135deg, ${C.primary} 0%, #E04840 100%)`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 16, fontWeight: 800, color: "#fff", fontFamily: MONO,
                    }}>{org.name[0]}</div>
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
              <form onSubmit={create} style={{ borderTop: `1px solid ${C.line}`, paddingTop: 20 }}>
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
                  <Btn onClick={create} disabled={creating || !name || !slug} style={{ flex: 1 }}>
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
