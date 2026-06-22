// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

vi.mock("@/api", () => ({
  getOrgs: vi.fn(),
  createNewOrg: vi.fn(),
  deleteOrg: vi.fn(),
}));
import { getOrgs, createNewOrg, deleteOrg } from "@/api";
import useOrgSelector from "@/hooks/useOrgSelector";

const ORGS = [
  { id: "1", name: "d-lab", slug: "dlab" },
  { id: "2", name: "StrideShift", slug: "strideshift" },
];

describe("useOrgSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOrgs.mockResolvedValue(ORGS);
  });

  it("loads the org list on mount and clears loading", async () => {
    const { result } = renderHook(() => useOrgSelector(vi.fn()));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(getOrgs).toHaveBeenCalledTimes(1);
    expect(result.current.orgs).toEqual(ORGS);
  });

  it("clears loading even when the list load fails", async () => {
    getOrgs.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useOrgSelector(vi.fn()));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.orgs).toEqual([]);
  });

  it("autoSlug derives a clean slug from the name", async () => {
    const { result } = renderHook(() => useOrgSelector(vi.fn()));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.autoSlug("My New Org!"));
    expect(result.current.name).toBe("My New Org!");
    expect(result.current.slug).toBe("my-new-org");
  });

  it("setSlug strips invalid characters", async () => {
    const { result } = renderHook(() => useOrgSelector(vi.fn()));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setSlug("Foo Bar_123!"));
    expect(result.current.slug).toBe("foobar123");
  });

  it("handleCreateClick requires name + slug (no-op when missing)", async () => {
    const { result } = renderHook(() => useOrgSelector(vi.fn()));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.handleCreateClick());
    expect(result.current.logoStep).toBe(false);
    expect(result.current.err).toBe("");
  });

  it("handleCreateClick errors when admin key is missing", async () => {
    const { result } = renderHook(() => useOrgSelector(vi.fn()));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.autoSlug("Acme"));
    act(() => result.current.handleCreateClick());
    expect(result.current.logoStep).toBe(false);
    expect(result.current.err).toMatch(/admin key is required/i);
  });

  it("handleCreateClick advances to the logo step when valid", async () => {
    const { result } = renderHook(() => useOrgSelector(vi.fn()));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.autoSlug("Acme"));
    act(() => result.current.setAdminKey("secret"));
    act(() => result.current.handleCreateClick());
    expect(result.current.logoStep).toBe(true);
  });

  it("doCreate POSTs name/slug/website + adminKey, omits logo_url when none, and calls onSelect", async () => {
    const onSelect = vi.fn();
    createNewOrg.mockResolvedValue({ slug: "acme" });
    const { result } = renderHook(() => useOrgSelector(onSelect));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.autoSlug("Acme"));
    act(() => { result.current.setWebsite("https://acme.test"); result.current.setAdminKey("secret"); });
    await act(async () => { await result.current.doCreate(null); });

    expect(createNewOrg).toHaveBeenCalledTimes(1);
    const [payload, key] = createNewOrg.mock.calls[0];
    expect(payload).toEqual({ name: "Acme", slug: "acme", website: "https://acme.test" });
    expect(payload.logo_url).toBeUndefined();
    expect(key).toBe("secret");
    expect(onSelect).toHaveBeenCalledWith("acme", true);
  });

  it("doCreate includes logo_url in the payload when supplied", async () => {
    createNewOrg.mockResolvedValue({ slug: "acme" });
    const { result } = renderHook(() => useOrgSelector(vi.fn()));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.autoSlug("Acme"));
    act(() => result.current.setAdminKey("secret"));
    await act(async () => { await result.current.doCreate("data:image/png;base64,xxx"); });
    expect(createNewOrg.mock.calls[0][0].logo_url).toBe("data:image/png;base64,xxx");
  });

  it("doCreate surfaces the error and exits the logo step on failure", async () => {
    const onSelect = vi.fn();
    createNewOrg.mockRejectedValue(new Error("Slug already taken"));
    const { result } = renderHook(() => useOrgSelector(onSelect));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.autoSlug("Acme"));
    act(() => result.current.setAdminKey("secret"));
    act(() => result.current.handleCreateClick());
    expect(result.current.logoStep).toBe(true);
    await act(async () => { await result.current.doCreate(null); });
    expect(onSelect).not.toHaveBeenCalled();
    expect(result.current.err).toBe("Slug already taken");
    expect(result.current.logoStep).toBe(false);
  });

  it("doDelete is a no-op until the confirm slug matches the target", async () => {
    const { result } = renderHook(() => useOrgSelector(vi.fn()));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setAdminKey("secret"));
    act(() => result.current.openDelete(ORGS[1]));
    expect(result.current.deleteTarget).toEqual(ORGS[1]);
    await act(async () => { await result.current.doDelete(); });
    expect(deleteOrg).not.toHaveBeenCalled();
  });

  it("doDelete DELETEs with slug + adminKey and removes the org from the list", async () => {
    deleteOrg.mockResolvedValue({});
    const { result } = renderHook(() => useOrgSelector(vi.fn()));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setAdminKey("secret"));
    act(() => result.current.openDelete(ORGS[1]));
    act(() => result.current.setConfirmSlug("strideshift"));
    await act(async () => { await result.current.doDelete(); });

    expect(deleteOrg).toHaveBeenCalledWith("strideshift", "secret");
    expect(result.current.orgs).toEqual([ORGS[0]]);
    expect(result.current.deleteTarget).toBe(null);
    expect(result.current.confirmSlug).toBe("");
  });

  it("doDelete surfaces a delete error and keeps the target open", async () => {
    deleteOrg.mockRejectedValue(new Error("Cannot delete"));
    const { result } = renderHook(() => useOrgSelector(vi.fn()));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.setAdminKey("secret"));
    act(() => result.current.openDelete(ORGS[1]));
    act(() => result.current.setConfirmSlug("strideshift"));
    await act(async () => { await result.current.doDelete(); });
    expect(result.current.deleteErr).toBe("Cannot delete");
    expect(result.current.deleteTarget).toEqual(ORGS[1]);
    expect(result.current.orgs).toEqual(ORGS);
  });

  it("exitAdmin turns off admin mode and clears the key", async () => {
    const { result } = renderHook(() => useOrgSelector(vi.fn()));
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => { result.current.setAdminMode(true); result.current.setAdminKey("secret"); });
    act(() => result.current.exitAdmin());
    expect(result.current.adminMode).toBe(false);
    expect(result.current.adminKey).toBe("");
  });
});
