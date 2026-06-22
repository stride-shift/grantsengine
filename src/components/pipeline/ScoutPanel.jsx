import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { C, FONT, MONO } from "@/theme";
import { Btn } from "@/components/ui";
import useScout from "@/hooks/useScout";

/* ── Presentation constants ── */
const REJECT_REASONS = [
  { key: "wrong_sector", label: "Wrong sector" },
  { key: "wrong_geo", label: "Wrong geography" },
  { key: "wrong_size", label: "Too small / Too large" },
  { key: "not_relevant", label: "Not relevant to us" },
  { key: "already_applied", label: "Already applied" },
  { key: "fake_grant", label: "Grant doesn't exist" },
  { key: "dead_link", label: "Dead / broken link" },
  { key: "wrong_deadline", label: "Wrong deadline" },
];

/* ── Scout: loading insights ── */
const SCOUT_INSIGHTS = [
  { label: "AI Skills Demand", stat: "4x", note: "Growth in AI job postings across Africa since 2023, with South Africa leading the continent", source: "LinkedIn Economic Graph" },
  { label: "Youth Unemployment", stat: "45.5%", note: "SA youth (15–34) unemployment rate — digital skills programmes show the strongest employment outcomes", source: "Stats SA Q4 2025" },
  { label: "CSI Spend Trending", stat: "R12.3B", note: "Total SA corporate social investment in 2025 — education and skills remain the top priority sector", source: "Trialogue CSI Handbook" },
  { label: "SETA Windows", stat: "Q1–Q2", note: "Most SETA discretionary grant windows open between February and June — peak scouting season", source: "DHET Calendar" },
  { label: "Digital Skills Gap", stat: "2.6M", note: "Estimated unfilled digital roles across Africa by 2030 — funders are prioritising pipeline programmes", source: "IFC Digital Skills Report" },
  { label: "Funder Shift", stat: "73%", note: "Of SA corporate funders now require measurable employment outcomes, not just training completion", source: "Trialogue 2025" },
  { label: "International Grants", stat: "+18%", note: "Year-on-year increase in international foundation funding to African digital skills organisations", source: "OECD DAC 2025" },
  { label: "NPO Growth", stat: "12%", note: "More registered NPOs competing for funding — differentiated outcomes data is the key advantage", source: "DSD NPO Database" },
  { label: "B-BBEE Value", stat: "135%", note: "Skills development spend counts 135% toward B-BBEE scorecards, making it the highest-leverage category", source: "B-BBEE Codes" },
  { label: "Tech Philanthropy", stat: "$4.2B", note: "Global tech company philanthropic spending in 2025 — AI education is the fastest-growing category", source: "CECP Giving in Numbers" },
];

const SCOUT_STEPS = [
  "Searching open CSI funding calls...",
  "Scanning SETA discretionary windows...",
  "Checking international tech funder programmes...",
  "Reviewing foundation grant rounds...",
  "Matching opportunities to your profile...",
  "Filtering by eligibility and fit...",
  "Ranking results by strategic alignment...",
];

