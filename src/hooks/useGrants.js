import { useState, useRef } from "react";
import { uid, td, addD } from "@/utils";
import { addGrant as apiAddGrant, removeGrant } from "@/api";
import { CAD } from "@/data/constants";

/**
 * Grants collection + mutations, extracted from App.jsx. `setGrants` is exposed
 * because the initial load, the background-hygiene pass, logout-reset, and the
 * Admin panel all need to set the list directly.
 *
 * - updateGrant: merges changes, auto-logs meaningful field changes, and
 *   auto-schedules follow-ups (CAD cadence) when moving to submitted/awaiting,
 *   then persists via the injected debounced dSave.
 * - addGrant: optimistic add + API persist with rollback + toast.
 * - deleteGrant: optimistic remove with a 6s-delayed server delete and an Undo
 *   toast (longer than the 5s toast so Undo actually works).
 *
 * Mutations are intentionally NOT memoised (recreated each render, reading the
 * latest stages/team/dSave) — matching the original inline behaviour.
 *
 * When `readOnly` is set (org's subscription expired AND a super-admin enabled the
 * read-only lock), all mutations no-op with an explanatory toast — viewing still
 * works.
 *
 * @param deps { stages, team, dSave, toast, readOnly }
 * @returns { grants, setGrants, updateGrant, addGrant, deleteGrant }
 */
export default function useGrants({ stages = [], team = [], dSave, toast, readOnly = false } = {}) {
  const [grants, setGrants] = useState([]);
  const pendingDeletes = useRef({});

  // Subscription read-only lock: block writes, keep reads.
  const blockedByReadOnly = () => {
    if (!readOnly) return false;
    toast?.("Read-only — your subscription has expired. Upgrade to make changes.", { type: "warning", duration: 4000 });
    return true;
  };

  const updateGrant = (id, updates) => {
    if (blockedByReadOnly()) return;
    setGrants(prev => {
      const old = prev.find(g => g.id === id);
      if (!old) return prev;

      // Auto-log meaningful changes (skip if caller is already setting log directly)
      const autoEntries = [];
      if (!updates.log) {
        if (updates.stage && updates.stage !== old.stage) {
          const fromLabel = stages.find(s => s.id === old.stage)?.label || old.stage;
          const toLabel = stages.find(s => s.id === updates.stage)?.label || updates.stage;
          autoEntries.push(`Stage moved: ${fromLabel} → ${toLabel}`);
        }
        if (updates.owner && updates.owner !== old.owner) {
          const member = team.find(t => t.id === updates.owner);
          autoEntries.push(`Assigned to ${member?.name || updates.owner}`);
        }
        if (updates.ask !== undefined && updates.ask !== old.ask && updates.ask > 0) {
          autoEntries.push(`Ask updated to R${Number(updates.ask).toLocaleString()}`);
        }
        if (updates.deadline && updates.deadline !== old.deadline) {
          autoEntries.push(`Deadline set to ${updates.deadline}`);
        }
        if (updates.priority !== undefined && updates.priority !== old.priority) {
          autoEntries.push(`Priority changed to ${updates.priority}`);
        }
      }

      // Auto-schedule follow-ups when moving to submitted/awaiting
      let autoFups = undefined;
      if (updates.stage && ["submitted", "awaiting"].includes(updates.stage) && !["submitted", "awaiting"].includes(old.stage)) {
        const cadence = CAD[old.type] || CAD["Foundation"];
        if (cadence && cadence.length > 0) {
          const baseDate = td();
          autoFups = cadence.map(step => ({
            date: addD(baseDate, step.d),
            label: step.l,
            type: step.t,
            done: false,
          }));
          autoEntries.push(`Follow-ups scheduled: ${cadence.length} touchpoints over ${cadence[cadence.length - 1].d} days`);
        }
      }

      const logAdditions = autoEntries.length
        ? autoEntries.map(t => ({ d: td(), t }))
        : [];
      const mergedLog = logAdditions.length
        ? [...(old.log || []), ...logAdditions]
        : undefined;

      const merged = { ...old, ...updates, ...(mergedLog ? { log: mergedLog } : {}), ...(autoFups ? { fups: autoFups } : {}) };
      const next = prev.map(g => g.id === id ? merged : g);
      dSave(id, merged);
      return next;
    });
  };

  const addGrant = async (grant) => {
    if (blockedByReadOnly()) return;
    const g = { ...grant, id: grant.id || uid() };
    setGrants(prev => [...prev, g]);
    try {
      await apiAddGrant(g);
      toast(`${g.name} added to pipeline`, { type: "success", duration: 3000 });
    } catch (err) {
      console.error("Failed to save grant:", g.name, err);
      setGrants(prev => prev.filter(x => x.id !== g.id));
      toast(`Failed to add ${g.name}. Please try again.`, { type: "error" });
    }
  };

  const deleteGrant = (id) => {
    if (blockedByReadOnly()) return;
    const backup = grants.find(g => g.id === id);
    if (!backup) return;
    setGrants(prev => prev.filter(g => g.id !== id));

    // Clear any existing timer for this grant (re-delete edge case)
    if (pendingDeletes.current[id]) clearTimeout(pendingDeletes.current[id]);

    // Delay server delete so undo actually works
    pendingDeletes.current[id] = setTimeout(async () => {
      delete pendingDeletes.current[id];
      try {
        await removeGrant(id);
      } catch (err) {
        console.error("Failed to delete grant:", id, err);
        setGrants(prev => [...prev, backup]);
        toast(`Failed to delete — ${backup.name} restored`, { type: "error" });
      }
    }, 6000); // 6s — slightly longer than the 5s toast

    toast(`${backup.name} deleted`, {
      type: "undo",
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          clearTimeout(pendingDeletes.current[id]);
          delete pendingDeletes.current[id];
          setGrants(prev => [...prev, backup]);
          toast(`${backup.name} restored`, { type: "success", duration: 2000 });
        },
      },
    });
  };

  return { grants, setGrants, updateGrant, addGrant, deleteGrant };
}
