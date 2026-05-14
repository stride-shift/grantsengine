import { useState, useEffect, useRef, useCallback } from "react";
import { C, FONT } from "../theme";
import { stepsForTour, markOverviewSeen } from "../data/tourSteps";

/* Anchored guided tour with smooth animations.
 *
 * Pass `tourId` (overview, pipeline, grantDetail, etc.) and the overlay
 * looks up the step list, filtered by the current member's role.
 *
 * Each step targets a DOM element via `data-tour="..."`. The overlay dims
 * the rest of the page, draws a glow ring around the target, and floats a
 * tooltip card beside it.
 *
 * Smoothness strategy:
 *  - The ring and tooltip are RENDERED ONCE and persist between steps.
 *    Position transitions via CSS, never unmount/remount → no flicker.
 *  - When a step changes, we trigger a smooth scroll, then poll the
 *    target's getBoundingClientRect via requestAnimationFrame each frame
 *    until it stabilises. The ring follows the target through the scroll.
 *  - Easing uses a cubic-bezier that mirrors macOS motion.
 *  - The tooltip body cross-fades between steps so content doesn't jank.
 */

const TARGET_POLL_INTERVAL = 50;   // ms — while waiting for target to mount
const TARGET_POLL_TIMEOUT  = 4000; // ms — give up if target never appears
const RECT_STABLE_FRAMES   = 6;    // frames the rect must hold steady before we stop tracking
const RECT_TRACK_TIMEOUT   = 1000; // ms — max time we'll track scroll
const RECT_STABLE_TOL      = 1.0;  // px tolerance — anything sub-pixel is jitter, not movement
const RING_PADDING         = 10;
const TOOLTIP_W            = 360;
const TOOLTIP_H_ESTIMATE   = 220;
const EASE                 = "cubic-bezier(0.32, 0.72, 0, 1)"; // macOS-feel ease

// Wait for an element matching selector to appear in the DOM.
function waitForTarget(selector, timeout = TARGET_POLL_TIMEOUT) {
  return new Promise((resolve) => {
    if (!selector) return resolve(null);
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);
    const start = Date.now();
    const interval = setInterval(() => {
      const el = document.querySelector(selector);
      if (el) { clearInterval(interval); resolve(el); }
      else if (Date.now() - start > timeout) { clearInterval(interval); resolve(null); }
    }, TARGET_POLL_INTERVAL);
  });
}

// Compute a tooltip position based on target rect + preferred placement.
function computeTooltipPosition(rect, placement, tooltipW = TOOLTIP_W, tooltipH = TOOLTIP_H_ESTIMATE) {
  const margin = 18;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tryPlace = (p) => {
    switch (p) {
      case "right":  return { top: rect.top + rect.height / 2 - tooltipH / 2, left: rect.right + margin };
      case "left":   return { top: rect.top + rect.height / 2 - tooltipH / 2, left: rect.left - tooltipW - margin };
      case "top":    return { top: rect.top - tooltipH - margin, left: rect.left + rect.width / 2 - tooltipW / 2 };
      case "bottom": return { top: rect.bottom + margin, left: rect.left + rect.width / 2 - tooltipW / 2 };
      default:       return { top: vh / 2 - tooltipH / 2, left: vw / 2 - tooltipW / 2 };
    }
  };
  const order = [placement, "right", "bottom", "left", "top"].filter((v, i, a) => a.indexOf(v) === i);
  for (const p of order) {
    const pos = tryPlace(p);
    if (pos.top >= 8 && pos.left >= 8 && pos.top + tooltipH <= vh - 8 && pos.left + tooltipW <= vw - 8) {
      return { ...pos, placement: p };
    }
  }
  return { ...tryPlace("center"), placement: "center" };
}

