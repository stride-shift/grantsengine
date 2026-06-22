// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import useDashboardMetrics from "@/hooks/useDashboardMetrics";

// Date helpers — keep deadline-relative classification deterministic regardless
// of when the suite runs. `dL` ceils a ms-diff to whole days, so anchoring to
// midnight + a whole-day offset keeps the day count stable.
const day = 864e5;
const isoDaysFromNow = (n) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() + n * day).toISOString().slice(0, 10);
};

const STAGES = [
  { id: "scouted", label: "Scouted", c: "#888" },
  { id: "qualifying", label: "Qualifying", c: "#888" },
  { id: "drafting", label: "Drafting", c: "#888" },
  { id: "submitted", label: "Submitted", c: "#888" },
  { id: "won", label: "Won", c: "#888" },
  { id: "lost", label: "Lost", c: "#888" },
];

const TEAM = [{ id: "t1", name: "Alison" }];

// 7 grants — past the 3-grant (ana) and 2-grant (funders) thresholds.
const GRANTS = [
  { id: "g1", funder: "Acme",     type: "Foundation", stage: "won",        ask: 500000, owner: "t1", deadline: isoDaysFromNow(60), rel: "Previous Funder", focus: ["Skills"], on: "Strong relationship, Clear impact" },
  { id: "g2", funder: "Acme",     type: "Foundation", stage: "lost",       ask: 300000, owner: "t1", deadline: isoDaysFromNow(60), rel: "Previous Funder", focus: ["Skills"], of: [["Budget too high"]] },
  { id: "g3", funder: "Acme",     type: "Foundation", stage: "qualifying", ask: 200000, owner: "t1", deadline: isoDaysFromNow(60), rel: "Warm Intro",      focus: ["Skills"] },
  { id: "g4", funder: "Beta Corp", type: "Corporate",  stage: "submitted",  ask: 1000000, owner: "t1", deadline: isoDaysFromNow(60), rel: "New" },
  { id: "g5", funder: "Beta Corp", type: "Corporate",  stage: "drafting",   ask: 400000, owner: "t1", deadline: isoDaysFromNow(-5) }, // missed → urgent (sev 0)
  { id: "g6", funder: "Gamma",    type: "Foundation", stage: "qualifying", ask: 0,      owner: "t1" },                                // no deadline → urgent (sev 3)
  { id: "g7", funder: "Delta",    type: "Foundation", stage: "qualifying", ask: 100000, owner: "team", deadline: isoDaysFromNow(60) }, // unassigned → urgent (sev 4)
];

const render = () => renderHook(() => useDashboardMetrics({ grants: GRANTS, team: TEAM, stages: STAGES }));

describe("useDashboardMetrics", () => {
  it("computes pipeline totals, won value, and weighted value", () => {
    const { pipe } = render().result.current;
    // Active = anything not won/lost/deferred/archived: g3,g4,g5,g6,g7
    expect(pipe.act.map((g) => g.id)).toEqual(["g3", "g4", "g5", "g6", "g7"]);
    // Active ask total: 200k + 1M + 400k + 0 + 100k
    expect(pipe.ask).toBe(1700000);
    // Won list + value
    expect(pipe.won.map((g) => g.id)).toEqual(["g1"]);
    expect(pipe.wonV).toBe(500000);
    expect(pipe.lost.map((g) => g.id)).toEqual(["g2"]);
    // Weighted: qual .15*200k + sub .6*1M + draft .3*400k + qual .15*0 + qual .15*100k
    expect(pipe.weightedVal).toBe(765000);
  });

  it("computes win rate from closed outcomes (1W / 1L = 50%)", () => {
    const { pipe, ana } = render().result.current;
    expect(pipe.closed).toBe(2);
    expect(pipe.winRate).toBe(50);
    expect(ana.wr).toBe(50);
  });

  it("aggregates per-funder intelligence (Acme: 3 grants, 1W/1L, R1M)", () => {
    const { funders } = render().result.current;
    const acme = funders.find((f) => f.name === "Acme");
    expect(acme).toBeTruthy();
    expect(acme.grants).toHaveLength(3);
    expect(acme.won).toBe(1);
    expect(acme.lost).toBe(1);
    expect(acme.active).toBe(1);
    expect(acme.totalAsk).toBe(1000000); // 500k + 300k + 200k
    expect(acme.wonVal).toBe(500000);
    // Funders never include the "Unknown" bucket
    expect(funders.every((f) => f.name !== "Unknown")).toBe(true);
  });

  it("classifies + orders urgent items (missed → no-deadline → unassigned)", () => {
    const { urgentGrants } = render().result.current;
    const byId = Object.fromEntries(urgentGrants.map((i) => [i.g.id, i]));

    // g5: drafting with a past deadline → missed → severity 0, reason "…overdue"
    expect(byId.g5.severity).toBe(0);
    expect(byId.g5.reason).toMatch(/overdue$/);

    // g6: active, no deadline → severity 3
    expect(byId.g6.severity).toBe(3);
    expect(byId.g6.reason).toBe("No deadline set");

    // g7: active, owner "team", far-future deadline → unassigned, severity 4
    expect(byId.g7.severity).toBe(4);
    expect(byId.g7.reason).toBe("Unassigned");

    // Sorted ascending by severity
    const severities = urgentGrants.map((i) => i.severity);
    expect([...severities].sort((a, b) => a - b)).toEqual(severities);
    expect(urgentGrants).toHaveLength(3);
  });

  it("builds teamById once and resolves owner names in workload", () => {
    const { teamById, ana } = render().result.current;
    expect(teamById.get("t1").name).toBe("Alison");
    // Active grants owned by Alison (t1): g3, g4, g5, g6. g7 is owner "team" → Unassigned.
    const alison = ana.workload.find((w) => w.label === "Alison");
    expect(alison.value).toBe(4); // g3, g4, g5, g6
    const unassigned = ana.workload.find((w) => w.label === "Unassigned");
    expect(unassigned.value).toBe(1); // g7 (owner "team")
  });

  it("returns ana=null below 3 grants and funders=[] below 2", () => {
    const one = renderHook(() => useDashboardMetrics({ grants: [GRANTS[0]], team: TEAM, stages: STAGES }));
    expect(one.result.current.ana).toBe(null);
    expect(one.result.current.funders).toEqual([]);
  });
});
