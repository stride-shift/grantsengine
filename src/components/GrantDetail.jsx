import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { C, FONT, MONO } from "../theme";
import { fmtK, dL, td, effectiveAsk, grantReadiness } from "../utils";
import { Btn, DeadlineBadge, TypeBadge, Tag, AICard, stripMd, timeAgo } from "./index";
import UploadZone from "./UploadZone";
import { getUploads } from "../api";
import { detectType, PTYPES, multiCohortInfo, funderStrategy } from "../data/funderStrategy";
import { DOCS, DOC_MAP, ORG_DOCS } from "../data/constants";
import ProposalWorkspace from "./ProposalWorkspace";
import BudgetBuilder from "./BudgetBuilder";

const fmtTs = (iso) => iso ? new Date(iso).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

// Extract ask recommendation from draft text
const extractAskFromDraft = (draftText) => {
  // Priority 1: Structured ASK_RECOMMENDATION line
  const structured = draftText.match(/ASK_RECOMMENDATION:\s*Type\s*(\d),\s*(\d+)\s*cohort\(s?\),\s*R(\d+)/i);
  if (structured) {
    const typeNum = parseInt(structured[1]);
    const count = parseInt(structured[2]);
    const amount = parseInt(structured[3]);
    if (PTYPES[typeNum] && amount > 0) return { ask: amount, typeNum, mcCount: count };
  }
  // Priority 2: Scan for Type X in body
  const typeMatch = draftText.match(/Type\s*(\d)/i);
  if (!typeMatch) return null;
  const detectedNum = parseInt(typeMatch[1]);
  const detectedPt = PTYPES[detectedNum];
  if (!detectedPt || !detectedPt.cost) return null;
  const mcMatch = draftText.match(/(\d+)\s*(?:x|×)\s*(?:Type\s*\d|cohort)/i);
  const mcCount = mcMatch ? parseInt(mcMatch[1]) : 1;
  return { ask: detectedPt.cost * mcCount, typeNum: detectedNum, mcCount };
};

/* ── Local presentational components (mirrors Dashboard patterns) ── */
const Card = ({ children, accent, pad = "20px 24px", style: sx, className }) => (
  <div className={className} style={{
    padding: pad, background: C.white, borderRadius: 14,
    boxShadow: C.cardShadow,
    borderTop: accent ? `3px solid ${accent}` : undefined,
    border: accent ? undefined : `1px solid ${C.line}`,
    ...sx,
  }}>{children}</div>
);

const Hd = ({ children, right, mb = 16 }) => (
  <div style={{
    display: "flex", alignItems: "baseline", justifyContent: "space-between",
    marginBottom: mb, marginTop: 28,
  }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, letterSpacing: 1.4, textTransform: "uppercase" }}>{children}</div>
    {right}
  </div>
);

