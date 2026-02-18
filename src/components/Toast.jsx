import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";
import { C, FONT, MONO } from "../theme";

/* ── Toast Context — provides showToast() to any component ── */
const ToastContext = createContext(null);

export const useToast = () => useContext(ToastContext);

/**
 * Toast types: "success" | "error" | "info" | "undo"
 * undo type adds an action button for undo operations
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((message, opts = {}) => {
    const {
      type = "info",       // "success" | "error" | "info" | "undo"
      duration = 4000,     // auto-dismiss ms (0 = manual only)
      action = null,       // { label: "Undo", onClick: fn }
    } = opts;

    const id = Date.now() + Math.random();
    setToasts(prev => [...prev.slice(-4), { id, message, type, action }]); // max 5

    if (duration > 0) {
      timers.current[id] = setTimeout(() => dismiss(id), duration);
    }
    return id;
  }, [dismiss]);

  // Cleanup on unmount
  useEffect(() => {
    return () => Object.values(timers.current).forEach(clearTimeout);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {/* Toast container — bottom-right */}
      {toasts.length > 0 && (
        <div style={{
          position: "fixed", bottom: 20, right: 20, zIndex: 9999,
          display: "flex", flexDirection: "column-reverse", gap: 8,
          pointerEvents: "none", maxWidth: 380,
        }}>
          {toasts.map(t => {
            const palette = {
              success: { bg: C.okSoft, border: C.ok, icon: "✓", color: "#15803D" },
              error: { bg: C.redSoft, border: C.red, icon: "✕", color: C.red },
              info: { bg: C.blueSoft, border: C.blue, icon: "ℹ", color: C.blue },
              undo: { bg: C.amberSoft, border: C.amber, icon: "↩", color: "#92400E" },
            }[t.type] || { bg: C.warm200, border: C.t4, icon: "•", color: C.t2 };

            return (
              <div key={t.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "12px 16px", borderRadius: 12,
                background: palette.bg, border: `1.5px solid ${palette.border}30`,
                boxShadow: "0 8px 30px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)",
                pointerEvents: "auto", fontFamily: FONT,
                animation: "ge-toast-in 0.25s ease-out",
              }}>
                <span style={{
                  width: 24, height: 24, borderRadius: 7, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: palette.border + "18", color: palette.color,
                  fontSize: 12, fontWeight: 800,
                }}>{palette.icon}</span>
                <span style={{
                  flex: 1, fontSize: 13, fontWeight: 500, color: C.t1, lineHeight: 1.4,
                }}>{t.message}</span>
                {t.action && (
                  <button onClick={() => { t.action.onClick(); dismiss(t.id); }}
                    style={{
                      fontSize: 12, fontWeight: 700, color: palette.color,
                      background: palette.border + "15", border: `1px solid ${palette.border}30`,
                      borderRadius: 6, padding: "5px 12px", cursor: "pointer",
                      fontFamily: FONT, whiteSpace: "nowrap", flexShrink: 0,
                    }}>
                    {t.action.label}
                  </button>
                )}
                <button onClick={() => dismiss(t.id)}
                  style={{
                    background: "none", border: "none", color: C.t4, fontSize: 14,
                    cursor: "pointer", padding: "2px 4px", lineHeight: 1, flexShrink: 0,
                  }}>×</button>
              </div>
            );
          })}
        </div>
      )}
    </ToastContext.Provider>
  );
}
