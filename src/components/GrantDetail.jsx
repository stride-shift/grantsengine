import { useState, useEffect, useCallback } from "react";
import { C, FONT, MONO } from "../theme";
import { fmtK, dL, td } from "../utils";
import { Btn, DeadlineBadge, TypeBadge, Tag, Label, Avatar, CopyBtn, AICard } from "./index";
import UploadZone from "./UploadZone";
import { getUploads } from "../api";
import { detectType, PTYPES, multiCohortInfo } from "../data/funderStrategy";

// Helper: format a timestamp for display
const timeAgo = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  const mins = Math.floor((now - d) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
};
const fmtTs = (iso) => iso ? new Date(iso).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;

export default function GrantDetail({ grant, team, stages, funderTypes, onUpdate, onDelete, onBack, onRunAI }) {
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

  const loadUploads = useCallback(async () => {
    if (!grant?.id) return;
    try {
      const data = await getUploads(grant.id);
      setUploads(data);
    } catch { /* ignore */ }
  }, [grant?.id]);

  useEffect(() => { loadUploads(); }, [loadUploads]);

  if (!grant) return null;
  const g = grant;
  const isAIError = (r) => !r || r.startsWith("Error") || r.startsWith("Rate limit") || r.startsWith("Connection") || r.startsWith("Request failed") || r.startsWith("No response") || r.startsWith("The AI service");
  const d = dL(g.deadline);
  const stg = (stages || []).find(s => s.id === g.stage);
  const getMember = (id) => team.find(t => t.id === id) || team.find(t => t.id === "team") || { name: "Unassigned", initials: "\u2014" };
  const m = getMember(g.owner);

  const up = (field, value) => onUpdate(g.id, { [field]: value });

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "notes", label: "Notes" },
    { id: "attachments", label: `Attachments${uploads.length ? ` (${uploads.length})` : ""}` },
    { id: "activity", label: "Activity" },
    { id: "ai", label: "AI Tools" },
  ];

  return (
    <div style={{ padding: "28px 36px", maxWidth: 920 }}>
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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 16 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.dark, marginBottom: 4, letterSpacing: -0.5, lineHeight: 1.2 }}>{g.name}</div>
          <div style={{ fontSize: 15, color: C.t2, fontWeight: 500, marginBottom: 8 }}>{g.funder}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <TypeBadge type={g.type} />
            <DeadlineBadge d={d} deadline={g.deadline} size="md" stage={g.stage} />
            {g.rel && g.rel !== "Cold" && (
              <span style={{ fontSize: 11, fontWeight: 600, color: C.ok, background: C.okSoft, padding: "3px 10px", borderRadius: 20 }}>{g.rel}</span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {g.applyUrl && (
            <a href={g.applyUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
              <Btn v="ghost" style={{ fontSize: 12 }}>{"\u2197"} Apply</Btn>
            </a>
          )}
          <Btn v="danger" onClick={() => setConfirmDel(true)} style={{ fontSize: 12 }}>Delete</Btn>
        </div>
      </div>

      {/* Confirm delete */}
      {confirmDel && (
        <div style={{ padding: 16, background: C.redSoft, borderRadius: 14, border: `1px solid ${C.red}20`, marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: C.red, fontWeight: 500 }}>Delete this grant permanently?</span>
          <Btn v="danger" onClick={() => { onDelete(g.id); onBack(); }} style={{ fontSize: 12 }}>Yes, Delete</Btn>
          <Btn v="ghost" onClick={() => setConfirmDel(false)} style={{ fontSize: 12 }}>Cancel</Btn>
        </div>
      )}

      {/* Key fields — Ask gets hero treatment */}
      {(() => {
        const pt = detectType(g);
        const mc = multiCohortInfo(g);
        const ptNum = pt ? Object.entries(PTYPES).find(([, v]) => v === pt)?.[0] : null;
        const isMC = mc && mc.count > 1;
        const mcBaseType = isMC ? PTYPES[mc.typeNum || 1] : null;
        const mcBaseCost = mcBaseType?.cost || 0;
        const mcMinExpected = isMC ? mcBaseCost * mc.count : 0;
        // Aligned if: single type exact match, or multi-cohort ask >= N×base (allows extras)
        const isAligned = !isMC && pt?.cost && g.ask === pt.cost;
        const mcAligned = isMC && g.ask >= mcMinExpected;
        // Only show "Align" for single-type mismatches, not composites
        const showAlign = !isMC && ptNum && !isAligned && pt?.cost;
        return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginBottom: 24 }}>
        <div style={{
          padding: "16px 20px", background: `linear-gradient(135deg, ${C.primarySoft} 0%, ${C.white} 100%)`,
          borderRadius: 14, boxShadow: C.cardShadow, border: `1.5px solid ${C.primary}25`,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.t4, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Ask</div>
          <div style={{ fontSize: 28, fontWeight: 800, fontFamily: MONO, color: C.primary }}>{fmtK(g.ask)}</div>
          {ptNum && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, color: C.white,
                background: (isAligned || mcAligned) ? C.ok : C.amber,
                padding: "1px 6px", borderRadius: 4,
              }}>T{isMC ? (mc.typeNum || 1) : ptNum}</span>
              <span style={{ fontSize: 10, color: C.t4, lineHeight: 1.3 }}>
                {isMC ? `${mc.count}× cohorts` : pt.label?.split("—")[0]?.trim()}
              </span>
            </div>
          )}
          {showAlign && (
            <button onClick={() => up("ask", pt.cost)}
              style={{
                marginTop: 6, fontSize: 10, fontWeight: 600, color: C.purple, background: C.purpleSoft,
                border: "none", borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontFamily: FONT,
              }}>
              Align to R{(pt.cost / 1000).toFixed(0)}K
            </button>
          )}
        </div>
        <div style={{ padding: "14px 18px", background: C.white, borderRadius: 14, boxShadow: C.cardShadow }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.t4, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Stage</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: stg?.c || C.t4 }} />
            <select value={g.stage} onChange={e => up("stage", e.target.value)}
              style={{ fontSize: 14, fontWeight: 600, color: stg?.c || C.dark, border: "none", background: "transparent", fontFamily: FONT, cursor: "pointer", flex: 1 }}>
              {(stages || []).map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        </div>
        <div style={{ padding: "14px 18px", background: C.white, borderRadius: 14, boxShadow: C.cardShadow }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.t4, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Owner</div>
          <select value={g.owner} onChange={e => up("owner", e.target.value)}
            style={{ fontSize: 14, fontWeight: 600, color: C.dark, border: "none", background: "transparent", fontFamily: FONT, cursor: "pointer", width: "100%" }}>
            {team.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div style={{ padding: "14px 18px", background: C.white, borderRadius: 14, boxShadow: C.cardShadow }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.t4, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Priority</div>
          <select value={g.pri} onChange={e => up("pri", parseInt(e.target.value))}
            style={{ fontSize: 14, fontWeight: 600, color: C.dark, border: "none", background: "transparent", fontFamily: FONT, cursor: "pointer", width: "100%" }}>
            {[5, 4, 3, 2, 1].map(p => <option key={p} value={p}>{p} {p === 5 ? "(Highest)" : p === 1 ? "(Lowest)" : ""}</option>)}
          </select>
        </div>
      </div>
        );
      })()}

      {/* Tabs — primary bottom border + subtle bg tint */}
      <div style={{ display: "flex", gap: 0, borderBottom: `2px solid ${C.line}`, marginBottom: 24 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              padding: "12px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer",
              background: tab === t.id ? C.primarySoft + "60" : "none", border: "none", fontFamily: FONT,
              color: tab === t.id ? C.primary : C.t3,
              borderBottom: tab === t.id ? `4px solid ${C.primary}` : "4px solid transparent",
              marginBottom: -2, borderRadius: "8px 8px 0 0",
              transition: "color 0.15s ease, background 0.15s ease",
            }}>{t.label}</button>
        ))}
      </div>

      {/* Overview */}
      {tab === "overview" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 24 }}>
            <div>
              <Label>Details</Label>
              <div style={{ background: C.white, borderRadius: 16, padding: 20, boxShadow: C.cardShadow }}>
                <div style={{ marginBottom: 12 }}>
                  <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>Funder Type</span>
                  <div style={{ marginTop: 4 }}><TypeBadge type={g.type} /></div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>Relationship</span>
                  <div style={{ fontSize: 13, color: C.dark, marginTop: 2, fontWeight: 500 }}>{g.rel}</div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>Hours Invested</span>
                  <div style={{ fontSize: 13, color: C.dark, marginTop: 2, fontWeight: 500 }}>{g.hrs || 0}h</div>
                </div>
                <div>
                  <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>Deadline</span>
                  <div style={{ marginTop: 4 }}>
                    <input type="date" value={g.deadline || ""} onChange={e => up("deadline", e.target.value || null)}
                      style={{ fontSize: 13, border: `1.5px solid ${C.line}`, borderRadius: 8, padding: "6px 10px", fontFamily: FONT }} />
                  </div>
                </div>
              </div>
            </div>
            <div>
              <Label>Focus Areas</Label>
              <div style={{ background: C.white, borderRadius: 16, padding: 20, boxShadow: C.cardShadow }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {(g.focus || []).map(f => <Tag key={f} text={f} />)}
                  {(!g.focus || !g.focus.length) && <span style={{ fontSize: 12, color: C.t4 }}>No focus areas set</span>}
                </div>
                <div style={{ marginTop: 14 }}>
                  <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>Geography</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                    {(g.geo || []).map(p => <Tag key={p} text={p} color={C.blue} />)}
                    {(!g.geo || !g.geo.length) && <span style={{ fontSize: 12, color: C.t4 }}>No geography set</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      {tab === "notes" && (
        <div>
          <textarea value={g.notes || ""} onChange={e => up("notes", e.target.value)}
            placeholder="Add notes about this grant..."
            style={{
              width: "100%", minHeight: 300, padding: 18, fontSize: 14, lineHeight: 1.7,
              border: `1.5px solid ${C.line}`, borderRadius: 14, fontFamily: FONT,
              resize: "vertical", outline: "none", boxSizing: "border-box",
              background: C.white, transition: "border-color 0.15s ease",
            }}
            onFocus={e => e.target.style.borderColor = C.primary}
            onBlur={e => e.target.style.borderColor = C.line}
          />
        </div>
      )}

      {/* Activity */}
      {tab === "activity" && (
        <div>
          <div style={{ background: C.white, borderRadius: 16, overflow: "hidden", boxShadow: C.cardShadow }}>
            {(g.log || []).slice().reverse().map((entry, i) => (
              <div key={i} style={{ display: "flex", gap: 10, padding: "12px 18px", borderBottom: `1px solid ${C.line}`, alignItems: "center", background: i % 2 === 1 ? C.warm100 : "transparent" }}>
                <span style={{ fontSize: 11, color: C.t4, fontFamily: MONO, minWidth: 80 }}>{entry.d}</span>
                <span style={{ fontSize: 13, color: C.t1 }}>{entry.t}</span>
              </div>
            ))}
            {(!g.log || !g.log.length) && (
              <div style={{ padding: 24, textAlign: "center", color: C.t4, fontSize: 13 }}>No activity yet</div>
            )}
          </div>
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
        const draftDone = ai.draft && !isAIError(ai.draft);
        const followupDone = ai.followup && !isAIError(ai.followup);
        const fitDone = ai.fitscore && !isAIError(ai.fitscore);
        const winlossDone = ai.winloss && !isAIError(ai.winloss);
        const completedCount = [researchDone, draftDone, followupDone].filter(Boolean).length;
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
              }}>{ai.fitscore}</div>
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
                { label: "Research", done: researchDone, active: busy.research },
                { label: "Proposal", done: draftDone, active: busy.draft },
                { label: "Follow-up", done: followupDone, active: busy.followup },
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
                background: completedCount === 3 ? C.primarySoft : C.warm200,
                color: completedCount === 3 ? C.primary : C.t4,
              }}>{completedCount}/3</div>
            </div>

            {/* Cards with connector lines */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {/* Step 1 — Funder Research */}
              <AICard
                title="Funder Research"
                desc="Search the web for this funder's priorities, recent grants, and what they look for in applications"
                step="1"
                icon={"\uD83D\uDD0D"}
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
                  {researchDone && fitDone ? "Fit score + research feed into proposal below"
                    : researchDone ? "Research feeds into proposal below — fit score will further sharpen it"
                    : fitDone ? "Fit score feeds into proposal below — research will add funder intelligence"
                    : "Fit score + research will inform the proposal if completed first"}
                </span>
              </div>

              {/* Step 2 — Draft Proposal (with version history) */}
              <AICard
                title="Draft Proposal"
                desc={researchDone && fitDone
                  ? "Generate a tailored proposal using your funder research + fit score analysis"
                  : researchDone
                  ? "Generate a tailored proposal using your funder research — run Fit Score first for even sharper alignment"
                  : fitDone
                  ? "Generate a proposal informed by your fit score — run Research first for deeper funder intelligence"
                  : "Generate a cover email and proposal — run Fit Score + Research first for the best result"}
                step="2"
                icon={"\uD83D\uDCDD"}
                busy={busy.draft}
                result={ai.draft}
                generatedAt={g.aiDraftAt}
                docName={`${g.name}_proposal`}
                docMeta={{ grantName: g.name, funder: g.funder, orgName: "d-lab NPC", ask: g.ask, type: g.type }}
                onRun={async () => {
                  setBusy(p => ({ ...p, draft: true }));
                  try {
                    // Save previous draft to version history before generating new one
                    if (ai.draft && !isAIError(ai.draft)) {
                      const prev = g.draftHistory || [];
                      const ts = g.aiDraftAt || new Date().toISOString();
                      onUpdate(g.id, { draftHistory: [...prev, { ts, text: ai.draft }].slice(-5) });
                    }
                    const r = await onRunAI("draft", g, ai.research || null, ai.fitscore || null);
                    setAi(p => ({ ...p, draft: r }));
                    if (!isAIError(r)) {
                      const now = new Date().toISOString();
                      onUpdate(g.id, { aiDraft: r, aiDraftAt: now });
                      const inputs = [ai.research && "research", ai.fitscore && "fit score"].filter(Boolean);
                      aiLog(`AI Draft Proposal generated${inputs.length ? ` (with ${inputs.join(" + ")})` : ""}`);
                    }
                  } catch (e) {
                    setAi(p => ({ ...p, draft: `Error: ${e.message}` }));
                  }
                  setBusy(p => ({ ...p, draft: false }));
                }}
              />
              {/* Ask alignment suggestion — after proposal is generated */}
              {draftDone && (() => {
                // Parse the draft for programme type mention
                const draftText = ai.draft || "";
                const typeMatch = draftText.match(/Type\s*(\d)/i);
                if (!typeMatch) return null;
                const detectedNum = parseInt(typeMatch[1]);
                const detectedPt = PTYPES[detectedNum];
                if (!detectedPt || !detectedPt.cost) return null;
                if (g.ask === detectedPt.cost) return null; // already aligned
                // Check multi-cohort
                const mcMatch = draftText.match(/(\d+)\s*(?:×|x)\s*(?:Type\s*\d|cohort)/i);
                const mcCount = mcMatch ? parseInt(mcMatch[1]) : 1;
                const suggestedAsk = detectedPt.cost * mcCount;
                if (Math.abs(g.ask - suggestedAsk) < 10000) return null; // close enough
                return (
                  <div style={{
                    padding: "10px 16px", margin: "0 22px", background: C.purpleSoft, borderRadius: 10,
                    border: `1px solid ${C.purple}20`, display: "flex", alignItems: "center", gap: 10,
                    marginBottom: 4, marginTop: -4,
                  }}>
                    <span style={{ fontSize: 18 }}>{"\uD83D\uDCA1"}</span>
                    <div style={{ flex: 1, fontSize: 12, color: C.t1, lineHeight: 1.4 }}>
                      Proposal references <strong>Type {detectedNum}</strong>{mcCount > 1 ? ` (${mcCount}× cohorts)` : ""} at <strong style={{ fontFamily: MONO }}>R{suggestedAsk.toLocaleString()}</strong> — current ask is {fmtK(g.ask)}
                    </div>
                    <button onClick={() => { up("ask", suggestedAsk); aiLog(`Ask updated to R${suggestedAsk.toLocaleString()} (Type ${detectedNum}${mcCount > 1 ? ` × ${mcCount}` : ""})`); }}
                      style={{ fontSize: 11, fontWeight: 600, color: C.white, background: C.purple, border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer", fontFamily: FONT, flexShrink: 0 }}>
                      Update Ask
                    </button>
                  </div>
                );
              })()}
              {/* Draft version history */}
              {g.draftHistory && g.draftHistory.length > 0 && (
                <div style={{ padding: "0 22px", marginTop: -4 }}>
                  <details style={{ fontSize: 12, color: C.t3 }}>
                    <summary style={{ cursor: "pointer", fontWeight: 600, padding: "6px 0", userSelect: "none" }}>
                      {g.draftHistory.length} previous version{g.draftHistory.length > 1 ? "s" : ""}
                    </summary>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 6 }}>
                      {g.draftHistory.slice().reverse().map((v, i) => (
                        <div key={i} style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: "8px 12px", background: C.warm100, borderRadius: 8, border: `1px solid ${C.line}`,
                        }}>
                          <div>
                            <span style={{ fontSize: 11, fontFamily: MONO, color: C.t4 }}>{fmtTs(v.ts) || v.ts}</span>
                            <span style={{ fontSize: 11, color: C.t3, marginLeft: 8 }}>
                              {v.text.slice(0, 80).replace(/\n/g, " ")}...
                            </span>
                          </div>
                          <button onClick={() => setAi(p => ({ ...p, draft: v.text }))}
                            style={{ fontSize: 11, color: C.purple, background: "none", border: `1px solid ${C.purple}30`, borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: FONT, fontWeight: 600, flexShrink: 0 }}>
                            Restore
                          </button>
                        </div>
                      ))}
                    </div>
                  </details>
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
                icon={"\u2709"}
                busy={busy.followup}
                result={ai.followup}
                generatedAt={g.aiFollowupAt}
                docName={`${g.name}_followup`}
                docMeta={{ grantName: `${g.name} — Follow-up`, funder: g.funder, orgName: "d-lab NPC", ask: g.ask, type: g.type }}
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
                    icon={g.stage === "won" ? "\uD83C\uDFC6" : "\uD83D\uDCA1"}
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
