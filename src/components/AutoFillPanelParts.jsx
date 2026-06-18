import { useState, useEffect, useRef } from "react";
import { C, FONT, MONO } from "../theme";
import { parseFitScore } from "../utils";
import { DOCS } from "../data/constants";
import { buildGlossaryAppendix } from "../data/glossary";

/* Download dropdown — picks between DOCX (Word) and PDF (browser print).
 * The .txt option is hidden by default but kept as a fallback. */
export function DownloadMenu({ disabled, onDocx, onPdf, onTxt, label = "⤓ Download", small = false }) {
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
export function ApplicationDocuments({ grant, docs, summary, extracting, uploads, orgUploads, matchUpload, onRefresh, onAttachNew, onRemove, onUpdateGrant, uploadingDoc }) {
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
export function VaultPicker({ files, onPick, onClose, title }) {
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
export function ProposalPreviewBlock({ grant, assembled, showPreview, onToggle, onDownloadDocx, onDownloadPdf, onDownloadTxt, generating, generatingStep, onUpdateGrant, uploads = [], orgUploads = [] }) {
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
  const fitscoreNum = parseFitScore(grant?.aiFitscore).score;
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
