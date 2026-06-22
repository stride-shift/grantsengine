import { useState, useEffect, useMemo, useCallback } from "react";
import { PTYPES, detectType, multiCohortInfo } from "@/data/funderStrategy";

// Parse PTYPES table amounts: "516,000" → 516000, "varies" → 0
const parseAmt = (s) => {
  if (!s || s === "varies") return 0;
  return parseInt(String(s).replace(/[,\s]/g, "")) || 0;
};

/**
 * Budget Builder view-model. Owns the budget model (type/cohorts/years/items/
 * org-contribution), the derived totals, the edit lifecycle, and the
 * save/clear/reset + item mutations. The component renders from this and only
 * keeps transient add-item form inputs of its own.
 *
 * @param grant the grant being budgeted (reads grant.budgetTable / funderBudget)
 * @param onUpdate (grantId, changes) persistence callback
 */
export default function useBudget(grant, onUpdate) {
  const g = grant;
  const saved = g.budgetTable;

  const [typeNum, setTypeNum] = useState(saved?.typeNum || null);
  const [cohorts, setCohorts] = useState(saved?.cohorts || 1);
  const [years, setYears] = useState(saved?.years || 1);
  const [items, setItems] = useState(saved?.items || []);
  const [orgContrib, setOrgContrib] = useState(saved?.includeOrgContribution || false);
  const [editing, setEditing] = useState(!saved);
  const [collapsed, setCollapsed] = useState(!!saved);

  // Auto-detect type/cohorts from the grant when nothing is saved yet (once, on mount)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTypeItems = (num) => {
    const pt = PTYPES[num];
    if (!pt?.table) return;
    setItems(
      pt.table
        .filter(([label]) => label !== "TOTAL")
        .map(([label, amount]) => ({ label, amount: parseAmt(amount), isCustom: false }))
    );
  };

  const selectType = useCallback((num) => {
    setTypeNum(num);
    loadTypeItems(num);
    setEditing(true);
    setCollapsed(false);
  }, []);

  const pt = typeNum ? PTYPES[typeNum] : null;
  const studentsPerCohort = pt?.students || 0;

  const calcs = useMemo(() => {
    const itemTotal = items.reduce((s, it) => s + (it.amount || 0), 0);
    const subtotal = itemTotal * cohorts; // one year's programme cost across all cohorts
    const orgAmount = orgContrib ? Math.round(subtotal * 0.3) : 0; // ONE year of org contribution
    const annualTotal = subtotal + orgAmount;
    const total = annualTotal * years; // full multi-year ask INCLUDING org contribution
    const totalOrgContribution = orgAmount * years; // multi-year org contribution to match `total`
    const totalStudents = studentsPerCohort * cohorts * years;
    const perStudent = totalStudents > 0 ? Math.round(total / totalStudents) : 0;
    return { itemTotal, subtotal, orgAmount, totalOrgContribution, annualTotal, total, totalStudents, perStudent };
  }, [items, cohorts, years, orgContrib, studentsPerCohort]);

  const hasChanges = useMemo(() => {
    if (!saved) return items.length > 0;
    const savedYears = saved.years || 1;
    if (saved.typeNum !== typeNum || saved.cohorts !== cohorts || savedYears !== years || saved.includeOrgContribution !== orgContrib) return true;
    if (saved.items.length !== items.length) return true;
    return saved.items.some((si, i) => si.label !== items[i]?.label || si.amount !== items[i]?.amount);
  }, [saved, typeNum, cohorts, years, orgContrib, items]);

  const saveBudget = useCallback(() => {
    const budgetTable = {
      typeNum,
      typeLabel: pt?.label || "",
      cohorts,
      years,
      studentsPerCohort,
      duration: pt?.duration || "",
      items: items.map((it) => ({ label: it.label, amount: it.amount, isCustom: it.isCustom })),
      includeOrgContribution: orgContrib,
      subtotal: calcs.subtotal,
      orgContribution: calcs.orgAmount, // ONE year (matches the UI line item)
      totalOrgContribution: calcs.totalOrgContribution, // multi-year (matches the grand total)
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
  }, [typeNum, pt, cohorts, years, studentsPerCohort, items, orgContrib, calcs, onUpdate, g.id]);

  const clearBudget = useCallback(() => {
    setTypeNum(null);
    setCohorts(1);
    setYears(1);
    setItems([]);
    setOrgContrib(false);
    setEditing(true);
    setCollapsed(false);
    onUpdate(g.id, { budgetTable: null, askYears: null });
  }, [onUpdate, g.id]);

  // Edit → Cancel: exit edit mode and revert every atom to the last saved budget
  const cancelEdit = useCallback(() => {
    setEditing(false);
    setTypeNum(saved?.typeNum || null);
    setCohorts(saved?.cohorts || 1);
    setYears(saved?.years || 1);
    setItems(saved?.items || []);
    setOrgContrib(saved?.includeOrgContribution || false);
  }, [saved]);

  const updateItem = useCallback((idx, field, value) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  }, []);
  const removeItem = useCallback((idx) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }, []);
  const addItem = useCallback((label, amount) => {
    const trimmed = (label || "").trim();
    if (!trimmed) return false;
    setItems((prev) => [...prev, { label: trimmed, amount: amount || 0, isCustom: true }]);
    return true;
  }, []);

  const funderBudget = g.funderBudget;
  const utilization = funderBudget && calcs.total > 0 ? Math.round((calcs.total / funderBudget) * 100) : null;

  return {
    saved,
    typeNum, cohorts, years, items, orgContrib,
    editing, collapsed, setEditing, setCollapsed,
    pt, studentsPerCohort, calcs, hasChanges, funderBudget, utilization,
    selectType, setCohorts, setYears, setOrgContrib,
    updateItem, removeItem, addItem,
    saveBudget, clearBudget, cancelEdit,
  };
}
