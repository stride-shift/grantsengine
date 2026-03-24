import { useState, useMemo } from "react";
import { C, FONT, MONO } from "../theme";
import { dL, effectiveAsk, fmtK, deadlineCtx } from "../utils";
import { Avatar } from "./index";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const CLOSED = ["won", "lost", "deferred", "archived"];

function startOfWeek(d) {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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

const EVENT_COLORS = {
  deadline: { bg: "#D50000", text: "#fff" },
  followup: { bg: "#039BE5", text: "#fff" },
  submitted: { bg: "#0B8043", text: "#fff" },
};

const EVENT_LABELS = {
  deadline: "Deadline",
  followup: "Follow-up",
  submitted: "Submitted",
};

export default function Calendar({ grants, team, stages, onSelectGrant }) {
  const [viewMode, setViewMode] = useState("month");
  const [current, setCurrent] = useState(new Date());
  const [activeTypes, setActiveTypes] = useState(new Set(["deadline", "followup", "submitted"]));
  const today = new Date();

  const teamById = useMemo(() => {
    const m = new Map();
    (team || []).forEach(t => m.set(t.id, t));
    return m;
  }, [team]);

  const stageById = useMemo(() => {
    const m = new Map();
    (stages || []).forEach(s => m.set(s.id, s));
    return m;
  }, [stages]);

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
    const lastDay = new Date(year, month + 1, 0);
    let start = startOfWeek(firstDay);
    const weeks = [];
    while (start <= lastDay || weeks.length < 6) {
      const week = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        week.push(d);
      }
      weeks.push(week);
      start.setDate(start.getDate() + 7);
      if (weeks.length >= 6) break;
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

  const nav = (dir) => {
    const d = new Date(current);
    if (viewMode === "month") d.setMonth(d.getMonth() + dir);
    else d.setDate(d.getDate() + dir * 7);
    setCurrent(d);
  };

  const toggleType = (type) => {
    setActiveTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) { if (next.size > 1) next.delete(type); }
      else next.add(type);
      return next;
    });
  };

  // ── Google Calendar style event chip ──
  const EventChip = ({ evt, compact = false }) => {
    const ec = EVENT_COLORS[evt.type];
    return (
      <div
        onClick={(e) => { e.stopPropagation(); onSelectGrant?.(evt.grant.id); }}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: compact ? "1px 4px" : "3px 6px",
          borderRadius: 4, background: ec.bg, color: ec.text,
          cursor: "pointer", marginBottom: 1, overflow: "hidden",
          fontSize: compact ? 10 : 11, fontWeight: 500, lineHeight: 1.3,
          transition: "opacity 0.1s",
        }}
        onMouseEnter={e => e.currentTarget.style.opacity = "0.85"}
        onMouseLeave={e => e.currentTarget.style.opacity = "1"}
        title={`${evt.grant.name} — ${evt.grant.funder}${evt.label ? ` (${evt.label})` : ""}`}
      >
        <span style={{
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {evt.grant.name}
        </span>
      </div>
    );
  };

  // ── Month view ──
  const MonthView = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
        {DAYS.map(d => (
          <div key={d} style={{
            padding: "8px 0", textAlign: "center", fontSize: 11, fontWeight: 600,
            color: C.t4, textTransform: "uppercase", letterSpacing: 0.5,
            borderBottom: `1px solid ${C.line}`,
          }}>{d}</div>
        ))}
      </div>
      {/* Weeks */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {monthGrid.map((week, wi) => (
          <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", flex: 1, minHeight: 0 }}>
            {week.map((day, di) => {
              const key = fmtDate(day);
              const dayEvents = eventsByDate[key] || [];
              const isToday = sameDay(day, today);
              const isCurrentMonth = day.getMonth() === current.getMonth();
              return (
                <div key={di} style={{
                  padding: "2px 4px", overflow: "hidden",
                  borderBottom: `1px solid ${C.line}`,
                  borderRight: di < 6 ? `1px solid ${C.line}` : "none",
                  background: !isCurrentMonth ? "#f8f9fa" : "#fff",
                  minHeight: 80,
                }}>
                  {/* Day number */}
                  <div style={{ display: "flex", justifyContent: "center", padding: "2px 0 3px" }}>
                    <span style={{
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      width: isToday ? 24 : "auto", height: isToday ? 24 : "auto",
                      borderRadius: isToday ? 12 : 0,
                      background: isToday ? "#1a73e8" : "transparent",
                      color: isToday ? "#fff" : !isCurrentMonth ? "#bbb" : "#333",
                      fontSize: 11, fontWeight: isToday ? 700 : 400,
                      padding: isToday ? 0 : "2px 0",
                    }}>
                      {day.getDate()}
                    </span>
                  </div>
                  {/* Events */}
                  {dayEvents.slice(0, 3).map((evt, ei) => (
                    <EventChip key={ei} evt={evt} compact />
                  ))}
                  {dayEvents.length > 3 && (
                    <div style={{ fontSize: 10, color: "#666", fontWeight: 500, padding: "1px 4px", cursor: "pointer" }}>
                      +{dayEvents.length - 3} more
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  // ── Week view ──
  const WeekView = () => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: `1px solid ${C.line}` }}>
        {weekDays.map((day, i) => {
          const isToday = sameDay(day, today);
          return (
            <div key={i} style={{ padding: "10px 4px", textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: isToday ? "#1a73e8" : "#70757a", textTransform: "uppercase" }}>{DAYS[i]}</div>
              <div style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: isToday ? 40 : "auto", height: isToday ? 40 : "auto",
                borderRadius: isToday ? 20 : 0,
                background: isToday ? "#1a73e8" : "transparent",
                color: isToday ? "#fff" : "#333",
                fontSize: 22, fontWeight: isToday ? 500 : 400,
                marginTop: 2,
              }}>
                {day.getDate()}
              </div>
              <div style={{ fontSize: 10, color: "#70757a", marginTop: 1 }}>{MONTHS[day.getMonth()].slice(0, 3)}</div>
            </div>
          );
        })}
      </div>
      {/* Event area */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", flex: 1 }}>
        {weekDays.map((day, i) => {
          const key = fmtDate(day);
          const dayEvents = eventsByDate[key] || [];
          return (
            <div key={i} style={{
              padding: "6px 4px", minHeight: 250,
              borderRight: i < 6 ? `1px solid ${C.line}` : "none",
            }}>
              {dayEvents.map((evt, ei) => (
                <EventChip key={ei} evt={evt} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── List view ──
  const ListView = () => {
    const grouped = {};
    for (const evt of upcomingEvents) {
      const d = parseLocalDate(evt.date);
      if (!d) continue;
      const monthKey = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      if (!grouped[monthKey]) grouped[monthKey] = [];
      grouped[monthKey].push(evt);
    }
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 16 }}>
        {Object.entries(grouped).map(([month, evts]) => (
          <div key={month}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#333", marginBottom: 8 }}>{month}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {evts.map((evt, i) => {
                const ec = EVENT_COLORS[evt.type];
                const d = parseLocalDate(evt.date);
                const stg = stageById.get(evt.grant.stage);
                const m = teamById.get(evt.grant.owner);
                const days = dL(evt.date);
                const dlCtx = deadlineCtx(days, evt.grant.stage);
                return (
                  <div key={`${evt.grant.id}-${i}`}
                    onClick={() => onSelectGrant?.(evt.grant.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                      border: `1px solid ${C.line}`, background: "#fff",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "#f8f9fa"}
                    onMouseLeave={e => e.currentTarget.style.background = "#fff"}
                  >
                    {/* Color dot */}
                    <div style={{ width: 10, height: 10, borderRadius: 5, background: ec.bg, flexShrink: 0 }} />
                    {/* Date */}
                    <div style={{ width: 50, textAlign: "center", flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#333", fontFamily: MONO }}>{d ? d.getDate() : "?"}</div>
                      <div style={{ fontSize: 9, color: "#70757a", textTransform: "uppercase" }}>{d ? MONTHS[d.getMonth()].slice(0, 3) : ""}</div>
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#333", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {evt.grant.name}
                      </div>
                      <div style={{ fontSize: 11, color: "#70757a", marginTop: 1 }}>
                        {evt.grant.funder}
                        {stg && <span style={{ marginLeft: 6, color: stg.c, fontWeight: 600, fontSize: 10 }}>{stg.label}</span>}
                      </div>
                    </div>
                    {/* Type badge */}
                    <span style={{
                      fontSize: 9, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
                      background: ec.bg, color: ec.text, flexShrink: 0,
                    }}>
                      {EVENT_LABELS[evt.type]}
                    </span>
                    {/* Right */}
                    <div style={{ textAlign: "right", flexShrink: 0, minWidth: 50 }}>
                      {effectiveAsk(evt.grant) > 0 && (
                        <div style={{ fontSize: 11, fontWeight: 600, fontFamily: MONO, color: "#333" }}>{fmtK(effectiveAsk(evt.grant))}</div>
                      )}
                      {dlCtx.label && (
                        <div style={{ fontSize: 9, fontWeight: 600, color: dlCtx.color }}>{dlCtx.label}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {upcomingEvents.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: "#70757a", fontSize: 13 }}>No upcoming events</div>
        )}
      </div>
    );
  };

  // ── Stats ──
  const todayStr = fmtDate(today);
  const thisWeekStart = startOfWeek(today);
  const thisWeekEnd = new Date(thisWeekStart);
  thisWeekEnd.setDate(thisWeekEnd.getDate() + 6);
  const deadlinesThisWeek = filteredEvents.filter(e => { const d = parseLocalDate(e.date); return d && d >= thisWeekStart && d <= thisWeekEnd && e.type === "deadline"; }).length;
  const deadlinesThisMonth = filteredEvents.filter(e => { const d = parseLocalDate(e.date); return d && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear() && e.type === "deadline"; }).length;
  const overdueCount = filteredEvents.filter(e => e.type === "deadline" && e.date < todayStr).length;

  return (
    <div style={{ padding: "16px 12px", height: "100%", display: "flex", flexDirection: "column", fontFamily: FONT }}>
      {/* Header bar — Google Calendar style */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#333", letterSpacing: -0.5 }}>Calendar</div>

          {/* View toggle */}
          <div style={{ display: "flex", border: `1px solid ${C.line}`, borderRadius: 6, overflow: "hidden" }}>
            {["month", "week", "list"].map(v => (
              <button key={v} onClick={() => setViewMode(v)} style={{
                padding: "5px 14px", fontSize: 12, fontWeight: 500, fontFamily: FONT,
                border: "none", borderRight: v !== "list" ? `1px solid ${C.line}` : "none",
                background: viewMode === v ? "#e8f0fe" : "#fff",
                color: viewMode === v ? "#1a73e8" : "#5f6368",
                cursor: "pointer", textTransform: "capitalize",
              }}>{v}</button>
            ))}
          </div>

          {/* Type filters */}
          <div style={{ display: "flex", gap: 4 }}>
            {["deadline", "followup", "submitted"].map(type => {
              const ec = EVENT_COLORS[type];
              const active = activeTypes.has(type);
              return (
                <button key={type} onClick={() => toggleType(type)} style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "4px 10px", borderRadius: 14, border: "none",
                  background: active ? ec.bg : "#e8eaed",
                  color: active ? ec.text : "#80868b",
                  fontSize: 11, fontWeight: 500, cursor: "pointer",
                  fontFamily: FONT, transition: "all 0.15s",
                  opacity: active ? 1 : 0.6,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: 3, background: active ? "#fff" : "#80868b" }} />
                  {EVENT_LABELS[type]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Navigation */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={() => setCurrent(new Date())} style={{
            padding: "5px 16px", fontSize: 12, fontWeight: 500, fontFamily: FONT,
            borderRadius: 6, border: `1px solid ${C.line}`, background: "#fff",
            color: "#333", cursor: "pointer",
          }}>Today</button>
          <button onClick={() => nav(-1)} style={{
            width: 30, height: 30, borderRadius: 15, border: "none",
            background: "transparent", cursor: "pointer", fontSize: 18, color: "#5f6368",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>{"\u2039"}</button>
          <button onClick={() => nav(1)} style={{
            width: 30, height: 30, borderRadius: 15, border: "none",
            background: "transparent", cursor: "pointer", fontSize: 18, color: "#5f6368",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>{"\u203A"}</button>
          <div style={{ fontSize: 18, fontWeight: 400, color: "#333", minWidth: 160 }}>
            {viewMode === "week"
              ? `${weekDays[0].getDate()} ${MONTHS[weekDays[0].getMonth()].slice(0, 3)} – ${weekDays[6].getDate()} ${MONTHS[weekDays[6].getMonth()].slice(0, 3)} ${weekDays[6].getFullYear()}`
              : `${MONTHS[current.getMonth()]} ${current.getFullYear()}`
            }
          </div>
        </div>
      </div>

      {/* Mini stats */}
      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#5f6368" }}>
          <span style={{ fontWeight: 700, color: "#333", fontFamily: MONO }}>{deadlinesThisWeek}</span> this week
        </div>
        <div style={{ width: 1, height: 14, background: "#dadce0" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#5f6368" }}>
          <span style={{ fontWeight: 700, color: "#333", fontFamily: MONO }}>{deadlinesThisMonth}</span> this month
        </div>
        {overdueCount > 0 && <>
          <div style={{ width: 1, height: 14, background: "#dadce0" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#D50000" }}>
            <span style={{ fontWeight: 700, fontFamily: MONO }}>{overdueCount}</span> overdue
          </div>
        </>}
      </div>

      {/* Calendar body */}
      <div style={{
        flex: 1, overflow: "auto", borderRadius: 8,
        border: `1px solid ${C.line}`, background: "#fff",
      }}>
        {viewMode === "month" && <MonthView />}
        {viewMode === "week" && <WeekView />}
        {viewMode === "list" && <ListView />}
      </div>
    </div>
  );
}
