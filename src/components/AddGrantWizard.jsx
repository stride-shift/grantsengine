import { useState } from "react";
import { C, FONT, MONO } from "../theme";
import { Btn } from "./index";
import { uid, td, calcTotalAsk, buildPtypeNotes } from "../utils";
import { PTYPES } from "../data/funderStrategy";
import { uploadFile } from "../api";

/* Add-grant wizard, lifted verbatim from Pipeline.jsx (Phase 4.6, move-only).
   Owns its own multi-step form state — none of it was read by the rest of Pipeline,
   so moving it in is behaviour-neutral. Rendered UNCONDITIONALLY by the parent with an
   `open` prop (it early-returns null when closed) so the half-filled form survives a
   +Add toggle-close exactly as before — the form state must NOT live in a conditionally
   mounted child, or it would wipe on every toggle. `onClose` stands in for the parent's
   setShowAdd(false). The Pipeline render-net wizard snapshot + interaction tests prove
   the DOM and behaviour are unchanged. */

const COMMON_FOCUS = ["Youth Employment", "Digital Skills", "AI/4IR", "Education", "Women", "Rural Dev", "STEM", "Entrepreneurship", "Work Readiness", "Leadership"];
const GRANT_SOURCES = ["scout", "email", "relationship", "website", "referral", "other"];

