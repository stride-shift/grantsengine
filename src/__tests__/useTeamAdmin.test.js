// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useTeamAdmin from "@/hooks/useTeamAdmin";
import { upsertTeamMember, deleteTeamMember, adminResetPassword } from "@/api";

vi.mock("@/api", () => ({
  upsertTeamMember: vi.fn(),
  deleteTeamMember: vi.fn(),
  adminResetPassword: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("useTeamAdmin", () => {
  it("handleAdd builds id+initials, calls upsertTeamMember, flashes, notifies, returns true", async () => {
    upsertTeamMember.mockResolvedValue({});
    const onTeamChanged = vi.fn();
    const { result } = renderHook(() => useTeamAdmin(onTeamChanged));

    let ok;
    await act(async () => {
      ok = await result.current.handleAdd({ name: "Jane Doe", email: " jane@x.co ", role: "pm" });
    });

    expect(ok).toBe(true);
    expect(upsertTeamMember).toHaveBeenCalledWith({
      id: "jane-doe", name: "Jane Doe", initials: "JD", role: "pm", email: "jane@x.co",
    });
    expect(result.current.actionMsg).toBe("Jane Doe added");
    expect(onTeamChanged).toHaveBeenCalledTimes(1);
    expect(result.current.actionBusy).toBe(false);
  });

  it("handleAdd passes email null when blank", async () => {
    upsertTeamMember.mockResolvedValue({});
    const { result } = renderHook(() => useTeamAdmin(vi.fn()));
    await act(async () => { await result.current.handleAdd({ name: "Bob", email: "  ", role: "board" }); });
    expect(upsertTeamMember).toHaveBeenCalledWith(expect.objectContaining({ email: null }));
  });

  it("handleAdd returns false and does nothing for a blank name", async () => {
    const { result } = renderHook(() => useTeamAdmin(vi.fn()));
    let ok;
    await act(async () => { ok = await result.current.handleAdd({ name: "   ", email: "", role: "pm" }); });
    expect(ok).toBe(false);
    expect(upsertTeamMember).not.toHaveBeenCalled();
  });

  it("handleAdd flashes the error and returns false when the API throws", async () => {
    upsertTeamMember.mockRejectedValue(new Error("boom"));
    const onTeamChanged = vi.fn();
    const { result } = renderHook(() => useTeamAdmin(onTeamChanged));
    let ok;
    await act(async () => { ok = await result.current.handleAdd({ name: "Jane", email: "", role: "pm" }); });
    expect(ok).toBe(false);
    expect(result.current.actionMsg).toBe("Error: boom");
    expect(onTeamChanged).not.toHaveBeenCalled();
  });

  it("handleRoleChange upserts role, closes the active action, flashes, notifies", async () => {
    upsertTeamMember.mockResolvedValue({});
    const onTeamChanged = vi.fn();
    const { result } = renderHook(() => useTeamAdmin(onTeamChanged));
    act(() => { result.current.setActiveAction({ id: "bob", mode: "edit" }); });

    await act(async () => { await result.current.handleRoleChange("bob", "board"); });

    expect(upsertTeamMember).toHaveBeenCalledWith({ id: "bob", role: "board" });
    expect(result.current.activeAction).toBe(null);
    expect(result.current.actionMsg).toBe("Role updated");
    expect(onTeamChanged).toHaveBeenCalledTimes(1);
  });

  it("handleResetPassword rejects short passwords without calling the API", async () => {
    const { result } = renderHook(() => useTeamAdmin(vi.fn()));
    act(() => { result.current.setActiveAction({ id: "bob", mode: "reset" }); });
    await act(async () => { await result.current.handleResetPassword("123"); });
    expect(adminResetPassword).not.toHaveBeenCalled();
    expect(result.current.actionMsg).toBe("Password must be 6+ characters");
  });

  it("handleResetPassword calls the API with the active member id, then closes + flashes", async () => {
    adminResetPassword.mockResolvedValue({});
    const { result } = renderHook(() => useTeamAdmin(vi.fn()));
    act(() => { result.current.setActiveAction({ id: "bob", mode: "reset" }); });
    let ok;
    await act(async () => { ok = await result.current.handleResetPassword("secret123"); });
    expect(ok).toBe(true);
    expect(adminResetPassword).toHaveBeenCalledWith("bob", "secret123");
    expect(result.current.activeAction).toBe(null);
    expect(result.current.actionMsg).toBe("Password reset");
  });

  it("handleDelete removes the member, closes, flashes, notifies", async () => {
    deleteTeamMember.mockResolvedValue({});
    const onTeamChanged = vi.fn();
    const { result } = renderHook(() => useTeamAdmin(onTeamChanged));
    act(() => { result.current.setActiveAction({ id: "bob", mode: "delete" }); });
    await act(async () => { await result.current.handleDelete("bob"); });
    expect(deleteTeamMember).toHaveBeenCalledWith("bob");
    expect(result.current.activeAction).toBe(null);
    expect(result.current.actionMsg).toBe("User removed");
    expect(onTeamChanged).toHaveBeenCalledTimes(1);
  });

  it("flash clears the message after 3s", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useTeamAdmin(vi.fn()));
    act(() => { result.current.flash("hello"); });
    expect(result.current.actionMsg).toBe("hello");
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current.actionMsg).toBe(null);
    vi.useRealTimers();
  });
});
