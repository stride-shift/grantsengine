import { describe, it, expect } from "vitest";
import { planEmailBackfill } from "../../server/lib/emailBackfill.js";

const members = [
  { id: "alison", org_id: "o1", name: "Alison", email: "alison@d-lab.co.za" }, // already set
  { id: "david", org_id: "o1", name: "David", email: "" },                      // no email
  { id: "barbara", org_id: "o1", name: "Barbara", email: null },                // no email
];

describe("planEmailBackfill", () => {
  it("plans valid assignments and leaves the rest to apply", () => {
    const plan = planEmailBackfill(members, {
      david: "david@d-lab.co.za",
      barbara: "barbara@d-lab.co.za",
    });
    expect(plan.apply).toEqual([
      { id: "david", email: "david@d-lab.co.za", orgId: "o1" },
      { id: "barbara", email: "barbara@d-lab.co.za", orgId: "o1" },
    ]);
    expect(plan.missing).toEqual([]); // everyone has/gets an email
  });

  it("flags a collision with an email already used by another member", () => {
    const plan = planEmailBackfill(members, { david: "ALISON@d-lab.co.za" }); // case-insensitive
    expect(plan.apply).toEqual([]);
    expect(plan.collisions).toEqual([
      { id: "david", email: "ALISON@d-lab.co.za", conflictsWith: "alison" },
    ]);
  });

  it("flags a collision between two entries in the same map", () => {
    const plan = planEmailBackfill(members, {
      david: "shared@d-lab.co.za",
      barbara: "shared@d-lab.co.za",
    });
    expect(plan.apply.map((a) => a.id)).toEqual(["david"]); // first wins
    expect(plan.collisions.map((c) => c.id)).toEqual(["barbara"]);
  });

  it("rejects invalid emails and unknown members", () => {
    const plan = planEmailBackfill(members, { david: "not-an-email", ghost: "g@x.com" });
    expect(plan.apply).toEqual([]);
    expect(plan.invalid).toEqual([
      { id: "david", email: "not-an-email", reason: "invalid email format" },
      { id: "ghost", email: "g@x.com", reason: "no such member" },
    ]);
  });

  it("skips assignments that match the member's current email", () => {
    const plan = planEmailBackfill(members, { alison: "alison@d-lab.co.za" });
    expect(plan.apply).toEqual([]);
    expect(plan.skipped).toEqual([{ id: "alison", email: "alison@d-lab.co.za", reason: "already set" }]);
  });

  it("reports who would still lack an email with no map", () => {
    const plan = planEmailBackfill(members, {});
    expect(plan.missing.map((m) => m.id)).toEqual(["david", "barbara"]);
  });
});
