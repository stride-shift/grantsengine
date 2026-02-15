import { useMemo } from "react";
import { C, FONT, MONO } from "../theme";
import { fmt, fmtK, dL, urgC } from "../utils";
import { Num, CalendarStrip, DeadlineBadge, TypeBadge, Avatar, Label } from "./index";

export default function Dashboard({ grants, team, stages, onSelectGrant, orgName }) {
  const pipe = useMemo(() => {
    const act = grants.filter(g => !["won", "lost", "deferred"].includes(g.stage));
    const won = grants.filter(g => g.stage === "won");
    const stageValues = (stages || []).filter(s => !["won", "lost", "deferred"].includes(s.id))
      .map(s => grants.filter(g => g.stage === s.id).reduce((sum, g) => sum + (g.ask || 0), 0));
    const wonValues = won.map(g => g.ask || 0).sort((a, b) => a - b);
    const wonCum = []; let wc = 0; for (const v of wonValues) { wc += v; wonCum.push(wc); }
    return {
      act, won,
      ask: act.reduce((s, g) => s + (g.ask || 0), 0),
      wonV: won.reduce((s, g) => s + (g.ask || 0), 0),
      stages: (stages || []).map(s => ({ ...s, n: grants.filter(g => g.stage === s.id).length })),
      sparkPipeline: stageValues.length > 1 ? stageValues : null,
      sparkWon: wonCum.length > 1 ? wonCum : null,
    };
  }, [grants, stages]);

  const notifs = useMemo(() => {
    const n = [];
    grants.forEach(g => {
      if (["won", "lost", "deferred"].includes(g.stage)) return;
      const d = dL(g.deadline);
      if (d !== null && d < 0) n.push({ id: `ov-${g.id}`, ty: "urgent", gid: g.id, tx: `${g.name} \u2014 ${Math.abs(d)} days overdue` });
      else if (d !== null && d <= 7) n.push({ id: `ur-${g.id}`, ty: "urgent", gid: g.id, tx: `${g.name} \u2014 deadline in ${d} days` });
      else if (d !== null && d <= 14) n.push({ id: `sn-${g.id}`, ty: "warn", gid: g.id, tx: `${g.name} \u2014 deadline in ${d} days` });
    });
    return n;
  }, [grants]);

  const getMember = (id) => team.find(t => t.id === id) || team.find(t => t.id === "team") || { name: "Unassigned", initials: "\u2014" };

  return (
    <div style={{ padding: "32px 36px", maxWidth: 1200 }}>
      {/* Header with red accent bar */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: C.dark, marginBottom: 6, letterSpacing: -0.5 }}>{orgName || "Dashboard"}</div>
        <div style={{ width: 40, height: 4, background: C.primary, borderRadius: 2, marginBottom: 8 }} />
        <div style={{ fontSize: 14, color: C.t3, fontWeight: 400 }}>Pipeline overview {"\u00b7"} {new Date().toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
      </div>

      {/* Hero metric + standard metrics */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div style={{
          flex: 1, minWidth: 200, padding: "22px 26px",
          background: `linear-gradient(135deg, ${C.primarySoft} 0%, ${C.white} 100%)`,
          borderRadius: 16, borderLeft: `4px solid ${C.primary}`,
          boxShadow: C.cardShadow, transition: "box-shadow 0.2s ease, transform 0.2s ease",
        }}
          onMouseEnter={e => { e.currentTarget.style.boxShadow = C.cardShadowHover; e.currentTarget.style.transform = "translateY(-2px)"; }}
          onMouseLeave={e => { e.currentTarget.style.boxShadow = C.cardShadow; e.currentTarget.style.transform = "none"; }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: C.t3, marginBottom: 12, letterSpacing: 1.2, textTransform: "uppercase" }}>Active Pipeline</div>
          <div style={{ fontSize: 40, fontWeight: 800, color: C.primary, letterSpacing: -2, fontFamily: MONO, lineHeight: 1 }}>{fmt(pipe.ask)}</div>
          <div style={{ fontSize: 12, color: C.t3, marginTop: 10, fontWeight: 500 }}>{pipe.act.length} grants in progress</div>
        </div>
        <Num label="Won" value={fmt(pipe.wonV)} sub={`${pipe.won.length} grants`} color={C.ok} accent={C.ok} sparkData={pipe.sparkWon} sparkColor={C.ok} />
        <Num label="Grants" value={grants.length} sub={`${pipe.act.length} active`} accent={C.blue} />
      </div>

      {/* Calendar */}
      <CalendarStrip grants={grants} onClickGrant={onSelectGrant} C={C} />

      {/* Notifications — white bg with colored left border */}
      {notifs.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <Label>Alerts</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {notifs.slice(0, 8).map(n => (
              <div key={n.id} onClick={() => onSelectGrant(n.gid)}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
                  background: C.white,
                  borderRadius: 12, cursor: "pointer", fontSize: 13, color: C.t1,
                  borderLeft: `4px solid ${n.ty === "urgent" ? C.red : C.amber}`,
                  boxShadow: C.cardShadow,
                  transition: "transform 0.15s ease, box-shadow 0.15s ease",
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateX(4px)"; e.currentTarget.style.boxShadow = C.cardShadowHover; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = C.cardShadow; }}>
                <span style={{ fontSize: 14 }}>{n.ty === "urgent" ? "\u26a0" : "\u23f0"}</span>
                {n.tx}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stage breakdown — 3px top border in stage color */}
      <Label>Pipeline by Stage</Label>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
        {pipe.stages.filter(s => s.n > 0).map(s => (
          <div key={s.id} style={{
            padding: "14px 22px", background: C.white, borderRadius: 14,
            boxShadow: C.cardShadow, minWidth: 100, textAlign: "center",
            borderTop: `3px solid ${s.c}`,
            transition: "transform 0.15s ease, box-shadow 0.15s ease",
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = C.cardShadowHover; }}
            onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = C.cardShadow; }}
          >
            <div style={{ fontSize: 28, fontWeight: 800, color: s.c, fontFamily: MONO }}>{s.n}</div>
            <div style={{ fontSize: 11, color: C.t3, fontWeight: 600, marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Deadlines table — navy header row */}
      <Label>Upcoming Deadlines</Label>
      <div style={{ background: C.white, borderRadius: 16, overflow: "hidden", boxShadow: C.cardShadow }}>
        {/* Table header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "10px 18px",
          background: C.navy, borderRadius: "16px 16px 0 0",
        }}>
          <div style={{ width: 26 }} />
          <div style={{ flex: 1, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: 0.5, textTransform: "uppercase" }}>Grant</div>
          <div style={{ width: 90, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: 0.5, textTransform: "uppercase" }}>Type</div>
          <div style={{ width: 80, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: 0.5, textTransform: "uppercase", textAlign: "right" }}>Ask</div>
          <div style={{ width: 90, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: 0.5, textTransform: "uppercase" }}>Deadline</div>
        </div>
        {grants.filter(g => g.deadline && !["won", "lost", "deferred"].includes(g.stage))
          .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
          .slice(0, 10)
          .map((g, idx) => {
            const d = dL(g.deadline);
            const m = getMember(g.owner);
            const stg = (stages || []).find(s => s.id === g.stage);
            return (
              <div key={g.id} onClick={() => onSelectGrant(g.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 18px",
                  borderBottom: `1px solid ${C.line}`, cursor: "pointer",
                  background: idx % 2 === 1 ? C.warm100 : "transparent",
                  transition: "background 0.15s ease, padding-left 0.15s ease",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = C.hover; e.currentTarget.style.paddingLeft = "22px"; }}
                onMouseLeave={e => { e.currentTarget.style.background = idx % 2 === 1 ? C.warm100 : "transparent"; e.currentTarget.style.paddingLeft = "18px"; }}>
                <Avatar member={m} size={26} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {stg && <span style={{ width: 8, height: 8, borderRadius: "50%", background: stg.c, flexShrink: 0 }} />}
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.dark, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.name}</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.t3 }}>{g.funder}</div>
                </div>
                <TypeBadge type={g.type} />
                <div style={{ fontSize: 13, fontWeight: 600, color: C.t2, fontFamily: MONO, minWidth: 70, textAlign: "right" }}>{fmtK(g.ask)}</div>
                <DeadlineBadge d={d} deadline={g.deadline} />
              </div>
            );
          })}
      </div>
    </div>
  );
}
