import { useState, useEffect, useRef, useMemo } from "react";
import { C, FONT, MONO } from "../theme";
import { Btn } from "./index";
import { detectForm, updateAutofillMappings, runAutofill, submitAutofill, verifyUrls, getUploads, uploadFile, getAuth, deleteUpload } from "../api";
import { detectSubmissionMethod, assembleText, isAIError } from "../utils";
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

/* Download dropdown — picks between DOCX (Word) and PDF (browser print).
 * The .txt option is hidden by default but kept as a fallback. */
function DownloadMenu({ disabled, onDocx, onPdf, onTxt, label = "⤓ Download", small = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);
  const baseBtn = small
    ? { fontSize: 11, padding: "4px 10px" }
    : { fontSize: 12, padding: "8px 14px" };
  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button onClick={() => !disabled && setOpen(o => !o)} disabled={disabled}
        style={{ ...baseBtn, fontWeight: 600, color: C.t2, background: C.white, border: `1px solid ${C.line}`, borderRadius: 6, cursor: disabled ? "not-allowed" : "pointer", fontFamily: FONT, display: "inline-flex", alignItems: "center", gap: 4 }}>
        {label}
        <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 2 }}>▾</span>
      </button>
      {open && !disabled && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 50,
          background: C.white, border: `1px solid ${C.line}`, borderRadius: 6,
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)", minWidth: 180, overflow: "hidden",
        }}>
          <button onClick={() => { onDocx(); setOpen(false); }} style={menuItemStyle}>
            <strong>Word (.docx)</strong>
            <div style={menuDescStyle}>Editable — best for further tweaking</div>
          </button>
          <button onClick={() => { onPdf(); setOpen(false); }} style={menuItemStyle}>
            <strong>PDF</strong>
            <div style={menuDescStyle}>Print-ready — best for email submission</div>
          </button>
          <button onClick={() => { onTxt(); setOpen(false); }} style={{ ...menuItemStyle, color: C.t3 }}>
            <strong>Plain text (.txt)</strong>
            <div style={menuDescStyle}>Fallback for copy-paste</div>
          </button>
        </div>
      )}
    </div>
  );
}
const menuItemStyle = { display: "block", width: "100%", padding: "10px 14px", background: "none", border: "none", textAlign: "left", cursor: "pointer", fontFamily: "inherit", fontSize: 12, color: "inherit", borderBottom: `1px solid ${C.line}` };
const menuDescStyle = { fontSize: 10, color: C.t4, marginTop: 2, fontWeight: 400 };

/* Application Documents — unified panel listing every document the funder
 * requires (extracted from their brief) PLUS any extras the team has attached.
 *
 * For each required doc, the user can either:
 *   • Upload a new file from disk
 *   • Pick from the Document Vault (org-wide compliance docs already on file)
 *
 * When a vault doc is picked, the linkage is stored in grant.attachedDocs so
 * the row shows as ✓ matched without having to re-upload the file.
 */
