// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useRouting from "@/hooks/useRouting";

beforeEach(() => { window.history.pushState({}, "", "/"); });

describe("useRouting", () => {
  it("defaults to the dashboard view with no selection", () => {
    const { result } = renderHook(() => useRouting({ orgSlug: "dlab", authed: true }));
    expect(result.current.view).toBe("dashboard");
    expect(result.current.sel).toBe(null);
    expect(window.location.pathname).toBe("/org/dlab");
  });

  it("syncs the URL when the view changes", () => {
    const { result } = renderHook(() => useRouting({ orgSlug: "dlab", authed: true }));
    act(() => result.current.setView("pipeline"));
    expect(window.location.pathname).toBe("/org/dlab/pipeline");
  });

  it("syncs a grant-detail URL when a grant is selected", () => {
    const { result } = renderHook(() => useRouting({ orgSlug: "dlab", authed: true }));
    act(() => result.current.setSel("g5"));
    expect(window.location.pathname).toBe("/org/dlab/grant/g5");
  });

  it("does not touch the URL when not authed", () => {
    window.history.pushState({}, "", "/landing");
    renderHook(() => useRouting({ orgSlug: "dlab", authed: false }));
    expect(window.location.pathname).toBe("/landing");
  });

  it("responds to popstate by selecting the grant in the URL", () => {
    const { result } = renderHook(() => useRouting({ orgSlug: "dlab", authed: true }));
    act(() => {
      window.history.pushState({}, "", "/org/dlab/grant/g7");
      window.dispatchEvent(new Event("popstate"));
    });
    expect(result.current.sel).toBe("g7");
  });

  it("ignores popstate for a different org", () => {
    const { result } = renderHook(() => useRouting({ orgSlug: "dlab", authed: true }));
    act(() => {
      window.history.pushState({}, "", "/org/other/funders");
      window.dispatchEvent(new Event("popstate"));
    });
    expect(result.current.view).toBe("dashboard"); // unchanged
    expect(result.current.sel).toBe(null);
  });
});
