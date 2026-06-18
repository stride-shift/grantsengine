import { C, FONT, MONO } from "../theme";

/*
 * Pure presentational leaves lifted move-only from GrantDetail.jsx (mirrors
 * DashboardParts / PipelineParts). These close over nothing — they take only
 * props and render markup. SectionWrap is deliberately NOT here: it must stay
 * module-scoped inside GrantDetail.jsx (a stable identity, or React remounts
 * its children and wipes their local state). Behaviour is byte-identical to the
 * originals; the GrantDetail render net (GrantDetail.render.test.jsx) guards the lift.
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
