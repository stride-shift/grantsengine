import { useState, useMemo } from "react";
import { C, FONT } from "../theme";
import { uid, td } from "../utils";
import { Btn } from "./index";

/* ── Outstanding Actions Checklist ── */
export default function OutstandingActions({ grant, onUpdate, complianceDocs = [], missingDocs = [] }) {
  const [newText, setNewText] = useState("");
  const actions = grant.outstandingActions || [];
  const g = grant;

  // Auto-detected items based on grant state.
  // In manual-engagement mode, proposal-specific prompts (draft, ask, docs) are
  // dropped in favour of relationship touchpoints.
  const autoItems = useMemo(() => {
    const items = [];
    const isManual = g.engagementMode === "manual";
    if (!g.deadline) items.push({ id: "_no-deadline", text: "Set a deadline", auto: true, priority: "high" });
    else {
      const days = Math.ceil((new Date(g.deadline) - new Date()) / 86400000);
      if (days < 0) items.push({ id: "_overdue", text: `Deadline missed by ${Math.abs(days)} days — resubmit or archive`, auto: true, priority: "high" });
    }
    if (!g.owner || g.owner === "team") items.push({ id: "_no-owner", text: "Assign an owner", auto: true, priority: "high" });
    if (isManual) {
      // Manual-engagement: nudge toward relationship work, not proposal AI
      const lastActivity = (g.activityLog || []).slice(-1)[0]?.at;
      const daysSince = lastActivity ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / 86400000) : null;
      if (daysSince === null || daysSince > 21) {
        items.push({ id: "_no-touchpoint", text: "Log next funder touchpoint (call, email, meeting)", auto: true, priority: "high" });
      }
    } else {
      if (!g.aiResearch && !["scouted", "vetting"].includes(g.stage)) items.push({ id: "_no-research", text: "Run funder research", auto: true, priority: "medium" });
      if (!g.aiFitscore) items.push({ id: "_no-fitscore", text: "Run fit score", auto: true, priority: "low" });
      if (!g.aiDraft && !g.aiSections && ["drafting", "review"].includes(g.stage)) items.push({ id: "_no-draft", text: "Generate proposal draft", auto: true, priority: "high" });
      if (g.ask === 0 && !["scouted", "vetting"].includes(g.stage)) items.push({ id: "_no-ask", text: "Set ask amount / build budget", auto: true, priority: "medium" });
      for (const doc of missingDocs) {
        items.push({ id: `_doc-${doc}`, text: `Upload: ${doc}`, auto: true, priority: "medium" });
      }
    }
    return items;
  }, [g.deadline, g.owner, g.aiResearch, g.aiFitscore, g.aiDraft, g.aiSections, g.ask, g.stage, g.engagementMode, g.activityLog, missingDocs]);

  const add = () => {
    if (!newText.trim()) return;
    onUpdate([...actions, { id: uid(), text: newText.trim(), done: false, createdAt: td() }]);
    setNewText("");
  };

  const toggle = (id) => {
    onUpdate(actions.map(a => a.id === id ? { ...a, done: !a.done } : a));
  };

  const remove = (id) => {
    onUpdate(actions.filter(a => a.id !== id));
  };

  const manualSorted = [...actions].sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0));
  const priorityColor = { high: C.red, medium: C.amber, low: C.t3 };

  return (
    <div>
      {/* Auto-detected items */}
      {autoItems.length > 0 && (
        <>
          {autoItems.map(a => (
            <div key={a.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
              borderBottom: `1px solid ${C.line}`, borderRadius: 4,
              background: a.priority === "high" ? C.redSoft + "40" : a.priority === "medium" ? C.amberSoft + "40" : "transparent",
            }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: priorityColor[a.priority] || C.t4, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, color: C.dark }}>{a.text}</span>
              <span style={{ fontSize: 9, color: priorityColor[a.priority], fontWeight: 600, flexShrink: 0 }}>{a.priority}</span>
            </div>
          ))}
          {manualSorted.length > 0 && <div style={{ height: 1, background: C.line, margin: "6px 0" }} />}
        </>
      )}

      {/* Manual items */}
      {manualSorted.map(a => (
        <div key={a.id} style={{
          display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
          borderBottom: `1px solid ${C.line}`,
          background: a.done ? C.okSoft + "40" : "transparent",
          borderRadius: 4,
        }}>
          <input type="checkbox" checked={a.done} onChange={() => toggle(a.id)}
            style={{ cursor: "pointer", flexShrink: 0, width: 16, height: 16 }} />
          <span style={{
            flex: 1, fontSize: 13, color: a.done ? C.t4 : C.dark,
            textDecoration: a.done ? "line-through" : "none",
          }}>{a.text}</span>
          {a.createdAt && <span style={{ fontSize: 9, color: C.t4, flexShrink: 0 }}>{a.createdAt}</span>}
          <button onClick={() => remove(a.id)} style={{
            fontSize: 14, color: C.t4, background: "none", border: "none",
            cursor: "pointer", fontFamily: FONT, padding: "4px 8px", lineHeight: 1,
          }} title="Remove action">✕</button>
        </div>
      ))}

      {/* Add manual item */}
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") add(); }}
          placeholder="Add a custom action..."
          style={{
            flex: 1, padding: "7px 10px", fontSize: 12, fontFamily: FONT,
            border: `1px solid ${C.line}`, borderRadius: 6, outline: "none",
          }}
        />
        <Btn v="ghost" style={{ fontSize: 11, padding: "6px 14px" }} onClick={add} disabled={!newText.trim()}>Add</Btn>
      </div>
      {autoItems.length === 0 && actions.length === 0 && (
        <div style={{ fontSize: 12, color: C.ok, padding: "8px 0", textAlign: "center" }}>
          ✓ All clear — nothing outstanding.
        </div>
      )}
    </div>
  );
}
