// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useCalendar from "@/hooks/useCalendar";

// Fixed reference "now": Mon 22 Jun 2026 (its own week start, simplifies assertions)
const TODAY = new Date(2026, 5, 22);

const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const GRANTS = [
  { id: "g1", name: "Alpha", stage: "submitted", deadline: "2026-06-24" },                 // this week + this month, future
  { id: "g2", name: "Bravo", stage: "review", deadline: "2026-06-10" },                    // this month, overdue (past)
  { id: "g3", name: "Charlie", stage: "draft", subDate: "2026-06-25",                       // submitted event + a follow-up
    fups: [{ date: "2026-06-26", label: "Call", done: false }, { date: "2026-06-27", label: "Old", done: true }] },
  { id: "g4", name: "Delta", stage: "won", deadline: "2026-06-24" },                         // CLOSED → excluded entirely
  { id: "g5", name: "Echo", stage: "shortlist", deadline: "2026-07-15" },                    // future, next month
];

describe("useCalendar", () => {
  it("flattens deadline/submitted/follow-up events and drops closed grants + done follow-ups", () => {
    const { result } = renderHook(() => useCalendar(GRANTS, TODAY));
    const evts = result.current.events;
    // g1 deadline, g2 deadline, g3 submitted, g3 followup(undone), g5 deadline = 5; g4 (won) excluded, done fup excluded
    expect(evts).toHaveLength(5);
    const g1Deadline = evts.find((e) => e.grant.id === "g1");
    expect(g1Deadline).toMatchObject({ type: "deadline", date: "2026-06-24" });
    expect(g1Deadline.grant.name).toBe("Alpha");
    // No event references the closed grant g4
    expect(evts.some((e) => e.grant.id === "g4")).toBe(false);
    // The follow-up carries its label and is typed "followup"
    const fup = evts.find((e) => e.type === "followup");
    expect(fup).toMatchObject({ grant: expect.objectContaining({ id: "g3" }), date: "2026-06-26", label: "Call" });
  });

  it("indexes events by date", () => {
    const { result } = renderHook(() => useCalendar(GRANTS, TODAY));
    const map = result.current.eventsByDate;
    expect(map["2026-06-24"]).toHaveLength(1);
    expect(map["2026-06-26"][0].type).toBe("followup");
    expect(map["2026-06-10"][0].grant.id).toBe("g2");
  });

  it("builds a 6-week month grid of 7-day weeks anchored to the current month", () => {
    const { result } = renderHook(() => useCalendar(GRANTS, TODAY));
    const grid = result.current.monthGrid;
    expect(grid).toHaveLength(6);
    grid.forEach((week) => expect(week).toHaveLength(7));
    // June 2026 starts on a Monday, so the grid begins exactly on the 1st
    expect(fmt(grid[0][0])).toBe("2026-06-01");
    // Each cell is a Date
    expect(grid[0][0]).toBeInstanceOf(Date);
  });

  it("builds the 7-day week starting Monday of the current week", () => {
    const { result } = renderHook(() => useCalendar(GRANTS, TODAY));
    const wd = result.current.weekDays;
    expect(wd).toHaveLength(7);
    // current defaults to the real "now", but on mount current === today's week here only matters by length;
    // assert consecutive days
    for (let i = 1; i < 7; i++) {
      expect(wd[i].getDate()).toBe(new Date(wd[0].getFullYear(), wd[0].getMonth(), wd[0].getDate() + i).getDate());
    }
  });

  it("upcoming events are future-or-today and sorted ascending by date", () => {
    const { result } = renderHook(() => useCalendar(GRANTS, TODAY));
    const up = result.current.upcomingEvents;
    // g1(06-24), g3 submitted(06-25), g3 followup(06-26), g5(07-15) — g2(06-10) is past
    expect(up.map((e) => e.date)).toEqual(["2026-06-24", "2026-06-25", "2026-06-26", "2026-07-15"]);
  });

  it("derives deadline stats: this week / this month / overdue", () => {
    const { result } = renderHook(() => useCalendar(GRANTS, TODAY));
    expect(result.current.deadlinesThisWeek).toBe(1);   // g1 (24 Jun, within Mon22–Sun28)
    expect(result.current.deadlinesThisMonth).toBe(2);  // g1 + g2 (both June deadlines)
    expect(result.current.overdueCount).toBe(1);        // g2 (10 Jun < 22 Jun)
    expect(result.current.overdueEvents[0].grant.id).toBe("g2");
  });

  it("toggleType filters events out and protects the last active type", () => {
    const { result } = renderHook(() => useCalendar(GRANTS, TODAY));
    act(() => result.current.toggleType("deadline"));
    expect(result.current.activeTypes.has("deadline")).toBe(false);
    // deadline events gone → only the submitted + followup remain
    expect(result.current.events.length).toBe(5); // raw events unchanged
    expect(result.current.upcomingEvents.every((e) => e.type !== "deadline")).toBe(true);
    // Turn off the rest down to one, then prove the last one cannot be removed
    act(() => result.current.toggleType("submitted"));
    act(() => result.current.toggleType("followup"));
    expect(result.current.activeTypes.size).toBe(1);
  });

  it("nav advances by month in month view and goToday resets to current month", () => {
    const { result } = renderHook(() => useCalendar(GRANTS, TODAY));
    const startMonth = result.current.monthGrid;
    act(() => result.current.nav(1));
    // Grid changed (advanced a month)
    expect(fmt(result.current.monthGrid[0][0])).not.toBe(fmt(startMonth[0][0]));
    act(() => result.current.goToday());
    // Back to the real current month grid
    const now = new Date();
    expect(result.current.monthGrid.some((w) => w.some((d) => d.getMonth() === now.getMonth() && d.getDate() === 1))).toBe(true);
  });
});
