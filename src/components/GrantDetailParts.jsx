import { C, FONT, MONO } from "../theme";
import { dL, grantReadiness } from "../utils";

/*
 * Pure presentational leaves lifted move-only from GrantDetail.jsx (mirrors
 * DashboardParts / PipelineParts). These close over nothing — they take only
 * props and render markup. SectionWrap is deliberately NOT here: it must stay
 * module-scoped inside GrantDetail.jsx (a stable identity, or React remounts
 * its children and wipes their local state). Behaviour is byte-identical to the
 * originals; the GrantDetail render net (GrantDetail.render.test.jsx) guards the lift.
 *
 * ContextSidebar / StatusStrip / StageBanner (below) are larger presentational
 * BODIES lifted in Phase 4.6. They own no local state and no parent-mutating
 * handlers — every free variable became an explicit prop (g / team / stg / stages /
 * complianceDocs) and their only behaviour is self-contained scrollIntoView. The
 * snapshots prove output-per-prop; the scroll-anchor interaction tests prove the
 * jump handlers survived the move.
 */

export const Card = ({ children, accent, pad = "16px 20px", style: sx, className }) => (
  <div className={className} style={{
    padding: pad, background: C.white, borderRadius: 10,
    boxShadow: C.cardShadow,
    borderTop: accent ? `3px solid ${accent}` : undefined,
    border: accent ? undefined : `1px solid ${C.line}`,
    ...sx,
  }}>{children}</div>
);

export const Hd = ({ children, right, mb = 12 }) => (
  <div style={{
    display: "flex", alignItems: "baseline", justifyContent: "space-between",
    marginBottom: mb, marginTop: 20,
  }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, letterSpacing: 1.4, textTransform: "uppercase" }}>{children}</div>
    {right}
  </div>
);

