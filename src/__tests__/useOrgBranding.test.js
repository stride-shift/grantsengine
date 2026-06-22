// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/api", () => ({
  uploadOrgLogo: vi.fn(),
}));
vi.mock("@/theme", () => ({
  resetTheme: vi.fn(),
}));
import { uploadOrgLogo } from "@/api";
import { resetTheme } from "@/theme";
import useOrgBranding from "@/hooks/useOrgBranding";

const DEFAULT_PRIMARY = "#4A7C59";
const DEFAULT_ACCENT = "#C17817";

describe("useOrgBranding", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("seeds colours from the org, falling back to theme defaults", () => {
    const { result } = renderHook(() => useOrgBranding({ primary_color: "#111111" }, vi.fn()));
    expect(result.current.primary).toBe("#111111");
    expect(result.current.accent).toBe(DEFAULT_ACCENT);
  });

  it("re-seeds colour atoms when the org's stored colours change", () => {
    const { result, rerender } = renderHook(
      ({ org }) => useOrgBranding(org, vi.fn()),
      { initialProps: { org: { primary_color: null, accent_color: null } } }
    );
    expect(result.current.primary).toBe(DEFAULT_PRIMARY);
    rerender({ org: { primary_color: "#222222", accent_color: "#333333" } });
    expect(result.current.primary).toBe("#222222");
    expect(result.current.accent).toBe("#333333");
  });

  it("saveBrandColors persists, nulling defaults and primary_dark, then flashes ✓ Saved", async () => {
    vi.useFakeTimers();
    const onUpdateOrg = vi.fn().mockResolvedValue({});
    const { result } = renderHook(() => useOrgBranding({}, onUpdateOrg));

    act(() => { result.current.setPrimary("#abcdef"); }); // non-default kept
    await act(async () => { await result.current.saveBrandColors(); });

    expect(onUpdateOrg).toHaveBeenCalledWith({
      primary_color: "#abcdef",
      primary_dark: null,
      accent_color: null, // left at default → nulled
    });
    expect(result.current.msg).toBe("✓ Saved");
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.msg).toBe("");
    vi.useRealTimers();
  });

  it("saveBrandColors reports a failure message and clears saving", async () => {
    const onUpdateOrg = vi.fn().mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() => useOrgBranding({}, onUpdateOrg));
    await act(async () => { await result.current.saveBrandColors(); });
    expect(result.current.msg).toBe("Failed: nope");
    expect(result.current.saving).toBe(false);
  });

  it("resetBrandColors snaps to defaults, persists all-null, resets theme", async () => {
    vi.useFakeTimers();
    const onUpdateOrg = vi.fn().mockResolvedValue({});
    const { result } = renderHook(() => useOrgBranding({ primary_color: "#000", accent_color: "#fff" }, onUpdateOrg));
    await act(async () => { await result.current.resetBrandColors(); });

    expect(result.current.primary).toBe(DEFAULT_PRIMARY);
    expect(result.current.accent).toBe(DEFAULT_ACCENT);
    expect(onUpdateOrg).toHaveBeenCalledWith({ primary_color: null, primary_dark: null, accent_color: null });
    expect(resetTheme).toHaveBeenCalledTimes(1);
    expect(result.current.msg).toBe("✓ Reset to defaults");
    act(() => { vi.advanceTimersByTime(2000); });
    expect(result.current.msg).toBe("");
    vi.useRealTimers();
  });

  it("handleLogoUpload uploads, persists the logo_url, and clears the input", async () => {
    uploadOrgLogo.mockResolvedValue({ logo_url: "http://x/logo.png" });
    const onUpdateOrg = vi.fn().mockResolvedValue({});
    const { result } = renderHook(() => useOrgBranding({}, onUpdateOrg));

    const file = { name: "logo.png" };
    const target = { files: [file], value: "logo.png" };
    await act(async () => { await result.current.handleLogoUpload({ target }); });

    expect(uploadOrgLogo).toHaveBeenCalledWith(file);
    expect(onUpdateOrg).toHaveBeenCalledWith({ logo_url: "http://x/logo.png" });
    expect(target.value).toBe("");
    await waitFor(() => expect(result.current.logoUploading).toBe(false));
  });

  it("handleLogoUpload no-ops with no file selected", async () => {
    const onUpdateOrg = vi.fn();
    const { result } = renderHook(() => useOrgBranding({}, onUpdateOrg));
    await act(async () => { await result.current.handleLogoUpload({ target: { files: [] } }); });
    expect(uploadOrgLogo).not.toHaveBeenCalled();
    expect(onUpdateOrg).not.toHaveBeenCalled();
  });
});
