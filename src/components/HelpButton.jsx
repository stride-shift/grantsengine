import { useState, useEffect, useRef } from "react";
import { C, FONT } from "../theme";

/* Context-aware help button. On Dashboard, opens a popover so the user can pick
 * between the nav walkthrough (overview) and the dashboard walkthrough.
 * On every other tab, a single click launches that tab's tour directly. */
export default function HelpButton({ currentView, selectedGrant, onLaunch }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Click-outside closes the popover
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const tabTourFor = (view, hasGrant) => {
    if (hasGrant) return "grantDetail";
    switch (view) {
      case "dashboard": return "dashboard";
      case "pipeline":  return "pipeline";
      case "vetting":   return "vetting";
      case "calendar":  return "calendar";
      case "docs":      return "docs";
      case "funders":   return "funders";
      case "settings":  return "settings";
      default:          return "overview";
    }
  };

  const handleClick = () => {
    // Only Dashboard offers a menu — every other tab launches its tour directly.
    if (currentView === "dashboard" && !selectedGrant) {
      setMenuOpen(o => !o);
    } else {
      onLaunch(tabTourFor(currentView, !!selectedGrant));
    }
  };

  return (
    <div ref={menuRef} style={{ position: "fixed", bottom: 18, right: 18, zIndex: 60 }}>
      <button
        data-tour="help-button"
        onClick={handleClick}
        title={currentView === "dashboard" ? "Walk me through the app" : "Walk through this tab"}
        style={{
          width: 42, height: 42, borderRadius: "50%",
          background: C.primary, border: "none",
          boxShadow: `0 6px 18px ${C.primary}55, 0 2px 6px rgba(0,0,0,0.15)`,
          cursor: "pointer", fontFamily: FONT,
          fontSize: 20, fontWeight: 800, color: C.white,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "transform 180ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 180ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.08)"; e.currentTarget.style.boxShadow = `0 8px 24px ${C.primary}80, 0 2px 6px rgba(0,0,0,0.2)`; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = `0 6px 18px ${C.primary}55, 0 2px 6px rgba(0,0,0,0.15)`; }}
      >
        ?
      </button>

      {/* Popover — only mounted when menu is open (Dashboard only) */}
      {menuOpen && (
        <div style={{
          position: "absolute", bottom: 52, right: 0,
          width: 280, background: C.white, borderRadius: 12,
          boxShadow: "0 12px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08)",
          border: `1px solid ${C.line}`, overflow: "hidden",
          fontFamily: FONT,
          animation: "ge-help-pop 180ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}>
          <button
            onClick={() => { setMenuOpen(false); onLaunch("overview"); }}
            style={{
              width: "100%", textAlign: "left", padding: "12px 14px",
              background: "none", border: "none", cursor: "pointer", fontFamily: FONT,
              borderBottom: `1px solid ${C.line}`,
              transition: "background 150ms cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = C.primarySoft || `${C.primary}10`}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: C.primary, marginBottom: 2 }}>
              Walk me through every tab
            </div>
            <div style={{ fontSize: 11, color: C.t3 }}>
              A guided tour across the whole app
            </div>
          </button>
          <button
            onClick={() => { setMenuOpen(false); onLaunch("dashboard"); }}
            style={{
              width: "100%", textAlign: "left", padding: "12px 14px",
              background: "none", border: "none", cursor: "pointer", fontFamily: FONT,
              transition: "background 150ms cubic-bezier(0.32, 0.72, 0, 1)",
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = C.primarySoft || `${C.primary}10`}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, marginBottom: 2 }}>
              Dashboard walkthrough
            </div>
            <div style={{ fontSize: 11, color: C.t3 }}>
              Tour the sections of the dashboard
            </div>
          </button>
        </div>
      )}

      <style>{`
        @keyframes ge-help-pop {
          0% { opacity: 0; transform: translateY(6px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