function ApplicationDocuments({ grant, docs, summary, extracting, uploads, orgUploads, matchUpload, onRefresh, onAttachNew, onRemove, onUpdateGrant, uploadingDoc }) {
  const [pickerOpenFor, setPickerOpenFor] = useState(null); // required doc name or "_extra"
  const attachedDocs = grant?.attachedDocs || {}; // { "PBO Certificate": uploadId, … }
  const allFiles = [...uploads, ...orgUploads];
  const fileById = id => allFiles.find(u => u.id === id);

  // Two sources of "what docs are required":
  //   1. AI-extracted from the funder's own brief (`docs` prop) — funder-specific
  //   2. Type-based defaults from DOCS[g.type] — what's typical for this funder type
  // Prefer AI extraction; fall back to type-based defaults so the user always sees
  // a useful checklist (and not "no documents specified").
  const aiHasDocs = Array.isArray(docs) && docs.length > 0;
  const typeDocs = (DOCS[grant?.type] || []).map(name => ({ name, required: true, note: "" }));
  const effectiveDocs = aiHasDocs ? docs : typeDocs;
  const docsSource = aiHasDocs ? "funder-brief" : typeDocs.length > 0 ? "type-default" : "none";

  // Augment match: first check the explicit attachedDocs linkage; fall back to
  // automatic name-match so previously uploaded files still surface.
  const resolveMatch = (name) => {
    const linkedId = attachedDocs[name];
    if (linkedId) {
      const u = fileById(linkedId);
      if (u) return u;
    }
    return matchUpload(name);
  };

  const linkDoc = (docName, uploadId) => {
    if (!onUpdateGrant) return;
    onUpdateGrant(grant.id, { attachedDocs: { ...attachedDocs, [docName]: uploadId } });
    setPickerOpenFor(null);
  };

  const unlinkDoc = (docName) => {
    if (!onUpdateGrant) return;
    const next = { ...attachedDocs };
    delete next[docName];
    onUpdateGrant(grant.id, { attachedDocs: next });
  };

  // Files not linked to any required doc — show in the "Additional" subsection.
  // Uses effectiveDocs (which falls back to type-defaults) so a file matched by name
  // to a type-default doc doesn't double-show in extras.
  const linkedIds = new Set(Object.values(attachedDocs));
  const reqDocs = Array.isArray(docs) && docs.length > 0 ? docs : (DOCS[grant?.type] || []).map(name => ({ name }));
  const extras = uploads.filter(u => !linkedIds.has(u.id) && !reqDocs.some(d => matchUpload(d.name)?.id === u.id));

  if (extracting) {
    return (
      <div style={{ padding: 14, background: C.warm100, border: `1px solid ${C.line}`, borderRadius: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, letterSpacing: 0.6, textTransform: "uppercase" }}>Application documents</div>
        <div style={{ fontSize: 12, color: C.t3, marginTop: 6 }}>Reading the funder's brief to figure out what's required…</div>
      </div>
    );
  }

  const totalReq = effectiveDocs.filter(d => d.required).length;
  const readyReq = effectiveDocs.filter(d => d.required && resolveMatch(d.name)).length;
  const allClear = totalReq > 0 && readyReq === totalReq;

  return (
    <div style={{ padding: 14, background: allClear ? `${C.ok}08` : C.warm100, border: `1px solid ${allClear ? `${C.ok}30` : C.line}`, borderRadius: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: allClear ? C.ok : C.t3, letterSpacing: 0.6, textTransform: "uppercase" }}>
          Application documents {totalReq > 0 && <span style={{ color: C.t4, fontWeight: 500 }}>· {readyReq}/{totalReq} ready</span>}
        </div>
        <button onClick={onRefresh} title="Re-extract from funder brief"
          style={{ fontSize: 10, fontWeight: 600, color: C.t3, background: "none", border: `1px solid ${C.line}`, borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontFamily: FONT }}>
          ↻ Re-scan brief
        </button>
      </div>
      {summary && (
        <div style={{ fontSize: 11, color: C.t3, marginBottom: 10, fontStyle: "italic", lineHeight: 1.5 }}>{summary}</div>
      )}
      {!aiHasDocs && docsSource === "type-default" && (
        <div style={{ fontSize: 10, color: C.t4, marginBottom: 10, padding: "6px 10px", background: C.warm100, borderRadius: 6, lineHeight: 1.5 }}>
          The funder's brief doesn't list specific required docs — showing the standard set for <strong style={{ color: C.t2 }}>{grant?.type || "this funder type"}</strong> instead. If you've since pasted the funder brief into the grant, click <strong>Re-scan brief</strong> above and the AI will pull the exact requirements from it.
        </div>
      )}

      {/* Required documents — one row per doc, with upload or pick-from-vault */}
      {(effectiveDocs && effectiveDocs.length > 0) ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: extras.length > 0 || true ? 12 : 0 }}>
          {effectiveDocs.map((d, i) => {
            const match = resolveMatch(d.name);
            return (
              <div key={i} style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px" }}>
                  <span style={{ fontSize: 14, color: match ? C.ok : (d.required ? C.amber : C.t4), flexShrink: 0, width: 16 }}>
                    {match ? "✓" : (d.required ? "!" : "·")}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.dark }}>
                      {d.name}
                      {!d.required && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 700, color: C.t4, background: C.warm100, padding: "1px 6px", borderRadius: 4, textTransform: "uppercase", letterSpacing: 0.3 }}>Optional</span>}
                    </div>
                    {d.note && <div style={{ fontSize: 10, color: C.t4, lineHeight: 1.4 }}>{d.note}</div>}
                    {match && (
                      <div style={{ fontSize: 10, color: C.ok, lineHeight: 1.4, marginTop: 2, display: "flex", alignItems: "center", gap: 4 }}>
                        <span>📎</span><span>{match.original_name || match.filename}</span>
                        {attachedDocs[d.name] && (
                          <button onClick={() => unlinkDoc(d.name)} title="Unlink this file"
                            style={{ background: "none", border: "none", color: C.t4, cursor: "pointer", padding: 0, fontFamily: FONT, fontSize: 10, marginLeft: 4 }}>
                            (unlink)
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {!match && (
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <button onClick={() => setPickerOpenFor(pickerOpenFor === d.name ? null : d.name)}
                        title="Use an existing document from your Document Vault"
                        style={{ fontSize: 11, fontWeight: 600, color: C.t2, background: C.white, border: `1px solid ${C.line}`, borderRadius: 5, padding: "4px 10px", cursor: "pointer", fontFamily: FONT }}>
                        📁 Pick from vault
                      </button>
                      <button onClick={onAttachNew} disabled={uploadingDoc}
                        style={{ fontSize: 11, fontWeight: 700, color: C.white, background: d.required ? C.amber : C.t3, border: "none", borderRadius: 5, padding: "4px 10px", cursor: uploadingDoc ? "wait" : "pointer", fontFamily: FONT }}>
                        {uploadingDoc ? "…" : "+ Upload"}
                      </button>
                    </div>
                  )}
                </div>
                {/* Vault picker — appears inline below the row */}
                {pickerOpenFor === d.name && (
                  <VaultPicker
                    files={allFiles}
                    onPick={(uploadId) => linkDoc(d.name, uploadId)}
                    onClose={() => setPickerOpenFor(null)}
                    title={`Choose a file for "${d.name}"`}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: C.t3, lineHeight: 1.5, marginBottom: 12 }}>
          The funder's brief doesn't list specific required documents. Use the actions below to attach anything you want to send with this application.
        </div>
      )}

      {/* Additional documents — files attached that don't map to a required doc */}
      <div style={{ paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.t4, letterSpacing: 0.6, textTransform: "uppercase" }}>
            Additional attachments {extras.length > 0 && <span style={{ fontWeight: 500 }}>· {extras.length}</span>}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => setPickerOpenFor(pickerOpenFor === "_extra" ? null : "_extra")}
              style={{ fontSize: 10, fontWeight: 600, color: C.t3, background: "none", border: `1px solid ${C.line}`, borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontFamily: FONT }}>
              📁 From vault
            </button>
            <button onClick={onAttachNew} disabled={uploadingDoc}
              style={{ fontSize: 10, fontWeight: 700, color: C.white, background: C.primary, border: "none", borderRadius: 4, padding: "2px 10px", cursor: uploadingDoc ? "wait" : "pointer", fontFamily: FONT }}>
              + Upload
            </button>
          </div>
        </div>
        {extras.length === 0 ? (
          <div style={{ fontSize: 11, color: C.t4, fontStyle: "italic" }}>
            Letters of support, CVs, supplementary financials, anything else the funder might want.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {extras.map(u => (
              <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: C.white, border: `1px solid ${C.line}`, borderRadius: 6 }}>
                <span style={{ fontSize: 12 }}>📎</span>
                <span style={{ flex: 1, fontSize: 11, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {u.original_name || u.filename}
                </span>
                <button onClick={() => onRemove(u.id)} title="Remove" style={{ background: "none", border: "none", color: C.t4, cursor: "pointer", fontSize: 14, padding: 0, fontFamily: FONT }}>×</button>
              </div>
            ))}
          </div>
        )}
        {pickerOpenFor === "_extra" && (
          <div style={{ marginTop: 8 }}>
            <VaultPicker
              files={allFiles.filter(u => !linkedIds.has(u.id))}
              onPick={(uploadId) => {
                // Linking to "extras" — we add it under a synthetic key so it shows
                // up. Or really, if it's already in uploads it shows automatically.
                // For org-wide files not in this grant, we record the linkage.
                if (!onUpdateGrant) return;
                const u = fileById(uploadId);
                if (!u) return;
                onUpdateGrant(grant.id, { attachedDocs: { ...attachedDocs, [`_extra_${u.original_name || u.filename || uploadId}`]: uploadId } });
                setPickerOpenFor(null);
              }}
              onClose={() => setPickerOpenFor(null)}
              title="Choose an extra document to attach"
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* Vault picker — inline dropdown showing every file in the org's Document
 * Vault + this grant's uploads. Clicking one links it to the selected slot. */
function VaultPicker({ files, onPick, onClose, title }) {
  if (!files || files.length === 0) {
    return (
      <div style={{ borderTop: `1px solid ${C.line}`, padding: "10px 12px", background: C.warm100, fontSize: 11, color: C.t3 }}>
        Your Document Vault is empty. Upload files via the Documents tab, or click "+ Upload" above to add one now.
        <button onClick={onClose} style={{ marginLeft: 8, background: "none", border: "none", color: C.t3, cursor: "pointer", textDecoration: "underline", fontFamily: FONT, fontSize: 11 }}>Close</button>
      </div>
    );
  }
  return (
    <div style={{ borderTop: `1px solid ${C.line}`, padding: "10px 12px", background: C.warm100 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.t3, letterSpacing: 0.6, textTransform: "uppercase" }}>{title}</span>
        <button onClick={onClose} style={{ fontSize: 10, color: C.t4, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: FONT }}>Close</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflowY: "auto" }}>
        {files.map(u => (
          <button key={u.id} onClick={() => onPick(u.id)}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: C.white, border: `1px solid ${C.line}`, borderRadius: 6, cursor: "pointer", textAlign: "left", fontFamily: FONT, width: "100%" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.primary; e.currentTarget.style.background = `${C.primary}06`; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.background = C.white; }}
          >
            <span style={{ fontSize: 12 }}>📎</span>
            <span style={{ flex: 1, fontSize: 11, color: C.t1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {u.original_name || u.filename || "Untitled"}
            </span>
            {u.category && <span style={{ fontSize: 9, color: C.t4, background: C.warm100, padding: "1px 6px", borderRadius: 4, textTransform: "uppercase", letterSpacing: 0.3 }}>{u.category}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

/* Proposal preview block — a collapsed/expanded view of the assembled proposal.
 * Has a TOC built from aiSectionsOrder + sticky meta bar inside the preview
 * pane so funder + ask + deadline stay visible while scrolling. */
function ProposalPreviewBlock({ grant, assembled, showPreview, onToggle, onDownloadDocx, onDownloadPdf, onDownloadTxt, generating, generatingStep, onUpdateGrant, uploads = [], orgUploads = [] }) {
  const order = grant?.aiSectionsOrder || [];
  const sections = grant?.aiSections || {};
  const completedSections = order.filter(n => sections[n]?.text).length;
  const wordCount = assembled ? assembled.split(/\s+/).filter(Boolean).length : 0;
  // Inline edit state — which section is currently being edited + its draft text
  const [editingName, setEditingName] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  const startEdit = (name) => { setEditingName(name); setEditDraft(sections[name]?.text || ""); };
  const cancelEdit = () => { setEditingName(null); setEditDraft(""); };
  const saveEdit = () => {
    if (!editingName || !onUpdateGrant) return;
    const prev = sections[editingName] || {};
    const updatedSections = {
      ...sections,
      [editingName]: { ...prev, text: editDraft, editedAt: new Date().toISOString(), isManualEdit: true },
    };
    onUpdateGrant(grant.id, { aiSections: updatedSections });
    setEditingName(null);
    setEditDraft("");
  };
  const fitscoreNum = (() => {
    if (!grant?.aiFitscore) return null;
    const m = String(grant.aiFitscore).match(/SCORE:\s*(\d+)/i);
    return m ? parseInt(m[1]) : null;
  })();
  return (
    <div style={{ background: C.white, border: `1px solid ${C.line}`, borderRadius: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: showPreview ? `1px solid ${C.line}` : "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, letterSpacing: 0.6, textTransform: "uppercase" }}>Proposal preview</div>
          {generating && completedSections === 0 && (
            <span style={{ fontSize: 11, color: C.primary, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.primary, animation: "ge-pulse 1.2s ease-in-out infinite" }} />
              {grant?.aiResearch ? "Drafting sections…" : "Researching funder…"}
            </span>
          )}
          {generating && completedSections > 0 && order.length > 0 && (
            <span style={{ fontSize: 11, color: C.primary, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.primary, animation: "ge-pulse 1.2s ease-in-out infinite" }} />
              Drafting… {completedSections}/{order.length} sections done
            </span>
          )}
          {!generating && wordCount > 0 && <span style={{ fontSize: 10, color: C.t4, fontFamily: MONO }}>{wordCount.toLocaleString()} words · ~{Math.max(1, Math.round(wordCount / 250))} pages</span>}
          {fitscoreNum !== null && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 100, background: fitscoreNum >= 70 ? `${C.ok}15` : fitscoreNum >= 50 ? `${C.amber}15` : `${C.red}15`, color: fitscoreNum >= 70 ? C.ok : fitscoreNum >= 50 ? C.amber : C.red, fontFamily: MONO }}>
              FIT {fitscoreNum}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {/* Glossary toggle — appends a glossary of SA NPO terms to the proposal.
              Only renders when there are terms in the text to define (≥1 glossary
              hit); otherwise the button is disabled with a helpful tooltip. */}
          {(() => {
            const glossaryEnabled = !!grant?.includeGlossary;
            const previewAppendix = assembled ? buildGlossaryAppendix(assembled) : "";
            const hasTerms = !!previewAppendix;
            const disabled = !onUpdateGrant || (!hasTerms && !glossaryEnabled);
            const toggle = () => {
              if (!onUpdateGrant) return;
              onUpdateGrant(grant.id, { includeGlossary: !glossaryEnabled });
            };
            return (
              <button onClick={toggle} disabled={disabled}
                title={!hasTerms && !glossaryEnabled ? "No glossary terms detected in this proposal yet — once the AI uses acronyms like B-BBEE, POPIA, SETA, etc., this will activate." : glossaryEnabled ? "Glossary is ON — click to remove it from the proposal" : "Click to append a glossary of sector acronyms and SA NPO terms to this proposal"}
                style={{
                  fontSize: 11, fontWeight: 600,
                  color: glossaryEnabled ? C.white : (disabled ? C.t4 : C.t2),
                  background: glossaryEnabled ? C.primary : C.white,
                  border: `1px solid ${glossaryEnabled ? C.primary : C.line}`,
                  borderRadius: 6, padding: "4px 10px",
                  cursor: disabled ? "not-allowed" : "pointer", fontFamily: FONT,
                  opacity: disabled ? 0.55 : 1,
                }}>
                ⓘ Glossary{glossaryEnabled ? " ✓" : ""}
              </button>
            );
          })()}
          <DownloadMenu disabled={!assembled}
            onDocx={onDownloadDocx} onPdf={onDownloadPdf} onTxt={onDownloadTxt}
            label="⤓ Download" small />
          <button onClick={onToggle}
            style={{ fontSize: 11, fontWeight: 700, color: C.primary, background: `${C.primary}12`, border: `1px solid ${C.primary}30`, borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontFamily: FONT }}>
            {showPreview ? "Hide preview" : "Show preview"}
          </button>
        </div>
      </div>
      {showPreview && (
        <div style={{ display: "flex", maxHeight: 480 }}>
          {/* Sidebar: TOC (only when long enough to justify it) */}
          {order.length >= 3 && (() => {
            const linkedIds = grant?.attachedDocs ? Object.values(grant.attachedDocs) : [];
            const allUploadsLookup = new Map([...uploads, ...orgUploads].map(u => [u.id, u]));
            const linkedFiles = linkedIds.map(id => allUploadsLookup.get(id)).filter(Boolean);
            const attachedCount = linkedFiles.length + uploads.filter(u => !linkedIds.includes(u.id)).length;
            const showGloss = grant?.includeGlossary && assembled && !!buildGlossaryAppendix(assembled);
            const tocClick = (id) => (e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); };
            const linkStyle = { display: "block", padding: "6px 14px", fontSize: 11, color: C.t2, textDecoration: "none", lineHeight: 1.4, borderLeft: `2px solid transparent` };
            const onEnter = e => { e.currentTarget.style.background = C.white; e.currentTarget.style.borderLeftColor = C.primary; };
            const onLeave = e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderLeftColor = "transparent"; };
            let extraIdx = order.length;
            return (
              <div style={{ width: 200, borderRight: `1px solid ${C.line}`, overflow: "auto", padding: "12px 0", background: C.warm100, flexShrink: 0 }}>
                <div style={{ padding: "0 14px 8px", fontSize: 9, fontWeight: 700, color: C.t4, letterSpacing: 0.6, textTransform: "uppercase" }}>Contents</div>
                {order.map((name, i) => (
                  <a key={name} href={`#preview-sec-${i}`} onClick={tocClick(`preview-sec-${i}`)}
                    style={linkStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>
                    <span style={{ fontFamily: MONO, color: C.t4, marginRight: 6 }}>{String(i + 1).padStart(2, "0")}</span>
                    {name}
                  </a>
                ))}
                {showGloss && (
                  <a href="#preview-sec-glossary" onClick={tocClick("preview-sec-glossary")} style={linkStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>
                    <span style={{ fontFamily: MONO, color: C.t4, marginRight: 6 }}>{String(++extraIdx).padStart(2, "0")}</span>
                    Glossary
                  </a>
                )}
                {attachedCount > 0 && (
                  <a href="#preview-sec-attachments" onClick={tocClick("preview-sec-attachments")} style={linkStyle} onMouseEnter={onEnter} onMouseLeave={onLeave}>
                    <span style={{ fontFamily: MONO, color: C.t4, marginRight: 6 }}>{String(++extraIdx).padStart(2, "0")}</span>
                    Attachments
                  </a>
                )}
              </div>
            );
          })()}
          {/* Document */}
          <div style={{ flex: 1, overflow: "auto", padding: "20px 32px", background: "#fff", fontFamily: "'Georgia', 'Times New Roman', serif", fontSize: 13, lineHeight: 1.7, color: "#1a1a1a", minWidth: 0 }}>
            {/* Sticky meta bar */}
            <div style={{ position: "sticky", top: -20, marginTop: -20, marginBottom: 16, padding: "10px 0", background: "#fff", borderBottom: `1px solid ${C.line}`, fontFamily: FONT, fontSize: 11, color: C.t3, display: "flex", gap: 14, flexWrap: "wrap", zIndex: 5 }}>
              <span><strong style={{ color: C.dark }}>{grant.funder}</strong></span>
              {grant.ask > 0 && <span>Ask: <strong style={{ color: C.dark, fontFamily: MONO }}>R{grant.ask.toLocaleString()}</strong></span>}
              {grant.deadline && <span>Deadline: <strong style={{ color: C.dark }}>{new Date(grant.deadline).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}</strong></span>}
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: C.dark, marginTop: 0, marginBottom: 6, fontFamily: FONT }}>{grant.name}</h1>
            <div style={{ fontSize: 13, color: C.t3, marginBottom: 24, fontFamily: FONT }}>{grant.funder}</div>
            {order.map((name, i) => {
              const sec = sections[name];
              if (!sec?.text) return null;
              const isEditing = editingName === name;
              return (
                <div key={name} id={`preview-sec-${i}`} style={{ marginBottom: 28, scrollMarginTop: 60 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${C.line}` }}>
                    <h2 style={{ fontSize: 15, fontWeight: 700, color: C.dark, margin: 0, fontFamily: FONT }}>
                      {i + 1}. {name}
                      {sec.isManualEdit && <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, color: C.purple, background: `${C.purple}15`, padding: "2px 6px", borderRadius: 4, textTransform: "uppercase", letterSpacing: 0.4, fontFamily: FONT }}>Edited</span>}
                    </h2>
                    {!isEditing && onUpdateGrant && (
                      <button onClick={() => startEdit(name)} title="Edit this section"
                        style={{ fontSize: 11, fontWeight: 600, color: C.t3, background: "none", border: `1px solid ${C.line}`, borderRadius: 5, padding: "3px 10px", cursor: "pointer", fontFamily: FONT }}>
                        ✎ Edit
                      </button>
                    )}
                  </div>
                  {isEditing ? (
                    <div>
                      <textarea value={editDraft} onChange={e => setEditDraft(e.target.value)}
                        autoFocus rows={Math.max(8, Math.min(24, editDraft.split("\n").length + 2))}
                        style={{ width: "100%", padding: "12px 14px", fontSize: 13, lineHeight: 1.6, border: `1px solid ${C.primary}40`, borderRadius: 6, outline: "none", resize: "vertical", boxSizing: "border-box", fontFamily: "'Georgia', 'Times New Roman', serif" }} />
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 8 }}>
                        <button onClick={cancelEdit}
                          style={{ fontSize: 11, fontWeight: 600, color: C.t3, background: "none", border: `1px solid ${C.line}`, borderRadius: 5, padding: "5px 12px", cursor: "pointer", fontFamily: FONT }}>
                          Cancel
                        </button>
                        <button onClick={saveEdit}
                          style={{ fontSize: 11, fontWeight: 700, color: C.white, background: C.primary, border: "none", borderRadius: 5, padding: "5px 14px", cursor: "pointer", fontFamily: FONT }}>
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    sec.text.split("\n").map((para, j) => {
                      const t = para.trim();
                      if (!t) return <div key={j} style={{ height: 8 }} />;
                      if (t.startsWith("- ") || t.startsWith("• ") || t.startsWith("* ")) {
                        return <div key={j} style={{ display: "flex", gap: 8, paddingLeft: 12 }}><span style={{ color: C.primary }}>•</span><span>{t.slice(2)}</span></div>;
                      }
                      if (t.startsWith("**") && t.endsWith("**")) {
                        return <div key={j} style={{ fontWeight: 700, marginTop: 10, fontFamily: FONT }}>{t.replace(/\*\*/g, "")}</div>;
                      }
                      return <p key={j} style={{ margin: "0 0 8px 0" }}>{t}</p>;
                    })
                  )}
                </div>
              );
            })}
            {/* Glossary section — only renders when user has toggled it on AND
                at least one glossary term appears in the proposal. */}
            {grant?.includeGlossary && assembled && (() => {
              const appendix = buildGlossaryAppendix(assembled);
              if (!appendix) return null;
              // Strip the leading separator/heading lines that buildGlossaryAppendix returns
              const lines = appendix.split("\n").filter(l => !/^---$/.test(l.trim()) && !/^##\s*Glossary/.test(l.trim()));
              const cleaned = lines.join("\n").trim();
              return (
                <div id={`preview-sec-glossary`} style={{ marginBottom: 28, scrollMarginTop: 60 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${C.line}` }}>
                    <h2 style={{ fontSize: 15, fontWeight: 700, color: C.dark, margin: 0, fontFamily: FONT }}>
                      Glossary
                      <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, color: C.primary, background: `${C.primary}15`, padding: "2px 6px", borderRadius: 4, textTransform: "uppercase", letterSpacing: 0.4, fontFamily: FONT }}>Auto-built</span>
                    </h2>
                  </div>
                  {cleaned.split("\n").map((line, j) => {
                    const t = line.trim();
                    if (!t) return <div key={j} style={{ height: 6 }} />;
                    // Glossary lines come as "**Term** — definition"
                    const match = t.match(/^\*\*([^*]+)\*\*\s*[—–-]\s*(.+)$/);
                    if (match) {
                      return (
                        <div key={j} style={{ marginBottom: 6, display: "flex", gap: 10 }}>
                          <strong style={{ minWidth: 140, color: C.dark, fontFamily: FONT }}>{match[1]}</strong>
                          <span style={{ flex: 1 }}>{match[2]}</span>
                        </div>
                      );
                    }
                    return <p key={j} style={{ margin: "0 0 8px 0" }}>{t}</p>;
                  })}
                </div>
              );
            })()}

            {/* Attached documents — listed at the end of the proposal like a real
                proposal's "Attachments" section. Pulls from grant.attachedDocs
                (vault links) + uploads (grant-scoped files). */}
            {assembled && (() => {
              const linkedIds = grant?.attachedDocs ? Object.values(grant.attachedDocs) : [];
              const allUploadsLookup = new Map([...uploads, ...orgUploads].map(u => [u.id, u]));
              const linkedFiles = linkedIds.map(id => allUploadsLookup.get(id)).filter(Boolean);
              const grantFiles = uploads.filter(u => !linkedIds.includes(u.id));
              const allAttached = [...linkedFiles, ...grantFiles];
              if (allAttached.length === 0) return null;
              return (
                <div id={`preview-sec-attachments`} style={{ marginBottom: 28, scrollMarginTop: 60 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 700, color: C.dark, marginBottom: 8, paddingBottom: 4, borderBottom: `1px solid ${C.line}`, fontFamily: FONT }}>
                    Attachments
                    <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, color: C.primary, background: `${C.primary}15`, padding: "2px 6px", borderRadius: 4, textTransform: "uppercase", letterSpacing: 0.4, fontFamily: FONT }}>
                      {allAttached.length} {allAttached.length === 1 ? "file" : "files"}
                    </span>
                  </h2>
                  <p style={{ margin: "0 0 10px", color: C.t3, fontSize: 12, fontFamily: FONT }}>The following documents accompany this proposal:</p>
                  <ol style={{ margin: "0 0 0 24px", padding: 0, fontFamily: FONT }}>
                    {allAttached.map(u => (
                      <li key={u.id} style={{ marginBottom: 4, fontSize: 13, color: C.t1 }}>
                        <strong style={{ color: C.dark }}>{u.original_name || u.filename || "Untitled"}</strong>
                        {u.category && <span style={{ marginLeft: 8, fontSize: 11, color: C.t4 }}>· {u.category}</span>}
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })()}

            {!assembled && generating && (
              <div style={{ padding: 40, textAlign: "center", color: C.t3, fontFamily: FONT, fontSize: 13 }}>
                <div style={{ marginBottom: 10, display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: C.primary, animation: "ge-pulse 1.2s ease-in-out infinite" }} />
                  <strong style={{ color: C.dark }}>{grant?.aiResearch ? "Drafting sections…" : "Researching funder…"}</strong>
                </div>
                <div style={{ fontSize: 12, color: C.t4, maxWidth: 480, margin: "0 auto", lineHeight: 1.5 }}>
                  {grant?.aiResearch
                    ? "Each section streams in as the AI completes it — usually 5-10 seconds per section. Total ~1-2 minutes for a full proposal."
                    : "Step 1 of 2: searching the funder's site, recent grants, and CSI/foundation databases. Sections start drafting once research lands. Total ~1-2 minutes."}
                </div>
              </div>
            )}
            {!assembled && !generating && (
              <div style={{ padding: 40, textAlign: "center", color: C.t3, fontFamily: FONT, fontSize: 13 }}>
                <div style={{ marginBottom: 8 }}>No proposal generated yet.</div>
                <div style={{ fontSize: 12, color: C.t4 }}>Generation should have started automatically. If it didn't, close this dialog and click <strong>Make the Magic Happen</strong>.</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
