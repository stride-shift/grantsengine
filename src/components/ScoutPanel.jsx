import { useState, useMemo, useEffect, forwardRef, useImperativeHandle } from "react";
import { C, FONT, MONO } from "../theme";
import { uid, td } from "../utils";
import { Btn } from "./index";
import { scoutPrompt, scoutBriefPrompt } from "../prompts";
import { kvGet, kvSet } from "../api";

/* ── Constants ── */
const SCOUT_TYPE_MAP = { corporate: "Corporate CSI", csi: "Corporate CSI", government: "Government/SETA", seta: "Government/SETA", international: "International", foundation: "Foundation", tech: "Tech Company" };
const REJECT_REASONS = [
  { key: "wrong_sector", label: "Wrong sector" },
  { key: "wrong_geo", label: "Wrong geography" },
  { key: "wrong_size", label: "Too small / Too large" },
  { key: "not_relevant", label: "Not relevant to us" },
  { key: "already_applied", label: "Already applied" },
];

/* ── Local fit score for scout results (0-100, calculated client-side before display) ── */
const calcScoutFitScore = (s) => {
  let score = 40; // base for any scouted result
  // Focus alignment
  const goodFocus = ["Youth Employment", "Digital Skills", "AI/4IR", "Education", "STEM", "Work Readiness"];
  const focusHits = (s.focus || []).filter(f => goodFocus.includes(f)).length;
  score += Math.min(focusHits * 8, 24);
  // Budget range fit (R200K-R5M sweet spot)
  const budget = Number(s.funderBudget || s.ask) || 0;
  if (budget >= 200000 && budget <= 5000000) score += 12;
  else if (budget > 0 && budget < 200000) score += 4;
  else if (budget > 5000000) score += 6;
  // Access — open is best
  const acc = (s.access || "").toLowerCase();
  if (acc === "open") score += 10;
  else if (acc.includes("relationship")) score += 4;
  // AI fit label from scout prompt
  if (s.fit === "High") score += 10;
  else if (s.fit === "Medium") score += 4;
  // Type bonus — some funder types historically better
  const typ = (s.type || "").toLowerCase();
  if (typ.includes("foundation") || typ.includes("csi")) score += 4;
  if (typ.includes("seta")) score += 3;
  // Deadline exists and is in the future
  if (s.deadline) {
    const dl = new Date(s.deadline);
    const now = new Date();
    if (dl > now) score += 4;
    const daysLeft = (dl - now) / 86400000;
    if (daysLeft > 14 && daysLeft < 180) score += 3; // sweet spot — enough time, not stale
  }
  return Math.min(100, Math.max(0, Math.round(score)));
};