export default function AddGrantWizard({ open, onClose, funderTypes, funderSuggestions, onAddGrant, onSelectGrant }) {
  const [wizStep, setWizStep] = useState(1); // 1 = funder, 2 = programme, 3 = AI actions
  const [newName, setNewName] = useState("");
  const [newFunder, setNewFunder] = useState("");
  const [newType, setNewType] = useState(funderTypes?.[0] || "Foundation");
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
  const [customFocusInput, setCustomFocusInput] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [pendingFiles, setPendingFiles] = useState([]); // files to upload after grant creation
  // Step 3: AI actions
  const [autoAI, setAutoAI] = useState({ fitscore: true, research: false, draft: false });
  const [addError, setAddError] = useState("");

  const resetWizard = () => {
    onClose(); setAddError(""); setWizStep(1);
    setSelectedPTypes(new Map()); setCustomProgrammes([]);
    setNewAsk(""); setNewDeadline(""); setNewRel("Cold");
    setNewMarket("sa"); setNewApplyUrl(""); setNewSource("scout"); setNewFocusTags([]);
    setNewNotes(""); setCustomFocusInput(""); setPendingFiles([]);
    setAutoAI({ fitscore: true, research: false, draft: false });
  };

  const addGrantEnhanced = async (runAI = false) => {
    const trimName = (newName || "").trim();
    const trimFunder = (newFunder || "").trim();
    if (!trimName || trimName.length < 2) { setAddError("Grant name must be at least 2 characters"); return; }
    if (!trimFunder) { setAddError("Funder name is required"); return; }
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
    if (pendingAI) onSelectGrant(grantId);

    // Upload any attached files in the background after grant creation
    if (filesToUpload.length > 0) {
      (async () => {
        for (const file of filesToUpload) {
          try { await uploadFile(file, grantId, null); }
          catch (err) { console.error("Upload failed:", file.name, err.message); }
        }
      })();
    }
  };

  if (!open) return null;

  return (
    <div style={{ marginBottom: 14, background: C.white, borderRadius: 10, boxShadow: C.cardShadow, overflow: "hidden" }}>
      {/* Step indicator */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.line}` }}>
        {[{ n: 1, l: "Grant & Funder" }, { n: 2, l: "Programme & Ask" }, { n: 3, l: "AI Actions" }].map(s => (
          <div key={s.n} onClick={() => { if (s.n < wizStep) setWizStep(s.n); }} style={{
            flex: 1, padding: "10px 16px", fontSize: 11, fontWeight: 700,
            color: wizStep === s.n ? C.primary : wizStep > s.n ? C.ok : C.t4,
            borderBottom: wizStep === s.n ? `2px solid ${C.primary}` : "2px solid transparent",
            textAlign: "center", letterSpacing: 0.5, cursor: s.n < wizStep ? "pointer" : "default",
          }}>{s.n}. {s.l}</div>
        ))}
      </div>

      <div style={{ padding: "14px 18px" }}>
        {/* ── Step 1: Grant & Funder ── */}
        {wizStep === 1 && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Grant name" autoFocus
                style={{ flex: 2, padding: "8px 12px", fontSize: 13, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: FONT }} />
              <input value={newFunder} onChange={e => setNewFunder(e.target.value)} placeholder="Funder name"
                list="funder-suggestions"
                style={{ flex: 1.5, padding: "8px 12px", fontSize: 13, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: FONT }} />
              <datalist id="funder-suggestions">
                {funderSuggestions.map(f => <option key={f} value={f} />)}
              </datalist>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              <select value={newType} onChange={e => setNewType(e.target.value)}
                style={{ padding: "8px 12px", fontSize: 11, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: FONT, flex: 1, minWidth: 120 }}>
                {(funderTypes || []).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input type="date" value={newDeadline} onChange={e => setNewDeadline(e.target.value)}
                style={{ padding: "8px 12px", fontSize: 11, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: FONT, width: 140 }} />
              <select value={newRel} onChange={e => setNewRel(e.target.value)}
                style={{ padding: "8px 12px", fontSize: 11, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: FONT, width: 90 }}>
                <option value="Cold">Cold</option>
                <option value="Warm">Warm</option>
                <option value="Hot">Hot</option>
              </select>
              <div style={{ display: "flex", gap: 0, borderRadius: 6, overflow: "hidden", border: `1px solid ${C.line}` }}>
                {[{ id: "sa", l: "🇿🇦 SA" }, { id: "global", l: "🌍 Global" }].map(m => (
                  <button key={m.id} onClick={() => setNewMarket(m.id)} style={{
                    padding: "6px 12px", fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer",
                    background: newMarket === m.id ? C.primary : C.white, color: newMarket === m.id ? C.white : C.t3,
                  }}>{m.l}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select value={newSource} onChange={e => setNewSource(e.target.value)}
                style={{ padding: "8px 12px", fontSize: 12, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: FONT, color: C.t2, background: "white" }}>
                {GRANT_SOURCES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
              <input value={newApplyUrl} onChange={e => setNewApplyUrl(e.target.value)} placeholder="Application URL (optional)"
                style={{ flex: 1, padding: "8px 12px", fontSize: 12, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: FONT, color: C.t2 }} />
              <Btn onClick={() => { if (newName?.trim() && newFunder?.trim()) setWizStep(2); else setAddError("Name and funder required"); }}
                disabled={!newName?.trim() || !newFunder?.trim()}
                style={{ fontSize: 12, padding: "8px 18px" }}>Next</Btn>
              <Btn onClick={resetWizard} v="ghost" style={{ fontSize: 12 }}>Cancel</Btn>
            </div>
            {addError && <div style={{ fontSize: 11, color: C.red, marginTop: 6 }}>{addError}</div>}
          </div>
        )}

        {/* ── Step 2: Programme & Ask ── */}
        {wizStep === 2 && (
          <div>
            <div style={{ fontSize: 12, color: C.t3, marginBottom: 10 }}>
              Select programme types for <strong style={{ color: C.dark }}>{newName}</strong> ({newFunder}) — select one or more
            </div>

            {/* Multi-select programme grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
              {Object.entries(PTYPES).map(([num, pt]) => {
                const isSelected = selectedPTypes.has(num);
                const cohorts = selectedPTypes.get(num)?.cohorts || 1;
                return (
                  <div key={num} onClick={() => {
                      const next = new Map(selectedPTypes);
                      if (isSelected) next.delete(num); else next.set(num, { cohorts: 1 });
                      setSelectedPTypes(next); setNewAsk("");
                    }}
                    style={{
                      padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                      border: isSelected ? `2px solid ${C.primary}` : `1px solid ${C.line}`,
                      background: isSelected ? C.primarySoft : C.white,
                      transition: "all 0.15s ease",
                    }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span style={{
                        width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 10, fontWeight: 800, fontFamily: MONO,
                        background: isSelected ? C.primary : C.raised, color: isSelected ? C.white : C.t3,
                      }}>T{num}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.dark, flex: 1 }}>{pt.label.split(" — ")[0]}</span>
                    </div>
                    <div style={{ fontSize: 10, color: C.t3, marginBottom: 4 }}>{pt.label.split(" — ")[1] || ""}</div>
                    <div style={{ display: "flex", gap: 8, fontSize: 10, color: C.t2 }}>
                      {pt.cost && <span style={{ fontWeight: 700, fontFamily: MONO, color: isSelected ? C.primary : C.t1 }}>R{(pt.cost * cohorts).toLocaleString()}</span>}
                      {pt.students && <span>{pt.students} students</span>}
                      <span>{pt.duration}</span>
                    </div>
                    {/* Inline cohort multiplier when selected */}
                    {isSelected && pt.cost && (
                      <div style={{ display: "flex", gap: 4, marginTop: 6 }} onClick={e => e.stopPropagation()}>
                        {[1, 2, 3, 5].map(n => (
                          <button key={n} onClick={() => {
                              const next = new Map(selectedPTypes);
                              next.set(num, { cohorts: n });
                              setSelectedPTypes(next); setNewAsk("");
                            }}
                            style={{
                              padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, fontFamily: MONO,
                              background: cohorts === n ? C.primary : C.white, color: cohorts === n ? C.white : C.t3,
                              border: `1px solid ${cohorts === n ? C.primary : C.line}`, cursor: "pointer",
                            }}>{n}x</button>
                        ))}
                        <span style={{ fontSize: 10, fontWeight: 700, color: C.primary, marginLeft: "auto", fontFamily: MONO }}>
                          R{(pt.cost * cohorts).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Custom programme */}
            {customProgrammes.map((cp, i) => (
              <div key={cp.id} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                <input placeholder="Programme name" value={cp.name} onChange={e => {
                    const next = [...customProgrammes]; next[i] = { ...next[i], name: e.target.value }; setCustomProgrammes(next);
                  }}
                  style={{ flex: 2, padding: "6px 10px", fontSize: 12, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: FONT }} />
                <input placeholder="Cost (R)" type="number" value={cp.cost || ""} onChange={e => {
                    const next = [...customProgrammes]; next[i] = { ...next[i], cost: parseInt(e.target.value) || 0 }; setCustomProgrammes(next); setNewAsk("");
                  }}
                  style={{ width: 100, padding: "6px 10px", fontSize: 12, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: MONO }} />
                <button onClick={() => {
                    const next = new Map(selectedPTypes);
                    if (next.has(cp.id)) next.delete(cp.id); else next.set(cp.id, { cohorts: 1 });
                    setSelectedPTypes(next); setNewAsk("");
                  }}
                  style={{
                    padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer",
                    background: selectedPTypes.has(cp.id) ? C.primary : C.raised,
                    color: selectedPTypes.has(cp.id) ? C.white : C.t3,
                    border: `1px solid ${selectedPTypes.has(cp.id) ? C.primary : C.line}`,
                  }}>{selectedPTypes.has(cp.id) ? "✓ Selected" : "Select"}</button>
                <button onClick={() => {
                    setCustomProgrammes(prev => prev.filter((_, j) => j !== i));
                    const next = new Map(selectedPTypes); next.delete(cp.id); setSelectedPTypes(next); setNewAsk("");
                  }}
                  style={{ background: "none", border: "none", color: C.t4, cursor: "pointer", fontSize: 14 }}>{"×"}</button>
              </div>
            ))}
            <button onClick={() => setCustomProgrammes(prev => [...prev, { id: `custom-${prev.length}`, name: "", cost: 0 }])}
              style={{ background: "none", border: `1px dashed ${C.line}`, borderRadius: 8, padding: "6px 14px",
                fontSize: 11, fontWeight: 600, color: C.t3, cursor: "pointer", fontFamily: FONT, marginBottom: 12, width: "100%" }}>
              + Custom Programme
            </button>

            {/* Ask breakdown */}
            {selectedPTypes.size > 0 && (() => {
              const baseCost = calcTotalAsk(selectedPTypes, customProgrammes, false);
              const orgCost = Math.round(baseCost * 0.3);
              const totalAsk = baseCost + orgCost;
              return (
                <div style={{ padding: "10px 14px", background: C.warm100, borderRadius: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: 11, color: C.t3, marginBottom: 4 }}>
                    Programme: <strong style={{ fontFamily: MONO }}>R{baseCost.toLocaleString()}</strong>
                    {" + "}30% org: <strong style={{ fontFamily: MONO }}>R{orgCost.toLocaleString()}</strong>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.primary, fontFamily: MONO }}>
                    Total ask: R{totalAsk.toLocaleString()}
                  </div>
                </div>
              );
            })()}

            {/* Custom ask override */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: C.t3, fontWeight: 600 }}>Override ask:</span>
              <input value={newAsk} onChange={e => setNewAsk(e.target.value)}
                placeholder="R amount" type="number"
                style={{ width: 120, padding: "6px 10px", fontSize: 13, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: MONO }} />
            </div>

            {/* Focus tags */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.t3, marginBottom: 4 }}>Focus areas</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {COMMON_FOCUS.map(tag => {
                  const sel = newFocusTags.includes(tag);
                  return (
                    <button key={tag} onClick={() => setNewFocusTags(prev => sel ? prev.filter(t => t !== tag) : [...prev, tag])}
                      style={{
                        padding: "3px 10px", fontSize: 10, fontWeight: 600, borderRadius: 20, cursor: "pointer", fontFamily: FONT,
                        background: sel ? C.primary + "18" : C.raised, color: sel ? C.primary : C.t3,
                        border: `1px solid ${sel ? C.primary + "50" : C.line}`,
                      }}>{tag}</button>
                  );
                })}
                <input value={customFocusInput} onChange={e => setCustomFocusInput(e.target.value)}
                  placeholder="+ custom" onKeyDown={e => {
                    if (e.key === "Enter" && customFocusInput.trim()) {
                      setNewFocusTags(prev => [...prev, customFocusInput.trim()]);
                      setCustomFocusInput("");
                    }
                  }}
                  style={{ width: 80, padding: "3px 8px", fontSize: 10, border: `1px solid ${C.line}`, borderRadius: 20, fontFamily: FONT }} />
              </div>
            </div>

            {/* Context & Attachments */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.t3, marginBottom: 4 }}>Context & direction</div>
              <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)}
                placeholder={"Paste funder guidelines, application requirements, strategic notes, or any context that should inform the AI when researching and drafting...\n\nExamples:\n• \"Returning funder — focus on continuity and outcomes from last cycle\"\n• \"They want a focus on rural youth and digital skills\"\n• \"Max 10 pages, must include theory of change\""}
                style={{ width: "100%", minHeight: 90, padding: "10px 12px", fontSize: 12, lineHeight: 1.5,
                  border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: FONT, resize: "vertical",
                  boxSizing: "border-box", background: C.bg }} />

              {/* File attachments */}
              <div style={{ marginTop: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <label style={{
                    display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px",
                    fontSize: 11, fontWeight: 600, color: C.t3, background: C.raised,
                    borderRadius: 6, cursor: "pointer", border: `1px solid ${C.line}`,
                    transition: "all 0.15s",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = C.primary; e.currentTarget.style.color = C.primary; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.color = C.t3; }}
                  >
                    <span style={{ fontSize: 13 }}>+</span> Attach files
                    <input type="file" multiple
                      accept=".pdf,.doc,.docx,.xlsx,.xls,.csv,.txt,.md,.jpg,.jpeg,.png,.gif,.webp"
                      style={{ display: "none" }}
                      onChange={e => {
                        if (e.target.files.length) setPendingFiles(prev => [...prev, ...Array.from(e.target.files)]);
                        e.target.value = "";
                      }} />
                  </label>
                  <span style={{ fontSize: 10, color: C.t4 }}>
                    Funder docs, RFPs, guidelines — uploaded after grant is created
                  </span>
                </div>

                {pendingFiles.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {pendingFiles.map((f, i) => (
                      <div key={i} style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "4px 10px",
                        background: C.white, border: `1px solid ${C.line}`, borderRadius: 6, fontSize: 11,
                      }}>
                        <span style={{ fontWeight: 600, color: C.dark, maxWidth: 180, overflow: "hidden",
                          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                        <span style={{ color: C.t4, fontSize: 10 }}>
                          {f.size < 1024 * 1024 ? `${(f.size / 1024).toFixed(0)}KB` : `${(f.size / (1024 * 1024)).toFixed(1)}MB`}
                        </span>
                        <button onClick={() => setPendingFiles(prev => prev.filter((_, j) => j !== i))}
                          style={{ background: "none", border: "none", color: C.t4, cursor: "pointer",
                            fontSize: 13, padding: "0 2px", lineHeight: 1 }}
                          onMouseEnter={e => { e.currentTarget.style.color = C.red; }}
                          onMouseLeave={e => { e.currentTarget.style.color = C.t4; }}
                        >×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Btn v="ghost" onClick={() => setWizStep(1)} style={{ fontSize: 12 }}>Back</Btn>
              <Btn onClick={() => setWizStep(3)} style={{ fontSize: 12, padding: "8px 18px" }}>Next</Btn>
              <Btn onClick={resetWizard} v="ghost" style={{ fontSize: 12 }}>Cancel</Btn>
            </div>
            {addError && <div style={{ fontSize: 11, color: C.red, marginTop: 6 }}>{addError}</div>}
          </div>
        )}

        {/* ── Step 3: AI Actions ── */}
        {wizStep === 3 && (
          <div>
            {/* Summary */}
            <div style={{ padding: "10px 14px", background: C.warm100, borderRadius: 8, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>{newName}</div>
              <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
                {newFunder} {"·"} {newType} {"·"} {newRel} {"·"} {newMarket === "global" ? "🌍 Global" : "🇿🇦 SA"}
                {newDeadline && ` · Due ${new Date(newDeadline + "T00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`}
              </div>
              {(() => {
                const enteredAsk = parseInt(String(newAsk).replace(/[,\s]/g, "")) || 0;
                const calcAsk = calcTotalAsk(selectedPTypes, customProgrammes, true);
                const finalAsk = enteredAsk || calcAsk;
                return finalAsk > 0 ? (
                  <div style={{ fontSize: 14, fontWeight: 800, color: C.primary, fontFamily: MONO, marginTop: 4 }}>R{finalAsk.toLocaleString()}</div>
                ) : null;
              })()}
              {selectedPTypes.size > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                  {[...selectedPTypes.entries()].map(([k, v]) => (
                    <span key={k} style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, background: C.primarySoft, color: C.primary }}>
                      {k.startsWith("custom-") ? customProgrammes.find(c => c.id === k)?.name || "Custom" : `Type ${k}`}
                      {v.cohorts > 1 ? ` ×${v.cohorts}` : ""}
                    </span>
                  ))}
                </div>
              )}
              {newFocusTags.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 6 }}>
                  {newFocusTags.map(t => <span key={t} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: C.raised, color: C.t3 }}>{t}</span>)}
                </div>
              )}
              {(newNotes.trim() || pendingFiles.length > 0) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, alignItems: "center" }}>
                  {newNotes.trim() && (
                    <span style={{ fontSize: 10, color: C.t3 }}>
                      Context: {newNotes.trim().length > 60 ? newNotes.trim().slice(0, 60) + "..." : newNotes.trim()}
                    </span>
                  )}
                  {pendingFiles.length > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: C.blue, background: C.blueSoft || C.primarySoft, padding: "2px 8px", borderRadius: 4 }}>
                      {pendingFiles.length} file{pendingFiles.length > 1 ? "s" : ""} attached
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* AI action toggles */}
            <div style={{ fontSize: 10, fontWeight: 700, color: C.t4, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
              Auto-run after creation
            </div>
            {[
              { key: "fitscore", label: "Fit Score", desc: "Assess alignment with the organisation's strengths" },
              { key: "research", label: "Funder Research", desc: "Research funder priorities, history, requirements", locked: autoAI.draft },
              { key: "draft", label: "Draft Proposal", desc: "Research runs first to tailor the proposal to the funder" },
            ].map(action => (
              <label key={action.key} onClick={() => {
                  if (action.locked) return; // research is locked on when draft is enabled
                  setAutoAI(prev => {
                    const next = { ...prev, [action.key]: !prev[action.key] };
                    // Enabling draft forces research on
                    if (action.key === "draft" && next.draft) next.research = true;
                    return next;
                  });
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                  borderRadius: 8, marginBottom: 4, cursor: action.locked ? "default" : "pointer",
                  background: autoAI[action.key] ? C.primarySoft : C.white,
                  border: `1px solid ${autoAI[action.key] ? C.primary + "50" : C.line}`,
                  transition: "all 0.15s", opacity: action.locked ? 0.7 : 1,
                }}>
                <span style={{
                  width: 18, height: 18, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 800,
                  background: autoAI[action.key] ? C.primary : C.white,
                  color: autoAI[action.key] ? C.white : C.t4,
                  border: `1px solid ${autoAI[action.key] ? C.primary : C.line}`,
                }}>{autoAI[action.key] ? "✓" : ""}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.dark }}>
                    {action.label}{action.locked ? " (required for draft)" : ""}
                  </div>
                  <div style={{ fontSize: 10, color: C.t3 }}>{action.desc}</div>
                </div>
              </label>
            ))}

            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12 }}>
              <Btn v="ghost" onClick={() => setWizStep(2)} style={{ fontSize: 12 }}>Back</Btn>
              <Btn onClick={() => addGrantEnhanced(true)} style={{ fontSize: 12, padding: "8px 18px" }}>
                {Object.values(autoAI).some(Boolean) ? "Add & Run AI" : "Add to Pipeline"}
              </Btn>
              <Btn onClick={() => addGrantEnhanced(false)} v="ghost" style={{ fontSize: 12 }}>Just Add</Btn>
              <Btn onClick={resetWizard} v="ghost" style={{ fontSize: 12 }}>Cancel</Btn>
            </div>
            {addError && <div style={{ fontSize: 11, color: C.red, marginTop: 6 }}>{addError}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
