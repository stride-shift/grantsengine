import { useState, useEffect, useRef } from "react";
import { C, FONT } from "@/theme";

/* WelcomeTutorial — first-time onboarding walkthrough.
 * Shown automatically on first login (controlled by localStorage flag).
 * Can also be reopened from a help menu.
 *
 * Each step is a card with a title, a 2-3 sentence description, and a
 * pointer to where the feature lives in the app. We deliberately do NOT
 * highlight specific DOM elements — that would require keeping
 * coordinates in sync with the UI as it evolves. Plain language wins.
 */

const STEPS = [
  {
    title: "Welcome to Grants Engine",
    body: "This is your grant-funding command centre. In five steps I'll show you everything you need to find new funders, write proposals, and keep nothing falling through the cracks.",
    icon: "👋",
  },
  {
    title: "Pipeline — every grant in one view",
    body: "The Pipeline tab is your main workspace. Every live grant lives here with its stage, deadline, owner, and how much you're asking for. Click any card to open the full grant.",
    icon: "📊",
    hint: "Open the Pipeline tab in the sidebar after this tutorial.",
  },
  {
    title: "Scout — find new funders with AI",
    body: "Scout searches across South African and international funders matched to your org profile. It scores each opportunity by fit, verifies the URL is live, and tells you whether it's open or relationship-only. Click an opportunity to expand the details, then \"+ Add\" to pull it into your Pipeline.",
    icon: "🔭",
    hint: "Scout sits in the toolbar at the top of the Pipeline.",
  },
  {
    title: "Make the Magic Happen",
    body: "Inside any grant you'll find the \"Make the Magic Happen\" button. It runs the full sequence — research, fit score, budget, proposal — and produces a draft grounded in your real outcomes, not generic AI text. Paste the funder's brief into the field above the button first for the strongest result.",
    icon: "✨",
    hint: "Available on every grant detail page.",
  },
  {
    title: "Concept Note vs Full Proposal",
    body: "Some funders want a short pre-proposal pitch before a full submission. Use the \"Generate Concept Note\" button (right below Make the Magic Happen) for a tight 1-2 page sell-the-idea pitch. Save the full proposal for when they say yes.",
    icon: "📝",
  },
  {
    title: "Documents, Calendar, and Activity",
    body: "Doc Vault stores every proposal, MOU, and compliance certificate — searchable. The Calendar pushes deadlines to whichever team member owns the relationship. Outstanding Actions on the Dashboard tells you what's overdue today.",
    icon: "📚",
    hint: "All accessible from the left sidebar.",
  },
  {
    title: "You're ready",
    body: "That's the tour. A few tips: paste the funder's brief verbatim before generating, use the \"Archive all\" button to clear out missed opportunities, and check the Scout Brief to refine which opportunities the AI surfaces. You can replay this tutorial anytime from the help icon.",
    icon: "🚀",
  },
];

const STORAGE_KEY = "ge_tutorial_seen_v1";

export const hasSeenTutorial = () => {
  try { return localStorage.getItem(STORAGE_KEY) === "true"; }
  catch { return true; } // fail closed — never re-show on storage error
};

export const markTutorialSeen = () => {
  try { localStorage.setItem(STORAGE_KEY, "true"); } catch {}
};

export const resetTutorial = () => {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
};

export default function WelcomeTutorial({ open, onClose }) {
  const [step, setStep] = useState(0);
  const dialogRef = useRef(null);

  const finish = () => {
    markTutorialSeen();
    onClose?.();
  };

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  // Escape to close + move initial focus to the dialog on open.
  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") finish(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(8, 24, 18, 0.55)", zIndex: 1100,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      fontFamily: FONT,
    }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={s.title}
        tabIndex={-1}
        style={{
        background: C.white, borderRadius: 16, width: "100%", maxWidth: 520,
        boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
        overflow: "hidden", outline: "none",
      }}>
        {/* Progress bar */}
        <div style={{ height: 4, background: C.line }}>
          <div style={{
            height: "100%", width: `${((step + 1) / STEPS.length) * 100}%`,
            background: `linear-gradient(90deg, ${C.primary}, ${C.primaryDark})`,
            transition: "width 0.3s ease",
          }} />
        </div>

        {/* Body */}
        <div style={{ padding: "32px 32px 24px" }}>
          <div aria-hidden="true" style={{ fontSize: 40, marginBottom: 16 }}>{s.icon}</div>
          <div style={{
            fontSize: 22, fontWeight: 800, color: C.dark, marginBottom: 10, letterSpacing: -0.3,
          }}>{s.title}</div>
          <div style={{
            fontSize: 14, color: C.t2, lineHeight: 1.6, marginBottom: 14,
          }}>{s.body}</div>
          {s.hint && (
            <div style={{
              fontSize: 12, color: C.t3, fontStyle: "italic",
              padding: "8px 12px", background: `${C.primary}08`, borderRadius: 6,
              borderLeft: `3px solid ${C.primary}`,
            }}>
              {s.hint}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 24px", borderTop: `1px solid ${C.line}`,
          display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
        }}>
          <div style={{ display: "flex", gap: 6 }}>
            {STEPS.map((_, i) => (
              <div key={i} style={{
                width: 6, height: 6, borderRadius: "50%",
                background: i === step ? C.primary : i < step ? `${C.primary}66` : C.line,
                transition: "background 0.2s",
              }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!last && (
              <button onClick={finish} style={{
                fontSize: 12, fontWeight: 600, color: C.t4, background: "none",
                border: "none", cursor: "pointer", fontFamily: FONT, padding: "8px 12px",
              }}>
                Skip
              </button>
            )}
            {step > 0 && (
              <button onClick={() => setStep(step - 1)} style={{
                fontSize: 13, fontWeight: 600, color: C.t2, background: C.white,
                border: `1px solid ${C.line}`, borderRadius: 8, padding: "8px 16px",
                cursor: "pointer", fontFamily: FONT,
              }}>
                Back
              </button>
            )}
            <button onClick={() => last ? finish() : setStep(step + 1)} style={{
              fontSize: 13, fontWeight: 700, color: C.white,
              background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
              border: "none", borderRadius: 8, padding: "8px 20px",
              cursor: "pointer", fontFamily: FONT,
            }}>
              {last ? "Get started" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
