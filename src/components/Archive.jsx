import { useState, useMemo } from "react";
import { C, FONT, MONO } from "../theme";
import { CLOSED_STAGES } from "../data/constants";

/* Closed proposals archive.
 *
 * Pipeline already supports filtering by stage, but Won/Lost/Deferred/Archived
 * grants tend to drown in the live view. This is a dedicated browser for
 * past proposals — sorted by closure date, grouped by outcome, searchable.
 * Doubles as the "Proposal Library" the team can mine for AI reference picks.
 */

export default function Archive({ grants, team, stages, onSelectGrant }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all"); // all | won | lost | deferred | archived

  const closed = useMemo(() => grants.filter(g => CLOSED_STAGES.includes(g.stage)), [grants]);

  const counts = useMemo(() => {
    const c = { all: closed.length, won: 0, lost: 0, deferred: 0, archived: 0 };
    for (const g of closed) c[g.stage] = (c[g.stage] || 0) + 1;
    return c;
  }, [closed]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return closed
      .filter(g => filter === "all" || g.stage === filter)
      .filter(g => {
        if (!query) return true;
        const hay = `${g.funder || ""} ${g.name || ""} ${g.type || ""} ${g.notes || ""} ${g.funderFeedback || ""}`.toLowerCase();
        return hay.includes(query);
      })
      .sort((a, b) => {
        // Most recently closed first — use deadline as a proxy if no closeDate
        const da = a.closedAt || a.deadline || a.createdAt || 0;
        const db = b.closedAt || b.deadline || b.createdAt || 0;
        return new Date(db).getTime() - new Date(da).getTime();
      });
  }, [closed, filter, q]);

  const winRate = useMemo(() => {
    const decided = closed.filter(g => g.stage === "won" || g.stage === "lost").length;
    if (decided === 0) return null;
    return Math.round((counts.won / decided) * 100);
  }, [closed, counts]);

  const totalRaised = useMemo(() => closed
    .filter(g => g.stage === "won")
    .reduce((sum, g) => sum + (Number(g.ask) || 0), 0), [closed]);

  return (
    <div style={{ padding: "24px 32px", fontFamily: FONT, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.dark, letterSpacing: -0.4 }}>Proposal archive</div>
        <div style={{ fontSize: 13, color: C.t3, marginTop: 4, lineHeight: 1.5 }}>
          Every closed proposal, searchable. Mine wins for reusable language; mine losses for what to avoid.
        </div>
      </div>

      {/* Summary stats */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
        gap: 10, marginBottom: 18,
      }}>
        <StatTile label="Total closed" value={counts.all} />
        <StatTile label="Won" value={counts.won} accent={C.ok} />
        <StatTile label="Lost" value={counts.lost} accent={C.red} />
        {winRate !== null && <StatTile label="Win rate" value={`${winRate}%`} accent={winRate >= 50 ? C.ok : C.amber} />}
        {totalRaised > 0 && <StatTile label="Total raised" value={`R${(totalRaised / 1000000).toFixed(1)}M`} accent={C.ok} mono />}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 14 }}>
        <input
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search archive…"
          style={{
            padding: "7px 12px", fontSize: 13, border: `1px solid ${C.line}`,
            borderRadius: 8, fontFamily: FONT, outline: "none", flex: "1 1 220px", maxWidth: 320,
          }}
        />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="All" count={counts.all} />
          <FilterChip active={filter === "won"} onClick={() => setFilter("won")} label="Won" count={counts.won} accent={C.ok} />
          <FilterChip active={filter === "lost"} onClick={() => setFilter("lost")} label="Lost" count={counts.lost} accent={C.red} />
          <FilterChip active={filter === "deferred"} onClick={() => setFilter("deferred")} label="Deferred" count={counts.deferred} />
          <FilterChip active={filter === "archived"} onClick={() => setFilter("archived")} label="Not relevant" count={counts.archived} />
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: C.t4, fontSize: 13 }}>
          {q ? `No archived proposals match "${q}".` : "No closed proposals yet."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map(g => <ArchiveRow key={g.id} grant={g} team={team} stages={stages} onClick={() => onSelectGrant(g.id)} />)}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, accent, mono }) {
  return (
    <div style={{
      background: C.white, border: `1px solid ${C.line}`, borderRadius: 10,
      padding: "10px 14px",
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.t4, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent || C.dark, fontFamily: mono ? MONO : FONT, lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

function FilterChip({ active, onClick, label, count, accent }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 12px", fontSize: 11, fontWeight: 600,
      borderRadius: 100, border: `1px solid ${active ? (accent || C.primary) : C.line}`,
      background: active ? (accent || C.primary) : C.white, color: active ? C.white : C.t2,
      cursor: "pointer", fontFamily: FONT,
      display: "inline-flex", alignItems: "center", gap: 6,
    }}>
      {label}
      <span style={{
        fontSize: 10, fontWeight: 700,
        padding: "1px 6px", borderRadius: 100,
        background: active ? "rgba(255,255,255,0.2)" : C.warm100,
        color: active ? C.white : C.t3,
      }}>{count}</span>
    </button>
  );
}

function ArchiveRow({ grant: g, team, stages, onClick }) {
  const stg = stages.find(s => s.id === g.stage);
  const owner = team.find(t => t.id === g.owner);
  const dateStr = g.closedAt || g.deadline;
  const dateLabel = dateStr ? new Date(dateStr).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "—";
  const hasDraft = !!g.aiDraft || !!(g.aiSections && Object.keys(g.aiSections).length > 0);

  return (
    <button onClick={onClick} style={{
      width: "100%", textAlign: "left", padding: "10px 14px",
      background: C.white, border: `1px solid ${C.line}`, borderRadius: 8,
      cursor: "pointer", fontFamily: FONT,
      display: "flex", alignItems: "center", gap: 12,
      transition: "border-color 150ms ease, background 150ms ease",
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = `${stg?.c || C.primary}40`; e.currentTarget.style.background = "#fafbfb"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.background = C.white; }}
    >
      <span style={{
        width: 56, fontSize: 10, fontWeight: 700, color: stg?.c || C.t3,
        textTransform: "uppercase", letterSpacing: 0.5, flexShrink: 0,
      }}>{stg?.label || g.stage}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.funder || "(no funder)"}</div>
        <div style={{ fontSize: 11, color: C.t3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name || "Untitled"}</div>
      </div>
      <span style={{ fontSize: 11, fontFamily: MONO, color: g.ask > 0 ? C.dark : C.t4, fontWeight: 600, flexShrink: 0, width: 90, textAlign: "right" }}>
        {g.ask > 0 ? `R${(g.ask / 1000).toFixed(0)}k` : "—"}
      </span>
      {hasDraft && (
        <span title="Has draft text — usable as AI reference" style={{
          fontSize: 9, fontWeight: 700, color: C.primary, background: `${C.primary}15`,
          padding: "2px 6px", borderRadius: 100, letterSpacing: 0.3, textTransform: "uppercase",
          flexShrink: 0,
        }}>Draft</span>
      )}
      <span style={{ fontSize: 11, color: C.t3, flexShrink: 0, width: 100, textAlign: "right" }}>{dateLabel}</span>
      {owner && <span style={{
        width: 22, height: 22, borderRadius: "50%", background: owner.c || C.t3,
        color: C.white, display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontSize: 9, fontWeight: 700, flexShrink: 0,
      }}>{owner.ini || owner.name?.slice(0, 2)}</span>}
    </button>
  );
}
