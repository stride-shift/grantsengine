import { useState, useEffect, useRef, useMemo } from "react";
import {
  detectForm,
  updateAutofillMappings,
  runAutofill,
  submitAutofill,
  verifyUrls,
  getUploads,
  uploadFile,
  deleteUpload,
} from "@/api";
import { detectSubmissionMethod, assembleText, isAIError } from "@/utils";
import { buildGlossaryAppendix } from "@/data/glossary";

// ── Pure HTML helpers for the PDF export — module scope (no component-state closure). ──
export const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const renderPara = (line) => {
  const t = line.trim();
  if (!t) return "<br/>";
  if (t.startsWith("- ") || t.startsWith("• ") || t.startsWith("* ")) return `<li>${escapeHtml(t.slice(2))}</li>`;
  if (t.startsWith("**") && t.endsWith("**")) return `<p style="font-weight:700;margin:12px 0 4px">${escapeHtml(t.replace(/\*\*/g, ""))}</p>`;
  return `<p>${escapeHtml(t)}</p>`;
};

/**
 * Submission Center / autofill view-model. Owns the form-detection job, the
 * field/mapping state + save lifecycle, grant- and org-scoped uploads, the
 * required-docs extraction, the AI apply-URL finder, the download builders
 * (docx/pdf/txt + glossary handling) and the autofill/submit flows.
 *
 * The component renders from this and keeps only transient input state (manual
 * URL text, credentials being typed, which panel is expanded, copied-field
 * feedback) plus all JSX. Actions take arguments rather than reading the
 * component's input text.
 *
 * @param grant         the grant being submitted
 * @param onSubmitted   (jobId) called after a successful final submit
 * @param onRunAI       (action, grant) AI proxy used for doc extraction + URL find
 * @param onUpdateGrant (grantId, changes) persistence callback
 */
