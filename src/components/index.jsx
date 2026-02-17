import { useState, useEffect } from "react";
import { C, FONT, MONO } from "../theme";
import { dL, urgC, urgLabel, deadlineCtx, cp } from "../utils";

export const DeadlineBadge = ({ d, deadline, size = "sm", stage }) => {
  if (d === null) return null;
  // Use stage-aware context if stage is provided, otherwise fall back to raw urgency
  const ctx = stage ? deadlineCtx(d, stage) : null;
  const col = ctx ? ctx.color : urgC(d);
  const bg = ctx ? ctx.bg : (d < 0 ? C.redSoft : d <= 14 ? C.amberSoft : C.warm200);
  const pulse = ctx ? ctx.severity === "critical" : (d >= 0 && d <= 3);
  const label = ctx ? ctx.label : urgLabel(d);
  const icon = ctx ? ctx.icon : (d < 0 ? "\u26a0" : "");
  const dateStr = deadline ? new Date(deadline).toLocaleDateString("en-ZA", { day: "numeric", month: "short" }) : null;
  const isSm = size === "sm";
  if (ctx && ctx.severity === "ok" && d < 0) {
    // Post-submission, past deadline — don't show badge at all (it's fine)
    return null;
  }
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: isSm ? "3px 8px" : "4px 12px", fontSize: isSm ? 10 : 12, fontWeight: 600,
      color: col, background: bg, borderRadius: 20,
      animation: pulse ? "ge-pulse 1.2s ease-in-out infinite" : "none", whiteSpace: "nowrap",
      letterSpacing: 0.1,
    }}>
      {icon && <span>{icon} </span>}{dateStr && !isSm && <span style={{ opacity: 0.7, marginRight: 2 }}>{dateStr} {"\u00b7"}</span>}{label}
    </span>
  );
};

export const TypeBadge = ({ type }) => {
  const tc = { "Foundation": C.blue, "Corporate CSI": C.red, "Government/SETA": C.amber, "International": "#1A7A42", "Tech Company": "#0891B2" };
  const bgs = { "Foundation": C.blueSoft, "Corporate CSI": C.redSoft, "Government/SETA": C.amberSoft, "International": "#E6F5EE", "Tech Company": "#ECFEFF" };
  const col = tc[type] || C.t3;
  const bg = bgs[type] || C.raised;
  return <span style={{ padding: "3px 10px", fontSize: 11, fontWeight: 700, color: col, background: bg, borderRadius: 20, whiteSpace: "nowrap", letterSpacing: 0.4 }}>{type}</span>;
};

export const Tag = ({ text, color = C.primary }) => (
  <span style={{
    display: "inline-block", padding: "3px 10px", fontSize: 12, fontWeight: 600,
    letterSpacing: 0.2, color, background: color + "14", borderRadius: 20,
    marginRight: 4, marginBottom: 3, fontFamily: FONT,
  }}>{text}</span>
);