function ScoutLoader() {
  const [idx, setIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const t = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setIdx(prev => (prev + 1) % SCOUT_INSIGHTS.length);
        setFade(true);
      }, 300);
    }, 3500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setStepIdx(prev => (prev + 1) % SCOUT_STEPS.length);
    }, 2800);
    return () => clearInterval(t);
  }, []);

  const insight = SCOUT_INSIGHTS[idx];
  const step = SCOUT_STEPS[stepIdx];

  return (
    <div style={{
      background: `linear-gradient(135deg, ${C.white} 0%, ${C.primarySoft} 100%)`,
      borderRadius: 10, padding: "20px 24px", marginBottom: 14,
      border: `1px solid ${C.primary}15`, boxShadow: C.cardShadow,
    }}>
      {/* Header with animated dots */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: `linear-gradient(135deg, ${C.primary} 0%, ${C.primaryDark} 100%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "ge-pulse 2s ease-in-out infinite",
          }}>
            <span style={{ fontSize: 15, color: C.white }}>{"☉"}</span>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>Scouting new opportunities</div>
            <div style={{ fontSize: 12, color: C.t3, marginTop: 1, transition: "opacity 0.3s", opacity: 1 }}>{step}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 6, height: 6, borderRadius: "50%", background: C.primary,
              animation: "ge-pulse 1.4s ease-in-out infinite",
              animationDelay: `${i * 0.2}s`,
            }} />
          ))}
        </div>
      </div>

      {/* Insight card */}
      <div style={{
        display: "flex", gap: 20, alignItems: "center",
        padding: "16px 20px", background: C.white, borderRadius: 8,
        border: `1px solid ${C.line}`,
        transition: "opacity 0.3s ease", opacity: fade ? 1 : 0,
        minHeight: 90,
      }}>
        <div style={{
          minWidth: 72, textAlign: "center", padding: "8px 0",
        }}>
          <div style={{
            fontSize: 28, fontWeight: 800, color: C.primary, fontFamily: MONO,
            letterSpacing: -1, lineHeight: 1,
          }}>{insight.stat}</div>
          <div style={{
            fontSize: 10, fontWeight: 600, color: C.t4, marginTop: 4,
            textTransform: "uppercase", letterSpacing: 0.5,
          }}>{insight.label}</div>
        </div>
        <div style={{ width: 1, height: 48, background: C.line, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: C.t1, lineHeight: 1.5, fontWeight: 500 }}>{insight.note}</div>
          <div style={{ fontSize: 10, color: C.t4, marginTop: 4, fontStyle: "italic" }}>{insight.source}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{
        marginTop: 16, height: 3, background: C.line, borderRadius: 2, overflow: "hidden",
      }}>
        <div style={{
          height: "100%", background: `linear-gradient(90deg, ${C.primary}, ${C.primaryDark})`,
          borderRadius: 2, animation: "scout-progress 8s ease-in-out infinite",
        }} />
      </div>

      {/* animations injected globally via injectFonts() */}
    </div>
  );
}

/* ── ScoutPanel Component — render-only; all logic lives in useScout ── */
const ScoutPanel = forwardRef(function ScoutPanel({ orgContext, grants, onAddGrant, onShowAdd, onShowUrlTool, onScoutingChange, api }, ref) {
  const {
    scouting,
    scoutResults,
    scoutBrief, setScoutBrief, saveScoutBrief,
    scoutBriefLoading,
    scoutRejections,
    scoutStats, scoutDisplay, hiddenLowConfCount,
    aiScout,
    generateScoutBrief,
    rejectScoutResult,
    clearScoutRejections,
    addScoutToPipeline,
    dismissResults,
  } = useScout({ orgContext, grants, onAddGrant, onScoutingChange, api });

  // ── Transient UI state (component-owned) ──
  const [scoutMarket, setScoutMarket] = useState("both"); // "sa" | "global" | "both"
  const [scoutSort, setScoutSort] = useState("fit"); // "fit" | "deadline" | "budget"
  const [scoutFitFilter, setScoutFitFilter] = useState("all"); // "all" | "high" | "medium"
  const [showUncertain, setShowUncertain] = useState(false);
  const [searchKeywords, setSearchKeywords] = useState(""); // Free-text keyword search
  const [scoutBriefDirty, setScoutBriefDirty] = useState(false);
  const [rejectingIdx, setRejectingIdx] = useState(null);
  const [rejectText, setRejectText] = useState("");
  const [expandedIdx, setExpandedIdx] = useState(null);

  // Run the scout with the live UI inputs; resets sort to "fit" after a run.
  const runScout = () => {
    setRejectingIdx(null);
    return aiScout({ market: scoutMarket, keywords: searchKeywords, onSortReset: setScoutSort });
  };

  // Regenerate the brief (clears the dirty flag — canonical value comes back).
  const handleGenerateBrief = async () => {
    await generateScoutBrief();
    setScoutBriefDirty(false);
  };

  // Reject + reset the popover input (transient UI).
  const handleReject = (s, reasonKey, freeText) => {
    rejectScoutResult(s, reasonKey, freeText);
    setRejectingIdx(null);
    setRejectText("");
  };

  const display = scoutDisplay({ sort: scoutSort, fitFilter: scoutFitFilter, showUncertain });

  // Expose scout controls to parent for toolbar rendering — preserves the
  // original ref contract exactly (aiScout takes no args from the parent).
  useImperativeHandle(ref, () => ({
    scouting,
    scoutMarket,
    setScoutMarket,
    aiScout: runScout,
    scoutResults,
    searchKeywords,
    setSearchKeywords,
  }));

  return (
    <>
      {/* Scout loading */}
      {scouting && <ScoutLoader />}

      {/* Scout results */}
      {!scouting && scoutResults.length > 0 && (
        <div style={{ background: C.white, borderRadius: 10, padding: "14px 18px", marginBottom: 14, border: "none", boxShadow: C.cardShadow }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>Scouted opportunities</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.primary, background: C.primarySoft, padding: "2px 10px", borderRadius: 100 }}>{scoutResults.length} found</span>
              {scoutStats.added > 0 && (
                <span style={{ fontSize: 12, fontWeight: 600, color: C.ok, background: C.okSoft, padding: "2px 10px", borderRadius: 100 }}>
                  {scoutStats.added} added
                </span>
              )}
              {scoutStats.rejected > 0 && (
                <span style={{ fontSize: 12, fontWeight: 600, color: C.t4, background: C.raised, padding: "2px 10px", borderRadius: 100 }}>
                  {scoutStats.rejected} rejected
                </span>
              )}
              {scoutStats.expired > 0 && (
                <span style={{ fontSize: 12, fontWeight: 600, color: C.red, background: C.redSoft, padding: "2px 10px", borderRadius: 100 }}>
                  {scoutStats.expired} expired
                </span>
              )}
              {(scoutStats.open > 0 || scoutStats.rel > 0 || scoutStats.inv > 0) && <>
                {scoutStats.open > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: C.ok, background: C.okSoft, padding: "2px 8px", borderRadius: 100 }}>✓ {scoutStats.open} open</span>}
                {scoutStats.rel > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: C.amber, background: C.amberSoft, padding: "2px 8px", borderRadius: 100 }}>→ {scoutStats.rel} relationship</span>}
                {scoutStats.inv > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: C.red, background: C.redSoft, padding: "2px 8px", borderRadius: 100 }}>✕ {scoutStats.inv} invite-only</span>}
              </>}
              {(scoutStats.urlOk > 0 || scoutStats.urlDead > 0) && <>
                {scoutStats.urlOk > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: C.ok, background: C.okSoft, padding: "2px 8px", borderRadius: 100 }}>🔗 {scoutStats.urlOk} verified</span>}
                {scoutStats.urlDead > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: C.red, background: C.redSoft, padding: "2px 8px", borderRadius: 100 }}>⚠ {scoutStats.urlDead} dead links</span>}
              </>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn v="ghost" style={{ fontSize: 12, padding: "5px 12px" }} onClick={runScout} disabled={scouting}>{scouting ? "Searching..." : "Search again"}</Btn>
              <button onClick={dismissResults} style={{ fontSize: 12, color: C.t4, background: "none", border: "none", cursor: "pointer", fontFamily: FONT }}>Dismiss</button>
            </div>
          </div>
          {/* Scout Brief — identity distillation */}
          {(scoutBrief || scoutBriefLoading) && (
            <div style={{
              background: `linear-gradient(135deg, ${C.primarySoft} 0%, ${C.blueSoft || C.primarySoft} 100%)`,
              borderRadius: 8, padding: "10px 14px", marginBottom: 12,
              border: `1px solid ${C.primary}15`,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.primary }}>Scout Brief</span>
                  {scoutRejections.length > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: C.t4, background: C.white, padding: "1px 8px", borderRadius: 100 }}>
                      {scoutRejections.length} rejected pattern{scoutRejections.length !== 1 ? "s" : ""} learned
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {scoutBriefDirty && (
                    <button onClick={() => {
                      saveScoutBrief(scoutBrief);
                      setScoutBriefDirty(false);
                    }} style={{ fontSize: 10, fontWeight: 700, color: C.ok, background: C.okSoft, border: `1px solid ${C.ok}30`, borderRadius: 5, padding: "2px 8px", cursor: "pointer", fontFamily: FONT }}>
                      Save
                    </button>
                  )}
                  <button onClick={handleGenerateBrief} disabled={scoutBriefLoading}
                    style={{ fontSize: 10, fontWeight: 600, color: C.t3, background: "none", border: "none", cursor: scoutBriefLoading ? "wait" : "pointer", fontFamily: FONT }}>
                    {scoutBriefLoading ? "Generating..." : "↻ Regenerate"}
                  </button>
                  {scoutRejections.length > 0 && (
                    <button onClick={clearScoutRejections}
                      style={{ fontSize: 10, fontWeight: 600, color: C.t4, background: "none", border: "none", cursor: "pointer", fontFamily: FONT }}>
                      Clear history
                    </button>
                  )}
                </div>
              </div>
              {scoutBriefLoading ? (
                <div style={{ fontSize: 12, color: C.t3, fontStyle: "italic", padding: "8px 0" }}>Distilling your organisation's identity...</div>
              ) : (
                <textarea
                  value={scoutBrief}
                  onChange={e => { setScoutBrief(e.target.value); setScoutBriefDirty(true); }}
                  onBlur={() => { if (scoutBriefDirty) { saveScoutBrief(scoutBrief); setScoutBriefDirty(false); } }}
                  rows={4}
                  style={{
                    width: "100%", fontSize: 11, lineHeight: 1.5, fontFamily: FONT,
                    color: C.dark, background: `${C.white}cc`, border: `1px solid ${C.primary}20`,
                    borderRadius: 6, padding: "8px 10px", resize: "vertical", outline: "none",
                    boxSizing: "border-box",
                  }}
                  placeholder="Describe what your org does, what you look for in grants, and what sectors are NOT relevant..."
                />
              )}
              <div style={{ fontSize: 10, color: C.t4, marginTop: 4 }}>
                This shapes which opportunities the AI recommends. Edit to refine your focus.
              </div>
            </div>
          )}
          {/* Sort & filter controls */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: C.t4, textTransform: "uppercase", letterSpacing: 0.5 }}>Sort</span>
            {[["fit", "Fit Score"], ["deadline", "Deadline"], ["budget", "Budget"]].map(([k, l]) => (
              <button key={k} onClick={() => setScoutSort(k)} style={{
                padding: "3px 10px", fontSize: 11, fontWeight: 600, fontFamily: FONT,
                borderRadius: 5, border: `1px solid ${scoutSort === k ? C.primary : C.line}`,
                background: scoutSort === k ? C.primarySoft : "transparent",
                color: scoutSort === k ? C.primary : C.t4, cursor: "pointer",
              }}>{l}</button>
            ))}
            <div style={{ width: 1, height: 16, background: C.line, margin: "0 4px" }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: C.t4, textTransform: "uppercase", letterSpacing: 0.5 }}>Filter</span>
            {[["all", "All"], ["high", "70+"], ["medium", "40+"]].map(([k, l]) => (
              <button key={k} onClick={() => setScoutFitFilter(k)} style={{
                padding: "3px 10px", fontSize: 11, fontWeight: 600, fontFamily: FONT,
                borderRadius: 5, border: `1px solid ${scoutFitFilter === k ? C.ok : C.line}`,
                background: scoutFitFilter === k ? C.okSoft : "transparent",
                color: scoutFitFilter === k ? C.ok : C.t4, cursor: "pointer",
              }}>{l}</button>
            ))}
            {hiddenLowConfCount > 0 && (
              <>
                <div style={{ width: 1, height: 16, background: C.line, margin: "0 4px" }} />
                <button
                  onClick={() => setShowUncertain(v => !v)}
                  title="Low-confidence results (missing URL, unverified, or generic link) are hidden by default"
                  style={{
                    padding: "3px 10px", fontSize: 11, fontWeight: 600, fontFamily: FONT,
                    borderRadius: 5, border: `1px solid ${showUncertain ? C.amber : C.line}`,
                    background: showUncertain ? C.amberSoft : "transparent",
                    color: showUncertain ? C.amber : C.t4, cursor: "pointer",
                  }}>
                  {showUncertain ? `Hide ${hiddenLowConfCount} uncertain` : `Show ${hiddenLowConfCount} uncertain`}
                </button>
              </>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {display.map((s, i) => {
              const fs = s.fitScore || 0;
              const fitC = fs >= 70 ? C.ok : fs >= 40 ? C.amber : C.t4;
              const expired = s.deadline && new Date(s.deadline) < new Date();
              const alreadyIn = s.inPipeline || s.added;
              const acc = (s.access || "").toLowerCase();
              const accessC = acc === "open" ? C.ok : acc.includes("relationship") ? C.amber : acc.includes("invitation") ? C.red : C.t4;
              const accessIcon = acc === "open" ? "✓" : acc.includes("relationship") ? "→" : acc.includes("invitation") ? "✕" : "?";
              const isByInvite = acc.includes("invitation");
              const isRejected = s.rejected;
              const isExpanded = expandedIdx === i;
              return (
                <div key={i}
                  onClick={() => setExpandedIdx(isExpanded ? null : i)}
                  style={{
                    padding: "8px 10px", position: "relative", cursor: "pointer",
                    background: isRejected ? `${C.t4}08` : s.added ? `${C.ok}08` : expired ? `${C.red}05` : isByInvite ? `${C.red}04` : C.bg, borderRadius: 8,
                    border: `1px solid ${isExpanded ? C.primary + "55" : isRejected ? C.t4 + "20" : s.added ? C.ok + "30" : expired ? C.red + "25" : isByInvite ? C.red + "15" : C.line}`,
                    opacity: isRejected ? 0.35 : (s.inPipeline && !s.added) || expired ? 0.5 : isByInvite ? 0.6 : 1,
                    boxShadow: isExpanded ? `0 0 0 3px ${C.primary}10` : "none",
                    transition: "border-color 0.15s, box-shadow 0.15s",
                  }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: isRejected || expired ? C.t4 : C.dark, textDecoration: isRejected || expired ? "line-through" : "none" }}>{s.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, color: fitC, background: fitC + "15", padding: "1px 7px", borderRadius: 100, fontFamily: MONO }} title={`Fit: ${s.fit} (${fs}/100)`}>{fs}</span>
                        {s.access && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: accessC, background: accessC + "15", padding: "1px 7px", borderRadius: 100 }} title={s.accessNote || ""}>{accessIcon} {s.access}</span>
                        )}
                        {s.market && (
                          <span style={{ fontSize: 9, fontWeight: 600, color: C.t4, background: C.raised, padding: "1px 6px", borderRadius: 100 }}>{s.market === "global" ? "🌍" : "🇿🇦"}</span>
                        )}
                        {expired && <span style={{ fontSize: 10, fontWeight: 600, color: C.red, background: C.redSoft, padding: "1px 7px", borderRadius: 100 }}>Expired</span>}
                        {s.added && <span style={{ fontSize: 10, fontWeight: 600, color: C.ok }}>{"✓"}</span>}
                        {s.inPipeline && !s.added && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: C.white, background: C.primary, padding: "2px 8px", borderRadius: 100, letterSpacing: 0.2 }}
                            title="This funder is already in your pipeline">
                            {"●"} Already tracking
                          </span>
                        )}
                        {s.genericLink && (
                          <span style={{ fontSize: 9, fontWeight: 600, color: C.amber, background: C.amberSoft, padding: "1px 6px", borderRadius: 100 }}
                            title="URL points only to the funder homepage — AI did not find a specific application page">
                            {"⚠"} generic link
                          </span>
                        )}
                        {isRejected && <span style={{ fontSize: 10, fontWeight: 600, color: C.t4, background: C.raised, padding: "1px 7px", borderRadius: 100 }}>Rejected</span>}
                        {s.urlStatus === "verified" && <span style={{ fontSize: 9, fontWeight: 600, color: C.ok, background: C.okSoft, padding: "1px 6px", borderRadius: 100 }} title="URL verified — link is live">{"✓"} Link OK</span>}
                        {s.urlStatus === "dead" && <span style={{ fontSize: 9, fontWeight: 600, color: C.red, background: C.redSoft, padding: "1px 6px", borderRadius: 100 }} title="URL is dead or unreachable">{"✕"} Dead link</span>}
                        {s.urlStatus === "warning" && <span style={{ fontSize: 9, fontWeight: 600, color: C.amber, background: C.amberSoft, padding: "1px 6px", borderRadius: 100 }} title="URL returned an error or redirect">? Link issue</span>}
                        {s.confidence && <span style={{ fontSize: 9, fontWeight: 600, color: s.confidence === "high" ? C.ok : s.confidence === "low" ? C.red : C.amber, background: (s.confidence === "high" ? C.ok : s.confidence === "low" ? C.red : C.amber) + "12", padding: "1px 6px", borderRadius: 100 }} title={`Confidence: ${s.confidence} — ${s.confidence === "high" ? "open access, URL + deadline present" : s.confidence === "low" ? "missing URL or unknown access" : "partial info available"}`}>{s.confidence === "high" ? "●" : s.confidence === "low" ? "○" : "◑"} {s.confidence}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: C.t3 }}>
                        {s.funder}{(s.funderBudget || s.ask) ? ` · ~R${Number(s.funderBudget || s.ask).toLocaleString()}` : ""}{s.valueType && s.valueType !== "cash" && s.valueType !== "unknown" ? ` · ${s.valueType}` : ""}
                        {s.deadline ? (
                          <span title={s.sourceConfidence === "verified" ? "Deadline confirmed on funder site" : "Deadline not verified — check funder site before relying on it"}
                            style={{ fontStyle: s.sourceConfidence === "verified" ? "normal" : "italic", color: s.sourceConfidence === "verified" ? C.t3 : C.amber }}>
                            {` · ${new Date(s.deadline).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}`}
                            {s.sourceConfidence !== "verified" && " ⚠"}
                          </span>
                        ) : (
                          <span style={{ color: C.t4, fontStyle: "italic" }}>{" · Deadline: TBC"}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.4, marginTop: 3 }}>{s.reason}</div>
                      {s.accessNote && (
                        <div style={{ fontSize: 11, color: accessC, lineHeight: 1.4, marginTop: 3, fontStyle: "italic" }}>
                          {acc === "open" ? "📋" : acc.includes("relationship") ? "🤝" : acc.includes("invitation") ? "🚫" : "❓"}{" "}
                          {s.url ? (
                            <a href={s.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ color: accessC, textDecoration: "underline" }}>{s.accessNote}</a>
                          ) : s.accessNote}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "flex-start" }} onClick={e => e.stopPropagation()}>
                      {s.url && (
                        <a href={s.url} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 11, color: C.blue, textDecoration: "none", padding: "4px 8px", border: `1px solid ${C.blue}25`, borderRadius: 5, fontFamily: FONT, fontWeight: 500 }}>
                          {"↗"}
                        </a>
                      )}
                      {!alreadyIn && !expired && !isByInvite && !isRejected && (
                        <button onClick={() => addScoutToPipeline(s)}
                          style={{ fontSize: 11, color: C.primary, padding: "4px 8px", border: `1px solid ${C.primary}30`, borderRadius: 5, background: "none", cursor: "pointer", fontFamily: FONT, fontWeight: 600 }}>
                          + Add
                        </button>
                      )}
                      {!isRejected && !s.added && (
                        <button onClick={() => setRejectingIdx(rejectingIdx === i ? null : i)}
                          style={{ fontSize: 13, color: C.t4, padding: "3px 7px", border: `1px solid ${C.line}`, borderRadius: 5, background: rejectingIdx === i ? C.redSoft : "none", cursor: "pointer", fontFamily: FONT, lineHeight: 1 }}
                          title="Not for us">
                          {"✕"}
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Expanded details panel */}
                  {isExpanded && (
                    <div style={{
                      marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${C.line}`,
                      display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 12, rowGap: 6,
                      fontSize: 11,
                    }}>
                      {s.type && (<>
                        <span style={{ color: C.t4, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>Type</span>
                        <span style={{ color: C.t2 }}>{s.type}</span>
                      </>)}
                      {s.fit && (<>
                        <span style={{ color: C.t4, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>AI fit</span>
                        <span style={{ color: C.t2 }}>{s.fit}{typeof fs === "number" ? ` · score ${fs}/100` : ""}</span>
                      </>)}
                      {s.sourceConfidence && (<>
                        <span style={{ color: C.t4, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>AI source</span>
                        <span style={{ color: C.t2 }}>{s.sourceConfidence}</span>
                      </>)}
                      {s.market && (<>
                        <span style={{ color: C.t4, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>Market</span>
                        <span style={{ color: C.t2 }}>{s.market === "global" ? "Global" : "South Africa"}</span>
                      </>)}
                      {s.valueType && (<>
                        <span style={{ color: C.t4, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>Value</span>
                        <span style={{ color: C.t2 }}>{s.valueType}</span>
                      </>)}
                      {Array.isArray(s.focus) && s.focus.length > 0 && (<>
                        <span style={{ color: C.t4, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>Focus</span>
                        <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {s.focus.map((f, fi) => (
                            <span key={fi} style={{ fontSize: 10, fontWeight: 600, color: C.primary, background: C.primarySoft, padding: "1px 7px", borderRadius: 100 }}>{f}</span>
                          ))}
                        </span>
                      </>)}
                      {s.url && (<>
                        <span style={{ color: C.t4, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>Link</span>
                        <a href={s.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                          style={{ color: C.blue, wordBreak: "break-all", textDecoration: "underline" }}>{s.url}</a>
                      </>)}
                      {s.rejected && s.rejectReason && (<>
                        <span style={{ color: C.t4, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>Rejected</span>
                        <span style={{ color: C.t2 }}>{(REJECT_REASONS.find(r => r.key === s.rejectReason) || {}).label || s.rejectReason}</span>
                      </>)}
                    </div>
                  )}

                  {/* Reject popover */}
                  {rejectingIdx === i && (
                    <div onClick={e => e.stopPropagation()} style={{
                      position: "absolute", top: "100%", right: 0, zIndex: 20, marginTop: 4,
                      background: C.white, borderRadius: 8, padding: 10,
                      border: `1px solid ${C.line}`, boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                      width: 210,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.t2, marginBottom: 6 }}>Why doesn't this fit?</div>
                      {REJECT_REASONS.map(r => (
                        <button key={r.key} onClick={() => handleReject(s, r.key, "")}
                          style={{
                            display: "block", width: "100%", textAlign: "left",
                            padding: "5px 8px", fontSize: 11, fontFamily: FONT,
                            background: "none", border: "none", cursor: "pointer",
                            color: C.t2, borderRadius: 4, transition: "background 0.1s",
                          }}
                          onMouseEnter={e => e.target.style.background = C.hover || C.raised}
                          onMouseLeave={e => e.target.style.background = "none"}
                        >{r.label}</button>
                      ))}
                      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                        <input
                          placeholder="Other reason..."
                          value={rejectText}
                          onChange={e => setRejectText(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter" && rejectText.trim()) handleReject(s, "custom", rejectText); }}
                          style={{
                            flex: 1, padding: "5px 8px", fontSize: 11, fontFamily: FONT,
                            border: `1px solid ${C.line}`, borderRadius: 4, outline: "none",
                          }}
                        />
                        {rejectText.trim() && (
                          <button onClick={() => handleReject(s, "custom", rejectText)}
                            style={{ fontSize: 10, fontWeight: 700, color: C.white, background: C.red, border: "none", borderRadius: 4, padding: "4px 8px", cursor: "pointer", fontFamily: FONT }}>
                            Reject
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state — onboarding experience */}
      {grants.length === 0 && !scouting && scoutResults.length === 0 && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ maxWidth: 520, width: "100%", textAlign: "center" }}>
            {/* Hero icon */}
            <div style={{
              width: 72, height: 72, borderRadius: 20, margin: "0 auto 24px",
              background: `linear-gradient(135deg, ${C.primarySoft} 0%, ${C.blueSoft} 100%)`,
              display: "flex", alignItems: "center", justifyContent: "center",
              border: `1px solid ${C.primary}15`,
            }}>
              <span style={{ fontSize: 32 }}>{"☉"}</span>
            </div>

            {/* Headline */}
            <div style={{ fontSize: 22, fontWeight: 800, color: C.dark, marginBottom: 8, letterSpacing: -0.3 }}>
              Build your pipeline
            </div>
            <div style={{ fontSize: 14, color: C.t3, lineHeight: 1.6, marginBottom: 32, maxWidth: 400, margin: "0 auto 32px" }}>
              Scout uses AI to find grant opportunities matched to your organisation profile, or add grants you already know about.
            </div>

            {/* Search keywords input */}
            <div style={{ maxWidth: 420, margin: "0 auto 16px", position: "relative" }}>
              <input
                type="text"
                value={searchKeywords}
                onChange={e => setSearchKeywords(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !scouting) runScout(); }}
                placeholder="Search for anything... e.g. 'food security grants', 'free LLM credits', 'youth employment'"
                style={{
                  width: "100%", padding: "10px 14px", fontSize: 13, fontFamily: FONT,
                  border: `1px solid ${C.line}`, borderRadius: 8, outline: "none",
                  boxSizing: "border-box",
                  transition: "border-color 0.15s",
                }}
                onFocus={e => e.target.style.borderColor = C.primary}
                onBlur={e => e.target.style.borderColor = C.line}
              />
              {searchKeywords && (
                <button onClick={() => setSearchKeywords("")} style={{
                  position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", color: C.t4, cursor: "pointer", fontSize: 14, fontFamily: FONT,
                }}>✕</button>
              )}
            </div>

            {/* Scout market selector */}
            <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 16 }}>
              {[{ id: "both", l: "Both" }, { id: "sa", l: "🇿🇦 Local" }, { id: "global", l: "🌍 Global" }].map(o => (
                <button key={o.id} onClick={() => setScoutMarket(o.id)} style={{
                  padding: "6px 14px", fontSize: 13, fontWeight: 600, fontFamily: FONT,
                  borderRadius: 6, border: `1px solid ${scoutMarket === o.id ? C.primary : C.line}`,
                  background: scoutMarket === o.id ? C.primarySoft : C.white,
                  color: scoutMarket === o.id ? C.primary : C.t3,
                  cursor: "pointer", transition: "all 0.15s",
                }}>{o.l}</button>
              ))}
            </div>

            {/* Primary CTA — Scout */}
            <Btn onClick={runScout} disabled={scouting} v="primary" style={{
              fontSize: 15, padding: "12px 32px", borderRadius: 8,
              background: `linear-gradient(135deg, ${C.primary} 0%, ${C.primaryDark} 100%)`,
              borderColor: C.primary, color: C.white,
              boxShadow: `0 4px 14px ${C.primary}30`,
            }}>
              {"☉"} Scout for opportunities
            </Btn>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "28px auto", maxWidth: 300 }}>
              <div style={{ flex: 1, height: 1, background: C.line }} />
              <span style={{ fontSize: 11, color: C.t4, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>or</span>
              <div style={{ flex: 1, height: 1, background: C.line }} />
            </div>

            {/* Secondary options */}
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => onShowAdd && onShowAdd()} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 16px",
                borderRadius: 8, border: `1px solid ${C.line}`, background: C.white,
                cursor: "pointer", fontFamily: FONT, fontSize: 13, fontWeight: 600, color: C.t2,
                transition: "all 0.15s ease",
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.primary + "60"; e.currentTarget.style.background = C.primarySoft; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.background = C.white; }}
              >
                <span style={{ fontSize: 15 }}>+</span> Add a grant manually
              </button>
              {onShowUrlTool && (
                <button onClick={() => onShowUrlTool()} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "8px 16px",
                  borderRadius: 8, border: `1px solid ${C.line}`, background: C.white,
                  cursor: "pointer", fontFamily: FONT, fontSize: 13, fontWeight: 600, color: C.t2,
                  transition: "all 0.15s ease",
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.blue + "60"; e.currentTarget.style.background = C.blueSoft; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.background = C.white; }}
                >
                  <span style={{ fontSize: 14 }}>{"🔗"}</span> Paste a grant URL
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
});

export default ScoutPanel;