export default function useAutofill({ grant, onSubmitted, onRunAI, onUpdateGrant, onTriggerMagic, generatingProposal, autoPrepare }) {
  // Form-detection + mapping state
  const [job, setJob] = useState(null);
  const [mappings, setMappings] = useState([]);
  const [fields, setFields] = useState([]);
  const [formType, setFormType] = useState(null);
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [notes, setNotes] = useState("");
  const [fetchError, setFetchError] = useState(null);
  const [resolvedUrl, setResolvedUrl] = useState(null);
  const [urlSource, setUrlSource] = useState(null);
  const [edited, setEdited] = useState(false);

  // Busy flags
  const [detecting, setDetecting] = useState(false);
  const [filling, setFilling] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // AI apply-URL finder
  const [findingUrl, setFindingUrl] = useState(false);
  const [findUrlResult, setFindUrlResult] = useState(null); // last AI search outcome

  // Submission Center — required docs checklist, uploaded files
  const [requiredDocs, setRequiredDocs] = useState(null); // null = unloaded, [] = empty, [{name, required, note}]
  const [reqDocsSummary, setReqDocsSummary] = useState("");
  const [extractingDocs, setExtractingDocs] = useState(false);
  const [uploads, setUploads] = useState([]); // grant-scoped uploads
  const [orgUploads, setOrgUploads] = useState([]); // org-wide uploads (compliance docs)
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Assemble the full proposal text for preview/attaching
  const assembledProposal = useMemo(() => {
    if (!grant?.aiSections) return grant?.aiDraft || "";
    return assembleText(grant.aiSections, grant.aiSectionsOrder);
  }, [grant?.aiSections, grant?.aiSectionsOrder, grant?.aiDraft]);

  // Auto-trigger the proposal generation when the panel opens and the grant
  // has no sections yet.
  const magicTriggeredRef = useRef(false);
  useEffect(() => {
    if (magicTriggeredRef.current) return;
    if (!onTriggerMagic) return;
    const hasSections = grant?.aiSections && Object.values(grant.aiSections).some(s => s?.text);
    const hasDraft = !!grant?.aiDraft;
    if (hasSections || hasDraft || generatingProposal) return;
    magicTriggeredRef.current = true;
    onTriggerMagic();
  }, [grant?.id, grant?.aiSections, grant?.aiDraft, generatingProposal, onTriggerMagic]);

  // Load uploads when the panel opens
  useEffect(() => {
    if (!grant?.id) return;
    (async () => {
      try {
        const [grantU, orgU] = await Promise.all([
          getUploads(grant.id).catch(() => []),
          getUploads().catch(() => []),
        ]);
        setUploads(Array.isArray(grantU) ? grantU : []);
        setOrgUploads(Array.isArray(orgU) ? orgU : []);
      } catch { /* non-blocking */ }
    })();
  }, [grant?.id]);

  // Load cached requiredDocs from the grant; else trigger extraction
  useEffect(() => {
    if (!grant) return;
    if (grant.requiredDocs && Array.isArray(grant.requiredDocs.documents)) {
      setRequiredDocs(grant.requiredDocs.documents);
      setReqDocsSummary(grant.requiredDocs.summary || "");
      return;
    }
    // Auto-extract if we have research/brief and haven't tried yet
    if ((grant.funderBrief || grant.aiResearch) && requiredDocs === null && !extractingDocs && onRunAI) {
      runExtractRequiredDocs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grant?.id, grant?.funderBrief, grant?.aiResearch]);

  const runExtractRequiredDocs = async () => {
    if (extractingDocs || !onRunAI) return;
    setExtractingDocs(true);
    try {
      const raw = await onRunAI("extractRequiredDocs", grant);
      if (isAIError(raw)) { console.warn("extractRequiredDocs:", raw); setRequiredDocs([]); return; }
      const txt = String(raw || "");
      const cleaned = txt.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
      const parsed = start >= 0 && end > start ? JSON.parse(cleaned.slice(start, end + 1)) : { documents: [], summary: "" };
      const docs = Array.isArray(parsed.documents) ? parsed.documents : [];
      setRequiredDocs(docs);
      setReqDocsSummary(parsed.summary || "");
      // Cache on the grant so we don't re-extract every open
      if (onUpdateGrant) onUpdateGrant(grant.id, { requiredDocs: { documents: docs, summary: parsed.summary || "", source: "funder-brief" }, requiredDocsAt: new Date().toISOString() });
    } catch (e) {
      console.error("Failed to extract required docs:", e);
      setRequiredDocs([]);
    } finally {
      setExtractingDocs(false);
    }
  };

  // Match a required-doc name to an uploaded file (case-insensitive substring match)
  const matchUpload = (docName) => {
    if (!docName) return null;
    const needle = docName.toLowerCase();
    const tokens = needle.split(/\s+/).filter(t => t.length > 3);
    const all = [...uploads, ...orgUploads];
    return all.find(u => {
      const hay = `${u.original_name || ""} ${u.filename || ""} ${u.category || ""}`.toLowerCase();
      if (hay.includes(needle)) return true;
      // Any 3+ char token matches?
      return tokens.some(t => hay.includes(t));
    });
  };

  const handleUploadFile = async (file) => {
    if (!file || !grant?.id) return;
    setUploadingDoc(true);
    try {
      const result = await uploadFile(file, grant.id);
      // Refresh uploads
      const fresh = await getUploads(grant.id);
      setUploads(Array.isArray(fresh) ? fresh : []);
      return result;
    } catch (e) {
      alert(`Upload failed: ${e.message}`);
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleRemoveUpload = async (uploadId) => {
    if (!uploadId) return;
    if (!confirm("Remove this document from this grant?")) return;
    try {
      await deleteUpload(uploadId);
      const fresh = await getUploads(grant.id);
      setUploads(Array.isArray(fresh) ? fresh : []);
    } catch (e) {
      alert(`Remove failed: ${e.message}`);
    }
  };

  // Build the assembled text with optional glossary appendix so downloads always
  // match what's visible in the preview.
  const buildDownloadText = () => {
    if (!assembledProposal) return "";
    if (grant?.includeGlossary) {
      const appendix = buildGlossaryAppendix(assembledProposal);
      return appendix ? assembledProposal + "\n\n" + appendix : assembledProposal;
    }
    return assembledProposal;
  };

  const filenameBase = `${(grant?.name || "proposal").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-proposal`;

  // DOCX export — uses the same generator as the main ProposalWorkspace so the
  // output looks identical to what users already get there.
  const downloadAsDocx = async () => {
    const text = buildDownloadText();
    if (!text) return;
    try {
      const { generateDocxFromSections } = await import("@/docxGenerator");
      const sections = grant?.aiSections || {};
      const order = grant?.aiSectionsOrder || [];
      // If user has a glossary toggled on AND it's in the text, splice a Glossary
      // pseudo-section so the docx renders the labelled definitions properly.
      let sectionsForDocx = sections;
      let orderForDocx = order;
      if (grant?.includeGlossary) {
        const appendix = buildGlossaryAppendix(assembledProposal);
        if (appendix) {
          sectionsForDocx = { ...sections, Glossary: { text: appendix.replace(/^---\n/, "").replace(/^## Glossary\n/m, "").trim() } };
          orderForDocx = [...order, "Glossary"];
        }
      }
      await generateDocxFromSections(sectionsForDocx, orderForDocx, filenameBase, {
        grantName: grant?.name,
        funder: grant?.funder,
        ask: grant?.ask,
        type: grant?.type,
      });
    } catch (e) {
      alert(`DOCX export failed: ${e.message}\n\nFalling back to plain text.`);
      downloadAsTxt();
    }
  };

  // PDF export — browser print dialog opens a print-ready window with the
  // proposal HTML; the user clicks "Save as PDF" in the print sheet.
  const downloadAsPdf = () => {
    const text = buildDownloadText();
    if (!text) return;
    const order = grant?.aiSectionsOrder || [];
    const sections = grant?.aiSections || {};
    const sectionsHtml = order.map((name, i) => {
      const sec = sections[name];
      if (!sec?.text) return "";
      const body = sec.text.split("\n").map(renderPara).join("\n");
      return `<section><h2>${i + 1}. ${escapeHtml(name)}</h2>${body}</section>`;
    }).join("");
    const glossaryHtml = (() => {
      if (!grant?.includeGlossary) return "";
      const appendix = buildGlossaryAppendix(assembledProposal);
      if (!appendix) return "";
      const cleaned = appendix.replace(/^---\n/, "").replace(/^## Glossary[\s\S]*?\n/m, "").trim();
      return `<section><h2>${order.length + 1}. Glossary</h2>${cleaned.split("\n").map(renderPara).join("\n")}</section>`;
    })();
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(grant?.name || "Proposal")}</title>
      <style>
        @page { size: A4; margin: 22mm 18mm; }
        body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; line-height: 1.55; color: #1a1a1a; max-width: 100%; }
        h1 { font-family: Helvetica, Arial, sans-serif; font-size: 20pt; margin: 0 0 4pt; }
        .meta { font-family: Helvetica, Arial, sans-serif; font-size: 10pt; color: #555; margin-bottom: 20pt; padding-bottom: 8pt; border-bottom: 1px solid #ddd; }
        h2 { font-family: Helvetica, Arial, sans-serif; font-size: 13pt; margin: 18pt 0 6pt; padding-bottom: 4pt; border-bottom: 1px solid #eee; page-break-after: avoid; }
        p { margin: 0 0 6pt; }
        section { page-break-inside: avoid; margin-bottom: 14pt; }
        ul, ol { margin: 4pt 0 8pt 18pt; padding: 0; }
        li { margin-bottom: 3pt; }
      </style></head><body>
      <h1>${escapeHtml(grant?.name || "Proposal")}</h1>
      <div class="meta">
        ${grant?.funder ? `<div><strong>Funder:</strong> ${escapeHtml(grant.funder)}</div>` : ""}
        ${grant?.ask > 0 ? `<div><strong>Ask:</strong> R${Number(grant.ask).toLocaleString()}</div>` : ""}
        ${grant?.deadline ? `<div><strong>Deadline:</strong> ${new Date(grant.deadline).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}</div>` : ""}
      </div>
      ${sectionsHtml}
      ${glossaryHtml}
      </body></html>`;
    const w = window.open("", "_blank", "noopener,width=900,height=1100");
    if (!w) { alert("Pop-up blocked — allow pop-ups for this site to export PDF."); return; }
    w.document.write(html);
    w.document.close();
    // Give the new window a moment to render before opening the print dialog
    setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 300);
  };

  // Plain text — kept as a fallback inside downloadAsDocx, otherwise unused now
  const downloadAsTxt = () => {
    const text = buildDownloadText();
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filenameBase}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // AI-search for the funder's real application URL when one is missing.
  const findApplyUrlWithAI = async () => {
    if (!onRunAI || !onUpdateGrant) {
      setError("AI URL search not wired up. Add an Apply link on the grant detail page.");
      return;
    }
    setFindingUrl(true); setError(""); setFindUrlResult(null);
    try {
      const raw = await onRunAI("findApplyUrl", grant);
      if (isAIError(raw)) { setError(raw); return; }
      const txt = String(raw || "");

      // 1. Try to parse structured candidates from JSON
      let candidates = [];
      let summary = "";
      try {
        const cleaned = txt.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
        const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
        if (start >= 0 && end > start) {
          const parsed = JSON.parse(cleaned.slice(start, end + 1));
          if (Array.isArray(parsed.candidates)) candidates = parsed.candidates;
          if (parsed.summary) summary = parsed.summary;
          // Legacy single-url shape — still handle it
          if (parsed.url && !candidates.length) candidates = [{ url: parsed.url, pageType: parsed.pageType, note: parsed.note }];
        }
      } catch { /* fall through to text extraction */ }

      // 2. Also extract any URLs from the raw text as a safety net (catches AI dropping the JSON shape)
      const urlRegex = /https?:\/\/[^\s"'<>)\]]+/gi;
      const textUrls = (txt.match(urlRegex) || []).map(u => u.replace(/[.,;:)\]}>]+$/, ""));
      for (const u of textUrls) {
        if (!candidates.some(c => c.url === u)) candidates.push({ url: u, pageType: "info_page", note: "" });
      }

      // 3. Synthesize a likely funder homepage as ultimate fallback
      const slug = (grant.funder || "")
        .toLowerCase()
        .replace(/\b(the|foundation|trust|fund|group|company|corporation|corp|inc|ltd|pty|sa|africa)\b/g, "")
        .replace(/[^a-z0-9]/g, "")
        .trim();
      if (slug && slug.length >= 3) {
        const guesses = [
          `https://www.${slug}.co.za`,
          `https://${slug}.co.za`,
          `https://www.${slug}.com`,
          `https://www.${slug}.org`,
          `https://www.${slug}.org.za`,
        ];
        for (const g of guesses) {
          if (!candidates.some(c => c.url === g)) candidates.push({ url: g, pageType: "homepage", note: "Likely funder homepage (auto-generated guess)." });
        }
      }

      // Filter out unusable URLs (grounding redirects, non-http, dupes)
      const seen = new Set();
      candidates = candidates.filter(c => {
        if (!c.url || !/^https?:\/\//i.test(c.url)) return false;
        if (/vertexaisearch|grounding-api-redirect|google\.com\/url\?/.test(c.url)) return false;
        if (seen.has(c.url)) return false;
        seen.add(c.url);
        return true;
      });

      // Sort by page-type priority so the homepage is the LAST resort, not the first
      // verified one.
      const TYPE_PRIORITY = { form: 0, info_page: 1, contact: 2, homepage: 3 };
      candidates.sort((a, b) => (TYPE_PRIORITY[a.pageType] ?? 1) - (TYPE_PRIORITY[b.pageType] ?? 1));

      if (candidates.length === 0) {
        setFindUrlResult({ url: null, note: "AI couldn't find any candidate URLs and we couldn't guess the funder's domain." });
        return;
      }

      // Verify candidates in priority order — save the highest-priority one that loads
      const verifyRes = await verifyUrls(candidates.map(c => c.url));
      const statusByUrl = new Map((verifyRes || []).map(r => [r.url, r]));

      let winner = null;
      for (const c of candidates) {
        const status = statusByUrl.get(c.url);
        if (status?.ok === true) { winner = c; break; }
      }

      if (!winner) {
        // Surface the candidate list anyway so user can manually try them
        setFindUrlResult({
          url: null,
          note: `Tried ${candidates.length} candidate URL${candidates.length === 1 ? "" : "s"} — none loaded. The funder's website may be down or blocking automated checks.`,
          candidates: candidates.slice(0, 5),
        });
        return;
      }

      // Save and surface
      onUpdateGrant(grant.id, { applyUrl: winner.url });
      setFindUrlResult({
        url: winner.url,
        pageType: winner.pageType || "info_page",
        note: winner.note || summary || "",
        summary,
      });
      if (winner.pageType === "form") {
        setTimeout(() => handleDetect(), 200);
      }
    } catch (e) {
      setError(`URL search failed: ${e.message}`);
    } finally {
      setFindingUrl(false);
    }
  };

  const handleDetect = async () => {
    setDetecting(true); setError("");
    try {
      const data = await detectForm(grant.id);
      if (data.error) { setError(data.error); return; }
      setJob({ id: data.jobId });
      setFields(data.fields || []);
      setMappings(data.mappings || []);
      setFormType(data.formType);
      setRequiresLogin(data.requiresLogin);
      setNotes(data.notes || "");
      setFetchError(data.fetchError || null);
      setResolvedUrl(data.resolvedUrl || null);
      setUrlSource(data.urlSource || null);
      // Apply-page-derived required docs: auto-fill the checklist, but never
      // overwrite a brief-derived set (precedence: funder-brief > apply-page).
      if (data.requiredDocs && Array.isArray(data.requiredDocs.documents) && data.requiredDocs.documents.length) {
        const briefSourced = grant.requiredDocs?.source === "funder-brief";
        if (!briefSourced) {
          setRequiredDocs(data.requiredDocs.documents);
          setReqDocsSummary(data.requiredDocs.summary || "");
          if (onUpdateGrant) onUpdateGrant(grant.id, { requiredDocs: { documents: data.requiredDocs.documents, summary: data.requiredDocs.summary || "", source: "apply-page" }, requiredDocsAt: new Date().toISOString() });
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setDetecting(false);
    }
  };

  // Classify the funder's submission channel so we can show the right action.
  const submission = detectSubmissionMethod(grant);
  const isFormBased = submission.method === "form";

  useEffect(() => {
    // Only auto-analyse once the proposal is in place (so the form maps from the
    // finished draft, never mid-generation) and we have a form URL.
    if (grant?.applyUrl && !job && isFormBased && !generatingProposal) handleDetect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grant?.applyUrl, isFormBased, generatingProposal]);

  // Full-automation prep: when the panel is opened by the auto-draft flow and the
  // grant still has no apply URL, find it via AI (which persists it and auto-detects
  // a form). Runs once, only after any proposal generation has finished.
  const autoPrepRef = useRef(false);
  useEffect(() => {
    if (!autoPrepare || autoPrepRef.current) return;
    if (generatingProposal || grant?.applyUrl) return;
    if (!onRunAI || !onUpdateGrant) return;
    autoPrepRef.current = true;
    findApplyUrlWithAI();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrepare, generatingProposal, grant?.applyUrl]);

  const updateMapping = (fieldName, newValue) => {
    setMappings(prev => prev.map(m => m.fieldName === fieldName ? { ...m, suggestedValue: newValue } : m));
    setEdited(true);
  };

  const saveEdits = async () => {
    if (!job?.id || !edited) return;
    try {
      await updateAutofillMappings(job.id, mappings);
      setEdited(false);
    } catch (e) { setError(e.message); }
  };

  // Credentials are component-owned (typed transient state); the action takes
  // them as an argument rather than reading them itself.
  const handleAutoFill = async (credentials) => {
    if (!job?.id) return;
    if (edited) await saveEdits();
    setFilling(true); setError("");
    try {
      const creds = requiresLogin && credentials?.username ? credentials : null;
      const data = await runAutofill(job.id, creds);
      if (data.error && !data.service_configured) {
        setError(data.error + " Use copy buttons to fill manually.");
      } else if (data.error) {
        setError(data.error);
      } else {
        setJob({ ...job, screenshots: data.screenshots, sessionId: data.sessionId });
      }
    } catch (e) { setError(e.message); }
    finally { setFilling(false); }
  };

  const handleFinalSubmit = async () => {
    if (!job?.id) return;
    if (!confirm("Submit the application to the funder? This cannot be undone.")) return;
    setSubmitting(true); setError("");
    try {
      const data = await submitAutofill(job.id);
      if (data.success) {
        onSubmitted?.(job.id);
        alert("Application submitted successfully!");
      } else {
        setError(data.error || "Submission failed");
      }
    } catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  return {
    // form-detection + mapping state
    job, mappings, fields, formType, requiresLogin, notes, fetchError, resolvedUrl, urlSource, edited,
    // busy flags + error
    detecting, filling, submitting, error, setError,
    // AI apply-URL finder
    findingUrl, findUrlResult,
    // submission center / docs
    requiredDocs, reqDocsSummary, extractingDocs, uploads, orgUploads, uploadingDoc,
    // derived
    assembledProposal, submission, isFormBased, filenameBase,
    // actions
    runExtractRequiredDocs, matchUpload, handleUploadFile, handleRemoveUpload,
    buildDownloadText, downloadAsDocx, downloadAsPdf, downloadAsTxt,
    findApplyUrlWithAI, handleDetect, updateMapping, saveEdits, handleAutoFill, handleFinalSubmit,
  };
}