const Field = ({ label, children }) => (
  <div>
    <div style={{ fontSize: 10, fontWeight: 700, color: C.t4, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
    {children}
  </div>
);

const ActivityRow = ({ date, text, isLast }) => (
  <div className="ge-hover-slide" style={{
    display: "flex", gap: 10, padding: "11px 18px",
    borderBottom: isLast ? "none" : `1px solid ${C.line}`,
    alignItems: "center", background: "transparent",
  }}>
    <span style={{ fontSize: 11, color: C.t4, fontFamily: MONO, minWidth: 80 }}>{date}</span>
    <span style={{ fontSize: 13, color: C.t1 }}>{text}</span>
  </div>
);

export default function GrantDetail({ grant, team, stages, funderTypes, complianceDocs = [], onUpdate, onDelete, onBack, onRunAI, onUploadsChanged }) {
  const [tab, setTab] = useState("overview");
  const [busy, setBusy] = useState({});
  const [ai, setAi] = useState(() => ({
    research: grant?.aiResearch || null,
    draft: grant?.aiDraft || null,
    followup: grant?.aiFollowup || null,
    fitscore: grant?.aiFitscore || null,
    winloss: grant?.aiWinloss || null,
  }));
  const [confirmDel, setConfirmDel] = useState(false);
  const [editingAsk, setEditingAsk] = useState(false);
  const [askInput, setAskInput] = useState("");
  const [uploads, setUploads] = useState([]);

  // Sync AI state when switching between grants
  useEffect(() => {
    setAi({
      research: grant?.aiResearch || null,
      draft: grant?.aiDraft || null,
      followup: grant?.aiFollowup || null,
      fitscore: grant?.aiFitscore || null,
      winloss: grant?.aiWinloss || null,
    });
  }, [grant?.id]);

  // Auto-log AI actions to activity feed
  const aiLog = (action) => {
    const prev = grant?.log || [];
    onUpdate(grant.id, { log: [...prev, { d: td(), t: action }] });
  };

  const uploadsLoaded = useRef(false);
  const loadUploads = useCallback(async () => {
    if (!grant?.id) return;
    try {
      const data = await getUploads(grant.id);
      setUploads(data);
      uploadsLoaded.current = true;
      // Invalidate AI uploads cache so next AI run picks up new docs
      if (onUploadsChanged) onUploadsChanged(grant.id);
    } catch { /* ignore */ }
  }, [grant?.id, onUploadsChanged]);

  // Reset upload state when switching grants
  useEffect(() => { uploadsLoaded.current = false; setUploads([]); }, [grant?.id]);

  // Lazy-load uploads only when Attachments tab is selected
  useEffect(() => {
    if (tab === "attachments" && !uploadsLoaded.current) loadUploads();
  }, [tab, loadUploads]);

  if (!grant) return null;
  const g = grant;
  const isAIError = (r) => !r || r.startsWith("Error") || r.startsWith("Rate limit") || r.startsWith("Connection") || r.startsWith("Request failed") || r.startsWith("No response") || r.startsWith("The AI service");
  const d = dL(g.deadline);
  const stg = (stages || []).find(s => s.id === g.stage);
  const getMember = (id) => team.find(t => t.id === id) || team.find(t => t.id === "team") || { name: "Unassigned", initials: "\u2014" };
  const m = getMember(g.owner);

  const up = (field, value) => onUpdate(g.id, { [field]: value });

  // ── Doc readiness for this grant's funder type ──
  const compMap = useMemo(() => {
    const m = {};
    for (const c of complianceDocs) m[c.doc_id] = c;
    return m;
  }, [complianceDocs]);

  const docReadiness = useMemo(() => {
    const required = DOCS[g.type];
    if (!required) return null;
    let ready = 0;
    for (const docName of required) {
      const orgDocId = DOC_MAP[docName];
      if (orgDocId) {
        const cd = compMap[orgDocId];
        if (cd && (cd.status === "valid" || cd.status === "uploaded")) ready++;
      }
      // Grant-specific docs (no DOC_MAP entry) are not counted in readiness
    }
    return { ready, total: required.length };
  }, [g.type, compMap]);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "docs", label: docReadiness ? `Docs (${docReadiness.ready}/${docReadiness.total})` : "Docs" },
    { id: "attachments", label: `Attachments${uploads.length ? ` (${uploads.length})` : ""}` },
    { id: "activity", label: "Activity" },
    { id: "ai", label: "Write Proposal" },
  ];

  return (
    <div style={{ padding: "32px 36px", maxWidth: 920 }}>
      {/* Breadcrumb trail */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6, marginBottom: 20,
        fontSize: 13, color: C.t4, fontWeight: 500,
      }}>
        <button onClick={onBack} style={{
          background: "none", border: "none", color: C.t3, fontSize: 13, cursor: "pointer",
          fontFamily: FONT, display: "flex", alignItems: "center", gap: 4,
          transition: "color 0.15s ease", padding: 0,
        }}
          onMouseEnter={e => e.currentTarget.style.color = C.primary}
          onMouseLeave={e => e.currentTarget.style.color = C.t3}>
          {"\u2190"} Pipeline
        </button>
        <span style={{ color: C.t4 }}>/</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: stg?.c || C.t4, flexShrink: 0 }} />
          <span style={{ color: C.t2, fontWeight: 600 }}>{stg?.label}</span>
        </span>
        <span style={{ color: C.t4 }}>/</span>
        <span style={{ color: C.dark, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 400 }}>{g.name}</span>
      </div>

      <Card accent={stg?.c || C.t4} style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, color: C.dark, marginBottom: 4, letterSpacing: -0.5, lineHeight: 1.2 }}>{g.name}</div>
            <div style={{ fontSize: 14, color: C.t2, fontWeight: 500, marginBottom: 8 }}>{g.funder}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <TypeBadge type={g.type} />
              <DeadlineBadge d={d} deadline={g.deadline} size="md" stage={g.stage} />
              {g.rel && g.rel !== "Cold" && (
                <span style={{ fontSize: 11, fontWeight: 600, color: C.ok, background: C.okSoft, padding: "3px 10px", borderRadius: 20 }}>{g.rel}</span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {g.applyUrl && (
              <a href={g.applyUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
                <Btn v="ghost" style={{ fontSize: 12 }}>{"\u2197"} Apply</Btn>
              </a>
            )}
            <Btn v="danger" onClick={() => setConfirmDel(true)} style={{ fontSize: 12 }}>Delete</Btn>
          </div>
        </div>
      </Card>

      {/* Confirm delete */}
      {confirmDel && (
        <Card accent={C.red} style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: C.red, fontWeight: 500, flex: 1 }}>Delete this grant permanently?</span>
          <Btn v="danger" onClick={() => { onDelete(g.id); onBack(); }} style={{ fontSize: 12 }}>Yes, Delete</Btn>
          <Btn v="ghost" onClick={() => setConfirmDel(false)} style={{ fontSize: 12 }}>Cancel</Btn>
        </Card>
      )}

      {/* Key fields — Ask prominent, controls grouped */}
      {(() => {
        const askIsSet = g.ask > 0;
        const hasFunderBudget = g.funderBudget && g.funderBudget > 0;
        const isAIDerived = g.askSource === "ai-draft";
        const isManual = g.askSource === "manual" || g.askSource === "user-override";
        const isLegacy = g.askSource === "scout-aligned";
        const pt = askIsSet ? detectType(g) : null;
        const mc = askIsSet ? multiCohortInfo(g) : null;
        const ptNum = pt ? Object.entries(PTYPES).find(([, v]) => v === pt)?.[0] : null;
        const isMC = mc && mc.count > 1;
        const sourceLabel = isAIDerived ? "AI-recommended" : isManual ? "Manual" : isLegacy ? "Legacy" : null;
        const sourceColor = isAIDerived ? C.ok : isManual ? C.purple : C.t4;
        return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
        {/* Row 1: ASK as standalone card */}
        <div style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
          <Card accent={C.primary} style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <Field label="Ask">
                <span />
              </Field>
              {sourceLabel && <span style={{ fontSize: 9, fontWeight: 600, color: sourceColor, background: sourceColor + "15", padding: "1px 6px", borderRadius: 4 }}>{sourceLabel}</span>}
            </div>
            {editingAsk ? (() => {
              const parseAsk = (raw) => parseInt(String(raw).replace(/[,\s]/g, "")) || 0;
              const commitAsk = () => {
                const v = parseAsk(askInput);
                if (v >= 1000) { up("ask", v); up("askSource", "user-override"); setEditingAsk(false); }
              };
              const parsed = parseAsk(askInput);
              const isValid = parsed >= 1000;
              return (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 16, fontWeight: 700, color: C.t3 }}>R</span>
                  <input type="text" autoFocus value={askInput}
                    onChange={e => setAskInput(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") commitAsk(); if (e.key === "Escape") setEditingAsk(false); }}
                    placeholder="e.g. 1,200,000"
                    style={{ width: 140, fontSize: 18, fontWeight: 700, fontFamily: MONO, border: `1.5px solid ${isValid || !askInput ? C.primary + "40" : C.red + "60"}`, borderRadius: 8, padding: "4px 8px", outline: "none", background: C.white }}
                  />
                  <Btn v="primary" style={{ fontSize: 10, padding: "4px 10px", opacity: isValid ? 1 : 0.5 }} onClick={commitAsk} disabled={!isValid}>Set</Btn>
                  <button onClick={() => setEditingAsk(false)} style={{ fontSize: 11, color: C.t4, background: "none", border: "none", cursor: "pointer" }}>✕</button>
                </div>
                {askInput && !isValid && <div style={{ fontSize: 10, color: C.red, marginTop: 4 }}>Min R1,000</div>}
                {isValid && <div style={{ fontSize: 10, color: C.ok, marginTop: 4 }}>= R{parsed.toLocaleString()}</div>}
              </div>
              );
            })() : askIsSet ? (
              <>
                <div style={{ fontSize: 28, fontWeight: 800, fontFamily: MONO, color: C.primary }}>{fmtK(g.ask)}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                  {ptNum && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.white, background: C.ok, padding: "1px 6px", borderRadius: 4 }}>T{isMC ? (mc.typeNum || 1) : ptNum}</span>
                      <span style={{ fontSize: 10, color: C.t4 }}>{isMC ? `${mc.count}× cohorts` : pt.label?.split("—")[0]?.trim()}</span>
                    </div>
                  )}
                  {hasFunderBudget && g.funderBudget !== g.ask && (
                    <span style={{ fontSize: 10, color: C.t4 }}>Funder budget: R{g.funderBudget.toLocaleString()}</span>
                  )}
                  <button onClick={() => { setAskInput(String(g.ask)); setEditingAsk(true); }}
                    style={{ fontSize: 10, fontWeight: 600, color: C.purple, background: "none", border: "none", cursor: "pointer", fontFamily: FONT, padding: 0 }}>
                    Override
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 24, fontWeight: 800, fontFamily: MONO, color: C.t4 }}>TBD</div>
                {hasFunderBudget && (
                  <div style={{ fontSize: 11, color: C.t3, marginTop: 4 }}>Funder offers ~R{g.funderBudget.toLocaleString()}</div>
                )}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: C.purple }}>Run proposal to set</span>
                  <button onClick={() => { setAskInput(""); setEditingAsk(true); }}
                    style={{ fontSize: 10, fontWeight: 600, color: C.t3, background: "none", border: `1px solid ${C.line}`, borderRadius: 5, padding: "2px 8px", cursor: "pointer", fontFamily: FONT }}>
                    Set manually
                  </button>
                </div>
              </>
            )}
          </Card>
        </div>

        {/* Row 2: Stage / Owner / Priority grouped */}
        <Card pad="16px 20px">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
            <Field label="Stage">
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: stg?.c || C.t4, flexShrink: 0 }} />
                <select value={g.stage} onChange={e => up("stage", e.target.value)}
                  style={{ fontSize: 14, fontWeight: 600, color: stg?.c || C.dark, border: "none", background: "transparent", fontFamily: FONT, cursor: "pointer", flex: 1 }}>
                  {(stages || []).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
            </Field>
            <Field label="Owner">
              <select value={g.owner} onChange={e => up("owner", e.target.value)}
                style={{ fontSize: 14, fontWeight: 600, color: C.dark, border: "none", background: "transparent", fontFamily: FONT, cursor: "pointer", width: "100%" }}>
                {team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
            <Field label="Priority">
              <select value={g.pri} onChange={e => up("pri", parseInt(e.target.value))}
                style={{ fontSize: 14, fontWeight: 600, color: C.dark, border: "none", background: "transparent", fontFamily: FONT, cursor: "pointer", width: "100%" }}>
                {[5, 4, 3, 2, 1].map(p => <option key={p} value={p}>{p} {p === 5 ? "(Highest)" : p === 1 ? "(Lowest)" : ""}</option>)}
              </select>
            </Field>
          </div>
        </Card>
      </div>
        );
      })()}

      {/* Readiness Bar */}
      {!["won", "lost", "deferred"].includes(g.stage) && (() => {
        const r = grantReadiness(g, complianceDocs);
        const barColor = r.score >= 80 ? C.ok : r.score >= 50 ? C.amber : C.red;
        return (
          <div style={{ marginBottom: 20, padding: "14px 18px", borderRadius: 14, background: C.warm100, border: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.t2 }}>Readiness</span>
                <span style={{ fontSize: 18, fontWeight: 800, fontFamily: MONO, color: barColor }}>{r.score}%</span>
              </div>
              {r.missing.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {r.missing.map((m, i) => (
                    <span key={i} style={{
                      fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6,
                      background: m.includes("docs") ? "#FEF3C7" : m.includes("deadline") ? "#FEE2E2" : "#F1F5F9",
                      color: m.includes("docs") ? "#92400E" : m.includes("deadline") ? "#991B1B" : "#475569",
                    }}>{m}</span>
                  ))}
                </div>
              )}
            </div>
            <div style={{ height: 5, borderRadius: 3, background: C.line, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${r.score}%`, background: barColor, borderRadius: 3, transition: "width 0.4s ease" }} />
            </div>
            {r.nextAction && (
              <div style={{ fontSize: 11, color: C.t3, fontWeight: 500, marginTop: 8 }}>
                Next: {r.nextAction}
              </div>
            )}
          </div>
        );
      })()}

      {/* AI Workflow Strip — persistent status indicators */}
      {(() => {
        const fitDone = ai.fitscore && !isAIError(ai.fitscore);
        const resDone = ai.research && !isAIError(ai.research);
        // Section-aware draft detection
        const hasSections = g.aiSections && Object.values(g.aiSections).some(s => s?.text && !isAIError(s.text));
        const draftDone = hasSections || (ai.draft && !isAIError(ai.draft));
        const sectionCount = hasSections ? Object.values(g.aiSections).filter(s => s?.text && !isAIError(s.text)).length : 0;
        const sectionTotal = hasSections ? (g.aiSectionsOrder || funderStrategy(g).structure).length : 0;
        const fitNum = fitDone ? (() => { const m = ai.fitscore.match(/SCORE:\s*(\d+)/); return m ? parseInt(m[1]) : null; })() : null;
        const isSubmittedPlus = ["submitted", "awaiting", "won", "lost", "deferred"].includes(g.stage);
        const anyBusy = busy.fitscore || busy.research || busy.draft || busy.generateAll || Object.values(busy.sections || {}).some(Boolean);

        const runAllChain = async () => {
          // Chain: Fit Score -> Research -> (then switch to AI tab for section generation)
          if (!fitDone && !busy.fitscore) {
            setBusy(p => ({ ...p, fitscore: true }));
            try {
              const r = await onRunAI("fitscore", g);
              setAi(p => ({ ...p, fitscore: r }));
              if (!isAIError(r)) {
                onUpdate(g.id, { aiFitscore: r, aiFitscoreAt: new Date().toISOString() });
                aiLog("AI Fit Score calculated");
              }
            } catch (e) { setAi(p => ({ ...p, fitscore: `Error: ${e.message}` })); }
            setBusy(p => ({ ...p, fitscore: false }));
          }
          if (!resDone && !busy.research) {
            setBusy(p => ({ ...p, research: true }));
            try {
              const r = await onRunAI("research", g);
              setAi(p => ({ ...p, research: r }));
              if (!isAIError(r)) {
                onUpdate(g.id, { aiResearch: r, aiResearchAt: new Date().toISOString() });
                aiLog(`AI Funder Research completed for ${g.funder}`);
              }
            } catch (e) { setAi(p => ({ ...p, research: `Error: ${e.message}` })); }
            setBusy(p => ({ ...p, research: false }));
          }
          // Switch to AI tab — ProposalWorkspace handles section generation
          if (!draftDone) {
            setTab("ai");
          }
        };

        const draftValue = hasSections && sectionTotal > 0
          ? `${sectionCount}/${sectionTotal}`
          : draftDone ? "Ready" : null;

        const budgetDone = !!g.budgetTable;

        const steps = [
          { key: "fitscore", label: "Fit Score", done: fitDone, busy: busy.fitscore, value: fitNum ? `${fitNum}` : null, color: fitDone ? (fitNum >= 70 ? C.ok : fitNum >= 40 ? C.amber : C.red) : C.t4 },
          { key: "research", label: "Research", done: resDone, busy: busy.research, value: resDone ? "Done" : null, color: resDone ? C.blue : C.t4 },
          { key: "budget", label: "Budget", done: budgetDone, busy: false, value: budgetDone ? fmtK(g.budgetTable.total) : null, color: budgetDone ? C.ok : C.t4 },
          { key: "draft", label: "Draft", done: draftDone, busy: busy.draft || busy.generateAll || Object.values(busy.sections || {}).some(Boolean), value: draftValue, color: draftDone ? (hasSections && sectionCount === sectionTotal ? C.purple : C.amber) : C.t4 },
        ];
        const allDone = fitDone && resDone && draftDone;
        const donePct = [fitDone, resDone, draftDone].filter(Boolean).length;

        return (
          <div style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 16,
            padding: "10px 16px", borderRadius: 12, background: C.white,
            border: `1px solid ${C.line}`, boxShadow: C.cardShadow,
          }}>
            {steps.map((s, i) => (
              <button key={s.key} onClick={() => { if (!s.done && !s.busy) setTab("ai"); }}
                style={{
                  flex: 1, display: "flex", alignItems: "center", gap: 6, padding: "6px 10px",
                  borderRadius: 8, border: `1.5px solid ${s.done ? s.color + "30" : C.line}`,
                  background: s.done ? s.color + "08" : s.busy ? C.purpleSoft : "transparent",
                  cursor: s.done ? "default" : "pointer", fontFamily: FONT,
                  transition: "all 0.15s ease",
                  animation: s.busy ? "ge-pulse 1.4s ease-in-out infinite" : "none",
                }}>
                <span style={{
                  width: 24, height: 24, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 800, fontFamily: MONO,
                  background: s.done ? s.color + "18" : C.raised,
                  color: s.done ? s.color : C.t4,
                }}>{s.busy ? "\u2026" : s.done ? (s.value || "\u2713") : (i + 1)}</span>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: s.done ? s.color : C.t3 }}>{s.label}</div>
                </div>
              </button>
            ))}
            {!allDone && !isSubmittedPlus && (
              <button onClick={runAllChain} disabled={anyBusy}
                style={{
                  padding: "8px 14px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                  background: anyBusy ? C.raised : C.primary, color: anyBusy ? C.t3 : C.white,
                  border: "none", cursor: anyBusy ? "default" : "pointer", fontFamily: FONT,
                  whiteSpace: "nowrap", flexShrink: 0,
                  opacity: anyBusy ? 0.6 : 1,
                }}>
                {anyBusy ? "Running..." : `Run All (${3 - donePct})`}
              </button>
            )}
            {allDone && (
              <span style={{ fontSize: 10, fontWeight: 700, color: C.ok, padding: "4px 10px", borderRadius: 6, background: C.okSoft, whiteSpace: "nowrap" }}>
                Workflow complete
              </span>
            )}
          </div>
        );
      })()}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.line}`, marginBottom: 24 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: "none", border: "none", fontFamily: FONT,
              color: tab === t.id ? C.primary : C.t3,
              borderBottom: tab === t.id ? `2px solid ${C.primary}` : "2px solid transparent",
              marginBottom: -1,
              transition: "color 0.15s ease",
            }}>{t.label}</button>
        ))}
      </div>

      {/* Overview */}
      {tab === "overview" && (
        <div>
          <Hd mb={12}>Grant Profile</Hd>
          <Card>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 20 }}>
              <Field label="Funder Type">
                <div style={{ marginTop: 4 }}><TypeBadge type={g.type} /></div>
              </Field>
              <Field label="Relationship">
                <div style={{ fontSize: 13, color: C.dark, fontWeight: 500 }}>{g.rel || "—"}</div>
              </Field>
              <Field label="Hours Invested">
                <div style={{ fontSize: 13, color: C.dark, fontWeight: 500 }}>{g.hrs || 0}h</div>
              </Field>
              <Field label="Deadline">
                <input type="date" value={g.deadline || ""} onChange={e => up("deadline", e.target.value || null)}
                  style={{ fontSize: 13, border: `1.5px solid ${C.line}`, borderRadius: 8, padding: "5px 10px", fontFamily: FONT, marginTop: 2 }} />
              </Field>
            </div>
          </Card>

          <Hd mb={12}>Focus & Geography</Hd>
          <Card>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.t4, marginBottom: 8 }}>Focus Areas</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {(g.focus || []).map(f => <Tag key={f} text={f} />)}
                  {(!g.focus || !g.focus.length) && <span style={{ fontSize: 12, color: C.t4 }}>No focus areas set</span>}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.t4, marginBottom: 8 }}>Geography</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {(g.geo || []).map(p => <Tag key={p} text={p} color={C.blue} />)}
                  {(!g.geo || !g.geo.length) && <span style={{ fontSize: 12, color: C.t4 }}>No geography set</span>}
                </div>
              </div>
            </div>
          </Card>

          <Hd mb={12}>Notes</Hd>
          <Card pad="0">
            <textarea value={g.notes || ""} onChange={e => up("notes", e.target.value)}
              placeholder="Add notes about this grant..."
              style={{
                width: "100%", minHeight: 140, padding: 18, fontSize: 14, lineHeight: 1.7,
                border: "none", borderRadius: 14, fontFamily: FONT,
                resize: "vertical", outline: "none", boxSizing: "border-box",
                background: "transparent",
              }}
            />
          </Card>
        </div>
      )}

      {/* Docs — Required documents checklist */}
      {tab === "docs" && (() => {
        const required = DOCS[g.type];
        if (!required) {
          return (
            <Card style={{ textAlign: "center", padding: 32 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.dark, marginBottom: 4 }}>Set a Funder Type</div>
              <div style={{ fontSize: 13, color: C.t3, lineHeight: 1.6 }}>
                Select a funder type on the Overview tab to see which documents are required for this application.
              </div>
            </Card>
          );
        }

        // Split required docs into org-level (has DOC_MAP entry) and grant-specific
        const orgDocs = [];
        const grantDocs = [];
        for (const docName of required) {
          const orgDocId = DOC_MAP[docName];
          if (orgDocId) {
            const cd = compMap[orgDocId];
            const orgDocDef = ORG_DOCS.find(od => od.id === orgDocId);
            const dl = cd?.expiry ? Math.ceil((new Date(cd.expiry) - new Date()) / 86400000) : null;
            let status = "missing", statusLabel = "Missing", statusColor = C.red, statusBg = C.redSoft, statusIcon = "✗";
            if (cd && (cd.status === "valid" || cd.status === "uploaded")) {
              if (dl !== null && dl <= 0) {
                status = "expired"; statusLabel = "Expired"; statusColor = C.red; statusBg = C.redSoft; statusIcon = "✗";
              } else if (dl !== null && dl <= 30) {
                status = "expiring"; statusLabel = `Expires in ${dl}d`; statusColor = C.amber; statusBg = C.amberSoft; statusIcon = "⚠";
              } else {
                status = "valid"; statusLabel = "Valid"; statusColor = C.ok; statusBg = C.okSoft; statusIcon = "✓";
              }
            } else if (cd?.status === "expired") {
              status = "expired"; statusLabel = "Expired"; statusColor = C.red; statusBg = C.redSoft; statusIcon = "✗";
            }
            orgDocs.push({ docName, orgDocId, cd, orgDocDef, status, statusLabel, statusColor, statusBg, statusIcon });
          } else {
            grantDocs.push(docName);
          }
        }

        return (
          <div>
            {/* Summary + progress */}
            <Card style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: docReadiness ? 12 : 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>
                  Required for {g.type}
                </div>
                {docReadiness && (
                  <span style={{
                    fontSize: 12, fontWeight: 700,
                    color: docReadiness.ready === docReadiness.total ? C.ok : C.t2,
                  }}>
                    {docReadiness.ready}/{docReadiness.total} ready
                  </span>
                )}
              </div>
              {docReadiness && (
                <div style={{ height: 4, background: C.line, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${(docReadiness.ready / docReadiness.total) * 100}%`,
                    background: docReadiness.ready === docReadiness.total ? C.ok : C.primary,
                    borderRadius: 2,
                    transition: "width 0.3s ease",
                  }} />
                </div>
              )}
            </Card>

            {/* Org-level documents */}
            {orgDocs.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <Hd mb={10}>Organisation Documents</Hd>
                <Card pad="0" style={{ overflow: "hidden" }}>
                  {orgDocs.map((doc, i) => (
                    <div
                      key={doc.orgDocId}
                      className="ge-hover-slide"
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "10px 14px",
                        borderBottom: i < orgDocs.length - 1 ? `1px solid ${C.line}` : "none",
                        background: "transparent",
                      }}
                    >
                      <span style={{
                        width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 800, color: doc.statusColor, background: doc.statusBg,
                      }}>
                        {doc.statusIcon}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>{doc.docName}</div>
                        {doc.orgDocDef?.desc && (
                          <div style={{ fontSize: 11, color: C.t4, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {doc.orgDocDef.desc}
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: doc.statusColor, whiteSpace: "nowrap" }}>
                        {doc.statusLabel}
                      </span>
                    </div>
                  ))}
                </Card>
                <div style={{ fontSize: 11, color: C.t4, marginTop: 8, paddingLeft: 4 }}>
                  Manage these documents in <span style={{ fontWeight: 600, color: C.primary, cursor: "default" }}>Settings</span>
                </div>
              </div>
            )}

            {/* Grant-specific documents */}
            {grantDocs.length > 0 && (
              <div>
                <Hd mb={10}>Grant-Specific Documents</Hd>
                <Card pad="0" style={{ overflow: "hidden" }}>
                  {grantDocs.map((docName, i) => (
                    <div
                      key={docName}
                      className="ge-hover-slide"
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "10px 14px",
                        borderBottom: i < grantDocs.length - 1 ? `1px solid ${C.line}` : "none",
                      }}
                    >
                      <span style={{
                        width: 22, height: 22, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 12, color: C.t4, background: C.hover,
                      }}>
                        ○
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>{docName}</div>
                      </div>
                      <span style={{ fontSize: 11, color: C.t4 }}>Prepare for submission</span>
                    </div>
                  ))}
                </Card>
                <div style={{ fontSize: 11, color: C.t4, marginTop: 8, paddingLeft: 4 }}>
                  Upload these in the <span style={{ fontWeight: 600, color: C.primary, cursor: "default" }}>Attachments</span> tab.
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Activity */}
      {tab === "activity" && (
        <div>
          {/* Scheduled Follow-ups */}
          {g.fups && g.fups.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>Scheduled Follow-ups</div>
              <Card pad="0" style={{ overflow: "hidden" }}>
                {g.fups.map((fup, i) => {
                  const daysUntil = fup.date ? Math.ceil((new Date(fup.date) - new Date()) / 864e5) : null;
                  const isOverdue = daysUntil !== null && daysUntil < 0;
                  const isToday = daysUntil === 0;
                  const isSoon = daysUntil > 0 && daysUntil <= 7;
                  const c = fup.done ? C.ok : isOverdue ? C.red : isToday ? C.amber : isSoon ? C.amber : C.t3;
                  return (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 18px",
                      borderBottom: i < g.fups.length - 1 ? `1px solid ${C.line}` : "none",
                      opacity: fup.done ? 0.5 : 1,
                    }}>
                      <button onClick={(e) => {
                        e.stopPropagation();
                        const updated = [...g.fups];
                        updated[i] = { ...updated[i], done: !updated[i].done };
                        onUpdate(g.id, { fups: updated });
                      }} style={{
                        width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                        border: `1.5px solid ${fup.done ? C.ok : C.line}`,
                        background: fup.done ? C.ok : "transparent",
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {fup.done && <span style={{ color: "#fff", fontSize: 10, fontWeight: 700 }}>{"\u2713"}</span>}
                      </button>
                      <span style={{ fontSize: 11, fontWeight: 700, fontFamily: MONO, color: c, minWidth: 65 }}>
                        {fup.date ? new Date(fup.date).toLocaleDateString("en-ZA", { day: "numeric", month: "short" }) : "--"}
                      </span>
                      <span style={{ fontSize: 12, color: fup.done ? C.t4 : C.t1, textDecoration: fup.done ? "line-through" : "none", flex: 1 }}>{fup.label}</span>
                      <span style={{
                        fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
                        background: fup.type === "status" ? C.blueSoft : fup.type === "update" ? "#ECFDF5" : C.amberSoft,
                        color: fup.type === "status" ? C.blue : fup.type === "update" ? "#059669" : C.amber,
                      }}>{fup.type || "follow-up"}</span>
                      {!fup.done && daysUntil !== null && (
                        <span style={{ fontSize: 10, fontWeight: 600, color: c }}>
                          {isOverdue ? `${Math.abs(daysUntil)}d ago` : isToday ? "Today" : `${daysUntil}d`}
                        </span>
                      )}
                    </div>
                  );
                })}
              </Card>
            </div>
          )}

          {/* Activity Log */}
          <div style={{ fontSize: 11, fontWeight: 700, color: C.t3, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>Activity Log</div>
          <Card pad="0" style={{ overflow: "hidden" }}>
            {(g.log || []).slice().reverse().map((entry, i, arr) => (
              <ActivityRow key={i} date={entry.d} text={entry.t} isLast={i === arr.length - 1} />
            ))}
            {(!g.log || !g.log.length) && (
              <div style={{ padding: 24, textAlign: "center", color: C.t4, fontSize: 13 }}>No activity yet</div>
            )}
          </Card>
        </div>
      )}

      {/* Attachments */}
      {tab === "attachments" && (
        <div>
          <UploadZone
            uploads={uploads}
            grantId={g.id}
            onUploadsChange={loadUploads}
            label="Grant Attachments"
          />
          <div style={{ fontSize: 11, color: C.t4, marginTop: 10, lineHeight: 1.5 }}>
            Upload RFPs, funder guidelines, templates, or reference docs. Extracted text feeds into AI-generated proposals for this grant.
          </div>
        </div>
      )}

      {/* AI Tools */}
      {tab === "ai" && (() => {
        const researchDone = ai.research && !isAIError(ai.research);
        const hasSections = g.aiSections && Object.values(g.aiSections).some(s => s?.text && !isAIError(s.text));
        const draftDone = hasSections || (ai.draft && !isAIError(ai.draft));
        const followupDone = ai.followup && !isAIError(ai.followup);
        const fitDone = ai.fitscore && !isAIError(ai.fitscore);
        const winlossDone = ai.winloss && !isAIError(ai.winloss);
        const askIsSet = (g.askSource === "ai-draft" || g.askSource === "budget-builder") && g.ask > 0;
        const completedCount = [fitDone, researchDone, draftDone, askIsSet].filter(Boolean).length;
        const isSubmittedPlus = ["submitted", "awaiting", "won", "lost", "deferred"].includes(g.stage);
        const isClosedStage = ["won", "lost"].includes(g.stage);

        // Parse fit score from AI result
        const fitScoreNum = fitDone ? (() => {
          const m = ai.fitscore.match(/SCORE:\s*(\d+)/);
          return m ? parseInt(m[1]) : null;
        })() : null;
        const fitVerdict = fitDone ? (() => {
          const m = ai.fitscore.match(/VERDICT:\s*(.+)/);
          return m ? m[1].trim() : null;
        })() : null;
        const fitError = ai.fitscore && isAIError(ai.fitscore) ? ai.fitscore : null;

        const runFitScore = async () => {
          setBusy(p => ({ ...p, fitscore: true }));
          try {
            // Save previous fit score to history before generating new one
            if (ai.fitscore && !isAIError(ai.fitscore)) {
              const prev = g.fitscoreHistory || [];
              const ts = g.aiFitscoreAt || new Date().toISOString();
              onUpdate(g.id, { fitscoreHistory: [...prev, { ts, text: ai.fitscore }].slice(-5) });
            }
            const r = await onRunAI("fitscore", g);
            setAi(p => ({ ...p, fitscore: r }));
            if (!isAIError(r)) {
              const now = new Date().toISOString();
              onUpdate(g.id, { aiFitscore: r, aiFitscoreAt: now });
              aiLog("AI Fit Score calculated");
            }
          } catch (e) { setAi(p => ({ ...p, fitscore: `Error: ${e.message}` })); }
          setBusy(p => ({ ...p, fitscore: false }));
        };

        return (
          <div>
            {/* Fit Score — quick assessment card */}
            <div style={{
              display: "flex", alignItems: "center", gap: 14, padding: "14px 20px",
              background: fitDone
                ? `linear-gradient(135deg, ${fitScoreNum >= 70 ? C.okSoft : fitScoreNum >= 40 ? C.amberSoft : C.redSoft} 0%, ${C.white} 100%)`
                : fitError ? C.redSoft + "40" : C.white,
              borderRadius: 14, boxShadow: C.cardShadow, marginBottom: 14,
              border: fitDone ? `1.5px solid ${fitScoreNum >= 70 ? C.ok : fitScoreNum >= 40 ? C.amber : C.red}20` : fitError ? `1.5px solid ${C.red}20` : `1.5px solid ${C.line}`,
            }}>
              {fitDone && fitScoreNum !== null ? (
                <>
                  <div style={{
                    width: 48, height: 48, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
                    background: fitScoreNum >= 70 ? C.okSoft : fitScoreNum >= 40 ? C.amberSoft : C.redSoft,
                    color: fitScoreNum >= 70 ? C.ok : fitScoreNum >= 40 ? C.amber : C.red,
                    fontSize: 18, fontWeight: 800, fontFamily: MONO,
                  }}>{fitScoreNum}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>{fitVerdict || "Fit Score"}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                      <span style={{ fontSize: 11, color: C.t3 }}>AI-assessed strategic fit with {g.funder}</span>
                      {g.aiFitscoreAt && (
                        <span style={{ fontSize: 10, color: C.t4, fontFamily: MONO }} title={fmtTs(g.aiFitscoreAt)}>· {timeAgo(g.aiFitscoreAt)}</span>
                      )}
                    </div>
                  </div>
                  <Btn v="ghost" onClick={runFitScore} disabled={busy.fitscore} style={{ fontSize: 11, padding: "5px 12px" }}>{busy.fitscore ? "..." : "\u21bb Re-score"}</Btn>
                </>
              ) : (
                <>
                  <div style={{
                    width: 48, height: 48, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
                    background: fitError ? C.redSoft : C.purpleSoft, color: fitError ? C.red : C.purple, fontSize: 18,
                    animation: busy.fitscore ? "ge-pulse 1.4s ease-in-out infinite" : "none",
                  }}>{busy.fitscore ? "\u2026" : fitError ? "!" : "\u2605"}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: fitError ? C.red : C.dark }}>{fitError ? "Fit Score Failed" : "Fit Score"}</div>
                    <div style={{ fontSize: 11, color: fitError ? C.red : C.t3, marginTop: 2 }}>
                      {fitError || "AI assesses how well this grant matches d-lab's profile"}
                    </div>
                  </div>
                  <Btn v="primary" onClick={runFitScore} disabled={busy.fitscore} style={{ fontSize: 12, padding: "7px 16px" }}>{busy.fitscore ? "Scoring..." : fitError ? "Retry" : "Score"}</Btn>
                </>
              )}
            </div>
            {/* Fit Score detail (expandable) */}
            {fitDone && (
              <div style={{
                padding: "14px 18px", background: C.warm100, borderRadius: 12,
                border: `1.5px solid ${fitScoreNum >= 70 ? C.ok : fitScoreNum >= 40 ? C.amber : C.red}25`,
                fontSize: 13, lineHeight: 1.7, color: C.t1, whiteSpace: "pre-wrap",
                marginBottom: 14, maxHeight: 200, overflow: "auto",
              }}>{stripMd(ai.fitscore)}</div>
            )}
            {/* Fit Score version history */}
            {g.fitscoreHistory && g.fitscoreHistory.length > 0 && (
              <div style={{ padding: "0 4px", marginBottom: 14, marginTop: -8 }}>
                <details style={{ fontSize: 12, color: C.t3 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 600, padding: "6px 0", userSelect: "none" }}>
                    {g.fitscoreHistory.length} previous score{g.fitscoreHistory.length > 1 ? "s" : ""}
                  </summary>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 6 }}>
                    {g.fitscoreHistory.slice().reverse().map((v, i) => {
                      const prevScore = v.text.match(/SCORE:\s*(\d+)/);
                      const prevVerdict = v.text.match(/VERDICT:\s*(.+)/);
                      return (
                        <div key={i} style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "8px 12px", background: C.warm100, borderRadius: 8, border: `1px solid ${C.line}`,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            {prevScore && <span style={{ fontSize: 13, fontWeight: 700, fontFamily: MONO, color: parseInt(prevScore[1]) >= 70 ? C.ok : parseInt(prevScore[1]) >= 40 ? C.amber : C.red }}>{prevScore[1]}</span>}
                            <span style={{ fontSize: 11, fontFamily: MONO, color: C.t4 }}>{fmtTs(v.ts)}</span>
                            {prevVerdict && <span style={{ fontSize: 11, color: C.t3 }}>{prevVerdict[1]}</span>}
                          </div>
                          <button onClick={() => setAi(p => ({ ...p, fitscore: v.text }))}
                            style={{ fontSize: 11, color: C.purple, background: "none", border: `1px solid ${C.purple}30`, borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: FONT, fontWeight: 600, flexShrink: 0 }}>
                            Restore
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </details>
              </div>
            )}

            {/* Workflow progress header — primary for completed, purple for active */}
            <div style={{
              display: "flex", alignItems: "center", gap: 0, marginBottom: 22,
              padding: "14px 20px", background: C.white, borderRadius: 14, boxShadow: C.cardShadow,
            }}>
              {[
                { label: "Fit Score", done: fitDone, active: busy.fitscore },
                { label: "Research", done: researchDone, active: busy.research },
                { label: "Proposal", done: draftDone, active: busy.draft },
                { label: "Ask Set", done: askIsSetByAI, active: false },
              ].map((s, i, arr) => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: s.done ? 13 : 11, fontWeight: 700,
                      background: s.active ? C.purpleSoft : s.done ? C.primarySoft : C.raised,
                      color: s.active ? C.purple : s.done ? C.primary : C.t4,
                      transition: "all 0.3s ease",
                      animation: s.active ? "ge-pulse 1.4s ease-in-out infinite" : "none",
                    }}>
                      {s.active ? "\u2026" : s.done ? "\u2713" : i + 1}
                    </div>
                    <span style={{
                      fontSize: 12, fontWeight: 600,
                      color: s.active ? C.purple : s.done ? C.primary : C.t4,
                    }}>{s.label}</span>
                  </div>
                  {i < arr.length - 1 && (
                    <div style={{
                      flex: 1, height: 2, marginLeft: 12, marginRight: 4,
                      background: s.done ? C.primary + "30" : C.line,
                      borderRadius: 1, transition: "background 0.3s ease",
                    }} />
                  )}
                </div>
              ))}
              <div style={{
                marginLeft: 8, padding: "3px 10px", borderRadius: 20,
                fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                background: completedCount === 4 ? C.primarySoft : C.warm200,
                color: completedCount === 4 ? C.primary : C.t4,
              }}>{completedCount}/4</div>
            </div>

            {/* Cards with connector lines */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Step 1 — Funder Research */}
              <AICard
                title="Funder Research"
                desc="Search the web for this funder's priorities, recent grants, and what they look for in applications"
                step="1"
                busy={busy.research}
                result={ai.research}
                generatedAt={g.aiResearchAt}
                onRun={async () => {
                  setBusy(p => ({ ...p, research: true }));
                  try {
                    // Save previous research to history before generating new one
                    if (ai.research && !isAIError(ai.research)) {
                      const prev = g.researchHistory || [];
                      const ts = g.aiResearchAt || new Date().toISOString();
                      onUpdate(g.id, { researchHistory: [...prev, { ts, text: ai.research }].slice(-5) });
                    }
                    const r = await onRunAI("research", g);
                    setAi(p => ({ ...p, research: r }));
                    if (!isAIError(r)) {
                      const now = new Date().toISOString();
                      onUpdate(g.id, { aiResearch: r, aiResearchAt: now });
                      aiLog(`AI Funder Research completed for ${g.funder}`);
                    }
                  } catch (e) {
                    setAi(p => ({ ...p, research: `Error: ${e.message}` }));
                  }
                  setBusy(p => ({ ...p, research: false }));
                }}
              />

              {/* Research version history */}
              {g.researchHistory && g.researchHistory.length > 0 && (
                <div style={{ padding: "0 22px", marginTop: -4 }}>
                  <details style={{ fontSize: 12, color: C.t3 }}>
                    <summary style={{ cursor: "pointer", fontWeight: 600, padding: "6px 0", userSelect: "none" }}>
                      {g.researchHistory.length} previous research{g.researchHistory.length > 1 ? " versions" : " version"}
                    </summary>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 6 }}>
                      {g.researchHistory.slice().reverse().map((v, i) => (
                        <div key={i} style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "8px 12px", background: C.warm100, borderRadius: 8, border: `1px solid ${C.line}`,
                        }}>
                          <div>
                            <span style={{ fontSize: 11, fontFamily: MONO, color: C.t4 }}>{fmtTs(v.ts)}</span>
                            <span style={{ fontSize: 11, color: C.t3, marginLeft: 8 }}>
                              {v.text.slice(0, 80).replace(/\n/g, " ")}...
                            </span>
                          </div>
                          <button onClick={() => setAi(p => ({ ...p, research: v.text }))}
                            style={{ fontSize: 11, color: C.purple, background: "none", border: `1px solid ${C.purple}30`, borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: FONT, fontWeight: 600, flexShrink: 0 }}>
                            Restore
                          </button>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              )}

              {/* Connector */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 22px" }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                  background: (researchDone || fitDone) ? C.primarySoft : C.warm200, fontSize: 10, color: (researchDone || fitDone) ? C.primary : C.t4,
                }}>{"\u2193"}</div>
                <span style={{ fontSize: 11, color: (researchDone || fitDone) ? C.primary : C.t4, fontWeight: 500 }}>
                  {researchDone && fitDone ? "Fit score + research feed into proposal, which will set the ask"
                    : researchDone ? "Research feeds into proposal — fit score will further sharpen it"
                    : fitDone ? "Fit score feeds into proposal — research will add funder intelligence"
                    : "Fit score + research will inform the proposal, which will recommend the right ask"}
                </span>
              </div>

              {/* Step 2 — Budget Builder */}
              <BudgetBuilder grant={g} onUpdate={onUpdate} />

              {/* Connector */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 22px" }}>
                <div style={{
                  width: 20, height: 20, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                  background: g.budgetTable ? C.primarySoft : C.warm200, fontSize: 10, color: g.budgetTable ? C.primary : C.t4,
                }}>{"\u2193"}</div>
                <span style={{ fontSize: 11, color: g.budgetTable ? C.primary : C.t4, fontWeight: 500 }}>
                  {g.budgetTable ? "Budget feeds real figures into the proposal" : "Optional: build a budget before generating the proposal"}
                </span>
              </div>

              {/* Step 3 — Section-by-Section Proposal Workspace */}
              <ProposalWorkspace
                grant={g}
                ai={ai}
                onRunAI={onRunAI}
                onUpdate={onUpdate}
                busy={busy}
                setBusy={setBusy}
              />
              {/* Ask confirmation — shows after budget-builder or draft sets the ask */}
              {askIsSet && g.ask > 0 && (
                <div style={{
                  padding: "10px 16px", margin: "0 22px", background: C.okSoft, borderRadius: 10,
                  border: `1px solid ${C.ok}20`, display: "flex", alignItems: "center", gap: 10,
                  marginBottom: 4, marginTop: -4,
                }}>
                  <span style={{ fontSize: 16 }}>{"\u2713"}</span>
                  <div style={{ flex: 1, fontSize: 12, color: C.t1, lineHeight: 1.4 }}>
                    Ask set to <strong style={{ fontFamily: MONO }}>R{g.ask.toLocaleString()}</strong> {g.askSource === "budget-builder" ? "from the budget builder" : "based on the programme type recommended in the proposal"}.
                    {g.funderBudget && g.funderBudget !== g.ask && (
                      <span style={{ color: C.t3 }}> Funder budget was R{g.funderBudget.toLocaleString()}.</span>
                    )}
                  </div>
                  <button onClick={() => { setAskInput(String(g.ask)); setEditingAsk(true); }}
                    style={{ fontSize: 11, fontWeight: 600, color: C.purple, background: C.purpleSoft, border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontFamily: FONT, flexShrink: 0 }}>
                    Override
                  </button>
                </div>
              )}

              {/* Separator */}
              <div style={{ height: 1, background: C.line, margin: "6px 0" }} />

              {/* Step 3 — Follow-up Email */}
              <AICard
                title="Follow-up Email"
                desc={isSubmittedPlus
                  ? `Draft a follow-up for this ${g.stage} grant \u2014 tailored to ${g.funder}`
                  : "Draft a follow-up email appropriate to the grant stage and funder"}
                step="3"
                busy={busy.followup}
                result={ai.followup}
                generatedAt={g.aiFollowupAt}
                docName={`${g.name}_followup`}
                docMeta={{ grantName: `${g.name} — Follow-up`, funder: g.funder, orgName: "d-lab NPC", ask: effectiveAsk(g), type: g.type }}
                onRun={async () => {
                  setBusy(p => ({ ...p, followup: true }));
                  try {
                    // Save previous follow-up to history
                    if (ai.followup && !isAIError(ai.followup)) {
                      const prev = g.followupHistory || [];
                      const ts = g.aiFollowupAt || new Date().toISOString();
                      onUpdate(g.id, { followupHistory: [...prev, { ts, text: ai.followup }].slice(-5) });
                    }
                    const r = await onRunAI("followup", g);
                    setAi(p => ({ ...p, followup: r }));
                    if (!isAIError(r)) {
                      const now = new Date().toISOString();
                      onUpdate(g.id, { aiFollowup: r, aiFollowupAt: now });
                      aiLog("AI Follow-up Email drafted");
                    }
                  } catch (e) {
                    setAi(p => ({ ...p, followup: `Error: ${e.message}` }));
                  }
                  setBusy(p => ({ ...p, followup: false }));
                }}
              />

              {/* Win/Loss Analysis — only for won or lost grants */}
              {isClosedStage && (
                <>
                  <div style={{ height: 1, background: C.line, margin: "10px 0" }} />
                  <AICard
                    title={g.stage === "won" ? "Win Analysis" : "Loss Analysis"}
                    desc={g.stage === "won"
                      ? "Understand what worked and how to leverage this win for future applications"
                      : "Analyse why this didn't succeed and identify lessons for next time"}
                    step={g.stage === "won" ? "\u2713" : "!"}
                    busy={busy.winloss}
                    result={ai.winloss}
                    generatedAt={g.aiWinlossAt}
                    onRun={async () => {
                      setBusy(p => ({ ...p, winloss: true }));
                      try {
                        const r = await onRunAI("winloss", g, g.stage);
                        setAi(p => ({ ...p, winloss: r }));
                        if (!isAIError(r)) {
                          const now = new Date().toISOString();
                          onUpdate(g.id, { aiWinloss: r, aiWinlossAt: now });
                          aiLog(`AI ${g.stage === "won" ? "Win" : "Loss"} Analysis completed`);
                        }
                      } catch (e) {
                        setAi(p => ({ ...p, winloss: `Error: ${e.message}` }));
                      }
                      setBusy(p => ({ ...p, winloss: false }));
                    }}
                  />
                </>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
