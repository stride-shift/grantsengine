import { useState, useEffect, useRef, useMemo } from "react";
import { C, FONT, MONO } from "../theme";
import { Btn } from "./index";
import { DownloadMenu, ApplicationDocuments, VaultPicker, ProposalPreviewBlock } from "./AutoFillPanelParts";
import { detectForm, updateAutofillMappings, runAutofill, submitAutofill, verifyUrls, getUploads, uploadFile, getAuth, deleteUpload } from "../api";
import { detectSubmissionMethod, assembleText, isAIError, parseFitScore } from "../utils";
import { DOCS } from "../data/constants";
import { buildGlossaryAppendix } from "../data/glossary";

const CONFIDENCE_COLOR = { high: "#16A34A", medium: "#C17817", low: "#9CA3AF" };
const STATUS_LABEL = {
  pending: "Pending",
  "ready-for-review": "Ready for review",
  filling: "Filling form...",
  submitting: "Submitting...",
  submitted: "Submitted",
  error: "Error",
};

export default function AutoFillPanel({ grant, onClose, onSubmitted, onRunAI, onUpdateGrant, onTriggerMagic, generatingProposal, generatingStep }) {
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [job, setJob] = useState(null);
  const [mappings, setMappings] = useState([]);
  const [fields, setFields] = useState([]);
  const [formType, setFormType] = useState(null);
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [notes, setNotes] = useState("");
  const [fetchError, setFetchError] = useState(null);
  const [resolvedUrl, setResolvedUrl] = useState(null);
  const [urlSource, setUrlSource] = useState(null);
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [showCreds, setShowCreds] = useState(false);
  const [filling, setFilling] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [copiedField, setCopiedField] = useState(null);
  const [edited, setEdited] = useState(false);
  const [findingUrl, setFindingUrl] = useState(false);
  const [findUrlResult, setFindUrlResult] = useState(null); // last AI search outcome

  // Submission Center state — required docs checklist, uploaded files, PDF preview
  const [requiredDocs, setRequiredDocs] = useState(null); // null = unloaded, [] = empty, [{name, required, note}]
  const [reqDocsSummary, setReqDocsSummary] = useState("");
  const [extractingDocs, setExtractingDocs] = useState(false);
  const [uploads, setUploads] = useState([]); // grant-scoped uploads
  const [orgUploads, setOrgUploads] = useState([]); // org-wide uploads (compliance docs)
  const [uploadingDoc, setUploadingDoc] = useState(false);
  // Open preview by default so the user sees progress as sections generate
  const [showPdfPreview, setShowPdfPreview] = useState(true);
  // Manual URL input — user can paste the apply link themselves instead of asking AI
  const [manualUrl, setManualUrl] = useState("");
  const [showManualUrl, setShowManualUrl] = useState(false);
  const saveManualUrl = () => {
    const u = manualUrl.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) { alert("URL must start with http:// or https://"); return; }
    if (onUpdateGrant) onUpdateGrant(grant.id, { applyUrl: u });
    setManualUrl("");
    setShowManualUrl(false);
  };
  const uploadInputRef = useRef(null);

  // Assemble the full proposal text for preview/attaching
  const assembledProposal = useMemo(() => {
    if (!grant?.aiSections) return grant?.aiDraft || "";
    return assembleText(grant.aiSections, grant.aiSectionsOrder);
  }, [grant?.aiSections, grant?.aiSectionsOrder, grant?.aiDraft]);

  // Auto-trigger the proposal generation when the panel opens and the grant
  // has no sections yet. The user clicked Auto-fill — they want a working
  // proposal to attach/submit, not an empty preview telling them to go click
  // something else first.
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
      if (onUpdateGrant) onUpdateGrant(grant.id, { requiredDocs: { documents: docs, summary: parsed.summary || "" }, requiredDocsAt: new Date().toISOString() });
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
      const { generateDocxFromSections } = await import("../docxGenerator");
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
  // proposal HTML; the user clicks "Save as PDF" in the print sheet. No server
  // round-trip, no PDF library dep, and the output respects the OS PDF engine.
  const downloadAsPdf = () => {
    const text = buildDownloadText();
    if (!text) return;
    const order = grant?.aiSectionsOrder || [];
    const sections = grant?.aiSections || {};
    const renderPara = (line) => {
      const t = line.trim();
      if (!t) return "<br/>";
      if (t.startsWith("- ") || t.startsWith("• ") || t.startsWith("* ")) return `<li>${escapeHtml(t.slice(2))}</li>`;
      if (t.startsWith("**") && t.endsWith("**")) return `<p style="font-weight:700;margin:12px 0 4px">${escapeHtml(t.replace(/\*\*/g, ""))}</p>`;
      return `<p>${escapeHtml(t)}</p>`;
    };
    const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
  // Strategy: ask AI for MULTIPLE candidate URLs, verify each, save the first
  // that loads. Plus extract any URLs from the AI's prose as a fallback if the
  // structured JSON didn't include them. Last resort: synthesize a guess from
  // the funder's name (e.g. "momentum group" → "https://www.momentumgroup.co.za").
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
      // verified one. Without this, every grant's apply link defaulted to the homepage
      // because homepages always load.
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
    } catch (e) {
      setError(e.message);
    } finally {
      setDetecting(false);
    }
  };

  // Classify the funder's submission channel so we can show the right action.
  // Only run form auto-detection when method is EXPLICITLY "form" AND we have
  // a URL. Unknown/email/invitation channels show the Submission Center with
  // preview + docs checklist + manual options instead.
  const submission = detectSubmissionMethod(grant);
  const isFormBased = submission.method === "form";

  useEffect(() => {
    // Only auto-analyse if explicitly form-based AND we already have a URL.
    if (grant?.applyUrl && !job && isFormBased) handleDetect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grant?.applyUrl, isFormBased]);

  // We DO NOT auto-trigger the URL search anymore. The user can click "Find
  // apply link" as an explicit action — automatic searches were misfiring on
  // grants where no link existed (email/invitation/unknown channels), wasting
  // AI calls and frustrating users with useless red warnings.
  const autoFindTriggeredRef = useRef(false);

  // (Removed: the auto-trigger on the "no URL" error condition. Users now
  // explicitly choose to search for the link — it's no longer forced on them
  // for every grant that happens to not have a URL yet.)

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

  const copyToClipboard = async (text, fieldName) => {
    try {
      await navigator.clipboard.writeText(text || "");
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 1200);
    } catch {}
  };

  const copyAll = async () => {
    const text = mappings.map(m => {
      const field = fields.find(f => f.name === m.fieldName);
      return `${field?.label || m.fieldName}:\n${m.suggestedValue || "(blank)"}\n`;
    }).join("\n");
    await navigator.clipboard.writeText(text);
    setCopiedField("__all__");
    setTimeout(() => setCopiedField(null), 1500);
  };

  const handleAutoFill = async () => {
    if (!job?.id) return;
    if (edited) await saveEdits();
    setFilling(true); setError("");
    try {
      const creds = requiresLogin && credentials.username ? credentials : null;
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

  const grouped = {
    highConf: mappings.filter(m => m.confidence === "high"),
    medConf: mappings.filter(m => m.confidence === "medium"),
    lowConf: mappings.filter(m => m.confidence === "low"),
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }}>
      <div style={{
        background: C.white, borderRadius: 12, width: "100%", maxWidth: 900,
        maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: C.cardShadowHover,
      }}>
        {/* Header */}
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.dark }}>Submission Center</div>
            <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>
              {grant.name} — {grant.funder}
              {formType && <span style={{ marginLeft: 8, padding: "1px 8px", borderRadius: 100, background: formType === "online-form" ? C.okSoft : C.raised, color: formType === "online-form" ? C.ok : C.t3, fontSize: 10, fontWeight: 600 }}>{formType}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ fontSize: 22, color: C.t4, background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: "18px 22px", overflow: "auto", flex: 1 }}>
          {/* SUBMISSION CENTER — always-on. Required-docs checklist + proposal
              preview + method-specific action panel apply to EVERY grant, not
              just non-form ones. Form-detection UI (below) is additive when
              the funder genuinely has an online form. */}
          {submission.method !== "invitation" && (
            <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Channel header — always show, colour depends on method */}
              {(() => {
                const isExplicit = submission.method !== "unknown";
                const palette = submission.method === "email"
                  ? { bg: C.blueSoft, border: `${C.blue}30`, color: C.blue }
                  : submission.method === "form"
                  ? { bg: `${C.primary}10`, border: `${C.primary}30`, color: C.primary }
                  : submission.method === "unknown"
                  ? { bg: C.warm100, border: C.line, color: C.t2 }
                  : { bg: C.amberSoft, border: `${C.amber}30`, color: C.amber };
                return (
                  <div style={{ padding: "14px 18px", background: palette.bg, border: `1px solid ${palette.border}`, borderRadius: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: palette.color, marginBottom: 6 }}>
                      {isExplicit ? submission.label : "Submission method unclear"}
                    </div>
                    <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.6 }}>
                      {isExplicit ? submission.desc : "The funder brief doesn't clearly say how to submit. Use the actions below to prepare the proposal and attachments — you can send via whichever channel the funder accepts."}
                    </div>
                  </div>
                );
              })()}

              {/* Full submission flow — required docs, preview, method-specific actions */}
              {true && (
                <>
                  <ApplicationDocuments
                    grant={grant}
                    docs={requiredDocs}
                    summary={reqDocsSummary}
                    extracting={extractingDocs}
                    uploads={uploads}
                    orgUploads={orgUploads}
                    matchUpload={matchUpload}
                    onRefresh={runExtractRequiredDocs}
                    onAttachNew={() => uploadInputRef.current?.click()}
                    onRemove={handleRemoveUpload}
                    onUpdateGrant={onUpdateGrant}
                    uploadingDoc={uploadingDoc}
                  />
                  <input ref={uploadInputRef} type="file" style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadFile(f); e.target.value = ""; }} />

                  <ProposalPreviewBlock
                    grant={grant}
                    assembled={assembledProposal}
                    showPreview={showPdfPreview}
                    onToggle={() => setShowPdfPreview(p => !p)}
                    onDownloadDocx={downloadAsDocx}
                    onDownloadPdf={downloadAsPdf}
                    onDownloadTxt={downloadAsTxt}
                    uploads={uploads}
                    orgUploads={orgUploads}
                    generating={generatingProposal}
                    generatingStep={generatingStep}
                    onUpdateGrant={onUpdateGrant}
                  />

                  {/* Action footer — picks the right CTA for the channel.
                      For "unknown" we give the user every option so they can
                      pick: search for a link, open the apply page if one exists,
                      open mail, download, or autofill if it's a form. */}
                  <div style={{ padding: 14, background: C.warm100, border: `1px solid ${C.line}`, borderRadius: 10 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.t4, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 8 }}>
                      {submission.method === "email" ? "Send by email" :
                       submission.method === "form" ? "Submit online" :
                       submission.method === "loi" ? "Send LOI" :
                       submission.method === "physical" ? "Print bundle" :
                       "Next step"}
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {/* Email channel — mailto with recipient */}
                      {submission.method === "email" && submission.recipient && (
                        <a href={`mailto:${submission.recipient}?subject=${encodeURIComponent(`${grant.name || "Proposal"} — ${grant.funder || ""}`)}`}
                          style={{ fontSize: 12, fontWeight: 700, color: C.white, background: C.blue, border: "none", borderRadius: 6, padding: "8px 14px", textDecoration: "none", fontFamily: FONT, display: "inline-flex", alignItems: "center", gap: 6 }}>
                          ✉ Open email to {submission.recipient}
                        </a>
                      )}

                      {/* Form OR unknown WITH existing applyUrl — analyse form button + open link */}
                      {(submission.method === "form" || submission.method === "unknown") && grant?.applyUrl && (
                        <>
                          <a href={grant.applyUrl} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 12, fontWeight: 700, color: C.white, background: C.primary, border: "none", borderRadius: 6, padding: "8px 14px", textDecoration: "none", fontFamily: FONT, display: "inline-flex", alignItems: "center", gap: 6 }}>
                            ↗ Open application page
                          </a>
                          {!detecting && !job && (
                            <button onClick={handleDetect}
                              style={{ fontSize: 12, fontWeight: 700, color: C.t2, background: C.white, border: `1px solid ${C.line}`, borderRadius: 6, padding: "8px 14px", cursor: "pointer", fontFamily: FONT }}>
                              Analyse form for autofill
                            </button>
                          )}
                        </>
                      )}

                      {/* Unknown / form WITHOUT applyUrl — explicit search button + manual paste */}
                      {(submission.method === "form" || submission.method === "unknown") && !grant?.applyUrl && (
                        <>
                          <button onClick={findApplyUrlWithAI} disabled={findingUrl}
                            style={{ fontSize: 12, fontWeight: 700, color: C.white, background: C.primary, border: "none", borderRadius: 6, padding: "8px 14px", cursor: findingUrl ? "wait" : "pointer", fontFamily: FONT }}>
                            {findingUrl ? "Searching…" : "🔍 Find apply link with AI"}
                          </button>
                          <button onClick={() => setShowManualUrl(s => !s)}
                            style={{ fontSize: 12, fontWeight: 700, color: C.t2, background: C.white, border: `1px solid ${C.line}`, borderRadius: 6, padding: "8px 14px", cursor: "pointer", fontFamily: FONT }}>
                            ✎ Set manually
                          </button>
                        </>
                      )}

                      <DownloadMenu disabled={!assembledProposal}
                        onDocx={downloadAsDocx} onPdf={downloadAsPdf} onTxt={downloadAsTxt}
                        label="⤓ Download proposal" />
                      <Btn v="ghost" style={{ fontSize: 12 }} onClick={onClose}>Close</Btn>
                    </div>

                    {/* Manual URL paste — appears when user clicks "Set manually" */}
                    {showManualUrl && (
                      <div style={{ marginTop: 10, padding: 10, background: C.white, border: `1px solid ${C.line}`, borderRadius: 6 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: C.t4, letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 6 }}>Paste the funder's application URL</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input type="url" value={manualUrl}
                            onChange={e => setManualUrl(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") saveManualUrl(); if (e.key === "Escape") setShowManualUrl(false); }}
                            placeholder="https://funder.example.com/apply"
                            autoFocus
                            style={{ flex: 1, padding: "6px 10px", fontSize: 12, border: `1px solid ${C.line}`, borderRadius: 5, outline: "none", fontFamily: MONO }} />
                          <button onClick={saveManualUrl} disabled={!manualUrl.trim()}
                            style={{ fontSize: 11, fontWeight: 700, color: C.white, background: manualUrl.trim() ? C.primary : C.t4, border: "none", borderRadius: 5, padding: "6px 14px", cursor: manualUrl.trim() ? "pointer" : "not-allowed", fontFamily: FONT }}>
                            Save
                          </button>
                          <button onClick={() => { setShowManualUrl(false); setManualUrl(""); }}
                            style={{ fontSize: 11, fontWeight: 600, color: C.t3, background: "none", border: `1px solid ${C.line}`, borderRadius: 5, padding: "6px 10px", cursor: "pointer", fontFamily: FONT }}>
                            Cancel
                          </button>
                        </div>
                        <div style={{ fontSize: 10, color: C.t4, marginTop: 4 }}>
                          The link should go directly to the funder's application page, not their homepage.
                        </div>
                      </div>
                    )}

                    {/* Inline "Set manual" for grants that already have an applyUrl */}
                    {grant?.applyUrl && (submission.method === "form" || submission.method === "unknown") && (
                      <div style={{ marginTop: 8, fontSize: 11, color: C.t3, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span>Current link: <a href={grant.applyUrl} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, textDecoration: "underline", wordBreak: "break-all" }}>{grant.applyUrl}</a></span>
                        <button onClick={() => setShowManualUrl(s => !s)}
                          style={{ fontSize: 10, fontWeight: 600, color: C.t3, background: "none", border: "none", textDecoration: "underline", cursor: "pointer", fontFamily: FONT, padding: 0 }}>
                          {showManualUrl ? "cancel" : "✎ replace"}
                        </button>
                      </div>
                    )}
                    {grant?.applyUrl && showManualUrl && (
                      <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                        <input type="url" value={manualUrl}
                          onChange={e => setManualUrl(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveManualUrl(); }}
                          placeholder="https://funder.example.com/apply"
                          autoFocus
                          style={{ flex: 1, padding: "6px 10px", fontSize: 12, border: `1px solid ${C.line}`, borderRadius: 5, outline: "none", fontFamily: MONO }} />
                        <button onClick={saveManualUrl} disabled={!manualUrl.trim()}
                          style={{ fontSize: 11, fontWeight: 700, color: C.white, background: manualUrl.trim() ? C.primary : C.t4, border: "none", borderRadius: 5, padding: "6px 14px", cursor: manualUrl.trim() ? "pointer" : "not-allowed", fontFamily: FONT }}>
                          Save
                        </button>
                      </div>
                    )}

                    {submission.method === "physical" && (
                      <div style={{ fontSize: 11, color: C.t3, marginTop: 8, lineHeight: 1.5 }}>
                        Generate the proposal, download, print, and post per the funder's instructions. Attach the required documents before printing.
                      </div>
                    )}
                    {submission.method === "loi" && (
                      <div style={{ fontSize: 11, color: C.t3, marginTop: 8, lineHeight: 1.5 }}>
                        Send a Concept Note first (use the "Generate concept note" button on the grant detail page). Only send a full proposal if invited.
                      </div>
                    )}
                    {submission.method === "unknown" && (
                      <div style={{ fontSize: 11, color: C.t3, marginTop: 8, lineHeight: 1.5 }}>
                        The funder brief doesn't clearly say how to submit. Once you know — paste the apply link, contact email, or postal address into the grant notes and reload this dialog.
                      </div>
                    )}

                    {/* AI URL search result — only shown after user explicitly clicked search */}
                    {findUrlResult && findUrlResult.url && (
                      <div style={{ marginTop: 12, padding: "10px 12px", background: `${C.ok}10`, border: `1px solid ${C.ok}30`, borderRadius: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.ok, marginBottom: 4 }}>Found and saved as apply link:</div>
                        <a href={findUrlResult.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: C.blue, textDecoration: "underline", wordBreak: "break-all" }}>{findUrlResult.url}</a>
                        {findUrlResult.note && <div style={{ marginTop: 6, fontSize: 11, color: C.t3 }}>{findUrlResult.note}</div>}
                      </div>
                    )}
                    {findUrlResult && !findUrlResult.url && Array.isArray(findUrlResult.candidates) && findUrlResult.candidates.length > 0 && (
                      <div style={{ marginTop: 12, padding: "10px 12px", background: C.amberSoft, border: `1px solid ${C.amber}30`, borderRadius: 8 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.amber, marginBottom: 6 }}>{findUrlResult.note}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Try manually:</div>
                        {findUrlResult.candidates.map((c, i) => (
                          <div key={i} style={{ marginBottom: 3 }}>
                            <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, fontSize: 11, textDecoration: "underline", wordBreak: "break-all" }}>{c.url}</a>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Invitation-only grants get a dedicated panel — autofill doesn't apply. */}
          {submission.method === "invitation" && (
            <div style={{ padding: 18, background: C.redSoft, border: `1px solid ${C.red}30`, borderRadius: 10, marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.red, marginBottom: 6 }}>{submission.label}</div>
              <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.6, marginBottom: 10 }}>{submission.desc}</div>
              <div style={{ fontSize: 12, color: C.t3, lineHeight: 1.5 }}>
                Best move: switch this grant to <strong>Manual engagement mode</strong> on the grant detail page and log relationship touchpoints in Activity. When the funder invites a proposal, come back here.
              </div>
              <Btn v="ghost" style={{ marginTop: 12, fontSize: 12 }} onClick={onClose}>Close</Btn>
            </div>
          )}

          {/* Form-detection results panel — only when form is being analysed */}
          {isFormBased && detecting && (
            <div style={{ textAlign: "center", padding: 40, color: C.t3 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.dark, marginBottom: 4 }}>Analysing form...</div>
              <div style={{ fontSize: 12 }}>Fetching {grant.applyUrl}</div>
            </div>
          )}

          {/* Real form-analysis errors (not the "no link" case — that's handled
              by the Submission Center action footer). Only show genuine fetch/parse
              failures here as a non-blocking warning. */}
          {error && !/(no apply link|don't have a link|no usable application url)/i.test(error) && (
            <div style={{ padding: "10px 14px", background: C.amberSoft, border: `1px solid ${C.amber}30`, borderRadius: 8, color: C.amber, fontSize: 12, marginBottom: 12 }}>
              {error}
            </div>
          )}

          {fetchError && (
            <div style={{ padding: "10px 14px", background: C.amberSoft, border: `1px solid ${C.amber}30`, borderRadius: 8, color: C.amber, fontSize: 12, marginBottom: 12 }}>
              Could not fetch form directly ({fetchError}). Detection may be incomplete — verify fields match the actual form.
            </div>
          )}

          {resolvedUrl && (
            <div style={{ padding: "8px 12px", background: C.raised, borderRadius: 8, fontSize: 11, color: C.t3, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontWeight: 700, color: C.t2 }}>URL{urlSource === "notes" ? " (from notes)" : ""}:</span>
              <a href={resolvedUrl} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                {resolvedUrl}
              </a>
            </div>
          )}

          {notes && (
            <div style={{ padding: "10px 14px", background: C.blueSoft, border: `1px solid ${C.blue}30`, borderRadius: 8, color: C.t2, fontSize: 12, marginBottom: 12 }}>
              <span style={{ fontWeight: 700, color: C.blue }}>Note:</span> {notes}
            </div>
          )}

          {requiresLogin && (
            <div style={{ padding: "12px 14px", background: C.raised, borderRadius: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.dark, marginBottom: 6 }}>Funder account required</div>
              <div style={{ fontSize: 11, color: C.t3, marginBottom: 8 }}>
                This form requires login. Credentials are used per-session and never stored.
              </div>
              {!showCreds ? (
                <Btn v="ghost" style={{ fontSize: 11, padding: "4px 12px" }} onClick={() => setShowCreds(true)}>
                  Add credentials
                </Btn>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="text" placeholder="Username / email" value={credentials.username}
                    onChange={e => setCredentials(c => ({ ...c, username: e.target.value }))}
                    style={{ flex: 1, padding: "6px 10px", fontSize: 12, border: `1px solid ${C.line}`, borderRadius: 6, fontFamily: FONT }}
                  />
                  <input type="password" placeholder="Password" value={credentials.password}
                    onChange={e => setCredentials(c => ({ ...c, password: e.target.value }))}
                    style={{ flex: 1, padding: "6px 10px", fontSize: 12, border: `1px solid ${C.line}`, borderRadius: 6, fontFamily: FONT }}
                  />
                </div>
              )}
            </div>
          )}

          {mappings.length > 0 && (
            <>
              {/* Phase 11: prominent manual copy-paste workflow header — for funder sites that block autofill */}
              {grant.applyUrl && (
                <div style={{
                  padding: "10px 12px", marginBottom: 12, borderRadius: 8,
                  background: `${C.blue}05`, border: `1px solid ${C.blue}20`,
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <span style={{ fontSize: 16 }}>📋</span>
                  <div style={{ flex: 1, fontSize: 12, color: C.t1, lineHeight: 1.4 }}>
                    <strong>Manual copy-paste mode:</strong> open the funder site side-by-side and copy each field below into their form. Works on sites that block AI autofill.
                  </div>
                  <a href={grant.applyUrl} target="_blank" rel="noopener noreferrer" style={{
                    fontSize: 11, fontWeight: 700, color: C.white, background: C.blue,
                    padding: "6px 12px", borderRadius: 5, textDecoration: "none", whiteSpace: "nowrap",
                  }}>
                    Open form ↗
                  </a>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>
                  {mappings.length} field{mappings.length !== 1 ? "s" : ""} detected
                </div>
                <button onClick={copyAll} style={{
                  fontSize: 11, fontWeight: 600, color: copiedField === "__all__" ? C.ok : C.primary,
                  background: "none", border: `1px solid ${copiedField === "__all__" ? C.ok : C.primary}30`,
                  borderRadius: 5, padding: "4px 10px", cursor: "pointer", fontFamily: FONT,
                }}>
                  {copiedField === "__all__" ? "✓ Copied all" : "Copy all as text"}
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {mappings.map((m, idx) => {
                  const field = fields.find(f => f.name === m.fieldName);
                  const fieldLabel = field?.label || m.fieldName;
                  const isTextarea = field?.type === "textarea" || (m.suggestedValue || "").length > 100;
                  const confColor = CONFIDENCE_COLOR[m.confidence] || C.t4;
                  return (
                    <div key={idx} style={{
                      padding: "10px 12px", background: C.warm100, borderRadius: 8,
                      border: `1px solid ${C.line}`,
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.dark }}>{fieldLabel}</span>
                          {field?.required && <span style={{ fontSize: 10, color: C.red, fontWeight: 700 }}>*</span>}
                          {field?.type && <span style={{ fontSize: 9, color: C.t4, background: C.white, padding: "1px 6px", borderRadius: 100, fontFamily: MONO }}>{field.type}</span>}
                          <span style={{ fontSize: 9, color: confColor, fontWeight: 700, textTransform: "uppercase" }}>{m.confidence}</span>
                        </div>
                        <button onClick={() => copyToClipboard(m.suggestedValue, m.fieldName)} style={{
                          fontSize: 11, fontWeight: 600, color: copiedField === m.fieldName ? C.ok : C.primary,
                          background: "none", border: "none", cursor: "pointer", fontFamily: FONT,
                        }}>
                          {copiedField === m.fieldName ? "✓ Copied" : "Copy"}
                        </button>
                      </div>
                      {isTextarea ? (
                        <textarea
                          value={m.suggestedValue || ""}
                          onChange={e => updateMapping(m.fieldName, e.target.value)}
                          onBlur={saveEdits}
                          rows={Math.min(6, Math.max(2, Math.ceil((m.suggestedValue || "").length / 80)))}
                          style={{
                            width: "100%", fontSize: 12, fontFamily: FONT, lineHeight: 1.5,
                            border: `1px solid ${C.line}`, borderRadius: 6, padding: "6px 10px",
                            outline: "none", resize: "vertical", boxSizing: "border-box",
                          }}
                        />
                      ) : (
                        <input type="text" value={m.suggestedValue || ""}
                          onChange={e => updateMapping(m.fieldName, e.target.value)}
                          onBlur={saveEdits}
                          placeholder={field?.placeholder || "(blank — fill manually)"}
                          style={{
                            width: "100%", fontSize: 12, fontFamily: FONT,
                            border: `1px solid ${C.line}`, borderRadius: 6, padding: "6px 10px",
                            outline: "none", boxSizing: "border-box",
                          }}
                        />
                      )}
                      {m.notes && (
                        <div style={{ fontSize: 10, color: C.t4, marginTop: 4, fontStyle: "italic" }}>{m.notes}</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Screenshots preview (Phase 2) */}
              {job?.screenshots?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, marginBottom: 8 }}>
                    Filled form preview
                  </div>
                  <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
                    {job.screenshots.map((s, i) => (
                      <img key={i} src={s.url} alt={`Page ${i + 1}`} style={{
                        height: 200, border: `1px solid ${C.line}`, borderRadius: 6,
                      }} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {mappings.length > 0 && (
          <div style={{ padding: "14px 22px", borderTop: `1px solid ${C.line}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 11, color: C.t4 }}>
              Review values before filling. Use copy buttons to paste into the funder's site manually.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {grant.applyUrl && (
                <a href={grant.applyUrl} target="_blank" rel="noopener noreferrer" style={{
                  fontSize: 12, padding: "8px 14px", borderRadius: 6,
                  border: `1px solid ${C.line}`, color: C.t2, textDecoration: "none", fontWeight: 600, fontFamily: FONT,
                }}>
                  Open funder site ↗
                </a>
              )}
              {!job?.screenshots?.length && (
                <Btn v="primary" disabled={filling} onClick={handleAutoFill}>
                  {filling ? "Filling..." : "Fill automatically"}
                </Btn>
              )}
              {job?.screenshots?.length > 0 && (
                <Btn v="primary" disabled={submitting} onClick={handleFinalSubmit}>
                  {submitting ? "Submitting..." : "Submit application"}
                </Btn>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