export const Field = ({ label, children }) => (
  <div>
    <div style={{ fontSize: 10, fontWeight: 700, color: C.t4, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
    {children}
  </div>
);

export const ActivityRow = ({ date, text, by, team, isLast }) => {
  const member = by && team ? team.find(t => t.id === by) : null;
  return (
    <div className="ge-hover-slide" style={{
      display: "flex", gap: 10, padding: "8px 14px",
      borderBottom: isLast ? "none" : `1px solid ${C.line}`,
      alignItems: "center", background: "transparent",
    }}>
      <span style={{ fontSize: 11, color: C.t4, fontFamily: MONO, minWidth: 80 }}>{date}</span>
      <span style={{ fontSize: 13, color: C.t1, flex: 1 }}>{text}</span>
      {member && member.id !== "team" && (
        <span style={{
          fontSize: 10, fontWeight: 700, color: C.white, background: member.c || C.t3,
          padding: "2px 8px", borderRadius: 100, fontFamily: FONT,
        }} title={`by ${member.name}`}>
          {member.ini || member.name?.slice(0, 2)}
        </span>
      )}
    </div>
  );
};

/* Persistent context sidebar — only visible on wide screens (>1320px). Sticky on the right
   edge with stage, next action, deadline countdown, and quick anchors to in-page sections. */
export const ContextSidebar = ({ g, stages, complianceDocs }) => {
  const stg = stages.find(s => s.id === g.stage);
  const dDays = g.deadline ? Math.ceil((new Date(g.deadline) - new Date()) / 86400000) : null;
  const deadlineColor = dDays === null ? C.t4 : dDays < 0 ? C.red : dDays <= 14 ? C.amber : C.dark;
  const r = (() => { try { return grantReadiness(g, complianceDocs); } catch { return null; } })();
  const action = r?.nextAction;
  const jump = (sel) => { const el = document.querySelector(sel); if (el) el.scrollIntoView({ behavior: "smooth", block: "center" }); };
  return (
    <>
      <div className="ge-grant-side" style={{
        position: "fixed", right: 16, top: 80, width: 220, zIndex: 25,
        background: C.white, border: `1px solid ${C.line}`, borderRadius: 10,
        boxShadow: "0 2px 10px rgba(0,0,0,0.04)", padding: "12px 12px 10px",
        fontFamily: FONT,
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: C.t4, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 }}>Stage</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: stg?.c || C.dark, marginBottom: 10 }}>{stg?.label || g.stage}</div>

        {g.deadline && (
          <>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.t4, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 4 }}>Deadline</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: deadlineColor, marginBottom: 10 }}>
              {new Date(g.deadline).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
              {dDays !== null && dDays >= 0 && <span style={{ color: C.t4, marginLeft: 6, fontWeight: 500 }}>· {dDays}d</span>}
              {dDays !== null && dDays < 0 && <span style={{ color: C.red, marginLeft: 6, fontWeight: 500 }}>· {Math.abs(dDays)}d ago</span>}
            </div>
          </>
        )}

        {r && (
          <>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.t4, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 4 }}>Ready</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <div style={{ flex: 1, height: 4, background: C.line, borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${r.score}%`, background: r.score >= 80 ? C.ok : r.score >= 40 ? C.amber : C.red, borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, fontFamily: MONO, color: r.score >= 80 ? C.ok : r.score >= 40 ? C.amber : C.red, minWidth: 32, textAlign: "right" }}>{r.score}%</span>
            </div>
          </>
        )}

        {action && (
          <>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.t4, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 4 }}>Next</div>
            <div style={{ fontSize: 11, color: C.t1, lineHeight: 1.4, marginBottom: 10 }}>{action}</div>
          </>
        )}

        <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 8, marginTop: 4 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.t4, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 }}>Jump to</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {[
              { label: "Outstanding actions", sel: '[data-tour="outstanding-actions"]' },
              { label: "About this grant", sel: '[data-tour="about-grant"]' },
              { label: "Proposal workspace", sel: '[data-tour="proposal-workspace"]' },
              { label: "Activity log", sel: '[data-tour="activity-log"]' },
            ].map(it => (
              <button key={it.sel} onClick={() => jump(it.sel)} style={{
                background: "none", border: "none", padding: "4px 6px", textAlign: "left",
                fontSize: 11, color: C.t2, cursor: "pointer", fontFamily: FONT,
                borderRadius: 4, transition: "background 120ms ease",
              }}
                onMouseEnter={e => { e.currentTarget.style.background = C.warm100; e.currentTarget.style.color = C.dark; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.t2; }}
              >
                → {it.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <style>{`
        @media (max-width: 1320px) { .ge-grant-side { display: none !important; } }
      `}</style>
    </>
  );
};

/* Fixed status strip — key facts always visible while scrolling. position:fixed because the
   parent flex layout has no constrained scrolling ancestor for sticky to grip. Sits at the
   top of the main content area (240px sidebar offset on desktop). */
export const StatusStrip = ({ g, team, stg, complianceDocs }) => {
  const ownerMember = team?.find(t => t.id === g.owner);
  const ownerLabel = ownerMember && ownerMember.id !== "team" ? ownerMember.name : "Unassigned";
  const dDays = dL(g.deadline);
  const deadlineLabel = !g.deadline ? "No deadline"
    : dDays < 0 ? `${Math.abs(dDays)}d overdue`
    : dDays === 0 ? "Due today"
    : `${dDays}d left`;
  const deadlineColor = !g.deadline ? C.t4 : dDays < 0 ? C.red : dDays <= 14 ? C.amber : C.t2;
  const askLabel = g.ask > 0 ? `R${(g.ask / 1e6).toFixed(2).replace(/\.?0+$/, "")}M` : "Ask TBD";
  const readinessPct = (() => {
    try {
      const r = grantReadiness(g, complianceDocs);
      const v = typeof r?.score === "number" ? r.score : null;
      return v !== null && !Number.isNaN(v) ? Math.round(v) : null;
    } catch { return null; }
  })();
  return (<>
    {/* Spacer so the fixed strip doesn't overlap content below */}
    <div style={{ height: 48, marginBottom: 8 }} />
    <div className="ge-grant-stickybar" style={{
      position: "fixed", top: 0, left: 240, right: 0, zIndex: 30,
      background: C.white,
      borderBottom: `1px solid ${C.line}`,
      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
      padding: "10px 24px",
      display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap",
      fontFamily: FONT,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: stg?.c || C.t4, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: C.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 12 }}>
        <div data-tour="stage-button" style={{ display: "inline-flex", alignItems: "baseline", gap: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: C.t4, textTransform: "uppercase", letterSpacing: 0.6 }}>Stage</span>
          <span style={{ color: stg?.c || C.t3, fontWeight: 700 }}>{stg?.label}</span>
        </div>
        <span style={{ color: C.line }}>·</span>
        <div style={{ display: "inline-flex", alignItems: "baseline", gap: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: C.t4, textTransform: "uppercase", letterSpacing: 0.6 }}>Ask</span>
          <span style={{ fontFamily: MONO, fontWeight: 700, color: g.ask > 0 ? C.dark : C.t4 }}>{askLabel}</span>
        </div>
        <span style={{ color: C.line }}>·</span>
        <div style={{ display: "inline-flex", alignItems: "baseline", gap: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: C.t4, textTransform: "uppercase", letterSpacing: 0.6 }}>Owner</span>
          <span style={{ color: C.t2, fontWeight: 600 }}>{ownerLabel}</span>
        </div>
        <span style={{ color: C.line }}>·</span>
        <div style={{ display: "inline-flex", alignItems: "baseline", gap: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: C.t4, textTransform: "uppercase", letterSpacing: 0.6 }}>Deadline</span>
          <span style={{ color: deadlineColor, fontWeight: dDays !== null && dDays <= 14 ? 700 : 600 }}>{deadlineLabel}</span>
        </div>
        {readinessPct !== null && (<>
          <span style={{ color: C.line }}>·</span>
          <button
            onClick={() => {
              const el = document.querySelector('[data-tour="outstanding-actions"]');
              if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            title="Jump to outstanding actions"
            style={{
              background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: FONT,
              display: "inline-flex", alignItems: "baseline", gap: 4,
            }}
          >
            <span style={{ fontSize: 9, fontWeight: 700, color: C.t4, textTransform: "uppercase", letterSpacing: 0.6 }}>Ready</span>
            <span style={{
              color: readinessPct >= 80 ? C.ok : readinessPct >= 40 ? C.amber : C.red,
              fontWeight: 700, fontSize: 12,
            }}>{readinessPct}%</span>
          </button>
        </>)}
      </div>
    </div>
  </>);
};

/* Stage-aware "what now?" banner — surfaces grantReadiness().nextAction for the current stage
   so the UI tells the user what to do, instead of dumping every panel. No handlers. */
export const StageBanner = ({ g, complianceDocs }) => {
  let r = null;
  try { r = grantReadiness(g, complianceDocs); } catch {}
  const action = r?.nextAction;
  if (!action) return null;
  const tone =
    ["scouted", "vetting", "qualifying"].includes(g.stage) ? "info" :
    g.stage === "drafting" ? "active" :
    g.stage === "review" ? "active" :
    g.stage === "resubmit" ? "warning" :
    ["submitted", "awaiting"].includes(g.stage) ? "muted" :
    g.stage === "won" ? "success" :
    g.stage === "lost" ? "muted" :
    "muted";
  const colors = {
    info:    { bg: `${C.blue}08`,   border: `${C.blue}25`,   accent: C.blue,   icon: "▸" },
    active:  { bg: `${C.primary}08`, border: `${C.primary}25`, accent: C.primary, icon: "▸" },
    warning: { bg: `${C.amber}08`,  border: `${C.amber}30`,  accent: C.amber,  icon: "⚠" },
    success: { bg: `${C.ok}08`,     border: `${C.ok}25`,     accent: C.ok,     icon: "✓" },
    muted:   { bg: C.bg,             border: C.line,           accent: C.t3,     icon: "·" },
  }[tone];
  return (
    <div style={{
      marginBottom: 16, padding: "10px 14px", borderRadius: 10,
      background: colors.bg, border: `1px solid ${colors.border}`,
      display: "flex", alignItems: "center", gap: 10, fontFamily: FONT,
    }}>
      <span style={{ color: colors.accent, fontSize: 14, fontWeight: 700, flexShrink: 0 }}>{colors.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: colors.accent, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 2 }}>
          What now?
        </div>
        <div style={{ fontSize: 13, color: C.dark, fontWeight: 500, lineHeight: 1.4 }}>
          {action}
        </div>
      </div>
    </div>
  );
};
