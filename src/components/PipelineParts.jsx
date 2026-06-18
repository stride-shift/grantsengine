import { C } from "../theme";
import { GATES, ROLES } from "../data/constants";

/* Presentational primitives lifted verbatim from Pipeline.jsx (Phase 4.5, move-only).
   ReadinessChips + GateIndicator are pure, props-only kanban-card helpers that close
   over no Pipeline state; the Pipeline render-net Board snapshot proves the DOM is
   unchanged. STAGE_ORDER stays module-private — only GateIndicator uses it. */

/* ── Readiness Chips — show missing items on kanban cards ── */
export const ReadinessChips = ({ missing }) => {
  if (!missing || missing.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
      {missing.slice(0, 3).map((m, i) => (
        <span key={i} style={{
          fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 6,
          background: m.includes("docs") ? C.amberSoft : m.includes("deadline") ? C.redSoft : C.navySoft,
          color: m.includes("docs") ? C.amber : m.includes("deadline") ? C.red : C.t2,
          letterSpacing: 0.2,
        }}>{m}</span>
      ))}
      {missing.length > 3 && (
        <span style={{ fontSize: 9, color: C.t4, fontWeight: 500 }}>+{missing.length - 3}</span>
      )}
    </div>
  );
};

/* ── Gate Indicator — shows approval requirement for next stage ── */
const STAGE_ORDER = ["scouted", "vetting", "qualifying", "drafting", "review", "submitted", "awaiting"];
export const GateIndicator = ({ stage, ownerRole }) => {
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) return null;
  const nextStage = STAGE_ORDER[idx + 1];
  const gateKey = `${stage}->${nextStage}`;
  const gate = GATES[gateKey];
  if (!gate) return null;
  const roleLevel = ROLES[ownerRole]?.level || 0;
  const needLevel = ROLES[gate.need]?.level || 99;
  const canSelf = roleLevel >= needLevel;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 4, marginTop: 6,
      padding: "3px 8px", borderRadius: 6, fontSize: 9, fontWeight: 600,
      background: canSelf ? C.okSoft : C.amberSoft,
      color: canSelf ? C.ok : C.amber,
    }}>
      <span style={{ fontSize: 10 }}>{canSelf ? "\u2713" : "\u25CB"}</span>
      <span>{canSelf ? "Can advance" : `${ROLES[gate.need]?.label || "Approval"} needed`}</span>
    </div>
  );
};
