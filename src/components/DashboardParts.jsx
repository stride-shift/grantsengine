import { useState } from "react";
import { C, MONO } from "../theme";
import { Btn, CopyBtn, stripMd } from "./index";

/* Presentational primitives lifted verbatim from Dashboard.jsx (Phase 4.5, move-only).
   These close over no Dashboard state — pure render helpers — so the lift is behaviour-
   preserving; the Dashboard render-net snapshot proves the DOM is unchanged. */

/* ═══ Micro chart components — zero dependencies ═══ */

export const Bar = ({ pct, color, h = 6 }) => (
  <div style={{ flex: 1, height: h, background: C.raised, borderRadius: h / 2, overflow: "hidden" }}>
    <div style={{ width: `${Math.max(pct > 0 ? 3 : 0, pct)}%`, height: "100%", borderRadius: h / 2, background: color, transition: "width 0.5s ease" }} />
  </div>
);

export const Spark = ({ data, color = C.primary, w = 80, h = 28 }) => {
  if (!data || data.length < 2) return null;
  const mn = Math.min(...data), mx = Math.max(...data), range = mx - mn || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - mn) / range) * (h - 4) - 2}`).join(" ");
  return <svg width={w} height={h} style={{ display: "block" }}><polyline points={pts} fill="none" stroke={color} strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" /></svg>;
};

/* Section divider with optional right-side element */
export const Hd = ({ children, right, mb = 20 }) => (
  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: mb, marginTop: 24 }}>
    <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, letterSpacing: 1.4, textTransform: "uppercase" }}>{children}</div>
    {right}
  </div>
);

/* Section accent colors — alternating green / blue */
const SECTION_THEMES = {
  "Pipeline":              { accent: "#10B981", bg: "#ECFDF5", border: "#10B98130", icon: "◈" },
  "In Play":               { accent: "#0EA5E9", bg: "#F0F9FF", border: "#0EA5E930", icon: "▶" },
  "Timeline":              { accent: "#059669", bg: "#ECFDF5", border: "#05966930", icon: "◷" },
  "Upcoming Follow-ups":   { accent: "#0284C7", bg: "#F0F9FF", border: "#0284C730", icon: "◉" },
  "AI Tools":              { accent: "#14B8A6", bg: "#F0FDFA", border: "#14B8A630", icon: "✦" },
  "Pipeline Intelligence": { accent: "#3B82F6", bg: "#EFF6FF", border: "#3B82F630", icon: "◆" },
};
const DEFAULT_THEME = { accent: "#10B981", bg: "#F9FAFB", border: "#E5E7EB", icon: "▸" };

/* Collapsible section — click header to toggle */
export const Section = ({ title, right, children, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const theme = SECTION_THEMES[title] || DEFAULT_THEME;
  return (
    <div style={{ marginTop: 16 }}>
      <div onClick={() => setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          cursor: "pointer", marginBottom: open ? 16 : 0, userSelect: "none",
          padding: "10px 14px", borderRadius: 10,
          background: open ? theme.bg : C.white,
          border: `1px solid ${open ? theme.border : C.line}`,
          transition: "all 0.2s ease",
        }}
        onMouseEnter={e => { if (!open) { e.currentTarget.style.background = theme.bg; e.currentTarget.style.borderColor = theme.border; } }}
        onMouseLeave={e => { if (!open) { e.currentTarget.style.background = C.white; e.currentTarget.style.borderColor = C.line; } }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 24, height: 24, borderRadius: 6,
            background: `${theme.accent}15`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, color: theme.accent, flexShrink: 0,
          }}>{theme.icon}</div>
          <div style={{ fontSize: 12, fontWeight: 700, color: open ? theme.accent : C.t2, letterSpacing: 0.5, textTransform: "uppercase", transition: "color 0.2s" }}>{title}</div>
          <span style={{
            fontSize: 9, color: theme.accent, fontWeight: 600,
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.2s", display: "inline-block",
          }}>{"▶"}</span>
        </div>
        <div onClick={e => e.stopPropagation()}>{right}</div>
      </div>
      {open && children}
    </div>
  );
};

/* Card with optional accent stripe */
export const Card = ({ children, accent, pad = "14px 16px", style: sx, className }) => (
  <div className={className} style={{
    padding: pad, background: C.white, borderRadius: 10,
    boxShadow: C.cardShadow,
    borderTop: accent ? `3px solid ${accent}` : undefined,
    border: accent ? undefined : `1px solid ${C.line}`,
    ...sx,
  }}>
    {children}
  </div>
);

/* Stat cell — big number with label and optional micro detail */
export const Stat = ({ label, value, sub, color = C.dark, small }) => (
  <div style={{ minWidth: small ? 80 : 110 }}>
    <div style={{ fontSize: 10, fontWeight: 600, color: C.t4, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
    <div style={{ fontSize: small ? 20 : 22, fontWeight: 800, color, fontFamily: MONO, letterSpacing: -1.5, lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: C.t3, marginTop: 6, fontWeight: 500 }}>{sub}</div>}
  </div>
);

/* Horizontal bar row — compact */
export const HRow = ({ label, value, max, color, suffix = "", w = 90 }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, height: 26 }}>
    <div style={{ width: w, fontSize: 11, fontWeight: 600, color: C.t2, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
    <Bar pct={(value / (max || 1)) * 100} color={color} />
    <div style={{ width: 36, fontSize: 11, fontWeight: 700, color: C.t1, fontFamily: MONO, textAlign: "right" }}>{value}{suffix}</div>
  </div>
);

/* AI output block — shared for all AI sections */
export const AIBlock = ({ label, sub, busy, result, onRun, btnLabel, busyLabel, accentColor }) => (
  <Card accent={accentColor} style={{ flex: 1, minWidth: 340, display: "flex", flexDirection: "column" }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: result ? 14 : 0 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>{label}</div>
        <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>{sub}</div>
      </div>
      <Btn
        v={result ? "ghost" : "primary"}
        onClick={onRun} disabled={busy}
        style={{
          fontSize: 12, padding: "6px 14px",
          ...(accentColor && !result ? { background: accentColor, borderColor: accentColor } : {}),
        }}
      >{busy ? busyLabel : result ? "↻ Refresh" : btnLabel || "Generate"}</Btn>
    </div>
    {busy && (
      <div style={{ height: 3, borderRadius: 2, overflow: "hidden", margin: "12px 0 0" }}>
        <div style={{ height: "100%", background: accentColor || C.primary, animation: "ai-load-bar 2s ease-in-out infinite", borderRadius: 2 }} />
      </div>
    )}
    {result && (
      <div style={{
        padding: "14px 16px", background: C.warm100, borderRadius: 10,
        fontSize: 13, lineHeight: 1.85, color: C.t1,
        whiteSpace: "pre-wrap", maxHeight: 420, overflow: "auto",
        position: "relative", marginTop: 2,
      }}>
        {stripMd(result)}
        <CopyBtn text={result} style={{ position: "absolute", top: 8, right: 8 }} />
      </div>
    )}
  </Card>
);