export const Sparkline = ({ data, color = C.primary, w = 80, h = 24 }) => {
  if (!data || data.length < 2) return null;
  const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - mn) / rng) * (h - 4) - 2}`).join(" ");
  return (<svg width={w} height={h} style={{ display: "block" }}><polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" /><circle cx={(data.length - 1) / (data.length - 1) * w} cy={h - ((data[data.length - 1] - mn) / rng) * (h - 4) - 2} r={2.5} fill={color} /></svg>);
};

export const CalendarStrip = ({ grants, onClickGrant, C: colors }) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const endDate = new Date(today); endDate.setDate(endDate.getDate() + 90);
  // Only show pre-submission grants on timeline — post-submission deadlines are irrelevant
  const preSubmission = ["scouted", "qualifying", "drafting", "review"];
  const deadlines = grants.filter(g => g.deadline && preSubmission.includes(g.stage)).map(g => {
    const d = new Date(g.deadline); d.setHours(0, 0, 0, 0);
    const days = Math.round((d - today) / 86400000);
    const ctx = deadlineCtx(days, g.stage);
    return { ...g, date: d, days, pct: Math.max(0, Math.min(100, (days / 90) * 100)), ctx };
  }).filter(g => g.days >= -14 && g.days <= 90).sort((a, b) => a.days - b.days);
  if (!deadlines.length) return null;
  const months = [];
  for (let i = 0; i <= 3; i++) { const m = new Date(today); m.setMonth(m.getMonth() + i, 1); if (m <= endDate) months.push(m); }
  return (
    <div style={{ background: colors.white, borderRadius: 16, padding: "16px 20px", marginBottom: 16, boxShadow: C.cardShadow }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: colors.t3 }}>Submission timeline</span>
        <span style={{ fontSize: 11, color: colors.t4 }}>Next 90 days</span>
      </div>
      <div style={{ position: "relative", height: 44, background: colors.raised, borderRadius: 10 }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: C.primary, borderRadius: 2, zIndex: 2 }} />
        <div style={{ position: "absolute", left: -2, top: -15, fontSize: 9, fontWeight: 700, color: C.primary, letterSpacing: 0.5 }}>Today</div>
        {months.map(m => {
          const d = Math.round((m - today) / 86400000); const pct = (d / 90) * 100;
          if (pct <= 0 || pct >= 100) return null;
          return <div key={m.toISOString()} style={{ position: "absolute", left: `${pct}%`, top: 0, bottom: 0, width: 1, background: colors.line }}>
            <span style={{ position: "absolute", top: -15, left: -12, fontSize: 9, color: colors.t4 }}>{m.toLocaleDateString("en-ZA", { month: "short" })}</span>
          </div>;
        })}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${(14 / 90) * 100}%`, background: "rgba(208,50,40,0.05)", borderRadius: "10px 0 0 10px" }} />
        {deadlines.map((g, i) => {
          // Stage-aware coloring: expired scouted = grey, missed drafting = amber, upcoming = urgency colors
          const color = g.ctx.severity === "expired" ? colors.t4 : g.ctx.severity === "missed" ? colors.amber : g.ctx.color;
          const opacity = g.ctx.severity === "expired" ? 0.5 : 1;
          const nearby = deadlines.filter(o => Math.abs(o.days - g.days) < 3 && deadlines.indexOf(o) < i);
          const yOff = (nearby.length % 3) * 12;
          const tipLabel = g.ctx.severity === "expired" ? `Window closed ${Math.abs(g.days)}d ago`
            : g.ctx.severity === "missed" ? `Missed by ${Math.abs(g.days)}d`
            : g.days === 0 ? "Due today!" : `${g.days}d remaining`;
          return <div key={g.id} title={`${g.name} — ${g.funder}\n${tipLabel}\nR${g.ask?.toLocaleString()}\nStage: ${g.stage}`}
            onClick={() => onClickGrant(g.id)}
            style={{ position: "absolute", left: `${Math.max(0.5, Math.min(99, g.pct))}%`, top: 10 + yOff, width: 14, height: 14, borderRadius: "50%", background: color, opacity, border: `2.5px solid ${colors.white}`, cursor: "pointer", transform: "translateX(-7px)", zIndex: 3, transition: "transform 0.2s ease, opacity 0.2s ease", boxShadow: `0 2px 6px ${color}40` }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateX(-7px) scale(1.5)"; e.currentTarget.style.opacity = "1"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "translateX(-7px) scale(1)"; e.currentTarget.style.opacity = String(opacity); }} />;
        })}
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
        <span style={{ fontSize: 10, color: colors.t4, display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: colors.red }} /> Urgent</span>
        <span style={{ fontSize: 10, color: colors.t4, display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: colors.amber }} /> Approaching</span>
        <span style={{ fontSize: 10, color: colors.t4, display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: C.ok }} /> On track</span>
        <span style={{ fontSize: 10, color: colors.t4, display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: colors.t4, opacity: 0.5 }} /> Expired</span>
      </div>
    </div>
  );
};

