import { useState, useEffect } from "react";
import { C, FONT, MONO } from "../theme";
import { Btn, Label, Avatar, RoleBadge } from "./index";
import UploadZone from "./UploadZone";
import { checkHealth, getUploads } from "../api";

export default function Settings({ org, profile, team, onUpdateProfile, onLogout }) {
  const [serverStatus, setServerStatus] = useState(null);
  const [uploads, setUploads] = useState([]);

  const loadUploads = async () => {
    try {
      const data = await getUploads(); // no grantId = org-level
      setUploads(data);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    checkHealth().then(setServerStatus);
    loadUploads();
  }, []);

  return (
    <div style={{ padding: "28px 32px", maxWidth: 800 }}>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5, color: C.dark, marginBottom: 6 }}>Settings</div>
      <div style={{ width: 32, height: 4, background: C.primary, borderRadius: 2, marginBottom: 24 }} />

      {/* Org info */}
      <div style={{ background: C.white, borderRadius: 16, padding: 24, boxShadow: C.cardShadow, marginBottom: 20, borderLeft: `4px solid ${C.primary}` }}>
        <Label>Organisation</Label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>Name</span>
            <div style={{ fontSize: 15, color: C.dark, fontWeight: 600, marginTop: 2 }}>{org?.name}</div>
          </div>
          <div>
            <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>Slug</span>
            <div style={{ fontSize: 14, color: C.t2, fontFamily: MONO, marginTop: 2 }}>/{org?.slug}</div>
          </div>
          <div>
            <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>Website</span>
            <div style={{ fontSize: 14, color: C.t2, marginTop: 2 }}>{org?.website || "\u2014"}</div>
          </div>
          <div>
            <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>Industry</span>
            <div style={{ fontSize: 14, color: C.t2, marginTop: 2 }}>{org?.industry || "\u2014"}</div>
          </div>
          <div>
            <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>Country</span>
            <div style={{ fontSize: 14, color: C.t2, marginTop: 2 }}>{org?.country || "South Africa"}</div>
          </div>
          <div>
            <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>Currency</span>
            <div style={{ fontSize: 14, color: C.t2, marginTop: 2 }}>{org?.currency || "ZAR"}</div>
          </div>
        </div>
      </div>

      {/* Profile */}
      {profile && (
        <div style={{ background: C.white, borderRadius: 16, padding: 24, boxShadow: C.cardShadow, marginBottom: 20, borderLeft: `4px solid ${C.primary}` }}>
          <Label>Profile</Label>
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>Mission</span>
            <div style={{ fontSize: 13, color: C.t1, marginTop: 4, lineHeight: 1.6 }}>{profile.mission || "Not set"}</div>
          </div>
          {profile.programmes && profile.programmes.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>Programmes</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {profile.programmes.map((p, i) => (
                  <span key={i} style={{ padding: "4px 10px", fontSize: 12, background: C.primarySoft, color: C.primary, borderRadius: 6, fontWeight: 600 }}>
                    {p.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Knowledge Base */}
      <div style={{ background: C.white, borderRadius: 16, padding: 24, boxShadow: C.cardShadow, marginBottom: 20, borderLeft: `4px solid ${C.primary}` }}>
        <UploadZone
          uploads={uploads}
          grantId={null}
          onUploadsChange={loadUploads}
          label="Knowledge Base"
        />
        <div style={{ fontSize: 11, color: C.t4, marginTop: 8, lineHeight: 1.5 }}>
          Upload annual reports, strategy docs, budgets, impact reports, and YouTube URLs.
          Extracted text feeds into all AI-generated proposals and research for this organisation.
        </div>
      </div>

      {/* Team */}
      <div style={{ background: C.white, borderRadius: 16, padding: 24, boxShadow: C.cardShadow, marginBottom: 20, borderLeft: `4px solid ${C.primary}` }}>
        <Label>Team</Label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {team.filter(t => t.id !== "team").map(m => (
            <div key={m.id} style={{
              display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
              borderRadius: 10, borderBottom: `1px solid ${C.line}`,
              transition: "background 0.15s",
            }}
              onMouseEnter={e => e.currentTarget.style.background = C.hover}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <Avatar member={m} size={34} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.dark }}>{m.name}</div>
                {m.email && <div style={{ fontSize: 12, color: C.t3 }}>{m.email}</div>}
              </div>
              <RoleBadge role={m.role} />
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: C.ok, border: `2px solid ${C.white}` }} />
            </div>
          ))}
        </div>
      </div>

      {/* Server status */}
      <div style={{ background: C.white, borderRadius: 16, padding: 24, boxShadow: C.cardShadow, marginBottom: 20, borderLeft: `4px solid ${C.primary}` }}>
        <Label>System</Label>
        <div style={{ display: "flex", gap: 20 }}>
          <div>
            <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>Server</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: serverStatus?.ok ? C.ok : C.red }} />
              <span style={{ fontSize: 13, color: C.t1, fontWeight: 500 }}>{serverStatus?.ok ? "Connected" : "Offline"}</span>
            </div>
          </div>
          <div>
            <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>AI</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: serverStatus?.apiKeyConfigured ? C.ok : C.amber }} />
              <span style={{ fontSize: 13, color: C.t1, fontWeight: 500 }}>{serverStatus?.apiKeyConfigured ? "API key configured" : "No API key"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Logout */}
      <Btn onClick={onLogout} v="ghost" style={{ fontSize: 13 }}>Sign Out</Btn>
    </div>
  );
}