/* ── Scout: loading insights ── */
const SCOUT_INSIGHTS = [
  { label: "AI Skills Demand", stat: "4x", note: "Growth in AI job postings across Africa since 2023, with South Africa leading the continent", source: "LinkedIn Economic Graph" },
  { label: "Youth Unemployment", stat: "45.5%", note: "SA youth (15\u201334) unemployment rate \u2014 digital skills programmes show the strongest employment outcomes", source: "Stats SA Q4 2025" },
  { label: "CSI Spend Trending", stat: "R12.3B", note: "Total SA corporate social investment in 2025 \u2014 education and skills remain the top priority sector", source: "Trialogue CSI Handbook" },
  { label: "SETA Windows", stat: "Q1\u2013Q2", note: "Most SETA discretionary grant windows open between February and June \u2014 peak scouting season", source: "DHET Calendar" },
  { label: "Digital Skills Gap", stat: "2.6M", note: "Estimated unfilled digital roles across Africa by 2030 \u2014 funders are prioritising pipeline programmes", source: "IFC Digital Skills Report" },
  { label: "Funder Shift", stat: "73%", note: "Of SA corporate funders now require measurable employment outcomes, not just training completion", source: "Trialogue 2025" },
  { label: "International Grants", stat: "+18%", note: "Year-on-year increase in international foundation funding to African digital skills organisations", source: "OECD DAC 2025" },
  { label: "NPO Growth", stat: "12%", note: "More registered NPOs competing for funding \u2014 differentiated outcomes data is the key advantage", source: "DSD NPO Database" },
  { label: "B-BBEE Value", stat: "135%", note: "Skills development spend counts 135% toward B-BBEE scorecards, making it the highest-leverage category", source: "B-BBEE Codes" },
  { label: "Tech Philanthropy", stat: "$4.2B", note: "Global tech company philanthropic spending in 2025 \u2014 AI education is the fastest-growing category", source: "CECP Giving in Numbers" },
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
            <span style={{ fontSize: 15, color: C.white }}>{"\u2609"}</span>
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

/* ── Scout: fallback data if API parse fails ── */
const SCOUT_FALLBACK = [
  { name: "NSF Digital Skills", funder: "National Skills Fund", type: "Government/SETA", funderBudget: 2500000, deadline: null, fit: "High", reason: "Digital skills, youth employment, scalable partner model", url: "https://www.nsf.gov.za/", focus: ["Youth Employment", "Digital Skills"], access: "Open", accessNote: "NSF publishes open calls for skills development projects — apply through their online portal" },
  { name: "W&R SETA Discretionary", funder: "Wholesale & Retail SETA", type: "Government/SETA", funderBudget: 1500000, deadline: "2026-06-30", fit: "Medium", reason: "Digital skills for retail sector, youth employment", url: "https://www.wrseta.org.za/grant_application.aspx", focus: ["Digital Skills", "Youth Employment"], access: "Open", accessNote: "Discretionary grant window opens annually — application forms available on website" },
  { name: "National Lotteries Commission", funder: "NLC Charities Sector", type: "Government/SETA", funderBudget: 3000000, deadline: "2026-06-30", fit: "Medium", reason: "Community development, NPO registered, large grants", url: "https://nlcsa.org.za/how-to-apply/", focus: ["Youth Employment", "Education"], access: "Open", accessNote: "Online application portal open to registered NPOs — apply through nlcsa.org.za" },
  { name: "Oppenheimer Memorial Trust", funder: "OMT", type: "Foundation", funderBudget: 550000, deadline: "2026-06-30", fit: "Medium", reason: "Education, under-resourced communities, biannual window", url: "https://www.omt.org.za/how-to-apply/", focus: ["Education", "Rural Dev"], access: "Open", accessNote: "Biannual application windows — unsolicited proposals accepted through their website" },
  { name: "FirstRand Foundation", funder: "FirstRand Foundation", type: "Foundation", funderBudget: 2000000, deadline: null, fit: "High", reason: "Youth employment, education, innovation — rolling applications", url: "https://www.firstrandfoundation.org.za/apply", focus: ["Youth Employment", "Education"], access: "Open", accessNote: "Rolling applications accepted year-round through online portal" },
  { name: "Microsoft Skills for Jobs", funder: "Microsoft Philanthropies", type: "Tech Company", funderBudget: 1500000, deadline: null, fit: "High", reason: "AI skills, digital employment, FET programme synergy", url: "https://www.microsoft.com/en-za/corporate-responsibility", focus: ["AI/4IR", "Digital Skills"], access: "Relationship first", accessNote: "No public application portal — approach via Microsoft SA partnerships team or local CSI contacts" },
  { name: "Ford Foundation Future of Work", funder: "Ford Foundation", type: "International", funderBudget: 5400000, deadline: null, fit: "Medium", reason: "Future of work, digital economy, Global South", url: "https://www.fordfoundation.org/work/our-grants/", focus: ["Youth Employment", "AI/4IR"], access: "Relationship first", accessNote: "Submit a brief letter of inquiry — grants officer reviews before inviting full proposal" },
  { name: "Anglo American CSI", funder: "Anglo American", type: "Corporate CSI", funderBudget: 2000000, deadline: null, fit: "Medium", reason: "Skills development, host communities, youth employment", url: "https://www.angloamerican.com/sustainability", focus: ["Youth Employment", "Digital Skills", "Rural Dev"], access: "Relationship first", accessNote: "CSI proposals through their sustainability team — approach via Anglo American Foundation SA" },
  { name: "Standard Bank CSI", funder: "Standard Bank", type: "Corporate CSI", funderBudget: 1500000, deadline: null, fit: "High", reason: "Youth skills, digital economy, B-BBEE alignment", url: "https://www.standardbank.co.za/southafrica/personal/about-us/corporate-social-investment", focus: ["Youth Employment", "Digital Skills"], access: "Open", accessNote: "CSI application form available on website — accepts unsolicited proposals for education and skills" },
  { name: "Echoing Green Fellowship", funder: "Echoing Green", type: "International", funderBudget: 1440000, deadline: "2026-03-15", fit: "Medium", reason: "Social entrepreneur fellowship, innovative models, early-stage", url: "https://echoinggreen.org/fellowship/", focus: ["Youth Employment", "Education"], access: "Open", accessNote: "Annual fellowship application — open call with published deadline, apply online" },
];

const parseScoutResults = (text) => {
  try {
    const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const start = clean.indexOf("[");
    const end = clean.lastIndexOf("]");
    if (start >= 0 && end > start) {
      const arr = JSON.parse(clean.substring(start, end + 1));
      if (Array.isArray(arr) && arr.length > 0 && arr[0].name) return arr;
    }
  } catch (e) { /* fall through */ }
  return null;
};

const CLOSED_STAGES = ["won", "lost", "deferred", "archived"];

/* ── ScoutPanel Component ── */
const ScoutPanel = forwardRef(function ScoutPanel({ orgContext, grants, onAddGrant, onShowAdd, onShowUrlTool, onScoutingChange, api }, ref) {
  const [scoutMarket, setScoutMarket] = useState("both"); // "sa" | "global" | "both"
  const [scouting, _setScouting] = useState(false);
  const setScouting = (v) => { _setScouting(v); onScoutingChange?.(v); };
  const [scoutResults, setScoutResults] = useState([]);
  const [scoutSort, setScoutSort] = useState("fit"); // "fit" | "deadline" | "budget"
  const [scoutFitFilter, setScoutFitFilter] = useState("all"); // "all" | "high" | "medium"
  // Scout brief + rejection feedback
  const [scoutBrief, setScoutBrief] = useState("");
  const [scoutBriefLoading, setScoutBriefLoading] = useState(false);
  const [scoutBriefDirty, setScoutBriefDirty] = useState(false);
  const [scoutRejections, setScoutRejections] = useState([]);
  const [rejectingIdx, setRejectingIdx] = useState(null);
  const [rejectText, setRejectText] = useState("");

  // Load scout brief + rejections from KV store on mount
  useEffect(() => {
    Promise.all([
      kvGet("scout_brief").catch(() => null),
      kvGet("scout_rejections").catch(() => null),
    ]).then(([brief, rejections]) => {
      if (brief) setScoutBrief(typeof brief === "string" ? brief : brief.value || "");
      if (Array.isArray(rejections)) setScoutRejections(rejections);
      else if (rejections?.value && Array.isArray(rejections.value)) setScoutRejections(rejections.value);
    });
  }, []);

  // Single-pass scout stats (replaces 5 separate .filter() calls)
  const scoutStats = useMemo(() => {
    let added = 0, expired = 0, open = 0, rel = 0, inv = 0, rejected = 0;
    const now = new Date();
    for (const s of scoutResults) {
      if (s.rejected) rejected++;
      if (s.added) added++;
      if (s.deadline && new Date(s.deadline) < now) expired++;
      const acc = (s.access || "").toLowerCase();
      if (acc === "open") open++;
      else if (acc.includes("relationship")) rel++;
      else if (acc.includes("invitation")) inv++;
    }
    return { added, expired, open, rel, inv, rejected };
  }, [scoutResults]);

  // Memoized sorted/filtered scout results — rejected cards sort to bottom
  const scoutDisplay = useMemo(() => {
    let results = [...scoutResults];
    if (scoutFitFilter === "high") results = results.filter(s => s.fitScore >= 70);
    else if (scoutFitFilter === "medium") results = results.filter(s => s.fitScore >= 40);
    if (scoutSort === "fit") results.sort((a, b) => b.fitScore - a.fitScore);
    else if (scoutSort === "deadline") results.sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
    else if (scoutSort === "budget") results.sort((a, b) => (Number(b.funderBudget || b.ask) || 0) - (Number(a.funderBudget || a.ask) || 0));
    // Always push rejected to bottom
    results.sort((a, b) => (a.rejected ? 1 : 0) - (b.rejected ? 1 : 0));
    return results;
  }, [scoutResults, scoutFitFilter, scoutSort]);

  /* ── Scout Brief: generate org identity distillation ── */
  const generateScoutBrief = async () => {
    if (!orgContext) return "";
    setScoutBriefLoading(true);
    try {
      const p = scoutBriefPrompt(orgContext);
      const result = await api(p.system, p.user, p.search, p.maxTok);
      const brief = (result || "").trim();
      if (brief) {
        setScoutBrief(brief);
        setScoutBriefDirty(false);
        kvSet("scout_brief", brief).catch(() => {});
      }
      return brief;
    } catch (err) {
      console.error("Scout brief generation failed:", err);
      return "";
    } finally {
      setScoutBriefLoading(false);
    }
  };

  /* ── Scout: reject a result ── */
  const rejectScoutResult = (s, reasonKey, freeText) => {
    const rejection = {
      funder: s.funder, name: s.name, reason: reasonKey,
      reasonText: freeText || "", date: new Date().toISOString().slice(0, 10),
      focus: s.focus || [],
    };
    const updated = [...scoutRejections, rejection];
    setScoutRejections(updated);
    kvSet("scout_rejections", updated).catch(() => {});
    setScoutResults(prev => prev.map(x =>
      x.name === s.name && x.funder === s.funder ? { ...x, rejected: true, rejectReason: reasonKey } : x
    ));
    setRejectingIdx(null);
    setRejectText("");
  };

  /* ── Scout: AI search for new grant opportunities ── */
  const aiScout = async () => {
    setScouting(true);
    setScoutResults([]);
    setRejectingIdx(null);
    const existing = grants
      .filter(g => !CLOSED_STAGES.includes(g.stage))
      .map(g => g.funder.toLowerCase());
    const existingFunders = [...new Set(existing)].join(", ");

    // Auto-generate scout brief if empty
    let brief = scoutBrief;
    if (!brief && orgContext) {
      brief = await generateScoutBrief();
    }

    const promptArgs = { existingFunders, orgContext, scoutBrief: brief, rejections: scoutRejections };
    let allParsed = [];

    if (scoutMarket === "both") {
      // Run SA and Global searches in parallel for balanced results
      const [pSA, pGlobal] = [
        scoutPrompt({ ...promptArgs, market: "sa" }),
        scoutPrompt({ ...promptArgs, market: "global" }),
      ];
      const [rSA, rGlobal] = await Promise.all([
        api(pSA.system, pSA.user, pSA.search, pSA.maxTok),
        api(pGlobal.system, pGlobal.user, pGlobal.search, pGlobal.maxTok),
      ]);
      const parsedSA = parseScoutResults(rSA) || [];
      const parsedGlobal = parseScoutResults(rGlobal) || [];
      const seen = new Set();
      for (const s of [...parsedSA, ...parsedGlobal]) {
        const key = `${(s.funder || "").toLowerCase()}|${(s.name || "").toLowerCase()}`;
        if (!seen.has(key)) { seen.add(key); allParsed.push(s); }
      }
    } else {
      const p = scoutPrompt({ ...promptArgs, market: scoutMarket });
      const r = await api(p.system, p.user, p.search, p.maxTok);
      allParsed = parseScoutResults(r) || [];
    }

    if (!allParsed.length) allParsed = SCOUT_FALLBACK;

    // Pre-mark results if funder was previously rejected
    const rejectedFunders = new Set(scoutRejections.map(r => (r.funder || "").toLowerCase()));

    setScoutResults(
      allParsed.map(s => {
        const fitScore = calcScoutFitScore(s);
        return {
          ...s,
          fitScore,
          inPipeline: existing.includes((s.funder || "").toLowerCase()),
          rejected: rejectedFunders.has((s.funder || "").toLowerCase()),
          added: false,
        };
      }).sort((a, b) => b.fitScore - a.fitScore)
    );
    setScoutSort("fit");
    setScouting(false);
  };

  const addScoutToPipeline = (s) => {
    const gType = SCOUT_TYPE_MAP[Object.keys(SCOUT_TYPE_MAP).find(k => (s.type || "").toLowerCase().includes(k))] || "Foundation";
    const funderBudget = Number(s.funderBudget || s.ask) || 0;
    const accessLine = s.access ? `\nAccess: ${s.access}${s.accessNote ? " — " + s.accessNote : ""}` : "";
    const notes = `${s.reason || ""}${s.url ? "\nApply: " + s.url : ""}${accessLine}`;
    // Store funder's raw budget — ask will be set after proposal generation
    const scoutedMarket = s.market || (s.type === "International" ? "global" : "sa");
    const newG = {
      id: uid(), name: s.name || "New Grant", funder: s.funder || "Unknown", type: gType,
      stage: "scouted", ask: 0, funderBudget, askSource: null, aiRecommendedAsk: null,
      deadline: s.deadline || null,
      focus: s.focus || ["Youth Employment", "Digital Skills"], geo: [], rel: "Cold", pri: 3, hrs: 0,
      notes, market: scoutedMarket, source: "scout",
      log: [{ d: td(), t: `Scouted by AI · funder budget R${funderBudget.toLocaleString()}${s.access ? ` · ${s.access}` : ""} · ask TBD` }],
      on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null, applyUrl: s.url || "",
    };
    onAddGrant(newG);
    setScoutResults(prev => prev.map(x => x.name === s.name && x.funder === s.funder ? { ...x, added: true } : x));
  };

  // Expose scout controls to parent for toolbar rendering
  useImperativeHandle(ref, () => ({
    scouting,
    scoutMarket,
    setScoutMarket,
    aiScout,
    scoutResults,
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
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn v="ghost" style={{ fontSize: 12, padding: "5px 12px" }} onClick={aiScout} disabled={scouting}>{scouting ? "Searching..." : "Search again"}</Btn>
              <button onClick={() => setScoutResults([])} style={{ fontSize: 12, color: C.t4, background: "none", border: "none", cursor: "pointer", fontFamily: FONT }}>Dismiss</button>
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
                      kvSet("scout_brief", scoutBrief).catch(() => {});
                      setScoutBriefDirty(false);
                    }} style={{ fontSize: 10, fontWeight: 700, color: C.ok, background: C.okSoft, border: `1px solid ${C.ok}30`, borderRadius: 5, padding: "2px 8px", cursor: "pointer", fontFamily: FONT }}>
                      Save
                    </button>
                  )}
                  <button onClick={generateScoutBrief} disabled={scoutBriefLoading}
                    style={{ fontSize: 10, fontWeight: 600, color: C.t3, background: "none", border: "none", cursor: scoutBriefLoading ? "wait" : "pointer", fontFamily: FONT }}>
                    {scoutBriefLoading ? "Generating..." : "\u21BB Regenerate"}
                  </button>
                  {scoutRejections.length > 0 && (
                    <button onClick={() => { setScoutRejections([]); kvSet("scout_rejections", []).catch(() => {}); }}
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
                  onBlur={() => { if (scoutBriefDirty) { kvSet("scout_brief", scoutBrief).catch(() => {}); setScoutBriefDirty(false); } }}
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
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {scoutDisplay.map((s, i) => {
              const fs = s.fitScore || 0;
              const fitC = fs >= 70 ? C.ok : fs >= 40 ? C.amber : C.t4;
              const expired = s.deadline && new Date(s.deadline) < new Date();
              const alreadyIn = s.inPipeline || s.added;
              const acc = (s.access || "").toLowerCase();
              const accessC = acc === "open" ? C.ok : acc.includes("relationship") ? C.amber : acc.includes("invitation") ? C.red : C.t4;
              const accessIcon = acc === "open" ? "\u2713" : acc.includes("relationship") ? "\u2192" : acc.includes("invitation") ? "\u2715" : "?";
              const isByInvite = acc.includes("invitation");
              const isRejected = s.rejected;
              return (
                <div key={i} style={{
                  padding: "8px 10px", position: "relative",
                  background: isRejected ? `${C.t4}08` : s.added ? `${C.ok}08` : expired ? `${C.red}05` : isByInvite ? `${C.red}04` : C.bg, borderRadius: 8,
                  border: `1px solid ${isRejected ? C.t4 + "20" : s.added ? C.ok + "30" : expired ? C.red + "25" : isByInvite ? C.red + "15" : C.line}`,
                  opacity: isRejected ? 0.35 : (s.inPipeline && !s.added) || expired ? 0.5 : isByInvite ? 0.6 : 1,
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
                          <span style={{ fontSize: 9, fontWeight: 600, color: C.t4, background: C.raised, padding: "1px 6px", borderRadius: 100 }}>{s.market === "global" ? "\uD83C\uDF0D" : "\uD83C\uDDFF\uD83C\uDDE6"}</span>
                        )}
                        {expired && <span style={{ fontSize: 10, fontWeight: 600, color: C.red, background: C.redSoft, padding: "1px 7px", borderRadius: 100 }}>Expired</span>}
                        {s.added && <span style={{ fontSize: 10, fontWeight: 600, color: C.ok }}>{"\u2713"}</span>}
                        {isRejected && <span style={{ fontSize: 10, fontWeight: 600, color: C.t4, background: C.raised, padding: "1px 7px", borderRadius: 100 }}>Rejected</span>}
                      </div>
                      <div style={{ fontSize: 12, color: C.t3 }}>
                        {s.funder}{(s.funderBudget || s.ask) ? ` \u00B7 ~R${Number(s.funderBudget || s.ask).toLocaleString()}` : ""}{s.deadline ? ` \u00B7 ${new Date(s.deadline).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}` : ""}
                      </div>
                      <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.4, marginTop: 3 }}>{s.reason}</div>
                      {s.accessNote && (
                        <div style={{ fontSize: 11, color: accessC, lineHeight: 1.4, marginTop: 3, fontStyle: "italic" }}>
                          {acc === "open" ? "\uD83D\uDCCB" : acc.includes("relationship") ? "\uD83E\uDD1D" : acc.includes("invitation") ? "\uD83D\uDEAB" : "\u2753"} {s.accessNote}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "flex-start" }}>
                      {s.url && (
                        <a href={s.url} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 11, color: C.blue, textDecoration: "none", padding: "4px 8px", border: `1px solid ${C.blue}25`, borderRadius: 5, fontFamily: FONT, fontWeight: 500 }}>
                          {"\u2197"}
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
                          \u2715
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Reject popover */}
                  {rejectingIdx === i && (
                    <div style={{
                      position: "absolute", top: "100%", right: 0, zIndex: 20, marginTop: 4,
                      background: C.white, borderRadius: 8, padding: 10,
                      border: `1px solid ${C.line}`, boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                      width: 210,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.t2, marginBottom: 6 }}>Why doesn't this fit?</div>
                      {REJECT_REASONS.map(r => (
                        <button key={r.key} onClick={() => rejectScoutResult(s, r.key, "")}
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
                          onKeyDown={e => { if (e.key === "Enter" && rejectText.trim()) rejectScoutResult(s, "custom", rejectText); }}
                          style={{
                            flex: 1, padding: "5px 8px", fontSize: 11, fontFamily: FONT,
                            border: `1px solid ${C.line}`, borderRadius: 4, outline: "none",
                          }}
                        />
                        {rejectText.trim() && (
                          <button onClick={() => rejectScoutResult(s, "custom", rejectText)}
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
              <span style={{ fontSize: 32 }}>{"\u2609"}</span>
            </div>

            {/* Headline */}
            <div style={{ fontSize: 22, fontWeight: 800, color: C.dark, marginBottom: 8, letterSpacing: -0.3 }}>
              Build your pipeline
            </div>
            <div style={{ fontSize: 14, color: C.t3, lineHeight: 1.6, marginBottom: 32, maxWidth: 400, margin: "0 auto 32px" }}>
              Scout uses AI to find grant opportunities matched to your organisation profile, or add grants you already know about.
            </div>

            {/* Scout market selector */}
            <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 16 }}>
              {[{ id: "both", l: "Both" }, { id: "sa", l: "\uD83C\uDDFF\uD83C\uDDE6 South Africa" }, { id: "global", l: "\uD83C\uDF0D Global" }].map(o => (
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
            <Btn onClick={aiScout} disabled={scouting} v="primary" style={{
              fontSize: 15, padding: "12px 32px", borderRadius: 8,
              background: `linear-gradient(135deg, ${C.primary} 0%, ${C.primaryDark} 100%)`,
              borderColor: C.primary, color: C.white,
              boxShadow: `0 4px 14px ${C.primary}30`,
            }}>
              {"\u2609"} Scout for opportunities
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
                  <span style={{ fontSize: 14 }}>{"\uD83D\uDD17"}</span> Paste a grant URL
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
