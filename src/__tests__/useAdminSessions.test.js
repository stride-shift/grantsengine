// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import useAdminSessions from "@/hooks/useAdminSessions";
import { getAdminSessions, getAdminSessionHistory, getAdminActivity } from "@/api";

vi.mock("@/api", () => ({
  getAdminSessions: vi.fn(),
  getAdminSessionHistory: vi.fn(),
  getAdminActivity: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  getAdminSessions.mockResolvedValue([{ member_id: "a" }]);
  getAdminSessionHistory.mockResolvedValue([{ member_id: "a", duration_mins: 10 }]);
  getAdminActivity.mockResolvedValue([{ event: "login", member_id: "a" }]);
});

afterEach(() => { vi.useRealTimers(); });

describe("useAdminSessions", () => {
  it("loads sessions, history (30) and activity (null filter, 100) on mount", async () => {
    const { result } = renderHook(() => useAdminSessions());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getAdminSessionHistory).toHaveBeenCalledWith(30);
    expect(getAdminActivity).toHaveBeenCalledWith(null, 100);
    expect(result.current.activeSessions).toEqual([{ member_id: "a" }]);
    expect(result.current.sessionHistory).toHaveLength(1);
    expect(result.current.activity).toHaveLength(1);
  });

  it("refetches activity with the new filter when filterMember changes", async () => {
    const { result } = renderHook(() => useAdminSessions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    getAdminActivity.mockClear();

    act(() => { result.current.setFilterMember("bob"); });
    await waitFor(() => expect(getAdminActivity).toHaveBeenCalledWith("bob", 100));
  });

  it("polls getAdminSessions every 30s, updating only active sessions", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAdminSessions());
    // flush the initial load
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(getAdminSessions).toHaveBeenCalledTimes(1);

    getAdminSessions.mockResolvedValue([{ member_id: "a" }, { member_id: "b" }]);
    await act(async () => { vi.advanceTimersByTime(30000); });
    await act(async () => { await Promise.resolve(); });

    expect(getAdminSessions).toHaveBeenCalledTimes(2);
    // history/activity are NOT re-fetched by the interval
    expect(getAdminSessionHistory).toHaveBeenCalledTimes(1);
    expect(result.current.activeSessions).toHaveLength(2);
  });

  it("clears the interval on unmount (no further polling)", async () => {
    vi.useFakeTimers();
    const { unmount } = renderHook(() => useAdminSessions());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(getAdminSessions).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => { vi.advanceTimersByTime(60000); });
    expect(getAdminSessions).toHaveBeenCalledTimes(1);
  });

  it("still clears loading when the initial load throws", async () => {
    getAdminSessions.mockRejectedValue(new Error("net"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useAdminSessions());
    await waitFor(() => expect(result.current.loading).toBe(false));
    spy.mockRestore();
  });
});