export const Num = ({ label, value, sub, color = C.dark, sparkData, sparkColor, accent }) => (
  <div style={{
    flex: 1, minWidth: 130, padding: "20px 22px", background: C.white, borderRadius: 16,
    border: `1.5px solid ${(accent || color)}25`, boxShadow: C.cardShadow, transition: "box-shadow 0.2s ease, transform 0.2s ease",
  }}
    onMouseEnter={e => { e.currentTarget.style.boxShadow = C.cardShadowHover; e.currentTarget.style.transform = "translateY(-2px)"; }}
    onMouseLeave={e => { e.currentTarget.style.boxShadow = C.cardShadow; e.currentTarget.style.transform = "none"; }}
  >
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.t3, marginBottom: 12, letterSpacing: 1.2, textTransform: "uppercase" }}>{label}</div>
      {sparkData && <Sparkline data={sparkData} color={sparkColor || color} />}
    </div>
    <div style={{ fontSize: 36, fontWeight: 800, color, letterSpacing: -1.5, fontFamily: MONO, lineHeight: 1 }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: C.t3, marginTop: 10, fontWeight: 500 }}>{sub}</div>}
  </div>
);

export const Btn = ({ children, onClick, v = "primary", disabled, style: sx }) => {
  const base = {
    padding: "9px 18px", border: "none", fontSize: 13, fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1,
    fontFamily: FONT, borderRadius: 12, transition: "all 0.2s ease", letterSpacing: 0.1,
  };
  const variants = {
    primary: { background: C.primary, color: "#fff", boxShadow: `0 2px 8px rgba(208, 50, 40, 0.25)` },
    ghost: { background: "transparent", color: C.t2, border: `1.5px solid ${C.line}` },
    muted: { background: C.raised, color: C.t2 },
    danger: { background: C.redSoft, color: C.red, border: `1.5px solid ${C.red}25` },
    success: { background: C.ok, color: "#fff", boxShadow: `0 2px 8px ${C.ok}30` },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...variants[v], ...sx }}>{children}</button>;
};

export const CopyBtn = ({ text }) => {
  const [ok, setOk] = useState(false);
  return (
    <button onClick={() => { cp(text); setOk(true); setTimeout(() => setOk(false), 2e3); }}
      style={{
        padding: "5px 14px", border: `1.5px solid ${ok ? C.primaryBorder : C.line}`,
        background: ok ? C.primarySoft : C.white, color: ok ? C.primary : C.t3,
        fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: FONT, borderRadius: 8,
        transition: "all 0.2s ease",
      }}>
      {ok ? "\u2713 Copied" : "Copy"}
    </button>
  );
};

export const Label = ({ children, style: sx }) => (
  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: "uppercase", color: C.t3, marginBottom: 14, ...sx }}>{children}</div>
);

export const Avatar = ({ member, size = 26 }) => {
  const m = member || { name: "Unassigned", initials: "\u2014", role: "none" };
  const colors = [
    { bg: C.redSoft, fg: C.red },
    { bg: C.blueSoft, fg: C.blue },
    { bg: C.amberSoft, fg: C.amber },
    { bg: "#E6F5EE", fg: "#1A7A42" },
    { bg: "#ECFEFF", fg: "#0891B2" },
    { bg: C.purpleSoft, fg: C.purple },
  ];
  const idx = m.name ? m.name.charCodeAt(0) % colors.length : colors.length - 1;
  const ac = colors[idx];
  return (
    <span title={m.name} style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      width: size, height: size, fontSize: size * 0.36, fontWeight: 700,
      color: ac.fg, background: ac.bg, borderRadius: size * 0.35, flexShrink: 0, fontFamily: MONO,
    }}>{m.initials || m.name?.[0] || "\u2014"}</span>
  );
};

export const RoleBadge = ({ role }) => {
  const rc = { director: { bg: C.primarySoft, fg: C.primary, l: "Director" }, hop: { bg: C.purpleSoft, fg: C.purple, l: "Head of Prog" }, pm: { bg: C.blueSoft, fg: C.blue, l: "Prog Manager" } };
  const r = rc[role]; if (!r) return null;
  return <span style={{ padding: "3px 10px", fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: r.fg, background: r.bg, borderRadius: 20, textTransform: "uppercase" }}>{r.l}</span>;
};

