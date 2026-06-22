import { useState, useEffect, useCallback } from "react";
import { getGcalStatus, getGcalAuthUrl, disconnectGcal, syncAllToGcal } from "@/api";

/**
 * Google Calendar connection view-model: connection status, the OAuth
 * connect/disconnect flow, and the auto-sync triggered by the OAuth popup's
 * postMessage callback. The component renders `connected`/`loading`/`msg` and
 * wires the buttons to `connect`/`disconnect`.
 *
 * Behaviour preserved 1:1 from Settings.jsx:
 *  - on mount: getGcalStatus() → connected (errors swallowed)
 *  - a window "message" listener watches for "gcal-connected": flips connected,
 *    shows "Connected! Syncing deadlines...", then syncAllToGcal() and reports
 *    the synced count (or the auto-sync-failed fallback)
 *  - connect(): getGcalAuthUrl() → window.open popup (500×600, name "gcal-auth"),
 *    "Failed: …" on error, loading guarded
 *  - disconnect(): disconnectGcal() → connected=false, msg "Disconnected"
 */
export default function useGcal() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    getGcalStatus().then(d => setConnected(d.connected)).catch(() => {});
    // Listen for OAuth callback
    const handler = async (e) => {
      if (e.data === "gcal-connected") {
        setConnected(true);
        setMsg("Connected! Syncing deadlines...");
        try {
          const r = await syncAllToGcal();
          setMsg(`Connected — ${r.synced} deadline${r.synced !== 1 ? "s" : ""} synced to your calendar`);
        } catch { setMsg("Connected — auto-sync failed, try again later"); }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const connect = useCallback(async () => {
    setLoading(true);
    try {
      const { url } = await getGcalAuthUrl();
      window.open(url, "gcal-auth", "width=500,height=600");
    } catch (e) { setMsg("Failed: " + e.message); }
    setLoading(false);
  }, []);

  const disconnect = useCallback(async () => {
    await disconnectGcal();
    setConnected(false);
    setMsg("Disconnected");
  }, []);

  return { connected, loading, msg, connect, disconnect };
}
