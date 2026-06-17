import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { C, FONT } from "../theme";
import { stepsForTour, markOverviewSeen } from "../data/tourSteps";

/* Anchored guided tour with smooth animations.
 *
 * Smoothness strategy:
 *  - Ring + tooltip are rendered once and persist; position transitions via CSS.
 *  - Step changes: fade out → instant scroll → set rect once → fade back in.
 *    No per-frame setState during scroll (that fought the 520ms CSS transitions
 *    and caused stutter). CSS owns the visual interpolation; React just commits
 *    the start and end positions.
 *  - User-driven scroll/resize while a step is active is tracked via rAF-throttled
 *    listener (one setState per frame max, not per event).
 */

const TARGET_POLL_INTERVAL = 50;   // ms — while waiting for target to mount
const TARGET_POLL_TIMEOUT  = 4000; // ms — give up if target never appears
const RING_PADDING         = 10;
const TOOLTIP_W            = 360;
const TOOLTIP_H_ESTIMATE   = 220;
const EASE                 = "cubic-bezier(0.32, 0.72, 0, 1)"; // macOS-feel ease
const FADE_OUT_MS          = 180;  // fade ring + content before jumping
const FADE_IN_DELAY_MS     = 60;   // small beat after scroll lands before fading back in

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

  // Memoise the step list so step references are stable across renders.
  // Without this, `step = steps[stepIdx]` was a new object identity every render,
  // which made locateTarget's useCallback recreate, which fired the useEffect,
  // which called locateTarget, which set state, which re-rendered... blink loop.
  // `selectedGrant` is passed as context so steps can skip themselves when their
  // target UI isn't visible — e.g. funder-feedback only on submitted+ stages.
  const steps = useMemo(
    () => (tourId ? stepsForTour(tourId, role, selectedGrant) : []),
    [tourId, role, selectedGrant]
  );

  const [stepIdx, setStepIdx] = useState(0);
  const [targetRect, setTargetRect] = useState(null);     // null → no target → show centred modal
  const [tooltipPos, setTooltipPos] = useState(null);     // null → don't render yet
  const [ready, setReady] = useState(false);              // first paint done
  const [visible, setVisible] = useState(true);           // ring + content fade together during step transitions
  const targetElRef = useRef(null);
  const trackingRafRef = useRef(null);
  const repositionRafRef = useRef(null);

  // Mirror prop callbacks into refs so locateTarget doesn't need them as deps.
  // App.jsx passes inline arrow functions which get a new identity each render —
  // including them in locateTarget's deps would re-trigger the effect endlessly.
  const onNavigateRef = useRef(onNavigate);
  useEffect(() => { onNavigateRef.current = onNavigate; }, [onNavigate]);

  const step = steps[stepIdx];

  // Reset state when the tour opens or the tour ID changes
  useEffect(() => {
    if (tourId) {
      setStepIdx(0);
      setReady(false);
      setTooltipPos(null);
      setTargetRect(null);
      setVisible(true);
    }
  }, [tourId]);

  // Read `ready` via a ref instead of state to avoid re-render loops in locateTarget's deps.
  const readyRef = useRef(false);
  useEffect(() => { readyRef.current = ready; }, [ready]);

  const locateTarget = useCallback(async () => {
    if (!tourId || !step) return;

    // Cancel any in-flight tracking from the previous step
    if (trackingRafRef.current) {
      clearTimeout(trackingRafRef.current);
      trackingRafRef.current = null;
    }

    const wasReady = readyRef.current;

    // Centred-modal step (no target)
    if (!step.target) {
      targetElRef.current = null;
      if (wasReady) {
        setVisible(false);
        await new Promise(r => setTimeout(r, FADE_OUT_MS));
      }
      setTargetRect(null);
      setTooltipPos(computeTooltipPosition({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }, "center"));
      setReady(true);
      setVisible(true);
      return;
    }

    // Navigate to the right view first if needed (the polling below will wait for the target to mount)
    if (step.view && step.view !== currentView && onNavigateRef.current) {
      onNavigateRef.current(step.view);
    }

    const el = await waitForTarget(step.target);

    if (el) {
      // Open any collapsed <details> ancestors so the target is actually visible.
      // Sections like Activity / Funder Feedback are wrapped in <details> and would
      // otherwise have a zero-size rect, falling back to a useless centred modal.
      let p = el;
      while (p && p !== document.body) {
        if (p.tagName === "DETAILS" && !p.open) p.open = true;
        p = p.parentElement;
      }
      // Give the browser one frame to layout the now-open sections
      await new Promise(r => requestAnimationFrame(() => r()));

      // Fade ring + content out together. Off-screen jumps become invisible;
      // on-screen moves still feel smooth because CSS interpolates the new top/left.
      if (wasReady) {
        setVisible(false);
        await new Promise(r => setTimeout(r, FADE_OUT_MS));
      }

      targetElRef.current = el;
      // INSTANT scroll — no smooth animation fighting our CSS transition.
      el.scrollIntoView({ block: "center", behavior: "instant" });

      // One frame for the browser to commit the scroll, then read the final rect once.
      await new Promise(r => requestAnimationFrame(() => r()));
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
      setTooltipPos(computeTooltipPosition(rect, step.placement || "right"));

      // Tiny beat so the new position commits before we fade back in
      trackingRafRef.current = setTimeout(() => {
        setReady(true);
        setVisible(true);
        trackingRafRef.current = null;
      }, FADE_IN_DELAY_MS);
    } else {
      // Target never appeared — show as centred modal
      targetElRef.current = null;
      if (wasReady) {
        setVisible(false);
        await new Promise(r => setTimeout(r, FADE_OUT_MS));
      }
      setTargetRect(null);
      setTooltipPos(computeTooltipPosition({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }, "center"));
      setReady(true);
      setVisible(true);
    }
  }, [tourId, step, currentView]);

  useEffect(() => { locateTarget(); }, [locateTarget]);

  // Clean up any pending timers on unmount
  useEffect(() => {
    return () => {
      if (trackingRafRef.current) clearTimeout(trackingRafRef.current);
      if (repositionRafRef.current) cancelAnimationFrame(repositionRafRef.current);
    };
  }, []);

  // Track the target through USER scroll/resize. rAF-throttled so we commit at most
  // one setState per frame, never N per scroll event.
  useEffect(() => {
    if (!tourId || !targetElRef.current) return;
    const reposition = () => {
      if (repositionRafRef.current) return; // already scheduled this frame
      repositionRafRef.current = requestAnimationFrame(() => {
        repositionRafRef.current = null;
        const el = targetElRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        setTargetRect(rect);
        setTooltipPos(computeTooltipPosition(rect, step?.placement || "right"));
      });
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      if (repositionRafRef.current) {
        cancelAnimationFrame(repositionRafRef.current);
        repositionRafRef.current = null;
      }
    };
  }, [tourId, step]);

  const finish = useCallback(() => {
    if (tourId === "overview") markOverviewSeen(memberId, role);
    if (trackingRafRef.current) clearTimeout(trackingRafRef.current);
    if (repositionRafRef.current) cancelAnimationFrame(repositionRafRef.current);
    onClose?.();
  }, [tourId, memberId, role, onClose]);

  // Escape key closes the tour.
  useEffect(() => {
    if (!tourId) return;
    const onKey = (e) => { if (e.key === "Escape") finish(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tourId, finish]);

  // Move initial focus to the tooltip dialog once it first becomes ready.
  const dialogRef = useRef(null);
  const focusedRef = useRef(false);
  useEffect(() => { focusedRef.current = false; }, [tourId]);
  useEffect(() => {
    if (ready && tooltipPos && !focusedRef.current && dialogRef.current) {
      dialogRef.current.focus();
      focusedRef.current = true;
    }
  }, [ready, tooltipPos]);

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
      {/* Dim backdrop — a single full-viewport SVG that punches a hole at the ring
          position via mask. This replaces the old 9999px box-shadow trick: that one
          forced the browser to re-rasterize a viewport-sized shadow on every frame
          of the pulse, which is what made the whole thing choppy.
          The SVG rect's x/y/w/h snap to the target instantly (no CSS transition on
          the hole). The ring fade-out covers any visible snap during step changes. */}
      <svg
        style={{
          position: "fixed", inset: 0, width: "100vw", height: "100vh",
          zIndex: 1099, pointerEvents: "none",
          opacity: ready && visible ? 1 : 0,
          transition: `opacity ${FADE_OUT_MS}ms ${EASE}`,
        }}
      >
        <defs>
          <mask id="ge-tour-mask" maskUnits="userSpaceOnUse">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {hasTarget && (
              <rect
                x={ringRect.left}
                y={ringRect.top}
                width={ringRect.width}
                height={ringRect.height}
                rx={14}
                ry={14}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0" y="0" width="100%" height="100%"
          fill="rgba(8, 24, 18, 0.65)"
          mask="url(#ge-tour-mask)"
        />
      </svg>

      {/* Spotlight ring — purely decorative. Tiny local glow only, no viewport-sized
          shadow. Position via top/left (small element → cheap repaints). The pulse
          animates only a small local box-shadow now, so it doesn't repaint the
          entire viewport on every frame. */}
      {hasTarget && (
        <div style={{
          position: "fixed",
          top: ringRect.top,
          left: ringRect.left,
          width: ringRect.width,
          height: ringRect.height,
          borderRadius: 14,
          zIndex: 1100,
          pointerEvents: "none",
          background: "transparent",
          border: `2px solid ${C.primary}`,
          boxSizing: "border-box",
          opacity: ready && visible ? 1 : 0,
          willChange: "opacity",
          transition: `opacity ${FADE_OUT_MS}ms ${EASE}`,
          animation: ready && visible ? "ge-tour-pulse 2.4s ease-in-out infinite" : "none",
        }} />
      )}

      {/* Tooltip card — single persistent element. Position transitions smoothly,
          opacity fades with the ring on step changes so nothing pops. */}
      {tooltipPos && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={step?.title ? `Tour step: ${step.title}` : "Guided tour"}
          tabIndex={-1}
          style={{
          position: "fixed",
          top: tooltipPos.top, left: tooltipPos.left,
          width: TOOLTIP_W, maxWidth: "calc(100vw - 32px)",
          zIndex: 1101,
          background: C.white, borderRadius: 14,
          boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
          fontFamily: FONT, overflow: "hidden", outline: "none",
          opacity: ready && visible ? 1 : 0,
          willChange: "top, left, opacity",
          transition: `
            top 520ms ${EASE},
            left 520ms ${EASE},
            opacity ${FADE_OUT_MS}ms ${EASE}
          `,
        }}>
          <div>
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
              <button onClick={finish} aria-label="Close tour" style={{
                fontSize: 18, color: C.t4, background: "none", border: "none",
                cursor: "pointer", padding: 0, lineHeight: 1, fontFamily: FONT,
              }}><span aria-hidden="true">×</span></button>
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
                  {last ? "Done" : "Next"} {!last && <span aria-hidden="true" style={{ fontSize: 14 }}>→</span>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* Small local glow only — no viewport-sized shadow.
           The dim is handled separately by the SVG mask above, so this keyframe
           only has to repaint a tight area around the ring (cheap). */
        @keyframes ge-tour-pulse {
          0%, 100% {
            box-shadow:
              0 0 0 0 ${C.primary}55,
              0 0 18px ${C.primary}80;
          }
          50% {
            box-shadow:
              0 0 0 6px ${C.primary}00,
              0 0 28px ${C.primary};
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
