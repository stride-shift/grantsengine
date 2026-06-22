import { useState, useMemo, useCallback } from "react";

/* ── Date helpers (self-contained so the hook is testable in isolation) ── */
const CLOSED = ["won", "lost", "deferred", "archived"];

function startOfWeek(d) {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function parseLocalDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.slice(0, 10).split("-");
  if (parts.length !== 3) return null;
  return new Date(+parts[0], +parts[1] - 1, +parts[2]);
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Calendar view-model. Flattens grant deadline/submitted/follow-up events
 * (skipping closed grants), builds the month/week grids, derives the upcoming
 * list + events-by-date index, the deadline stats (this week / month / overdue),
 * and owns current-month/week navigation. The component renders from this and
 * only keeps view-mode / filter / overdue-panel UI toggles of its own.
 *
 * @param grants grants to flatten events from
 * @param today  reference "now" date (defaults to new Date())
 */
export default function useCalendar(grants, today = new Date()) {
  const [viewMode, setViewMode] = useState("month");
  const [current, setCurrent] = useState(() => new Date());
  const [activeTypes, setActiveTypes] = useState(() => new Set(["deadline", "followup", "submitted"]));

  const events = useMemo(() => {
    const evts = [];
    for (const g of grants) {
      if (CLOSED.includes(g.stage)) continue;
      if (g.deadline) evts.push({ type: "deadline", date: g.deadline.slice(0, 10), grant: g });
      if (g.subDate) evts.push({ type: "submitted", date: g.subDate.slice(0, 10), grant: g });
      if (Array.isArray(g.fups)) {
        for (const fup of g.fups) {
          if (!fup.done && fup.date) evts.push({ type: "followup", date: fup.date.slice(0, 10), grant: g, label: fup.label });
        }
      }
    }
    return evts;
  }, [grants]);

  const filteredEvents = useMemo(() => events.filter(e => activeTypes.has(e.type)), [events, activeTypes]);

  const eventsByDate = useMemo(() => {
    const map = {};
    for (const e of filteredEvents) {
      if (!e.date) continue;
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    }
    return map;
  }, [filteredEvents]);

  const monthGrid = useMemo(() => {
    const year = current.getFullYear(), month = current.getMonth();
    const firstDay = new Date(year, month, 1);
    let start = startOfWeek(firstDay);
    const weeks = [];
    while (weeks.length < 6) {
      const week = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        week.push(d);
      }
      weeks.push(week);
      start.setDate(start.getDate() + 7);
    }
    return weeks;
  }, [current]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(current);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [current]);

  const upcomingEvents = useMemo(() =>
    filteredEvents.filter(e => e.date >= fmtDate(today)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 50),
    [filteredEvents, today]
  );

  const todayStr = fmtDate(today);
  const { deadlinesThisWeek, deadlinesThisMonth, overdueEvents, overdueCount } = useMemo(() => {
    const thisWeekStart = startOfWeek(today);
    const thisWeekEnd = new Date(thisWeekStart);
    thisWeekEnd.setDate(thisWeekEnd.getDate() + 6);
    const week = filteredEvents.filter(e => { const d = parseLocalDate(e.date); return d && d >= thisWeekStart && d <= thisWeekEnd && e.type === "deadline"; }).length;
    const month = filteredEvents.filter(e => { const d = parseLocalDate(e.date); return d && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear() && e.type === "deadline"; }).length;
    const overdue = filteredEvents.filter(e => e.type === "deadline" && e.date < todayStr).sort((a, b) => b.date.localeCompare(a.date));
    return { deadlinesThisWeek: week, deadlinesThisMonth: month, overdueEvents: overdue, overdueCount: overdue.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredEvents, todayStr]);

  const nav = useCallback((dir) => {
    setCurrent(prev => {
      const d = new Date(prev);
      if (viewMode === "month") d.setMonth(d.getMonth() + dir);
      else d.setDate(d.getDate() + dir * 7);
      return d;
    });
  }, [viewMode]);

  const goToday = useCallback(() => setCurrent(new Date()), []);

  const toggleType = useCallback((type) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) { if (next.size > 1) next.delete(type); }
      else next.add(type);
      return next;
    });
  }, []);

  return {
    viewMode, setViewMode,
    current,
    activeTypes, toggleType,
    events, filteredEvents, eventsByDate,
    monthGrid, weekDays, upcomingEvents,
    deadlinesThisWeek, deadlinesThisMonth, overdueEvents, overdueCount,
    nav, goToday,
  };
}
