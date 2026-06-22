import { useState, useCallback } from "react";
import { upsertTeamMember, deleteTeamMember, adminResetPassword } from "@/api";

/**
 * Team-member admin actions: add, role change, password reset, delete.
 * Owns the busy flag, the transient flash message, and the single inline
 * action panel that may be open (`activeAction`). The component renders rows
 * from this, keeps the add-member form input text of its own, and reads
 * `actionMsg`/`actionBusy`/`activeAction` to drive the UI.
 *
 * @param onTeamChanged callback fired after a mutation that changes the roster
 */
export default function useTeamAdmin(onTeamChanged) {
  // Single active inline action — only one row's action panel is open at a time.
  // Shape: { id, mode } | null, where mode is 'edit' | 'reset' | 'delete'.
  const [activeAction, setActiveAction] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);

  const flash = useCallback((msg) => {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(null), 3000);
  }, []);

  // Resolves true when the member was added (so the component can clear its
  // add-member form), false/undefined otherwise.
  const handleAdd = useCallback(async ({ name, email, role }) => {
    if (!name.trim()) return false;
    setActionBusy(true);
    let ok = false;
    try {
      const initials = name.trim().split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
      const id = name.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      await upsertTeamMember({ id, name: name.trim(), initials, role, email: email.trim() || null });
      flash(`${name.trim()} added`);
      onTeamChanged?.();
      ok = true;
    } catch (e) { flash(`Error: ${e.message}`); }
    setActionBusy(false);
    return ok;
  }, [flash, onTeamChanged]);

  const handleRoleChange = useCallback(async (memberId, editRole) => {
    setActionBusy(true);
    try {
      await upsertTeamMember({ id: memberId, role: editRole });
      setActiveAction(null);
      flash("Role updated");
      onTeamChanged?.();
    } catch (e) { flash(`Error: ${e.message}`); }
    setActionBusy(false);
  }, [flash, onTeamChanged]);

  // Resolves true on a successful reset (so the component can clear its
  // password input), false otherwise.
  const handleResetPassword = useCallback(async (resetPw) => {
    if (!resetPw || resetPw.length < 6) { flash("Password must be 6+ characters"); return false; }
    setActionBusy(true);
    let ok = false;
    try {
      await adminResetPassword(activeAction?.id, resetPw);
      setActiveAction(null);
      flash("Password reset");
      ok = true;
    } catch (e) { flash(`Error: ${e.message}`); }
    setActionBusy(false);
    return ok;
  }, [flash, activeAction]);

  const handleDelete = useCallback(async (id) => {
    setActionBusy(true);
    try {
      await deleteTeamMember(id);
      setActiveAction(null);
      flash("User removed");
      onTeamChanged?.();
    } catch (e) { flash(`Error: ${e.message}`); }
    setActionBusy(false);
  }, [flash, onTeamChanged]);

  return {
    activeAction, setActiveAction,
    actionBusy, actionMsg, flash,
    handleAdd, handleRoleChange, handleResetPassword, handleDelete,
  };
}
