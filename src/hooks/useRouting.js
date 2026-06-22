import { useState, useEffect } from "react";

/**
 * View/selection state + URL sync (no router), extracted from App.jsx.
 * Owns `view` and `sel` (the selected grant id) and keeps the URL in sync via
 * pushState, plus a popstate listener for back/forward. App renders from
 * `view`/`sel` and uses `setView`/`setSel` in its handlers.
 *
 * @param deps { orgSlug, authed }
 * @returns { view, sel, setView, setSel }
 */
export default function useRouting({ orgSlug, authed }) {
  const [view, setView] = useState("dashboard");
  const [sel, setSel] = useState(null);

  // Sync the URL to the current view/selection
  useEffect(() => {
    if (authed && orgSlug) {
      const path = sel ? `/org/${orgSlug}/grant/${sel}` :
        view === "dashboard" ? `/org/${orgSlug}` :
          `/org/${orgSlug}/${view}`;
      if (window.location.pathname !== path) {
        window.history.pushState({}, "", path);
      }
    }
  }, [authed, orgSlug, view, sel]);

  // Back/forward navigation
  useEffect(() => {
    const onPop = () => {
      const path = window.location.pathname;
      const match = path.match(/^\/org\/([^/]+)\/?(.*)$/);
      if (match) {
        const [, slug, rest] = match;
        if (slug !== orgSlug) return; // different org, ignore
        if (rest.startsWith("grant/")) {
          setSel(rest.replace("grant/", ""));
        } else if (rest) {
          setSel(null);
          setView(rest);
        } else {
          setSel(null);
          setView("dashboard");
        }
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [orgSlug]);

  return { view, sel, setView, setSel };
}
