import { useState, useEffect, useRef } from "react";
import { C, FONT, MONO } from "../theme";
import { Btn } from "./index";
import { detectForm, updateAutofillMappings, runAutofill, submitAutofill, verifyUrls } from "../api";

const CONFIDENCE_COLOR = { high: "#16A34A", medium: "#C17817", low: "#9CA3AF" };
const STATUS_LABEL = {
  pending: "Pending",
  "ready-for-review": "Ready for review",
  filling: "Filling form...",
  submitting: "Submitting...",
  submitted: "Submitted",
  error: "Error",
};

export default function AutoFillPanel({ grant, onClose, onSubmitted, onRunAI, onUpdateGrant }) {
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

  useEffect(() => {
    if (grant?.applyUrl && !job) handleDetect();
  }, []);

  // Auto-trigger AI URL search once when the panel opens for a grant with no usable URL.
  // Tracked in a ref so we don't loop if the AI also fails to find one.
  const autoFindTriggeredRef = useRef(false);
  useEffect(() => {
    if (autoFindTriggeredRef.current) return;
    if (!onRunAI || !onUpdateGrant) return;
    // Only fire if we have NO usable URL on the grant and we haven't detected yet
    if (grant?.applyUrl || job || detecting || findingUrl) return;
    autoFindTriggeredRef.current = true;
    findApplyUrlWithAI();
  }, [grant?.id, grant?.applyUrl, job, detecting, findingUrl, onRunAI, onUpdateGrant]);

  // Same auto-trigger when handleDetect returns the specific "no URL" error
  useEffect(() => {
    if (autoFindTriggeredRef.current) return;
    if (!onRunAI || !onUpdateGrant) return;
    if (!error || !error.toLowerCase().includes("no usable application url")) return;
    autoFindTriggeredRef.current = true;
    findApplyUrlWithAI();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error, onRunAI, onUpdateGrant]);

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
            <div style={{ fontSize: 16, fontWeight: 800, color: C.dark }}>Auto-fill Application</div>
            <div style={{ fontSize: 12, color: C.t3, marginTop: 2 }}>
              {grant.name} — {grant.funder}
              {formType && <span style={{ marginLeft: 8, padding: "1px 8px", borderRadius: 100, background: formType === "online-form" ? C.okSoft : C.raised, color: formType === "online-form" ? C.ok : C.t3, fontSize: 10, fontWeight: 600 }}>{formType}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ fontSize: 22, color: C.t4, background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1 }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: "18px 22px", overflow: "auto", flex: 1 }}>
          {detecting && (
            <div style={{ textAlign: "center", padding: 40, color: C.t3 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.dark, marginBottom: 4 }}>Analysing form...</div>
              <div style={{ fontSize: 12 }}>Fetching {grant.applyUrl}</div>
            </div>
          )}

          {!detecting && !job && !error && (
            <div style={{ textAlign: "center", padding: 40 }}>
              <Btn v="primary" onClick={handleDetect}>Analyse application form</Btn>
            </div>
          )}

          {error && (() => {
            const isNoLink = error.toLowerCase().includes("no apply link")
              || error.toLowerCase().includes("don't have a link to apply")
              || error.toLowerCase().includes("no usable application url"); // legacy match
            return (
              <div style={{ padding: "10px 14px", background: C.redSoft, border: `1px solid ${C.red}30`, borderRadius: 8, color: C.red, fontSize: 12, marginBottom: 12 }}>
                <div style={{ marginBottom: isNoLink ? 10 : 0 }}>{error}</div>
                {/* When we don't have a link, offer a one-click AI search instead of dumping the user back to settings */}
                {isNoLink && onRunAI && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      onClick={findApplyUrlWithAI}
                      disabled={findingUrl}
                      style={{
                        fontSize: 12, fontWeight: 700, color: C.white,
                        background: C.primary, border: "none", borderRadius: 6,
                        padding: "6px 14px", cursor: findingUrl ? "wait" : "pointer", fontFamily: FONT,
                      }}>
                      {findingUrl ? "Searching the funder's website…" : "Search for the apply link"}
                    </button>
                    <span style={{ fontSize: 11, color: C.t3 }}>
                      or paste a link yourself in the grant's Apply link box
                    </span>
                  </div>
                )}
                {findUrlResult && findUrlResult.url && (
                  <div style={{ marginTop: 10, padding: "10px 12px", background: C.white, border: `1px solid ${C.ok}30`, borderRadius: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.ok, marginBottom: 4 }}>
                      Found and verified: this page loads
                    </div>
                    <a href={findUrlResult.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: C.blue, textDecoration: "underline", wordBreak: "break-all" }}>{findUrlResult.url}</a>
                    {findUrlResult.note && <div style={{ marginTop: 6, fontSize: 11, color: C.t3, fontStyle: "italic" }}>{findUrlResult.note}</div>}
                    {findUrlResult.pageType && findUrlResult.pageType !== "form" && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}` }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.dark, marginBottom: 4 }}>
                          {findUrlResult.pageType === "homepage" ? "This is the funder's homepage." :
                            findUrlResult.pageType === "contact" ? "This is a contact page, not a form." :
                            "This page describes their funding but doesn't have an online form."}
                        </div>
                        <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.5 }}>
                          Auto-fill needs a real online form to do its work. Since this funder doesn't have one, your best move is to:
                          <ol style={{ margin: "6px 0 0 18px", padding: 0, color: C.t2 }}>
                            <li style={{ marginBottom: 2 }}>Open the page above to read what they fund and how they want to be approached.</li>
                            <li style={{ marginBottom: 2 }}>Close this dialog and use <strong>Make the Magic Happen</strong> on the grant page to draft a full proposal — you can email or copy-paste it into whatever channel the funder uses.</li>
                          </ol>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {findUrlResult && !findUrlResult.url && (
                  <div style={{ marginTop: 10, padding: "10px 12px", background: C.amberSoft, border: `1px solid ${C.amber}30`, borderRadius: 8, fontSize: 11, color: C.amber }}>
                    <div>{findUrlResult.note}</div>
                    {Array.isArray(findUrlResult.candidates) && findUrlResult.candidates.length > 0 && (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                          Try these manually:
                        </div>
                        {findUrlResult.candidates.map((c, i) => (
                          <div key={i} style={{ marginBottom: 4 }}>
                            <a href={c.url} target="_blank" rel="noopener noreferrer" style={{ color: C.blue, fontSize: 11, textDecoration: "underline", wordBreak: "break-all" }}>{c.url}</a>
                            {c.note && <span style={{ marginLeft: 6, fontSize: 10, color: C.t4, fontStyle: "italic" }}>— {c.note}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

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
