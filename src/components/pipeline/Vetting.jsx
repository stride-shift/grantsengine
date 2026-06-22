import { useState, useMemo } from "react";
import { C, FONT, MONO } from "@/theme";
import { Btn } from "@/components/ui";
import { TEAM } from "@/data/constants";

/* ── Vetting checklist fields ── */
const VETTING_CHECKS = [
  { key: "urlVerified", label: "Link works", desc: "Application page loads and is accessible", icon: "🔗" },
  { key: "deadlineVerified", label: "Deadline correct", desc: "Deadline matches what's on the funder site", icon: "📅" },
  { key: "funderVerified", label: "Funder is real", desc: "This is a real organisation with a real funding programme", icon: "🏢" },
  { key: "sectorRelevant", label: "Sector relevant", desc: "This grant aligns with d-lab's work", icon: "🎯" },
];

const isFullyVetted = (g) => {
  const v = g.vetting || {};
  return VETTING_CHECKS.every(c => v[c.key] === true);
};

/* ── A single vetting-check row: toggle button + inline contextual data (children) ── */
function VettingCheckButton({ grantId, checkKey, checked, label, icon, onToggle, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button onClick={() => onToggle(grantId, checkKey)}
        aria-pressed={!!checked}
        aria-label={`${label} — ${checked ? "verified" : "not verified"}`}
        style={{
          display: "flex", alignItems: "center", gap: 5, padding: "6px 12px",
          fontSize: 11, fontWeight: 600, fontFamily: FONT, borderRadius: 6, minWidth: 120,
          border: `1px solid ${checked ? C.ok + "40" : C.line}`,
          background: checked ? C.okSoft : C.white,
          color: checked ? C.ok : C.t3, cursor: "pointer",
        }}>
        <span aria-hidden="true" style={{ fontSize: 13 }}>{checked ? "✓" : icon}</span>
        {label}
      </button>
      {children}
    </div>
  );
}

