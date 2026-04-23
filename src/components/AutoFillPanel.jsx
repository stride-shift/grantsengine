import { useState, useEffect } from "react";
import { C, FONT, MONO } from "../theme";
import { Btn } from "./index";
import { detectForm, updateAutofillMappings, runAutofill, submitAutofill } from "../api";

const CONFIDENCE_COLOR = { high: "#16A34A", medium: "#C17817", low: "#9CA3AF" };
const STATUS_LABEL = {
  pending: "Pending",
  "ready-for-review": "Ready for review",
  filling: "Filling form...",
  submitting: "Submitting...",
  submitted: "Submitted",
  error: "Error",
};

export default function AutoFillPanel({ grant, onClose, onSubmitted }) {
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [job, setJob] = useState(null);
  const [mappings, setMappings] = useState([]);
  const [fields, setFields] = useState([]);
  const [formType, setFormType] = useState(null);
  const [requiresLogin, setRequiresLogin] = useState(false);
  const [notes, setNotes] = useState("");
  const [fetchError, setFetchError] = useState(null);
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [showCreds, setShowCreds] = useState(false);
  const [filling, setFilling] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [copiedField, setCopiedField] = useState(null);
  const [edited, setEdited] = useState(false);

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
    } catch (e) {
      setError(e.message);
    } finally {
      setDetecting(false);
    }
  };

  useEffect(() => {
    if (grant?.applyUrl && !job) handleDetect();
  }, []);

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

          {error && (
            <div style={{ padding: "10px 14px", background: C.redSoft, border: `1px solid ${C.red}30`, borderRadius: 8, color: C.red, fontSize: 12, marginBottom: 12 }}>
              {error}
            </div>
          )}

          {fetchError && (
            <div style={{ padding: "10px 14px", background: C.amberSoft, border: `1px solid ${C.amber}30`, borderRadius: 8, color: C.amber, fontSize: 12, marginBottom: 12 }}>
              Could not fetch form directly ({fetchError}). Detection may be incomplete — verify fields match the actual form.
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