export default function TourOverlay({ tourId, currentMember, currentView, selectedGrant, onNavigate, onClose }) {
  const role = currentMember?.role || "guest";
  const memberId = currentMember?.id || null;
  const steps = tourId ? stepsForTour(tourId, role) : [];

  const [stepIdx, setStepIdx] = useState(0);
  const [targetRect, setTargetRect] = useState(null);     // null → no target → show centred modal
  const [tooltipPos, setTooltipPos] = useState(null);     // null → don't render yet
  const [ready, setReady] = useState(false);              // first paint done
  const [contentVisible, setContentVisible] = useState(true); // tooltip content cross-fade
  const targetElRef = useRef(null);
  const trackingRafRef = useRef(null);

  const step = steps[stepIdx];

  // Reset state when the tour opens or the tour ID changes
  useEffect(() => {
    if (tourId) {
      setStepIdx(0);
      setReady(false);
      setTooltipPos(null);
      setTargetRect(null);
      setContentVisible(true);
    }
  }, [tourId]);

  // Track the target rect through any in-flight scroll using rAF.
  // Stops once the rect is stable for RECT_STABLE_FRAMES consecutive frames,
  // or after RECT_TRACK_TIMEOUT ms — whichever comes first.
  const trackRectUntilStable = useCallback((el, placement) => {
    if (trackingRafRef.current) cancelAnimationFrame(trackingRafRef.current);
    let lastRect = null;
    let stableCount = 0;
    const startTime = performance.now();
    const tick = () => {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
      setTooltipPos(computeTooltipPosition(rect, placement || "right"));
      const stable = lastRect &&
        Math.abs(rect.top - lastRect.top) < RECT_STABLE_TOL &&
        Math.abs(rect.left - lastRect.left) < RECT_STABLE_TOL &&
        Math.abs(rect.width - lastRect.width) < RECT_STABLE_TOL &&
        Math.abs(rect.height - lastRect.height) < RECT_STABLE_TOL;
      if (stable) {
        stableCount++;
        if (stableCount >= RECT_STABLE_FRAMES) return; // done — let CSS hold the position
      } else {
        stableCount = 0;
      }
      lastRect = rect;
      if (performance.now() - startTime > RECT_TRACK_TIMEOUT) return;
      trackingRafRef.current = requestAnimationFrame(tick);
    };
    trackingRafRef.current = requestAnimationFrame(tick);
  }, []);

  // Locate the target for the current step.
  const locateTarget = useCallback(async () => {
    if (!tourId || !step) return;

    // Centred-modal step (no target)
    if (!step.target) {
      targetElRef.current = null;
      if (trackingRafRef.current) cancelAnimationFrame(trackingRafRef.current);
      // Smooth content cross-fade
      setContentVisible(false);
      await new Promise(r => setTimeout(r, 150));
      setTargetRect(null);
      setTooltipPos(computeTooltipPosition({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }, "center"));
      setReady(true);
      setContentVisible(true);
      return;
    }

    // Navigate to the right view first if needed (the polling below will wait for the target to mount)
    if (step.view && step.view !== currentView && onNavigate) {
      onNavigate(step.view);
    }

    const el = await waitForTarget(step.target);

    if (el) {
      // Cross-fade tooltip content out while we transition the position
      if (ready) setContentVisible(false);

      targetElRef.current = el;
      // Smooth scroll the target into the centre of the viewport
      el.scrollIntoView({ block: "center", behavior: ready ? "smooth" : "auto" });

      // Give the smooth-scroll one frame to start, then track via rAF until it lands
      await new Promise(r => requestAnimationFrame(() => r()));
      trackRectUntilStable(el, step.placement);

      // Bring tooltip content back in after a short beat
      setTimeout(() => {
        setReady(true);
        setContentVisible(true);
      }, 220);
    } else {
      // Target never appeared — show as centred modal
      targetElRef.current = null;
      setContentVisible(false);
      await new Promise(r => setTimeout(r, 150));
      setTargetRect(null);
      setTooltipPos(computeTooltipPosition({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }, "center"));
      setReady(true);
      setContentVisible(true);
    }
  }, [tourId, step, currentView, onNavigate, trackRectUntilStable, ready]);

  useEffect(() => { locateTarget(); }, [locateTarget]);

  // Clean up the rAF tracker when the tour closes
  useEffect(() => {
    return () => { if (trackingRafRef.current) cancelAnimationFrame(trackingRafRef.current); };
  }, []);

  // Reposition on user scroll/resize so the ring tracks the target across the page
  useEffect(() => {
    if (!tourId || !targetElRef.current) return;
    const reposition = () => {
      const el = targetElRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
      setTooltipPos(computeTooltipPosition(rect, step?.placement || "right"));
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [tourId, step]);

  const finish = useCallback(() => {
    if (tourId === "overview") markOverviewSeen(memberId, role);
    if (trackingRafRef.current) cancelAnimationFrame(trackingRafRef.current);
    onClose?.();
  }, [tourId, memberId, role, onClose]);

  const next = () => {
    if (stepIdx >= steps.length - 1) finish();
    else setStepIdx(stepIdx + 1);
  };
  const back = () => setStepIdx(Math.max(0, stepIdx - 1));

  if (!tourId || !step) return null;

  const last = stepIdx === steps.length - 1;
  const hasTarget = !!targetRect;
  const ringRect = hasTarget ? {
    top: targetRect.top - RING_PADDING,
    left: targetRect.left - RING_PADDING,
    width: targetRect.width + RING_PADDING * 2,
    height: targetRect.height + RING_PADDING * 2,
  } : null;

  return (
    <>
      {/* Backdrop — only shown when there's NO target (centred modal steps).
          When a target exists, the ring's own 9999px box-shadow spread does the
          dimming outside the ring AND keeps the highlighted element fully bright. */}
      {!hasTarget && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 1099,
            background: "rgba(8, 24, 18, 0.65)",
            pointerEvents: "auto",
            opacity: ready ? 1 : 0,
            transition: `opacity 350ms ${EASE}`,
          }}
        />
      )}

      {/* Spotlight ring — the 9999px box-shadow spread is what dims everything
          OUTSIDE the ring. The ring element itself is transparent inside.
          NOTE: box-shadow is NOT in the transition list anymore — it was conflicting
          with the pulse keyframe animation and causing the ring to flicker. */}
      <div style={{
        position: "fixed",
        top: ringRect ? ringRect.top : -9999,
        left: ringRect ? ringRect.left : -9999,
        width: ringRect ? ringRect.width : 0,
        height: ringRect ? ringRect.height : 0,
        borderRadius: 14,
        zIndex: 1100,
        pointerEvents: "none",
        background: "transparent",
        opacity: hasTarget && ready ? 1 : 0,
        willChange: "top, left, width, height, opacity",
        transition: `
          top 520ms ${EASE},
          left 520ms ${EASE},
          width 520ms ${EASE},
          height 520ms ${EASE},
          opacity 280ms ${EASE}
        `,
        animation: hasTarget && ready ? "ge-tour-pulse 2.4s ease-in-out infinite" : "none",
      }} />

      {/* Tooltip card — single persistent element. Position transitions smoothly,
          content cross-fades when stepIdx changes so text doesn't snap. */}
      {tooltipPos && (
        <div style={{
          position: "fixed",
          top: tooltipPos.top, left: tooltipPos.left,
          width: TOOLTIP_W, maxWidth: "calc(100vw - 32px)",
          zIndex: 1101,
          background: C.white, borderRadius: 14,
          boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
          fontFamily: FONT, overflow: "hidden",
          opacity: ready ? 1 : 0,
          willChange: "top, left, opacity",
          transition: `
            top 520ms ${EASE},
            left 520ms ${EASE},
            opacity 280ms ${EASE}
          `,
        }}>
          {/* Inner content cross-fades between steps so the words don't pop */}
          <div style={{
            opacity: contentVisible ? 1 : 0,
            transform: contentVisible ? "translateY(0)" : "translateY(6px)",
            transition: `opacity 220ms ${EASE}, transform 220ms ${EASE}`,
          }}>
            {/* Header — step counter */}
            <div style={{ padding: "16px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{
                fontSize: 10, fontWeight: 800, color: C.primary,
                letterSpacing: 1.2, textTransform: "uppercase",
              }}>
                Step {stepIdx + 1} of {steps.length}
                {role && role !== "guest" && (
                  <span style={{ marginLeft: 8, color: C.t4, fontWeight: 600 }}>· {role}</span>
                )}
              </div>
              <button onClick={finish} style={{
                fontSize: 18, color: C.t4, background: "none", border: "none",
                cursor: "pointer", padding: 0, lineHeight: 1, fontFamily: FONT,
              }}>×</button>
            </div>

            {/* Body */}
            <div style={{ padding: "10px 20px 16px" }}>
              <div style={{
                fontSize: 18, fontWeight: 800, color: C.dark, marginBottom: 8, letterSpacing: -0.3, lineHeight: 1.3,
              }}>{step.title}</div>
              <div style={{
                fontSize: 13, color: C.t2, lineHeight: 1.55,
              }}>{step.body}</div>
            </div>

            {/* Footer */}
            <div style={{
              padding: "12px 20px", borderTop: `1px solid ${C.line}`,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <button onClick={finish} style={{
                fontSize: 12, fontWeight: 600, color: C.t4, background: "none",
                border: "none", cursor: "pointer", fontFamily: FONT,
                transition: `color 180ms ${EASE}`,
              }}
                onMouseEnter={e => e.currentTarget.style.color = C.t2}
                onMouseLeave={e => e.currentTarget.style.color = C.t4}>
                Skip
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                {stepIdx > 0 && (
                  <button onClick={back} style={{
                    fontSize: 13, fontWeight: 600, color: C.t2, background: C.white,
                    border: `1px solid ${C.line}`, borderRadius: 8, padding: "6px 14px",
                    cursor: "pointer", fontFamily: FONT,
                    transition: `background 180ms ${EASE}, border-color 180ms ${EASE}`,
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = C.hover || "#F3F4F6"; e.currentTarget.style.borderColor = C.primary + "40"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = C.white; e.currentTarget.style.borderColor = C.line; }}>
                    Back
                  </button>
                )}
                <button onClick={next} style={{
                  fontSize: 13, fontWeight: 700, color: C.white,
                  background: C.primary,
                  border: "none", borderRadius: 8, padding: "6px 18px",
                  cursor: "pointer", fontFamily: FONT,
                  display: "flex", alignItems: "center", gap: 6,
                  transition: `transform 180ms ${EASE}, box-shadow 180ms ${EASE}`,
                  boxShadow: `0 2px 8px ${C.primary}40`,
                }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = `0 4px 14px ${C.primary}60`; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = `0 2px 8px ${C.primary}40`; }}>
                  {last ? "Done" : "Next"} {!last && <span style={{ fontSize: 14 }}>→</span>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes ge-tour-pulse {
          0%, 100% {
            box-shadow:
              0 0 0 3px ${C.primary},
              0 0 0 6px ${C.white},
              0 0 0 9px ${C.primary},
              0 0 0 9999px rgba(8, 24, 18, 0.65),
              0 0 50px ${C.primary},
              0 0 90px ${C.primary}90;
          }
          50% {
            box-shadow:
              0 0 0 3px ${C.primary},
              0 0 0 6px ${C.white},
              0 0 0 12px ${C.primary},
              0 0 0 9999px rgba(8, 24, 18, 0.65),
              0 0 90px ${C.primary},
              0 0 140px ${C.primary};
          }
        }
      `}</style>
    </>
  );
}

/* Tiny ? button helper — exported in case any tab wants a custom placement.
 * Most tabs inline the button themselves for layout reasons. */
export function TourLauncher({ onLaunch, label = "How does this tab work?", size = 28 }) {
  return (
    <button
      onClick={onLaunch}
      title={label}
      style={{
        width: size, height: size, borderRadius: "50%",
        background: C.white, border: `1px solid ${C.primary}40`,
        color: C.primary, fontSize: Math.round(size * 0.5), fontWeight: 800,
        cursor: "pointer", fontFamily: FONT, lineHeight: 1,
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        boxShadow: `0 1px 4px ${C.primary}15`,
        transition: `transform 180ms cubic-bezier(0.32, 0.72, 0, 1), box-shadow 180ms cubic-bezier(0.32, 0.72, 0, 1)`,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.1)"; e.currentTarget.style.boxShadow = `0 2px 10px ${C.primary}40`; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = `0 1px 4px ${C.primary}15`; }}
    >
      ?
    </button>
  );
}
