import { useState, useCallback } from "react";
import { uid, td } from "@/utils";
import { PTYPES } from "@/data/funderStrategy";
import { uploadFile } from "@/api";

/**
 * Add-grant wizard view-model. Owns every wizard field (name/funder/type/
 * deadline/programmes/focus/ask/source/notes/attachments/auto-AI), the derived
 * ask + notes builders, the reset, and the submit (`addGrantEnhanced`). The
 * component renders the steps from this and only keeps transient view state
 * (which step is shown, the inline "add custom focus" input text, etc.).
 *
 * Submit behaviour is identical to the previous inline implementation: same
 * validation, same payload shape passed to onAddGrant, same custom-programme id
 * generation, same background file upload.
 *
 * @param defaultType the default funder type (funderTypes?.[0] || "Foundation")
 * @param deps        { onAddGrant, onSelectGrant } callbacks
 */
export default function useGrantWizard(defaultType, deps = {}) {
  const { onAddGrant, onSelectGrant } = deps;

  const [wizStep, setWizStep] = useState(1); // 1 = funder, 2 = programme, 3 = AI actions
  const [newName, setNewName] = useState("");
  const [newFunder, setNewFunder] = useState("");
  const [newType, setNewType] = useState(defaultType || "Foundation");
  const [newAsk, setNewAsk] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [newRel, setNewRel] = useState("Cold");
  const [newMarket, setNewMarket] = useState("sa");
  const [newApplyUrl, setNewApplyUrl] = useState("");
  const [newSource, setNewSource] = useState("scout");
  // Step 2: multi-programme selection — Map<ptypeKey, { cohorts }> where key is "1"-"8" or "custom-N"
  const [selectedPTypes, setSelectedPTypes] = useState(new Map());
  const [customProgrammes, setCustomProgrammes] = useState([]); // [{ id, name, cost }]
  const [newFocusTags, setNewFocusTags] = useState([]);
  const [newNotes, setNewNotes] = useState("");
  const [pendingFiles, setPendingFiles] = useState([]); // files to upload after grant creation
  // Step 3: AI actions
  const [autoAI, setAutoAI] = useState({ fitscore: true, research: false, draft: false });
  const [addError, setAddError] = useState("");

  const calcTotalAsk = useCallback((ptypes, customs, includeOrgCost = true) => {
    let total = 0;
    for (const [key, { cohorts }] of ptypes) {
      if (key.startsWith("custom-")) {
        const cp = customs.find(c => c.id === key);
        if (cp?.cost) total += cp.cost * cohorts;
      } else {
        const pt = PTYPES[key];
        if (pt?.cost) total += pt.cost * cohorts;
      }
    }
    if (includeOrgCost && total > 0) total = Math.round(total * 1.3);
    return total;
  }, []);

  const buildPtypeNotes = useCallback((ptypes, customs, userNotes) => {
    const parts = [];
    for (const [key, { cohorts }] of ptypes) {
      if (key.startsWith("custom-")) {
        const cp = customs.find(c => c.id === key);
        if (cp) parts.push(`Custom: ${cp.name}${cohorts > 1 ? ` (${cohorts} cohorts)` : ""} R${(cp.cost || 0).toLocaleString()}/cohort`);
      } else {
        parts.push(`Type ${key}${cohorts > 1 ? ` (${cohorts} cohorts)` : ""}`);
      }
    }
    return [parts.join(" + "), userNotes].filter(Boolean).join("\n");
  }, []);

  const resetWizard = useCallback(() => {
    setAddError(""); setWizStep(1);
    setSelectedPTypes(new Map()); setCustomProgrammes([]);
    setNewAsk(""); setNewDeadline(""); setNewRel("Cold");
    setNewMarket("sa"); setNewApplyUrl(""); setNewSource("scout"); setNewFocusTags([]);
    setNewNotes(""); setPendingFiles([]);
    setAutoAI({ fitscore: true, research: false, draft: false });
  }, []);

  /**
   * Submit the wizard. Returns true when a grant was created (so the component
   * can close the modal + clear its transient input), false on validation
   * failure (component keeps the modal open and shows addError).
   */
  const addGrantEnhanced = useCallback((runAI = false) => {
    const trimName = (newName || "").trim();
    const trimFunder = (newFunder || "").trim();
    if (!trimName || trimName.length < 2) { setAddError("Grant name must be at least 2 characters"); return false; }
    if (!trimFunder) { setAddError("Funder name is required"); return false; }
    setAddError("");

    const calculatedAsk = calcTotalAsk(selectedPTypes, customProgrammes, true);
    const enteredAsk = parseInt(String(newAsk).replace(/[,\s]/g, "")) || 0;
    const finalAsk = enteredAsk || calculatedAsk;
    const ptypeNotes = buildPtypeNotes(selectedPTypes, customProgrammes, newNotes);
    const pendingAI = runAI && Object.values(autoAI).some(Boolean) ? autoAI : null;

    const ptypeSummary = [...selectedPTypes.entries()].map(([k, v]) =>
      k.startsWith("custom-") ? "Custom" : `T${k}${v.cohorts > 1 ? `×${v.cohorts}` : ""}`
    ).join("+");

    const grantId = uid();
    const g = {
      id: grantId, name: trimName, funder: trimFunder, type: newType,
      stage: "scouted", ask: finalAsk, funderBudget: finalAsk || null,
      askSource: enteredAsk ? "manual" : calculatedAsk ? "calculated" : null,
      aiRecommendedAsk: null,
      deadline: newDeadline || null,
      focus: newFocusTags, geo: [], rel: newRel, pri: 3, hrs: 0,
      notes: ptypeNotes, market: newMarket,
      log: [{ d: td(), t: `Grant created · R${finalAsk.toLocaleString()}${ptypeSummary ? ` · ${ptypeSummary}` : ""}` }],
      on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null,
      applyUrl: newApplyUrl,
      source: newSource,
      _pendingAI: pendingAI,
    };

    const filesToUpload = [...pendingFiles];
    onAddGrant(g);
    resetWizard();
    if (pendingAI) onSelectGrant?.(grantId);

    // Upload any attached files in the background after grant creation
    if (filesToUpload.length > 0) {
      (async () => {
        for (const file of filesToUpload) {
          try { await uploadFile(file, grantId, null); }
          catch (err) { console.error("Upload failed:", file.name, err.message); }
        }
      })();
    }
    return true;
  }, [
    newName, newFunder, newType, newAsk, newDeadline, newRel, newMarket,
    newApplyUrl, newSource, newFocusTags, newNotes, selectedPTypes,
    customProgrammes, autoAI, pendingFiles, calcTotalAsk, buildPtypeNotes,
    resetWizard, onAddGrant, onSelectGrant,
  ]);

  return {
    // step
    wizStep, setWizStep,
    // fields
    newName, setNewName, newFunder, setNewFunder, newType, setNewType,
    newAsk, setNewAsk, newDeadline, setNewDeadline, newRel, setNewRel,
    newMarket, setNewMarket, newApplyUrl, setNewApplyUrl, newSource, setNewSource,
    selectedPTypes, setSelectedPTypes, customProgrammes, setCustomProgrammes,
    newFocusTags, setNewFocusTags, newNotes, setNewNotes,
    pendingFiles, setPendingFiles, autoAI, setAutoAI,
    addError, setAddError,
    // derived + actions
    calcTotalAsk, buildPtypeNotes, resetWizard, addGrantEnhanced,
  };
}