/* ── Main component ── */
export default function Vetting({ grants, team, stages, onSelectGrant, onUpdateGrant, onNavigate, onLaunchTour }) {
  const [filter, setFilter] = useState("all"); // "all" | "mine" | "unvetted" | "vetted"
  const [sortBy, setSortBy] = useState("deadline"); // "deadline" | "fit" | "funder" | "date"
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkRejectOpen, setBulkRejectOpen] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState("");
  // Inline URL edit — only one grant can be in edit mode at a time. Saving via
  // onUpdateGrant(applyUrl) propagates the change everywhere (grant detail,
  // pipeline cards, autofill, calendar invites — they all read g.applyUrl).
  const [editingUrlFor, setEditingUrlFor] = useState(null);
  const [editUrlValue, setEditUrlValue] = useState("");
  const startUrlEdit = (g) => { setEditingUrlFor(g.id); setEditUrlValue(g.applyUrl || ""); };
  const cancelUrlEdit = () => { setEditingUrlFor(null); setEditUrlValue(""); };
  const saveUrlEdit = (grantId) => {
    const v = editUrlValue.trim();
    if (v && !/^https?:\/\//i.test(v)) { alert("URL must start with http:// or https://"); return; }
    onUpdateGrant(grantId, { applyUrl: v });
    setEditingUrlFor(null);
    setEditUrlValue("");
  };

  // Grants in scouted or vetting stage
  const vettingGrants = useMemo(() => {
    let list = grants.filter(g => g.stage === "scouted" || g.stage === "vetting");

    if (filter === "unvetted") list = list.filter(g => !isFullyVetted(g));
    else if (filter === "vetted") list = list.filter(g => isFullyVetted(g));

    if (sortBy === "deadline") {
      list.sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
    } else if (sortBy === "fit") {
      list.sort((a, b) => (b.aiFitscore?.score || 0) - (a.aiFitscore?.score || 0));
    } else if (sortBy === "funder") {
      list.sort((a, b) => (a.funder || "").localeCompare(b.funder || ""));
    } else if (sortBy === "date") {
      list.sort((a, b) => {
        const aDate = a.log?.[0]?.d || "0000";
        const bDate = b.log?.[0]?.d || "0000";
        return bDate.localeCompare(aDate);
      });
    }
    return list;
  }, [grants, filter, sortBy]);

  const stats = useMemo(() => {
    const all = grants.filter(g => g.stage === "scouted" || g.stage === "vetting");
    const unvetted = all.filter(g => !isFullyVetted(g));
    const vetted = all.filter(g => isFullyVetted(g));
    return { total: all.length, unvetted: unvetted.length, vetted: vetted.length };
  }, [grants]);

  const toggleCheck = (grantId, checkKey) => {
    const g = grants.find(x => x.id === grantId);
    if (!g) return;
    const vetting = { ...(g.vetting || {}) };
    vetting[checkKey] = !vetting[checkKey];
    onUpdateGrant(grantId, { vetting });
  };

  const approveGrant = (grantId) => {
    const g = grants.find(x => x.id === grantId);
    if (!g || !isFullyVetted(g)) return;
    onUpdateGrant(grantId, { stage: "qualifying" });
  };

  const rejectGrant = (grant, reason) => {
    if (!grant) return;
    onUpdateGrant(grant.id, {
      stage: "archived",
      log: [...(grant.log || []), { d: new Date().toISOString().slice(0, 10), t: `Rejected in vetting: ${reason || "not relevant"}` }],
    });
  };

  const bulkReject = () => {
    for (const id of selectedIds) {
      const g = grants.find(x => x.id === id);
      rejectGrant(g, bulkRejectReason || "bulk rejected");
    }
    setSelectedIds(new Set());
    setBulkRejectOpen(false);
    setBulkRejectReason("");
  };

  const bulkApprove = () => {
    for (const id of selectedIds) {
      const g = grants.find(x => x.id === id);
      if (g && isFullyVetted(g)) {
        onUpdateGrant(id, { stage: "qualifying" });
      }
    }
    setSelectedIds(new Set());
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === vettingGrants.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(vettingGrants.map(g => g.id)));
  };

  const getOwnerInfo = (ownerId) => TEAM.find(t => t.id === ownerId) || TEAM.find(t => t.id === "team");

  return (
    <div style={{ padding: "20px 24px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.dark, letterSpacing: -0.3 }}>Vetting Queue</div>
          <div style={{ fontSize: 13, color: C.t3, marginTop: 2 }}>
            Verify scouted grants before they enter the pipeline
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Stats badges */}
          <span style={{ fontSize: 12, fontWeight: 600, color: C.t3, background: C.raised, padding: "4px 12px", borderRadius: 100 }}>
            {stats.total} total
          </span>
          {stats.unvetted > 0 && (
            <span style={{ fontSize: 12, fontWeight: 600, color: C.amber, background: C.amberSoft, padding: "4px 12px", borderRadius: 100 }}>
              {stats.unvetted} need vetting
            </span>
          )}
          {stats.vetted > 0 && (
            <span style={{ fontSize: 12, fontWeight: 600, color: C.ok, background: C.okSoft, padding: "4px 12px", borderRadius: 100 }}>
              {stats.vetted} ready
            </span>
          )}
        </div>
      </div>

      {/* Toolbar: filters, sort, bulk actions */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        background: C.white, borderRadius: 10, padding: "10px 16px", marginBottom: 14,
        border: `1px solid ${C.line}`, boxShadow: C.cardShadow,
      }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.t4, textTransform: "uppercase", letterSpacing: 0.5 }}>Filter</span>
          {[["all", "All"], ["unvetted", "Unvetted"], ["vetted", "Ready"]].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} style={{
              padding: "4px 12px", fontSize: 11, fontWeight: 600, fontFamily: FONT,
              borderRadius: 5, border: `1px solid ${filter === k ? C.primary : C.line}`,
              background: filter === k ? C.primarySoft : "transparent",
              color: filter === k ? C.primary : C.t4, cursor: "pointer",
            }}>{l}</button>
          ))}
          <div style={{ width: 1, height: 16, background: C.line, margin: "0 4px" }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: C.t4, textTransform: "uppercase", letterSpacing: 0.5 }}>Sort</span>
          {[["deadline", "Deadline"], ["fit", "Fit"], ["funder", "Funder"], ["date", "Date Added"]].map(([k, l]) => (
            <button key={k} onClick={() => setSortBy(k)} style={{
              padding: "4px 12px", fontSize: 11, fontWeight: 600, fontFamily: FONT,
              borderRadius: 5, border: `1px solid ${sortBy === k ? C.primary : C.line}`,
              background: sortBy === k ? C.primarySoft : "transparent",
              color: sortBy === k ? C.primary : C.t4, cursor: "pointer",
            }}>{l}</button>
          ))}
        </div>
        {/* Bulk actions */}
        {selectedIds.size > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.primary }}>{selectedIds.size} selected</span>
            <Btn v="ghost" style={{ fontSize: 11, padding: "4px 12px", color: C.ok, borderColor: C.ok + "40" }} onClick={bulkApprove}>
              Approve selected
            </Btn>
            <Btn v="ghost" style={{ fontSize: 11, padding: "4px 12px", color: C.red, borderColor: C.red + "40" }} onClick={() => setBulkRejectOpen(true)}>
              Reject selected
            </Btn>
          </div>
        )}
      </div>

      {/* Bulk reject modal */}
      {bulkRejectOpen && (
        <div style={{
          background: C.white, borderRadius: 10, padding: "14px 18px", marginBottom: 14,
          border: `1px solid ${C.red}30`, boxShadow: C.cardShadow,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 8 }}>Reject {selectedIds.size} grants</div>
          <input
            aria-label="Rejection reason (optional)"
            placeholder="Reason (optional)..."
            value={bulkRejectReason}
            onChange={e => setBulkRejectReason(e.target.value)}
            style={{
              width: "100%", padding: "8px 12px", fontSize: 12, fontFamily: FONT,
              border: `1px solid ${C.line}`, borderRadius: 6, outline: "none", marginBottom: 8,
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <Btn v="ghost" style={{ fontSize: 11, padding: "4px 12px", color: C.red, borderColor: C.red + "40" }} onClick={bulkReject}>Confirm reject</Btn>
            <Btn v="ghost" style={{ fontSize: 11, padding: "4px 12px" }} onClick={() => setBulkRejectOpen(false)}>Cancel</Btn>
          </div>
        </div>
      )}

      {/* Empty state */}
      {vettingGrants.length === 0 && (
        <div style={{
          textAlign: "center", padding: "60px 20px",
          background: C.white, borderRadius: 10, border: `1px solid ${C.line}`,
        }}>
          <div aria-hidden="true" style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.dark, marginBottom: 6 }}>All clear</div>
          <div style={{ fontSize: 13, color: C.t3, maxWidth: 360, margin: "0 auto" }}>
            {stats.total === 0
              ? "No scouted grants to vet. Run a scout search to find new opportunities."
              : "All grants in the vetting queue have been processed."}
          </div>
          {stats.total === 0 && (
            <Btn v="primary" style={{ marginTop: 16, fontSize: 13, padding: "8px 20px" }}
              onClick={() => onNavigate?.("pipeline")}>
              Go to Pipeline
            </Btn>
          )}
        </div>
      )}

      {/* Select all */}
      {vettingGrants.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, paddingLeft: 4 }}>
          <input
            type="checkbox"
            checked={selectedIds.size === vettingGrants.length && vettingGrants.length > 0}
            onChange={selectAll}
            style={{ cursor: "pointer" }}
          />
          <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>Select all</span>
        </div>
      )}

      {/* Grant cards */}
      <div data-tour="vetting-list" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {vettingGrants.map(g => {
          const vetted = isFullyVetted(g);
          const vetting = g.vetting || {};
          const checked = VETTING_CHECKS.filter(c => vetting[c.key] === true).length;
          const owner = getOwnerInfo(g.owner);
          const daysLeft = g.deadline ? Math.ceil((new Date(g.deadline) - new Date()) / 86400000) : null;

          return (
            <div key={g.id} style={{
              background: C.white, borderRadius: 10, padding: "14px 18px",
              border: `1px solid ${vetted ? C.ok + "40" : C.line}`,
              boxShadow: C.cardShadow,
              opacity: vetted ? 1 : 0.95,
            }}>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={selectedIds.has(g.id)}
                  onChange={() => toggleSelect(g.id)}
                  style={{ cursor: "pointer", marginTop: 4 }}
                />

                {/* Grant info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                    <span
                      style={{ fontWeight: 700, fontSize: 14, color: C.dark, cursor: "pointer", textDecoration: "none" }}
                      onClick={() => onSelectGrant?.(g.id)}
                      onMouseEnter={e => e.target.style.textDecoration = "underline"}
                      onMouseLeave={e => e.target.style.textDecoration = "none"}
                    >{g.name}</span>
                    <span style={{ fontSize: 12, color: C.t3 }}>{g.funder}</span>
                    {g.type && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: C.t4, background: C.raised, padding: "1px 8px", borderRadius: 100 }}>{g.type}</span>
                    )}
                    {g.market && (
                      <span role="img" aria-label={g.market === "global" ? "Global" : "South Africa"} style={{ fontSize: 10 }}>{g.market === "global" ? "🌍" : "🇿🇦"}</span>
                    )}
                    {g.stage === "vetting" && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: "#0EA5E9", background: "#F0F9FF", padding: "1px 8px", borderRadius: 100 }}>In Vetting</span>
                    )}
                    {vetted && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: C.ok, background: C.okSoft, padding: "1px 8px", borderRadius: 100 }}>✓ Verified</span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 12, color: C.t3, marginBottom: 10 }}>
                    {g.funderBudget > 0 && <span>Budget: R{g.funderBudget.toLocaleString()}</span>}
                    {owner && owner.id !== "team" && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{
                          width: 16, height: 16, borderRadius: "50%", background: owner.c,
                          display: "inline-flex", alignItems: "center", justifyContent: "center",
                          fontSize: 8, fontWeight: 700, color: "#fff",
                        }}>{owner.ini}</span>
                        {owner.name}
                      </span>
                    )}
                  </div>

                  {/* Vetting checklist — each item shows relevant data inline */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {/* 1. Link works */}
                    <VettingCheckButton grantId={g.id} checkKey="urlVerified" checked={vetting.urlVerified} label="Link works" icon="🔗" onToggle={toggleCheck}>
                      {editingUrlFor === g.id ? (
                        <div style={{ display: "flex", gap: 4, flex: 1, alignItems: "center" }}>
                          <input type="url" value={editUrlValue} autoFocus
                            onChange={e => setEditUrlValue(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") saveUrlEdit(g.id); if (e.key === "Escape") cancelUrlEdit(); }}
                            placeholder="https://funder.example.com/apply"
                            style={{ flex: 1, padding: "4px 8px", fontSize: 11, border: `1px solid ${C.primary}40`, borderRadius: 4, fontFamily: MONO, outline: "none" }} />
                          <button onClick={() => saveUrlEdit(g.id)}
                            style={{ fontSize: 10, fontWeight: 700, color: C.white, background: C.primary, border: "none", borderRadius: 4, padding: "4px 10px", cursor: "pointer", fontFamily: FONT }}>Save</button>
                          <button onClick={cancelUrlEdit}
                            style={{ fontSize: 10, fontWeight: 600, color: C.t3, background: "none", border: `1px solid ${C.line}`, borderRadius: 4, padding: "4px 8px", cursor: "pointer", fontFamily: FONT }}>×</button>
                        </div>
                      ) : g.applyUrl ? (
                        <>
                          <a href={g.applyUrl} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 11, color: C.blue, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 360 }}>
                            {g.applyUrl} ↗
                          </a>
                          <button onClick={() => startUrlEdit(g)} title="Edit URL"
                            style={{ fontSize: 10, fontWeight: 600, color: C.t4, background: "none", border: "none", cursor: "pointer", fontFamily: FONT, padding: "0 4px" }}
                            onMouseEnter={e => e.currentTarget.style.color = C.primary}
                            onMouseLeave={e => e.currentTarget.style.color = C.t4}>
                            ✎ edit
                          </button>
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: 11, color: C.t4, fontStyle: "italic" }}>No apply URL</span>
                          <button onClick={() => startUrlEdit(g)}
                            style={{ fontSize: 10, fontWeight: 700, color: C.primary, background: `${C.primary}12`, border: `1px solid ${C.primary}30`, borderRadius: 4, padding: "3px 10px", cursor: "pointer", fontFamily: FONT }}>
                            + Add URL
                          </button>
                        </>
                      )}
                    </VettingCheckButton>

                    {/* 2. Deadline correct */}
                    <VettingCheckButton grantId={g.id} checkKey="deadlineVerified" checked={vetting.deadlineVerified} label="Deadline correct" icon="📅" onToggle={toggleCheck}>
                      {g.deadline ? (
                        <span style={{ fontSize: 11, color: daysLeft !== null && daysLeft < 0 ? C.red : daysLeft !== null && daysLeft < 14 ? C.amber : C.t2, fontWeight: 600 }}>
                          {new Date(g.deadline).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                          {daysLeft !== null && <span style={{ fontWeight: 400, color: C.t3 }}> ({daysLeft > 0 ? daysLeft + "d left" : "overdue"})</span>}
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: C.amber, fontStyle: "italic" }}>No deadline set</span>
                      )}
                    </VettingCheckButton>

                    {/* 3. Funder is real */}
                    <VettingCheckButton grantId={g.id} checkKey="funderVerified" checked={vetting.funderVerified} label="Funder is real" icon="🏢" onToggle={toggleCheck}>
                      <span style={{ fontSize: 11, color: C.t2 }}>{g.funder}</span>
                    </VettingCheckButton>

                    {/* 4. Sector relevant */}
                    <VettingCheckButton grantId={g.id} checkKey="sectorRelevant" checked={vetting.sectorRelevant} label="Sector relevant" icon="🎯" onToggle={toggleCheck}>
                      {g.focus && g.focus.length > 0 && (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {g.focus.slice(0, 4).map((f, i) => (
                            <span key={i} style={{ fontSize: 10, color: C.t3, background: C.raised, padding: "1px 6px", borderRadius: 100 }}>{f}</span>
                          ))}
                        </div>
                      )}
                    </VettingCheckButton>
                  </div>

                  {/* Progress bar */}
                  <div style={{
                    marginTop: 8, height: 3, background: C.raised, borderRadius: 2, overflow: "hidden",
                  }}>
                    <div style={{
                      height: "100%", width: `${(checked / VETTING_CHECKS.length) * 100}%`,
                      background: vetted ? C.ok : C.primary,
                      borderRadius: 2, transition: "width 0.3s ease",
                    }} />
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                  <span title={!vetted ? "Complete all 4 verification checks to approve" : "Move to qualifying stage"}>
                  <Btn
                    v="primary"
                    disabled={!vetted}
                    style={{
                      fontSize: 11, padding: "6px 14px",
                      opacity: vetted ? 1 : 0.4,
                    }}
                    onClick={() => approveGrant(g.id)}
                  >
                    Approve →
                  </Btn>
                  </span>
                  <Btn
                    v="ghost"
                    style={{ fontSize: 11, padding: "6px 14px", color: C.red, borderColor: C.red + "30" }}
                    onClick={() => {
                      if (window.confirm(`Reject "${g.name}"? It will be moved to archived.`)) {
                        rejectGrant(g, "rejected in vetting");
                      }
                    }}
                  >
                    Reject
                  </Btn>
                  <button
                    onClick={() => onSelectGrant?.(g.id)}
                    style={{
                      fontSize: 11, color: C.t4, background: "none", border: "none",
                      cursor: "pointer", fontFamily: FONT, padding: "4px 0",
                    }}
                  >
                    View details →
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
