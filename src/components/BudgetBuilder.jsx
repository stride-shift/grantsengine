import { useState, useEffect, useMemo } from "react";
import { C, FONT, MONO } from "../theme";
import { PTYPES, detectType, multiCohortInfo } from "../data/funderStrategy";
import { Btn } from "./index";

/* ── Budget Builder ──
   Interactive budget calculator using real PTYPES line-item data.
   Eliminates AI budget hallucination by making the budget the source of truth.
*/

// Parse PTYPES table amounts: "516,000" → 516000, "varies" → 0
const parseAmt = s => {
  if (!s || s === "varies") return 0;
  return parseInt(String(s).replace(/[,\s]/g, "")) || 0;
};

// Format ZAR
const fmtR = n => n ? `R${n.toLocaleString()}` : "R0";

// Type options for selector
const TYPE_OPTIONS = Object.entries(PTYPES).map(([k, v]) => ({
  num: parseInt(k),
  label: `Type ${k}: ${v.label}`,
  short: v.label,
  students: v.students,
  cost: v.cost,
  perStudent: v.perStudent,
  duration: v.duration,
  desc: v.desc,
}));

export default function BudgetBuilder({ grant, onUpdate }) {
  const g = grant;
  const saved = g.budgetTable;

  // State
  const [typeNum, setTypeNum] = useState(saved?.typeNum || null);
  const [cohorts, setCohorts] = useState(saved?.cohorts || 1);
  const [years, setYears] = useState(saved?.years || 1);
  const [items, setItems] = useState(saved?.items || []);
  const [orgContrib, setOrgContrib] = useState(saved?.includeOrgContribution || false);
  const [editing, setEditing] = useState(!saved);
  const [collapsed, setCollapsed] = useState(!!saved);
  const [addingItem, setAddingItem] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newAmount, setNewAmount] = useState("");

  // Auto-detect type from grant if not set
  useEffect(() => {
    if (!typeNum && !saved) {
      const detected = detectType(g);
      if (detected) {
        const match = Object.entries(PTYPES).find(([, v]) => v === detected);
        if (match) setTypeNum(parseInt(match[0]));
      }
      const mc = multiCohortInfo(g);
      if (mc?.count > 1) setCohorts(mc.count);
    }
  }, []);

  // Load items from PTYPES when type changes
  const loadTypeItems = (num) => {
    const pt = PTYPES[num];
    if (!pt?.table) return;
    const newItems = pt.table
      .filter(([label]) => label !== "TOTAL")
      .map(([label, amount]) => ({
        label,
        amount: parseAmt(amount),
        isCustom: false,
      }));
    setItems(newItems);
  };

  // Select type handler
  const selectType = (num) => {
    setTypeNum(num);
    loadTypeItems(num);
    setEditing(true);
    setCollapsed(false);
  };

  // Calculations
  const pt = typeNum ? PTYPES[typeNum] : null;
  const studentsPerCohort = pt?.students || 0;

  const calcs = useMemo(() => {
    const itemTotal = items.reduce((s, it) => s + (it.amount || 0), 0);
    const subtotal = itemTotal * cohorts;
    const orgAmount = orgContrib ? Math.round(subtotal * 0.3) : 0;
    const annualTotal = subtotal + orgAmount;
    const total = annualTotal * years;
    const totalStudents = studentsPerCohort * cohorts * years;
    const perStudent = totalStudents > 0 ? Math.round(total / totalStudents) : 0;
    return { itemTotal, subtotal, orgAmount, annualTotal, total, totalStudents, perStudent };
  }, [items, cohorts, years, orgContrib, studentsPerCohort]);

  // Check if unsaved changes
  const hasChanges = useMemo(() => {
    if (!saved) return items.length > 0;
    if (saved.typeNum !== typeNum || saved.cohorts !== cohorts || (saved.years || 1) !== years || saved.includeOrgContribution !== orgContrib) return true;
    if (saved.items.length !== items.length) return true;
    return saved.items.some((si, i) => si.label !== items[i]?.label || si.amount !== items[i]?.amount);
  }, [saved, typeNum, cohorts, years, orgContrib, items]);

  // Save budget
  const saveBudget = () => {
    const budgetTable = {
      typeNum,
      typeLabel: pt?.label || "",
      cohorts,
      years,
      studentsPerCohort,
      duration: pt?.duration || "",
      items: items.map(it => ({ label: it.label, amount: it.amount, isCustom: it.isCustom })),
      includeOrgContribution: orgContrib,
      subtotal: calcs.subtotal,
      orgContribution: calcs.orgAmount,
      annualTotal: calcs.annualTotal,
      total: calcs.total,
      perStudent: calcs.perStudent,
      savedAt: new Date().toISOString(),
    };
    onUpdate(g.id, {
      budgetTable,
      ask: calcs.total,
      askSource: "budget-builder",
      aiRecommendedAsk: calcs.total,
      ...(years > 1 ? { askYears: years } : { askYears: null }),
    });
    setEditing(false);
    setCollapsed(false);
  };

  // Clear budget
  const clearBudget = () => {
    setTypeNum(null);
    setCohorts(1);
    setYears(1);
    setItems([]);
    setOrgContrib(false);
    setEditing(true);
    setCollapsed(false);
    onUpdate(g.id, { budgetTable: null, askYears: null });
  };

  // Item mutations
  const updateItem = (idx, field, value) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };
  const removeItem = (idx) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };
  const addItem = () => {
    if (!newLabel.trim()) return;
    setItems(prev => [...prev, { label: newLabel.trim(), amount: parseInt(newAmount) || 0, isCustom: true }]);
    setNewLabel("");
    setNewAmount("");
    setAddingItem(false);
  };

  // Funder budget comparison
  const funderBudget = g.funderBudget;
  const utilization = funderBudget && calcs.total > 0 ? Math.round((calcs.total / funderBudget) * 100) : null;

  // ── Collapsed saved state ──
  if (saved && collapsed && !editing) {
    return (
      <div style={{
        margin: "0 22px", padding: "12px 18px", background: C.white, borderRadius: 14,
        border: `1.5px solid ${C.ok}25`, boxShadow: C.cardShadow,
        display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
      }} onClick={() => setCollapsed(false)}>
        <div style={{
          width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
          background: C.okSoft, color: C.ok, fontSize: 13, fontWeight: 700,
        }}>{"\u2713"}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.dark }}>
            Budget: {fmtR(saved.total)}
          </div>
          <div style={{ fontSize: 11, color: C.t3, marginTop: 1 }}>
            {saved.typeLabel} {saved.cohorts > 1 ? `× ${saved.cohorts} cohorts` : ""}{saved.years > 1 ? ` × ${saved.years} years` : ""} — {fmtR(saved.perStudent)}/student
          </div>
        </div>
        <span style={{ fontSize: 11, color: C.t4, fontWeight: 500 }}>{"\u25BC"}</span>
      </div>
    );
  }

  // ── Main builder UI ──
  return (
    <div style={{
      margin: "0 22px", background: C.white, borderRadius: 14,
      border: `1.5px solid ${typeNum ? C.primary + "30" : C.line}`,
      boxShadow: C.cardShadow, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 18px 10px", display: "flex", alignItems: "center", gap: 12,
        borderBottom: `1px solid ${C.line}`,
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
          background: saved ? C.okSoft : C.primarySoft, color: saved ? C.ok : C.primary,
          fontSize: 12, fontWeight: 700, fontFamily: MONO,
        }}>{saved ? "\u2713" : "R"}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, letterSpacing: -0.2 }}>Budget Builder</div>
          <div style={{ fontSize: 11, color: C.t4, marginTop: 1 }}>
            {saved ? `Saved: ${fmtR(saved.total)}` : "Build a real budget from d-lab programme costs"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {saved && !editing && (
            <button onClick={() => setEditing(true)}
              style={{
                background: "none", border: `1.5px solid ${C.line}`, borderRadius: 7,
                padding: "4px 10px", fontSize: 10, fontWeight: 600, color: C.t3,
                cursor: "pointer", fontFamily: FONT,
              }}>Edit</button>
          )}
          {saved && (
            <button onClick={() => setCollapsed(true)}
              style={{
                background: "none", border: "none", padding: "4px 6px",
                fontSize: 12, color: C.t4, cursor: "pointer", fontFamily: FONT,
              }}>{"\u25B2"}</button>
          )}
        </div>
      </div>

      <div style={{ padding: "14px 18px" }}>
        {/* Type selector */}
        {(editing || !typeNum) && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.t3, letterSpacing: 0.5, textTransform: "uppercase", display: "block", marginBottom: 6 }}>
              Programme Type
            </label>
            <select
              value={typeNum || ""}
              onChange={e => {
                const v = parseInt(e.target.value);
                if (v) selectType(v);
              }}
              style={{
                width: "100%", padding: "9px 12px", fontSize: 13, fontFamily: FONT,
                borderRadius: 10, border: `1.5px solid ${C.line}`, color: C.t1,
                background: C.white, outline: "none", cursor: "pointer",
                appearance: "auto",
              }}
            >
              <option value="">Select a programme type...</option>
              {TYPE_OPTIONS.map(t => (
                <option key={t.num} value={t.num}>
                  {t.label} ({t.students ? `${t.students} students` : "per learner"}, {t.cost ? fmtR(t.cost) : `${fmtR(t.perStudent)}/learner`})
                </option>
              ))}
            </select>
            {typeNum && pt && (
              <div style={{ fontSize: 11, color: C.t3, marginTop: 6, lineHeight: 1.5, padding: "6px 10px", background: C.warm100, borderRadius: 8 }}>
                {pt.desc}
              </div>
            )}
          </div>
        )}

        {/* Cohort multiplier */}
        {typeNum && (
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.t3, letterSpacing: 0.5, textTransform: "uppercase" }}>
                Cohorts / yr
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <button onClick={() => setCohorts(p => Math.max(1, p - 1))} disabled={!editing || cohorts <= 1}
                  style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${C.line}`, background: C.warm100, fontSize: 14, cursor: editing ? "pointer" : "default", color: C.t3, fontFamily: MONO, display: "flex", alignItems: "center", justifyContent: "center" }}>-</button>
                <span style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color: C.dark, minWidth: 24, textAlign: "center" }}>{cohorts}</span>
                <button onClick={() => setCohorts(p => Math.min(10, p + 1))} disabled={!editing}
                  style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${C.line}`, background: C.warm100, fontSize: 14, cursor: editing ? "pointer" : "default", color: C.t3, fontFamily: MONO, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
              </div>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.t3, letterSpacing: 0.5, textTransform: "uppercase" }}>
                Years
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <button onClick={() => setYears(p => Math.max(1, p - 1))} disabled={!editing || years <= 1}
                  style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${C.line}`, background: C.warm100, fontSize: 14, cursor: editing ? "pointer" : "default", color: C.t3, fontFamily: MONO, display: "flex", alignItems: "center", justifyContent: "center" }}>-</button>
                <span style={{ fontSize: 18, fontWeight: 700, fontFamily: MONO, color: C.dark, minWidth: 24, textAlign: "center" }}>{years}</span>
                <button onClick={() => setYears(p => Math.min(5, p + 1))} disabled={!editing}
                  style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${C.line}`, background: C.warm100, fontSize: 14, cursor: editing ? "pointer" : "default", color: C.t3, fontFamily: MONO, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
              </div>
            </div>
            <div style={{ fontSize: 12, color: C.t2, paddingTop: 18 }}>
              {"\u00d7"} {studentsPerCohort || "?"} students = <strong style={{ fontFamily: MONO, color: C.dark }}>{calcs.totalStudents}</strong> total students{years > 1 ? ` over ${years} years` : ""}
            </div>
            <div style={{ fontSize: 11, color: C.t4, paddingTop: 18 }}>
              {pt?.duration}{years > 1 ? " / year" : ""}
            </div>
          </div>
        )}

        {/* Line items table */}
        {typeNum && items.length > 0 && (
          <div style={{
            borderRadius: 10, border: `1px solid ${C.line}`, overflow: "hidden", marginBottom: 12,
          }}>
            {/* Header */}
            <div style={{
              display: "flex", padding: "8px 12px", background: C.warm200,
              borderBottom: `1px solid ${C.line}`,
            }}>
              <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: C.t3, letterSpacing: 0.5, textTransform: "uppercase" }}>
                Line Item {cohorts > 1 ? "(per cohort)" : ""}
              </span>
              <span style={{ width: 130, fontSize: 10, fontWeight: 700, color: C.t3, letterSpacing: 0.5, textTransform: "uppercase", textAlign: "right" }}>
                Amount (ZAR)
              </span>
              {editing && <span style={{ width: 32 }} />}
            </div>

            {/* Rows */}
            {items.map((it, idx) => (
              <div key={idx} style={{
                display: "flex", alignItems: "center", padding: "6px 12px",
                borderBottom: idx < items.length - 1 ? `1px solid ${C.line}40` : "none",
                background: it.isCustom ? C.warm100 : "transparent",
              }}>
                {editing ? (
                  <input
                    value={it.label}
                    onChange={e => updateItem(idx, "label", e.target.value)}
                    style={{
                      flex: 1, padding: "5px 8px", fontSize: 12, fontFamily: FONT,
                      border: `1px solid ${C.line}`, borderRadius: 6, color: C.t1,
                      background: "transparent", outline: "none",
                    }}
                  />
                ) : (
                  <span style={{ flex: 1, fontSize: 12, color: C.t1 }}>
                    {it.label}
                    {it.isCustom && <span style={{ fontSize: 9, color: C.t4, marginLeft: 6, fontWeight: 600 }}>CUSTOM</span>}
                  </span>
                )}
                {editing ? (
                  <input
                    type="number"
                    value={it.amount || ""}
                    onChange={e => updateItem(idx, "amount", parseInt(e.target.value) || 0)}
                    style={{
                      width: 120, padding: "5px 8px", fontSize: 12, fontFamily: MONO,
                      border: `1px solid ${C.line}`, borderRadius: 6, color: C.t1,
                      background: "transparent", outline: "none", textAlign: "right",
                    }}
                  />
                ) : (
                  <span style={{ width: 130, fontSize: 12, fontFamily: MONO, color: C.t1, fontWeight: 600, textAlign: "right" }}>
                    {fmtR(it.amount)}
                  </span>
                )}
                {editing && (
                  <button onClick={() => removeItem(idx)}
                    style={{
                      width: 24, height: 24, marginLeft: 8, border: "none", borderRadius: 6,
                      background: "transparent", color: C.t4, fontSize: 14, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = C.red; e.currentTarget.style.background = C.redSoft; }}
                    onMouseLeave={e => { e.currentTarget.style.color = C.t4; e.currentTarget.style.background = "transparent"; }}
                  >{"\u00d7"}</button>
                )}
              </div>
            ))}

            {/* Add item row */}
            {editing && (
              addingItem ? (
                <div style={{
                  display: "flex", alignItems: "center", padding: "6px 12px", gap: 6,
                  borderTop: `1px solid ${C.line}`, background: C.warm100,
                }}>
                  <input
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    placeholder="Item description"
                    style={{
                      flex: 1, padding: "5px 8px", fontSize: 12, fontFamily: FONT,
                      border: `1px solid ${C.line}`, borderRadius: 6, color: C.t1,
                      background: C.white, outline: "none",
                    }}
                    autoFocus
                    onKeyDown={e => { if (e.key === "Enter") addItem(); if (e.key === "Escape") setAddingItem(false); }}
                  />
                  <input
                    type="number"
                    value={newAmount}
                    onChange={e => setNewAmount(e.target.value)}
                    placeholder="Amount"
                    style={{
                      width: 100, padding: "5px 8px", fontSize: 12, fontFamily: MONO,
                      border: `1px solid ${C.line}`, borderRadius: 6, color: C.t1,
                      background: C.white, outline: "none", textAlign: "right",
                    }}
                    onKeyDown={e => { if (e.key === "Enter") addItem(); }}
                  />
                  <button onClick={addItem}
                    style={{
                      padding: "4px 10px", fontSize: 10, fontWeight: 700, color: C.primary,
                      background: C.primarySoft, border: "none", borderRadius: 6, cursor: "pointer", fontFamily: FONT,
                    }}>Add</button>
                  <button onClick={() => { setAddingItem(false); setNewLabel(""); setNewAmount(""); }}
                    style={{ background: "none", border: "none", fontSize: 10, color: C.t4, cursor: "pointer", fontFamily: FONT }}>Cancel</button>
                </div>
              ) : (
                <div style={{ padding: "6px 12px", borderTop: `1px solid ${C.line}` }}>
                  <button onClick={() => setAddingItem(true)}
                    style={{
                      background: "none", border: "none", fontSize: 11, fontWeight: 600,
                      color: C.primary, cursor: "pointer", fontFamily: FONT, padding: "2px 0",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.textDecoration = "underline"; }}
                    onMouseLeave={e => { e.currentTarget.style.textDecoration = "none"; }}
                  >+ Add line item</button>
                </div>
              )
            )}

            {/* Totals */}
            <div style={{ borderTop: `2px solid ${C.line}`, background: C.warm100 }}>
              {/* Subtotal per cohort */}
              <div style={{ display: "flex", padding: "8px 12px", alignItems: "center" }}>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: C.t2 }}>
                  Subtotal per cohort
                </span>
                <span style={{ width: 130, fontSize: 12, fontFamily: MONO, fontWeight: 700, color: C.t1, textAlign: "right" }}>
                  {fmtR(calcs.itemTotal)}
                </span>
                {editing && <span style={{ width: 32 }} />}
              </div>

              {/* Multi-cohort line */}
              {cohorts > 1 && (
                <div style={{ display: "flex", padding: "4px 12px 8px", alignItems: "center" }}>
                  <span style={{ flex: 1, fontSize: 12, color: C.t3 }}>
                    {"\u00d7"} {cohorts} cohorts
                  </span>
                  <span style={{ width: 130, fontSize: 12, fontFamily: MONO, fontWeight: 600, color: C.t2, textAlign: "right" }}>
                    {fmtR(calcs.subtotal)}
                  </span>
                  {editing && <span style={{ width: 32 }} />}
                </div>
              )}

              {/* 30% org contribution */}
              <div style={{ display: "flex", padding: "6px 12px", alignItems: "center", borderTop: `1px solid ${C.line}` }}>
                <label style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, cursor: editing ? "pointer" : "default" }}>
                  <input
                    type="checkbox"
                    checked={orgContrib}
                    onChange={e => setOrgContrib(e.target.checked)}
                    disabled={!editing}
                    style={{ accentColor: C.primary }}
                  />
                  <span style={{ fontSize: 11, color: C.t2 }}>
                    30% org contribution
                    <span style={{ color: C.t4, marginLeft: 4, fontSize: 10 }}>(operational costs)</span>
                  </span>
                </label>
                <span style={{ width: 130, fontSize: 12, fontFamily: MONO, fontWeight: 600, color: orgContrib ? C.t1 : C.t4, textAlign: "right" }}>
                  {orgContrib ? fmtR(calcs.orgAmount) : "—"}
                </span>
                {editing && <span style={{ width: 32 }} />}
              </div>

              {/* Annual total (shown only for multi-year) */}
              {years > 1 && (
                <div style={{
                  display: "flex", padding: "8px 12px", alignItems: "center",
                  borderTop: `2px solid ${C.line}`, background: C.warm200,
                }}>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: C.t2 }}>
                    Annual total
                  </span>
                  <span style={{ width: 130, fontSize: 13, fontFamily: MONO, fontWeight: 700, color: C.t1, textAlign: "right" }}>
                    {fmtR(calcs.annualTotal)}
                  </span>
                  {editing && <span style={{ width: 32 }} />}
                </div>
              )}
              {years > 1 && (
                <div style={{ display: "flex", padding: "4px 12px 8px", alignItems: "center", background: C.warm200 }}>
                  <span style={{ flex: 1, fontSize: 12, color: C.t3 }}>
                    {"\u00d7"} {years} years
                  </span>
                  <span style={{ width: 130, fontSize: 12, fontFamily: MONO, fontWeight: 600, color: C.t2, textAlign: "right" }}>
                    {fmtR(calcs.total)}
                  </span>
                  {editing && <span style={{ width: 32 }} />}
                </div>
              )}

              {/* Grand total */}
              <div style={{
                display: "flex", padding: "10px 12px", alignItems: "center",
                borderTop: `2px solid ${C.primary}30`, background: C.primarySoft + "40",
              }}>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 800, color: C.dark }}>
                  {years > 1 ? `TOTAL (${years}-YEAR ASK)` : "TOTAL"}
                </span>
                <span style={{ width: 130, fontSize: 16, fontFamily: MONO, fontWeight: 800, color: C.primary, textAlign: "right" }}>
                  {fmtR(calcs.total)}
                </span>
                {editing && <span style={{ width: 32 }} />}
              </div>

              {/* Per student */}
              {calcs.totalStudents > 0 && (
                <div style={{ display: "flex", padding: "6px 12px 8px", alignItems: "center" }}>
                  <span style={{ flex: 1, fontSize: 11, color: C.t3 }}>
                    Per student ({calcs.totalStudents} students{years > 1 ? ` over ${years} yrs` : ""})
                  </span>
                  <span style={{ width: 130, fontSize: 12, fontFamily: MONO, fontWeight: 600, color: C.t2, textAlign: "right" }}>
                    {fmtR(calcs.perStudent)}
                  </span>
                  {editing && <span style={{ width: 32 }} />}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Funder budget comparison */}
        {funderBudget && calcs.total > 0 && (
          <div style={{
            padding: "8px 12px", background: utilization > 100 ? C.amberSoft : C.warm100,
            borderRadius: 8, border: `1px solid ${utilization > 100 ? C.amber + "30" : C.line}`,
            marginBottom: 12, display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: 11, color: C.t2, lineHeight: 1.4 }}>
              Funder budget: <strong style={{ fontFamily: MONO }}>{fmtR(funderBudget)}</strong>
              {" "} — your budget is{" "}
              <strong style={{
                fontFamily: MONO,
                color: utilization > 120 ? C.red : utilization > 100 ? C.amber : utilization < 60 ? C.amber : C.ok,
              }}>
                {utilization}%
              </strong>
              {" "}of capacity
              {utilization < 60 && <span style={{ color: C.t4 }}> (consider adding components)</span>}
              {utilization > 120 && <span style={{ color: C.t4 }}> (may exceed funder capacity)</span>}
            </span>
          </div>
        )}

        {/* Action buttons */}
        {typeNum && items.length > 0 && (
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
            {hasChanges && editing && (
              <span style={{ fontSize: 10, color: C.amber, fontWeight: 600, marginRight: "auto" }}>Unsaved changes</span>
            )}
            {saved && editing && (
              <button onClick={() => { setEditing(false); setTypeNum(saved.typeNum); setCohorts(saved.cohorts); setYears(saved.years || 1); setItems(saved.items); setOrgContrib(saved.includeOrgContribution); }}
                style={{ padding: "6px 14px", fontSize: 11, fontWeight: 600, color: C.t3, background: "none", border: `1.5px solid ${C.line}`, borderRadius: 7, cursor: "pointer", fontFamily: FONT }}>Cancel</button>
            )}
            <button onClick={clearBudget}
              style={{ padding: "6px 14px", fontSize: 11, fontWeight: 600, color: C.t4, background: "none", border: "none", cursor: "pointer", fontFamily: FONT }}>Clear</button>
            {editing && (
              <Btn onClick={saveBudget} v="primary" style={{ fontSize: 12, padding: "7px 16px" }}>
                Save Budget {"\u0026"} Set Ask
              </Btn>
            )}
          </div>
        )}

        {/* Empty state — no type selected */}
        {!typeNum && (
          <div style={{
            padding: "24px", textAlign: "center", background: C.warm100, borderRadius: 10,
            border: `1.5px dashed ${C.line}`,
          }}>
            <div style={{ fontSize: 12, color: C.t4, marginBottom: 4 }}>
              No budget set yet
            </div>
            <div style={{ fontSize: 11, color: C.t4, lineHeight: 1.5 }}>
              Select a programme type above to auto-populate line items from d-lab's real costs
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
