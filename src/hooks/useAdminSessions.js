import { useState, useEffect, useCallback } from "react";
import { getAdminSessions, getAdminSessionHistory, getAdminActivity } from "@/api";

/**
 * Loads admin observability data: active sessions, 30-day login history, and
 * the activity feed (optionally filtered by member). Refetches everything when
 * the member filter changes, and polls active sessions every 30s.
 *
 * The component renders from `activeSessions`/`sessionHistory`/`activity`,
 * owns the `filterMember` selection here, and reads `loading` for the spinner.
 */
export default function useAdminSessions() {
  const [activeSessions, setActiveSessions] = useState([]);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [activity, setActivity] = useState([]);
  const [filterMember, setFilterMember] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [sess, hist, act] = await Promise.all([
        getAdminSessions(),
        getAdminSessionHistory(30),
        getAdminActivity(filterMember, 100),
      ]);
      setActiveSessions(sess);
      setSessionHistory(hist);
      setActivity(act);
    } catch (err) {
      console.error("Admin data load failed:", err);
    }
    setLoading(false);
  }, [filterMember]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const t = setInterval(async () => {
      try { setActiveSessions(await getAdminSessions()); } catch { /* ignore */ }
    }, 30000);
    return () => clearInterval(t);
  }, []);

  return {
    activeSessions, sessionHistory, activity,
    filterMember, setFilterMember, loading,
  };
}
