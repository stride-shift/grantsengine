// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { loginWithEmail } from "@/api";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("loginWithEmail", () => {
  it("POSTs email+password to /api/auth/login and stores token+slug+member on success", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: "t1", slug: "dlab", member: { id: "alison", name: "Alison" } }),
    });

    const data = await loginWithEmail("alison@d-lab.co.za", "pw");

    expect(global.fetch).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ email: "alison@d-lab.co.za", password: "pw" });
    expect(data.slug).toBe("dlab");
    expect(localStorage.getItem("gt_token")).toBe("t1");
    expect(localStorage.getItem("gt_slug")).toBe("dlab");
    expect(JSON.parse(localStorage.getItem("gt_member"))).toEqual({ id: "alison", name: "Alison" });
  });

  it("falls back to org.slug when the response has no top-level slug", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ token: "t2", org: { slug: "acme" }, member: { id: "m" } }),
    });
    const data = await loginWithEmail("x@y.com", "pw");
    expect(data.token).toBe("t2");
    expect(localStorage.getItem("gt_slug")).toBe("acme");
  });

  it("throws the server error message on failure", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Invalid email or password" }),
    });
    await expect(loginWithEmail("a@x.com", "bad")).rejects.toThrow("Invalid email or password");
    expect(localStorage.getItem("gt_token")).toBe(null);
  });
});
