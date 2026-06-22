import { useState, useRef, useCallback, useEffect } from "react";
import { saveGrant } from "@/api";

/**
 * Debounced grant persistence with a save-state indicator. Extracted from
 * App.jsx. Each grant id is debounced 1s; `silent` saves (background work) skip
 * the saveState/toast surface. Identical error toasts are de-duped within 10s.
 *
 * @param toast    the toast emitter (from useToast)
 * @param resetKey when this changes (e.g. `authed` on logout/org-switch) all
 *                 pending saves are cancelled — matches the original [authed] cleanup.
 * @returns { saveState, dSave } — saveState ∈ "idle"|"saving"|"saved"|"error"
 */
export default function useSave(toast, resetKey) {
  const [saveState, setSaveState] = useState("idle");
  const saveTimers = useRef({});
  const saveStateTimer = useRef(null);
  const lastErrorToastRef = useRef({ msg: "", at: 0 });
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const dSave = useCallback((grantId, data, opts = {}) => {
    const { silent = false } = opts;
    clearTimeout(saveTimers.current[grantId]);
    saveTimers.current[grantId] = setTimeout(async () => {
      if (!silent) setSaveState("saving");
      try {
        await saveGrant(data);
        if (!silent) {
          setSaveState("saved");
          clearTimeout(saveStateTimer.current);
          saveStateTimer.current = setTimeout(() => setSaveState("idle"), 2000);
        }
      } catch (err) {
        console.error("Save failed:", err.message, "grant:", grantId);
        if (silent) return; // background work — don't bother the user
        setSaveState("error");
        // De-duplicate toasts: same error within 10s gets suppressed
        const now = Date.now();
        const last = lastErrorToastRef.current;
        if (last.msg !== err.message || now - last.at > 10000) {
          toastRef.current?.(`Save failed: ${err.message}`, { type: "error", duration: 5000 });
          lastErrorToastRef.current = { msg: err.message, at: now };
        }
        clearTimeout(saveStateTimer.current);
        saveStateTimer.current = setTimeout(() => setSaveState("idle"), 5000);
      }
    }, 1000);
  }, []);

  // Cancel pending saves on unmount or when resetKey changes (logout / org switch)
  useEffect(() => {
    const timers = saveTimers.current;
    const stateTimer = saveStateTimer;
    return () => {
      Object.values(timers).forEach((t) => clearTimeout(t));
      saveTimers.current = {};
      clearTimeout(stateTimer.current);
    };
  }, [resetKey]);

  return { saveState, dSave };
}
