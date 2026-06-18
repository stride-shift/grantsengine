import { useState, useEffect, useRef } from "react";
import { FONT } from "../theme";

// Sidebar global search — surfaces any grant by funder, name, type or notes.
// Picking a result opens the grant directly (no detour through the pipeline).
export default function GlobalSearch({ grants, query, onQueryChange, onPick }) {
  const [focused, setFocused] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!focused) return;
    const handler = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setFocused(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [focused]);

  const q = query.trim().toLowerCase();
  const matches = !q ? [] : grants
    .filter(g => {
      if (g.stage === "archived") return false;
      const hay = `${g.funder || ""} ${g.name || ""} ${g.type || ""} ${g.notes || ""} ${g.market || ""}`.toLowerCase();
      return hay.includes(q);
    })
    .slice(0, 8);

  return (
    <div ref={boxRef} style={{ padding: "10px 12px 0", position: "relative" }}>
      <div style={{ position: "relative" }}>
        <span style={{
          position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
          color: "rgba(255,255,255,0.4)", fontSize: 12, pointerEvents: "none",
        }}>{"⚲"}</span>
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="Search grants…"
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "8px 10px 8px 28px", fontSize: 12,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 8, color: "#fff", outline: "none",
            fontFamily: FONT,
          }}
        />
      </div>
      {focused && q && (
        <div style={{
          position: "absolute", top: "100%", left: 12, right: 12, marginTop: 6,
          background: "#0e1b2c", border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 8, overflow: "hidden", zIndex: 30,
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          maxHeight: 320, overflowY: "auto",
        }}>
          {matches.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: 12, color: "rgba(255,255,255,0.45)", fontFamily: FONT }}>
              No grants match "{query}"
            </div>
          ) : matches.map(g => (
            <button
              key={g.id}
              onClick={() => { onPick(g.id); setFocused(false); }}
              style={{
                width: "100%", textAlign: "left", padding: "10px 12px",
                background: "transparent", border: "none", cursor: "pointer",
                borderBottom: "1px solid rgba(255,255,255,0.06)", fontFamily: FONT,
                display: "block",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.06)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", marginBottom: 2 }}>{g.funder || "(no funder)"}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>
                {g.name || "Untitled"} · {g.stage || "—"}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
