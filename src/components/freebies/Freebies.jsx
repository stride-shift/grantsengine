import { useState, useMemo } from "react";
import { C, FONT } from "@/theme";
import { FREEBIES, FREEBIE_CATEGORIES } from "@/data/freebies";

/* Nonprofit resources / freebies directory.
 *
 * Static curated list from data/freebies.js. Filter by category, search by name.
 * The list isn't an exhaustive catalogue — it's the things NPOs in this kind of
 * org actually use. Edit data/freebies.js to keep it current.
 */

export default function Freebies() {
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return FREEBIES.filter(f => {
      if (cat !== "all" && f.category !== cat) return false;
      if (!query) return true;
      const hay = `${f.name} ${f.offer} ${f.eligibility} ${f.notes}`.toLowerCase();
      return hay.includes(query);
    });
  }, [cat, q]);

  const counts = useMemo(() => {
    const c = { all: FREEBIES.length };
    for (const f of FREEBIES) c[f.category] = (c[f.category] || 0) + 1;
    return c;
  }, []);

  return (
    <div style={{ padding: "24px 32px", fontFamily: FONT, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.dark, letterSpacing: -0.4 }}>Nonprofit resources</div>
        <div style={{ fontSize: 13, color: C.t3, marginTop: 4, lineHeight: 1.5 }}>
          Curated freebies, discounts, and ad grants for verified nonprofits.
          Apply where eligible — most require proof of NPO/PBO registration.
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 18 }}>
        <input
          type="search"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search resources…"
          style={{
            padding: "7px 12px", fontSize: 13, border: `1px solid ${C.line}`,
            borderRadius: 8, fontFamily: FONT, outline: "none", flex: "1 1 220px", maxWidth: 320,
          }}
        />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <CatChip active={cat === "all"} onClick={() => setCat("all")} label="All" count={counts.all} />
          {FREEBIE_CATEGORIES.map(c => (
            <CatChip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)} label={c.label} count={counts[c.id] || 0} />
          ))}
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: C.t4, fontSize: 13 }}>
          No resources match "{q}".
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
          {filtered.map(f => <FreebieCard key={f.id} freebie={f} />)}
        </div>
      )}

      <div style={{ marginTop: 24, padding: 14, fontSize: 11, color: C.t4, textAlign: "center", lineHeight: 1.5 }}>
        Offers change. Verify eligibility on the provider's site before applying.
        Missing a resource the team uses? Add it to <code style={{ background: C.warm100, padding: "1px 5px", borderRadius: 4 }}>src/data/freebies.js</code>.
      </div>
    </div>
  );
}

function CatChip({ active, onClick, label, count }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 12px", fontSize: 11, fontWeight: 600,
      borderRadius: 100, border: `1px solid ${active ? C.primary : C.line}`,
      background: active ? C.primary : C.white, color: active ? C.white : C.t2,
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

function FreebieCard({ freebie: f }) {
  const cat = FREEBIE_CATEGORIES.find(c => c.id === f.category);
  return (
    <div style={{
      background: C.white, border: `1px solid ${C.line}`, borderRadius: 10,
      padding: 16, display: "flex", flexDirection: "column", gap: 8,
      transition: "border-color 180ms ease, box-shadow 180ms ease",
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = `${C.primary}40`; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.05)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.boxShadow = "none"; }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, lineHeight: 1.3 }}>{f.name}</div>
        {cat && (
          <span style={{
            fontSize: 9, fontWeight: 700, color: C.primary,
            background: `${C.primary}12`, padding: "2px 8px", borderRadius: 100,
            letterSpacing: 0.3, textTransform: "uppercase", whiteSpace: "nowrap",
          }}>{cat.label}</span>
        )}
      </div>
      <div style={{ fontSize: 13, color: C.t1, lineHeight: 1.5 }}>{f.offer}</div>
      {f.eligibility && (
        <div style={{ fontSize: 11, color: C.t3, lineHeight: 1.45 }}>
          <strong style={{ color: C.t2 }}>Eligibility:</strong> {f.eligibility}
        </div>
      )}
      {f.notes && (
        <div style={{ fontSize: 11, color: C.t3, lineHeight: 1.45, fontStyle: "italic" }}>
          {f.notes}
        </div>
      )}
      <a href={f.url} target="_blank" rel="noopener noreferrer" style={{
        marginTop: 4, fontSize: 12, fontWeight: 600, color: C.primary,
        textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4,
      }}
        onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
        onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}
      >
        Apply / learn more →
      </a>
    </div>
  );
}
