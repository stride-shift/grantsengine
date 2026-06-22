// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/api", () => ({
  getGcalStatus: vi.fn(),
  getGcalAuthUrl: vi.fn(),
  disconnectGcal: vi.fn(),
  syncAllToGcal: vi.fn(),
}));
import { getGcalStatus, getGcalAuthUrl, disconnectGcal, syncAllToGcal } from "@/api";
import useGcal from "@/hooks/useGcal";

describe("useGcal", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("reads connection status on mount", async () => {
    getGcalStatus.mockResolvedValue({ connected: true });
    const { result } = renderHook(() => useGcal());
    await waitFor(() => expect(result.current.connected).toBe(true));
  });

  it("swallows a status error and stays disconnected", async () => {
    getGcalStatus.mockRejectedValue(new Error("x"));
    const { result } = renderHook(() => useGcal());
    await Promise.resolve();
    expect(result.current.connected).toBe(false);
  });

  it("connect() opens the OAuth popup with the returned url", async () => {
    getGcalStatus.mockResolvedValue({ connected: false });
    getGcalAuthUrl.mockResolvedValue({ url: "http://auth/url" });
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const { result } = renderHook(() => useGcal());
    await waitFor(() => expect(getGcalStatus).toHaveBeenCalled());

    await act(async () => { await result.current.connect(); });

    expect(getGcalAuthUrl).toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalledWith("http://auth/url", "gcal-auth", "width=500,height=600");
    expect(result.current.loading).toBe(false);
    openSpy.mockRestore();
  });

  it("connect() reports a failure message", async () => {
    getGcalStatus.mockResolvedValue({ connected: false });
    getGcalAuthUrl.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useGcal());
    await waitFor(() => expect(getGcalStatus).toHaveBeenCalled());
    await act(async () => { await result.current.connect(); });
    expect(result.current.msg).toBe("Failed: boom");
    expect(result.current.loading).toBe(false);
  });

  it("disconnect() clears the connection and sets the message", async () => {
    getGcalStatus.mockResolvedValue({ connected: true });
    disconnectGcal.mockResolvedValue({});
    const { result } = renderHook(() => useGcal());
    await waitFor(() => expect(result.current.connected).toBe(true));

    await act(async () => { await result.current.disconnect(); });
    expect(disconnectGcal).toHaveBeenCalled();
    expect(result.current.connected).toBe(false);
    expect(result.current.msg).toBe("Disconnected");
  });

  it("a 'gcal-connected' postMessage flips connected and auto-syncs deadlines", async () => {
    getGcalStatus.mockResolvedValue({ connected: false });
    syncAllToGcal.mockResolvedValue({ synced: 3 });
    const { result } = renderHook(() => useGcal());
    await waitFor(() => expect(getGcalStatus).toHaveBeenCalled());

    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", { data: "gcal-connected" }));
      await Promise.resolve();
    });

    expect(result.current.connected).toBe(true);
    await waitFor(() => expect(syncAllToGcal).toHaveBeenCalled());
    await waitFor(() => expect(result.current.msg).toBe("Connected — 3 deadlines synced to your calendar"));
  });

  it("auto-sync failure shows the fallback message", async () => {
    getGcalStatus.mockResolvedValue({ connected: false });
    syncAllToGcal.mockRejectedValue(new Error("sync fail"));
    const { result } = renderHook(() => useGcal());
    await waitFor(() => expect(getGcalStatus).toHaveBeenCalled());

    await act(async () => {
      window.dispatchEvent(new MessageEvent("message", { data: "gcal-connected" }));
      await Promise.resolve();
    });

    expect(result.current.connected).toBe(true);
    await waitFor(() => expect(result.current.msg).toBe("Connected — auto-sync failed, try again later"));
  });
});