export const downloadDoc = (text, filename) => {
  const lt = String.fromCharCode(60);
  const escaped = text.replace(/&/g,"&amp;").replace(new RegExp(lt, "g"),"&lt;").replace(/>/g,"&gt;")
    .replace(/\u2550{3,}.*\n?/g, "<hr>")
    .replace(/^(\d+)\.\s+(.+)$/gm, "<h2>$1. $2</h2>")
    .replace(/^([A-Z][A-Z\s&/]{4,})$/gm, "<h2>$1</h2>")
    .replace(/^[\u2022\u25cf]\s+(.+)$/gm, "<li>$1</li>")
    .replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br>");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.6;color:#222;max-width:7in;margin:0.8in auto}h1,h2,h3{color:#1a1a1a;margin-top:18pt}h1{font-size:16pt;border-bottom:1pt solid #ccc;padding-bottom:6pt}h2{font-size:13pt}table{border-collapse:collapse;width:100%;margin:8pt 0}td,th{border:1pt solid #bbb;padding:4pt 8pt;font-size:10pt}</style></head>
<body>${escaped}</body></html>`;
  const blob = new Blob([html], { type: "application/msword" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename.replace(/[^a-zA-Z0-9_-]/g, "_") + ".doc";
  a.click();
  URL.revokeObjectURL(a.href);
};

export const DownloadBtn = ({ text, filename, label, onDocx }) => (
  <button onClick={() => onDocx ? onDocx(text, filename) : downloadDoc(text, filename)} style={{
    display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 16px",
    fontSize: 12, fontWeight: 600, color: C.primary, background: C.primarySoft,
    border: `1px solid ${C.primary}25`, borderRadius: 10, cursor: "pointer", fontFamily: FONT,
    transition: "all 0.2s ease",
  }}
    onMouseEnter={e => { e.currentTarget.style.background = C.primary; e.currentTarget.style.color = "#fff"; }}
    onMouseLeave={e => { e.currentTarget.style.background = C.primarySoft; e.currentTarget.style.color = C.primary; }}
  >
    <span style={{ fontSize: 14, lineHeight: 1 }}>{"\u21e9"}</span>
    {label || "Download .docx"}
  </button>
);

/* ── AI loading steps per action type ── */
const AI_LOAD_STEPS = {
  "Draft Proposal": [
    "Analysing grant requirements...",
    "Matching programme type to funder priorities...",
    "Pulling outcome data and budget lines...",
    "Composing the cover email...",
    "Writing opening hook for this funder...",
    "Structuring the proposal narrative...",
    "Building the impact case...",
    "Drafting the full proposal...",
    "Polishing language and tone...",
  ],
  "Funder Research": [
    "Searching funder website and reports...",
    "Analysing recent grant recipients...",
    "Identifying decision-makers...",
    "Mapping funding priorities and patterns...",
    "Checking application process...",
    "Building strategic recommendations...",
  ],
  "Follow-up Email": [
    "Reviewing grant stage and timeline...",
    "Selecting the right follow-up tone...",
    "Composing subject line and opening...",
    "Adding a fresh proof point...",
    "Crafting the ask and next step...",
  ],
  _default: [
    "Preparing context...",
    "Generating response...",
    "Refining output...",
  ],
};

const AI_LOAD_TIPS = [
  { tip: "Funders read hundreds of proposals \u2014 a specific opening line beats a generic one every time.", tag: "Writing" },
  { tip: "Cost-per-student is the single most persuasive number in any skills development proposal.", tag: "Strategy" },
  { tip: "B-BBEE skills spend counts at 135% \u2014 always highlight this for corporate CSI funders.", tag: "B-BBEE" },
  { tip: "Returning funders convert at 3x the rate of cold applications. Nurture those relationships.", tag: "Pipeline" },
  { tip: "92% completion vs 55% sector average is your strongest differentiator. Lead with it.", tag: "Impact" },
  { tip: "SETA discretionary windows are short \u2014 have your proposal pre-drafted before they open.", tag: "Timing" },
  { tip: "International funders care about systems, not stories. Show the 7 programme types model.", tag: "International" },
  { tip: "A 15-minute call converts better than a 10-page follow-up. Ask for the meeting.", tag: "Follow-up" },
];

const AILoadingPanel = ({ title }) => {
  const [stepIdx, setStepIdx] = useState(0);
  const [tipIdx] = useState(() => Math.floor(Math.random() * AI_LOAD_TIPS.length));
  const [elapsed, setElapsed] = useState(0);

  const steps = AI_LOAD_STEPS[title] || AI_LOAD_STEPS._default;

  useEffect(() => {
    const t = setInterval(() => setStepIdx(p => (p + 1) % steps.length), 2600);
    return () => clearInterval(t);
  }, [steps.length]);

  useEffect(() => {
    const t = setInterval(() => setElapsed(p => p + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const tip = AI_LOAD_TIPS[tipIdx];

  return (
    <div style={{ marginTop: 16, padding: "18px 20px", background: `linear-gradient(135deg, ${C.warm100} 0%, ${C.purpleSoft}60 100%)`, borderRadius: 12, border: `1px solid ${C.line}` }}>
      {/* Status row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 3 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 5, height: 5, borderRadius: "50%", background: C.purple,
              animation: "ge-pulse 1.4s ease-in-out infinite",
              animationDelay: `${i * 0.2}s`,
            }} />
          ))}
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>{steps[stepIdx]}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: C.t4, fontFamily: MONO }}>{elapsed}s</span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 3, background: C.line, borderRadius: 2, overflow: "hidden", marginBottom: 14 }}>
        <div style={{
          height: "100%", borderRadius: 2,
          background: `linear-gradient(90deg, ${C.primary}, ${C.purple})`,
          animation: "ai-load-bar 12s ease-in-out infinite",
        }} />
      </div>

      {/* Tip */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", background: C.white, borderRadius: 8, border: `1px solid ${C.line}` }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.purple, background: C.purpleSoft, padding: "2px 8px", borderRadius: 100, whiteSpace: "nowrap", marginTop: 1 }}>{tip.tag}</span>
        <span style={{ fontSize: 12, color: C.t2, lineHeight: 1.5 }}>{tip.tip}</span>
      </div>

      <style>{`
        @keyframes ai-load-bar {
          0% { width: 3%; }
          20% { width: 25%; }
          45% { width: 50%; }
          70% { width: 75%; }
          90% { width: 92%; }
          100% { width: 97%; }
        }
      `}</style>
    </div>
  );
};

export const AICard = ({ title, desc, onRun, busy, result, docName, docMeta, step, icon, locked, lockedMsg, generatedAt }) => {
  const [expanded, setExpanded] = useState(!result);
  const hasResult = !!result && !result.startsWith("Error") && !result.startsWith("Rate limit") && !result.startsWith("Connection");
  const isError = !!result && (result.startsWith("Error") || result.startsWith("Rate limit") || result.startsWith("Connection") || result.startsWith("Request failed") || result.startsWith("The AI service"));
  // Auto-expand when new result comes in
  useEffect(() => { if (result && !busy) setExpanded(true); }, [result, busy]);
  // Format relative time
  const timeAgo = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    const now = new Date();
    const mins = Math.floor((now - d) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
  };

  return (
    <div style={{
      background: C.white, borderRadius: 16, marginBottom: 0,
      border: hasResult && !busy ? `1.5px solid ${C.ok}20` : isError ? `1.5px solid ${C.red}20` : `1.5px solid transparent`,
      boxShadow: C.cardShadow, transition: "all 0.25s ease",
      overflow: "hidden",
    }}>
      {/* Card header */}
      <div style={{ padding: "18px 22px 16px", display: "flex", alignItems: "center", gap: 14 }}>
        {/* Step number / status icon */}
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: busy ? 14 : hasResult ? 16 : 14, fontWeight: 700,
          background: busy ? C.purpleSoft : hasResult ? C.okSoft : locked ? C.raised : C.primarySoft,
          color: busy ? C.purple : hasResult ? C.ok : locked ? C.t4 : C.primary,
          transition: "all 0.25s ease",
          animation: busy ? "ge-pulse 1.4s ease-in-out infinite" : "none",
        }}>
          {busy ? "\u2026" : hasResult ? "\u2713" : isError ? "!" : icon || step}
        </div>

        {/* Title + desc */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: locked ? C.t4 : C.dark, letterSpacing: -0.2 }}>{title}</div>
          <div style={{ fontSize: 12, color: locked ? C.t4 : C.t3, lineHeight: 1.4, marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {locked ? lockedMsg : hasResult && !expanded
              ? <>
                  <span>Generated</span>
                  {generatedAt && <span style={{ fontSize: 10, color: C.t4, fontFamily: MONO }}>{timeAgo(generatedAt)}</span>}
                  <span style={{ color: C.t4 }}>·</span>
                  <span>click to view or re-run</span>
                </>
              : hasResult
                ? <>
                    <span>{desc}</span>
                    {generatedAt && <span style={{ fontSize: 10, color: C.t4, fontFamily: MONO }}>· generated {timeAgo(generatedAt)}</span>}
                  </>
                : desc
            }
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {hasResult && !busy && (
            <button onClick={() => setExpanded(p => !p)} style={{
              background: "none", border: `1.5px solid ${C.line}`, borderRadius: 8,
              padding: "5px 12px", fontSize: 11, fontWeight: 600, color: C.t3,
              cursor: "pointer", fontFamily: FONT, transition: "all 0.15s ease",
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.t3; e.currentTarget.style.color = C.dark; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.color = C.t3; }}
            >{expanded ? "Collapse" : "Expand"}</button>
          )}
          {!locked && (
            <Btn onClick={onRun} disabled={busy || locked} v={busy ? "muted" : hasResult ? "ghost" : "primary"}
              style={{ flexShrink: 0, fontSize: 12, padding: "7px 16px" }}>
              {busy ? "Working\u2026" : hasResult ? "\u21bb Re-run" : "Run"}
            </Btn>
          )}
        </div>
      </div>

      {/* Loading panel */}
      {busy && (
        <div style={{ padding: "0 22px 18px" }}>
          <AILoadingPanel title={title} />
        </div>
      )}

      {/* Error display */}
      {isError && !busy && (
        <div style={{ padding: "0 22px 18px" }}>
          <div style={{
            padding: "12px 16px", background: C.redSoft, borderRadius: 10,
            border: `1px solid ${C.red}15`, fontSize: 13, color: C.red, lineHeight: 1.5,
          }}>{result}</div>
        </div>
      )}

      {/* Result display (collapsible) */}
      {hasResult && !busy && expanded && (
        <div style={{
          padding: "0 22px 20px",
          animation: "ai-expand 0.2s ease-out",
        }}>
          {/* Action bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
            {docName && <DownloadBtn text={result} filename={docName} onDocx={docMeta ? async (text, fn) => {
              const { generateDocx } = await import("../docxGenerator.js");
              await generateDocx(text, fn, docMeta);
            } : null} />}
            <CopyBtn text={result} />
          </div>
          {/* Result text */}
          <div style={{
            padding: "20px 22px", background: C.warm100, borderRadius: 12,
            border: `1.5px solid ${C.primary}20`,
            fontSize: 13.5, lineHeight: 1.85, color: C.t1, whiteSpace: "pre-wrap",
            maxHeight: 500, overflow: "auto",
          }}>{result}</div>
        </div>
      )}
      <style>{`
        @keyframes ai-expand {
          from { opacity: 0; max-height: 0; }
          to { opacity: 1; max-height: 600px; }
        }
      `}</style>
    </div>
  );
};
