import { useState, useRef, useCallback } from "react";
import { getCompliance, updateComplianceDoc, createComplianceDoc } from "@/api";

/**
 * Compliance-document state + upsert mutation. Extracted from App.jsx.
 * `setComplianceDocs` is exposed so the initial batched load in App's loadData
 * can seed the list (preserving the single Promise.all fetch — the hook does not
 * fetch on mount itself). `upsertCompDoc` create/updates then refetches.
 *
 * @param toast the toast emitter (from useToast)
 * @returns { complianceDocs, setComplianceDocs, upsertCompDoc }
 */
export default function useComplianceDocs(toast) {
  const [complianceDocs, setComplianceDocs] = useState([]);
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const upsertCompDoc = useCallback(async (doc) => {
    try {
      if (doc.id) {
        await updateComplianceDoc(doc.id, doc);
      } else {
        const result = await createComplianceDoc(doc);
        doc = { ...doc, id: result.id };
      }
      const updated = await getCompliance().catch(() => []);
      setComplianceDocs(updated || []);
      toastRef.current?.(`${doc.name} updated`, { type: "success", duration: 2000 });
    } catch (err) {
      console.error("Compliance doc update failed:", err);
      toastRef.current?.(`Failed to update ${doc.name}`, { type: "error" });
    }
  }, []);

  return { complianceDocs, setComplianceDocs, upsertCompDoc };
}
