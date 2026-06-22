import { useState, useCallback, useEffect } from "react";
import { getOrg, getGrants, getTeam, getProfile, getPipelineConfig, getCompliance } from "@/api";
import { applyOrgTheme } from "@/theme";

/**
 * Initial workspace load after auth. Extracted from App.jsx. Owns the `loading`
 * flag and the auth-triggered fetch; the org/profile/team/stages/funderTypes
 * state stays in App and is written via the injected setters (avoids a circular
 * dependency, since useGrants/useAI need stages/team). Grants and compliance are
 * seeded through their hooks' setters.
 *
 * Preserves the original behaviour: one Promise.all, the grant migration
 * (funderBudget/askSource backfill + pre-submission ask reset), the per-changed
 * -grant dSave, and the "Unassigned" team member guarantee.
 *
 * @param deps { authed, setOrg, setProfile, setTeam, setStages, setFunderTypes,
 *               setComplianceDocs, setGrants, dSave, toast }
 * @returns { loading, loadData }
 */
export default function useDataLoad({
  authed, setOrg, setProfile, setTeam, setStages, setFunderTypes,
  setComplianceDocs, setGrants, dSave, toast,
}) {
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [orgData, grantsData, teamData, profileData, pipeConfig, compData] = await Promise.all([
        getOrg(),
        getGrants(),
        getTeam(),
        getProfile(),
        getPipelineConfig(),
        getCompliance().catch(() => []),
      ]);
      setOrg(orgData);
      applyOrgTheme(orgData);
      setComplianceDocs(compData || []);

      // Migrate existing grants: backfill funderBudget/askSource for pre-redesign grants
      const PRE_SUB = ["scouted", "vetting", "qualifying", "drafting", "review"];
      const raw = grantsData || [];
      const migrated = raw.map(g => {
        // Phase 1: backfill funderBudget for grants that don't have it yet
        if (g.funderBudget === undefined) {
          return { ...g, funderBudget: g.ask || null, askSource: g.ask ? "scout-aligned" : null, aiRecommendedAsk: null };
        }
        // Phase 2: for pre-submission grants where ask was pre-set from seed data (not AI-derived
        // or user-overridden), reset ask to 0 so the AI draft can propose an ambitious ask
        if (g.askSource === "scout-aligned" && PRE_SUB.includes(g.stage) && !g.aiDraft) {
          return { ...g, ask: 0, funderBudget: g.funderBudget || g.ask || null, askSource: null };
        }
        return g;
      });
      setGrants(migrated);
      migrated.forEach((g, i) => { if (g !== raw[i]) dSave(g.id, g); });

      setProfile(profileData);

      // Team: ensure "Unassigned" exists
      const t = teamData || [];
      if (!t.find(m => m.id === "team")) t.push({ id: "team", name: "Unassigned", initials: "—", role: "none" });
      setTeam(t);

      // Pipeline config
      if (pipeConfig) {
        if (pipeConfig.stages) setStages(pipeConfig.stages);
        if (pipeConfig.funder_types) setFunderTypes(pipeConfig.funder_types);
      }
    } catch (err) {
      console.error("Failed to load data:", err);
      toast(`Failed to load workspace: ${err.message}`, { type: "error", duration: 0 });
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- all setters/dSave/toast are stable refs
  }, []);

  useEffect(() => {
    if (authed) loadData();
  }, [authed, loadData]);

  return { loading, loadData };
}
