import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { C, FONT, MONO } from "../theme";
import { fmtK, dL, uid, td, effectiveAsk, grantReadiness } from "../utils";
import { Btn, DeadlineBadge, TypeBadge, Avatar, Label } from "./index";
import { scoutPrompt, scoutBriefPrompt } from "../prompts";
import { detectType, PTYPES } from "../data/funderStrategy";
import { GATES, ROLES } from "../data/constants";
import { uploadFile, kvGet, kvSet } from "../api";

/* ── Readiness Chips — show missing items on kanban cards ── */
const ReadinessChips = ({ missing }) => {
  if (!missing || missing.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
      {missing.slice(0, 3).map((m, i) => (
        <span key={i} style={{
          fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 6,
          background: m.includes("docs") ? C.amberSoft : m.includes("deadline") ? C.redSoft : C.navySoft,
          color: m.includes("docs") ? C.amber : m.includes("deadline") ? C.red : C.t2,
          letterSpacing: 0.2,
        }}>{m}</span>
      ))}
      {missing.length > 3 && (
        <span style={{ fontSize: 9, color: C.t4, fontWeight: 500 }}>+{missing.length - 3}</span>
      )}
    </div>
  );
};

/* ── Gate Indicator — shows approval requirement for next stage ── */
const STAGE_ORDER = ["scouted", "qualifying", "drafting", "review", "submitted", "awaiting"];
const GateIndicator = ({ stage, ownerRole }) => {
  const idx = STAGE_ORDER.indexOf(stage);
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) return null;
  const nextStage = STAGE_ORDER[idx + 1];
  const gateKey = `${stage}->${nextStage}`;
  const gate = GATES[gateKey];
  if (!gate) return null;
  const roleLevel = ROLES[ownerRole]?.level || 0;
  const needLevel = ROLES[gate.need]?.level || 99;
  const canSelf = roleLevel >= needLevel;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 4, marginTop: 6,
      padding: "3px 8px", borderRadius: 6, fontSize: 9, fontWeight: 600,
      background: canSelf ? C.okSoft : C.amberSoft,
      color: canSelf ? C.ok : C.amber,
    }}>
      <span style={{ fontSize: 10 }}>{canSelf ? "\u2713" : "\u25CB"}</span>
      <span>{canSelf ? "Can advance" : `${ROLES[gate.need]?.label || "Approval"} needed`}</span>
    </div>
  );
};

const VIEW_OPTIONS = [["kanban", "Board"], ["list", "List"], ["person", "Person"]];
const CLOSED_STAGES = ["won", "lost", "deferred", "archived"];
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
const COMMON_FOCUS = ["Youth Employment", "Digital Skills", "AI/4IR", "Education", "Women", "Rural Dev", "STEM", "Entrepreneurship", "Work Readiness", "Leadership"];
const AVATAR_COLORS = [
  { bg: C.primarySoft, accent: C.primary },
  { bg: C.blueSoft, accent: C.blue },
  { bg: C.amberSoft, accent: C.amber },
  { bg: C.emeraldSoft, accent: C.emerald },
  { bg: C.tealSoft, accent: C.teal },
  { bg: C.purpleSoft, accent: C.purple },
];

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

export default function Pipeline({ grants, team, stages, funderTypes, complianceDocs = [], orgContext = "", onSelectGrant, onUpdateGrant, onAddGrant, onRunAI, api, onToast }) {
  const [pView, setPView] = useState("kanban");
  const [q, setQ] = useState("");
  const [sf, setSf] = useState("all");
  const [pSort, setPSort] = useState("default");
  const [market, setMarket] = useState("all"); // "all" | "sa" | "global"
  const [scoutMarket, setScoutMarket] = useState("both"); // "sa" | "global" | "both"
  const [dragId, setDragId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [wizStep, setWizStep] = useState(1); // 1 = funder, 2 = programme, 3 = AI actions
  const [newName, setNewName] = useState("");
  const [newFunder, setNewFunder] = useState("");
  const [newType, setNewType] = useState(funderTypes?.[0] || "Foundation");
  const [newAsk, setNewAsk] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [newRel, setNewRel] = useState("Cold");
  const [newMarket, setNewMarket] = useState("sa");
  const [newApplyUrl, setNewApplyUrl] = useState("");
  // Step 2: multi-programme selection — Map<ptypeKey, { cohorts }> where key is "1"-"8" or "custom-N"
  const [selectedPTypes, setSelectedPTypes] = useState(new Map());
  const [customProgrammes, setCustomProgrammes] = useState([]); // [{ id, name, cost }]
  const [newFocusTags, setNewFocusTags] = useState([]);
  const [customFocusInput, setCustomFocusInput] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [pendingFiles, setPendingFiles] = useState([]); // files to upload after grant creation
  // Step 3: AI actions
  const [autoAI, setAutoAI] = useState({ fitscore: true, research: false, draft: false });
  const [scouting, setScouting] = useState(false);
  const [scoutResults, setScoutResults] = useState([]);
  const [scoutSort, setScoutSort] = useState("fit"); // "fit" | "deadline" | "budget"
  const [scoutFitFilter, setScoutFitFilter] = useState("all"); // "all" | "high" | "medium"
  const [urlInput, setUrlInput] = useState("");
  const [urlBusy, setUrlBusy] = useState(false);
  const [showUrlTool, setShowUrlTool] = useState(false);
  const [activeFilters, setActiveFilters] = useState(new Set()); // "due-week", "due-month", "no-deadline", "no-draft", "unassigned", owner ids
  const [selectedIds, setSelectedIds] = useState(new Set()); // batch operations
  const [batchAction, setBatchAction] = useState(null); // "stage" | "owner" | "priority"
  const [scoringAll, setScoringAll] = useState(false);
  const [scoreProgress, setScoreProgress] = useState({ done: 0, total: 0, current: "" });
  const [showArchived, setShowArchived] = useState(false);
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

  const STAGES = stages || [];

  // Build team lookup once per team change (avoids O(n) find per grant card)
  const teamById = useMemo(() => {
    const m = new Map();
    if (team) for (const t of team) m.set(t.id, t);
    return m;
  }, [team]);
  const fallbackMember = teamById.get("team") || { name: "Unassigned", initials: "\u2014" };
  const getMember = (id) => teamById.get(id) || fallbackMember;

  // Debounced search — immediate typing, delayed filtering (150ms)
  const [debouncedQ, setDebouncedQ] = useState("");
  const debounceRef = useRef(null);
  const handleSearchChange = useCallback((val) => {
    setQ(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQ(val), 150);
  }, []);

  // Market counts (computed before filtering)
  const marketCounts = useMemo(() => {
    const sa = grants.filter(g => (g.market || "sa") === "sa");
    const gl = grants.filter(g => g.market === "global");
    return {
      sa: { count: sa.length, ask: sa.reduce((s, g) => s + (effectiveAsk(g) || 0), 0) },
      global: { count: gl.length, ask: gl.reduce((s, g) => s + (effectiveAsk(g) || 0), 0) },
    };
  }, [grants]);

  const archivedCount = useMemo(() => grants.filter(g => g.stage === "archived").length, [grants]);

  const filtered = useMemo(() => {
    let gs = [...grants];
    // Hide archived unless explicitly toggled on
    if (!showArchived) gs = gs.filter(g => g.stage !== "archived");
    if (market !== "all") gs = gs.filter(g => (g.market || "sa") === market);
    if (debouncedQ) {
      const lq = debouncedQ.toLowerCase();
      gs = gs.filter(g => {
        // Search across all text fields — name, funder, notes, stage, type, owner, focus tags, AI content
        if (g.name?.toLowerCase().includes(lq)) return true;
        if (g.funder?.toLowerCase().includes(lq)) return true;
        if (g.notes?.toLowerCase().includes(lq)) return true;
        if (g.stage?.toLowerCase().includes(lq)) return true;
        if (g.type?.toLowerCase().includes(lq)) return true;
        if (g.market?.toLowerCase().includes(lq)) return true;
        if (g.rel?.toLowerCase().includes(lq)) return true;
        // Owner name lookup
        if (g.owner) {
          const ownerName = getMember(g.owner)?.name?.toLowerCase() || "";
          if (ownerName.includes(lq)) return true;
        }
        // Focus tags
        if (Array.isArray(g.focus) && g.focus.some(f => f.toLowerCase().includes(lq))) return true;
        // Geo tags
        if (Array.isArray(g.geo) && g.geo.some(f => f.toLowerCase().includes(lq))) return true;
        // AI research summary (first 500 chars — avoid deep search of megabytes)
        if (g.aiResearch?.slice(0, 500).toLowerCase().includes(lq)) return true;
        // Ask amount — allow searching by number
        if (g.ask && String(g.ask).includes(lq)) return true;
        return false;
      });
    }
    if (sf !== "all") gs = gs.filter(g => g.type === sf);
    if (activeFilters.size > 0) {
      gs = gs.filter(g => {
        for (const f of activeFilters) {
          if (f === "due-week") { const d = dL(g.deadline); if (d === null || d > 7 || d < 0) return false; }
          else if (f === "due-month") { const d = dL(g.deadline); if (d === null || d > 30 || d < 0) return false; }
          else if (f === "no-deadline") { if (g.deadline) return false; }
          else if (f === "no-draft") { if (g.aiDraft) return false; }
          else if (f === "unassigned") { if (g.owner && g.owner !== "team") return false; }
          else if (f.startsWith("owner:")) { if (g.owner !== f.slice(6)) return false; }
        }
        return true;
      });
    }
    return gs;
  }, [grants, debouncedQ, sf, market, activeFilters, showArchived]);

  const sorted = useMemo(() => {
    let gs = [...filtered];
    if (pSort === "ask") gs.sort((a, b) => (b.ask || 0) - (a.ask || 0));
    else if (pSort === "priority") gs.sort((a, b) => (b.pri || 0) - (a.pri || 0));
    else if (pSort === "fit") {
      // Extract numeric score from AI fit score text (SCORE: XX)
      const getFit = g => {
        if (!g.aiFitscore) return -1;
        const m = g.aiFitscore.match(/SCORE:\s*(\d+)/);
        return m ? parseInt(m[1]) : -1;
      };
      gs.sort((a, b) => getFit(b) - getFit(a));
    }
    else /* default + deadline */ gs.sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));
    return gs;
  }, [filtered, pSort]);

  // Pre-compute person groups from sorted grants (avoids rebuild on every render)
  const personEntries = useMemo(() => {
    const map = new Map();
    sorted.forEach(g => {
      const ownerId = g.owner || "team";
      if (!map.has(ownerId)) map.set(ownerId, []);
      map.get(ownerId).push(g);
    });
    return [...map.entries()].sort((a, b) => {
      if (a[0] === "team") return 1;
      if (b[0] === "team") return -1;
      return b[1].length - a[1].length;
    });
  }, [sorted]);

  // Memoized owner names for filter chips
  const ownerNames = useMemo(() =>
    [...new Set(grants.map(g => g.owner).filter(o => o && o !== "team"))],
    [grants]
  );

  // Memoized funder list for datalist suggestions
  const funderSuggestions = useMemo(() =>
    [...new Set(grants.map(g => g.funder).filter(Boolean))],
    [grants]
  );

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

  const handleDrop = (stageId) => {
    if (!dragId) return;
    const g = grants.find(x => x.id === dragId);
    if (g && g.stage !== stageId) {
      onUpdateGrant(dragId, { stage: stageId, log: [...(g.log || []), { d: td(), t: `Moved to ${stageId}` }] });
    }
    setDragId(null);
  };

  const [addError, setAddError] = useState("");

  const calcTotalAsk = (ptypes, customs, includeOrgCost = true) => {
    let total = 0;
    for (const [key, { cohorts }] of ptypes) {
      if (key.startsWith("custom-")) {
        const cp = customs.find(c => c.id === key);
        if (cp?.cost) total += cp.cost * cohorts;
      } else {
        const pt = PTYPES[key];
        if (pt?.cost) total += pt.cost * cohorts;
      }
    }
    if (includeOrgCost && total > 0) total = Math.round(total * 1.3);
    return total;
  };

  const buildPtypeNotes = (ptypes, customs, userNotes) => {
    const parts = [];
    for (const [key, { cohorts }] of ptypes) {
      if (key.startsWith("custom-")) {
        const cp = customs.find(c => c.id === key);
        if (cp) parts.push(`Custom: ${cp.name}${cohorts > 1 ? ` (${cohorts} cohorts)` : ""} R${(cp.cost || 0).toLocaleString()}/cohort`);
      } else {
        parts.push(`Type ${key}${cohorts > 1 ? ` (${cohorts} cohorts)` : ""}`);
      }
    }
    return [parts.join(" + "), userNotes].filter(Boolean).join("\n");
  };

  const resetWizard = () => {
    setShowAdd(false); setAddError(""); setWizStep(1);
    setSelectedPTypes(new Map()); setCustomProgrammes([]);
    setNewAsk(""); setNewDeadline(""); setNewRel("Cold");
    setNewMarket("sa"); setNewApplyUrl(""); setNewFocusTags([]);
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
      notes, market: scoutedMarket,
      log: [{ d: td(), t: `Scouted by AI · funder budget R${funderBudget.toLocaleString()}${s.access ? ` · ${s.access}` : ""} · ask TBD` }],
      on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null, applyUrl: s.url || "",
    };
    onAddGrant(newG);
    setScoutResults(prev => prev.map(x => x.name === s.name && x.funder === s.funder ? { ...x, added: true } : x));
  };

  /* ── Score All: batch AI fit score for every active grant ── */
  const scoreAllGrants = async () => {
    const active = grants.filter(g => !CLOSED_STAGES.includes(g.stage));
    if (active.length === 0) return;
    setScoringAll(true);
    setScoreProgress({ done: 0, total: active.length, current: "" });
    for (let i = 0; i < active.length; i++) {
      const g = active[i];
      setScoreProgress({ done: i, total: active.length, current: g.funder });
      try {
        const r = await onRunAI("fitscore", g);
        if (r && !r.startsWith?.("Error")) {
          onUpdateGrant(g.id, { aiFitscore: r, aiFitscoreAt: new Date().toISOString() });
        }
      } catch (e) {
        console.error(`Fit score failed for ${g.name}:`, e);
      }
    }
    setScoreProgress({ done: active.length, total: active.length, current: "" });
    setScoringAll(false);
  };

  const activeStages = STAGES.filter(s => !CLOSED_STAGES.includes(s.id));
  const closedStages = STAGES.filter(s => CLOSED_STAGES.includes(s.id));

  return (
    <div style={{ padding: "20px 24px", height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Row 1: Title + Market tabs + Add */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.dark, letterSpacing: -0.5 }}>Pipeline</div>
          <div style={{ display: "flex", gap: 3 }}>
            {[
              { id: "all", label: "All", count: grants.length },
              { id: "sa", label: "\uD83C\uDDFF\uD83C\uDDE6", count: marketCounts.sa.count },
              { id: "global", label: "\uD83C\uDF0D", count: marketCounts.global.count },
            ].map(tab => (
              <button key={tab.id} onClick={() => setMarket(tab.id)} style={{
                padding: "3px 10px", fontSize: 12, fontWeight: 600, fontFamily: FONT,
                borderRadius: 6, border: `1px solid ${market === tab.id ? C.primary : C.line}`,
                background: market === tab.id ? C.primarySoft : C.white,
                color: market === tab.id ? C.primary : C.t3,
                cursor: "pointer", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 5,
              }}>
                {tab.label}
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "0px 5px", borderRadius: 10,
                  background: market === tab.id ? C.primary : C.raised,
                  color: market === tab.id ? C.white : C.t4,
                }}>{tab.count}</span>
              </button>
            ))}
          </div>
        </div>
        {grants.length > 0 && (
          <Btn onClick={() => setShowAdd(!showAdd)} v="primary" style={{ fontSize: 12, padding: "6px 14px" }}>+ Add</Btn>
        )}
      </div>

      {/* Row 2: Search + Filters + View + Actions */}
      {grants.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          <input value={q} onChange={e => handleSearchChange(e.target.value)} placeholder="Search..."
            style={{ padding: "5px 10px", fontSize: 12, border: `1px solid ${C.line}`, borderRadius: 6, width: 140, fontFamily: FONT, outline: "none", transition: "border-color 0.15s" }}
            onFocus={e => e.target.style.borderColor = C.primary}
            onBlur={e => e.target.style.borderColor = C.line}
          />
          <select value={sf} onChange={e => setSf(e.target.value)}
            style={{ padding: "5px 8px", fontSize: 11, border: `1px solid ${C.line}`, borderRadius: 6, fontFamily: FONT, background: C.white }}>
            <option value="all">All types</option>
            {(funderTypes || []).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={pSort} onChange={e => setPSort(e.target.value)}
            style={{ padding: "5px 8px", fontSize: 11, border: `1px solid ${C.line}`, borderRadius: 6, fontFamily: FONT, background: C.white }}>
            <option value="default">By deadline</option>
            <option value="ask">By amount</option>
            <option value="priority">By priority</option>
            <option value="fit">By fit score</option>
          </select>
          <div style={{ display: "flex", border: `1px solid ${C.line}`, borderRadius: 6, overflow: "hidden" }}>
            {VIEW_OPTIONS.map(([k,l]) => (
              <button key={k} onClick={() => setPView(k)} style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, background: pView === k ? C.primary : C.white, color: pView === k ? C.white : C.t3, border: "none", cursor: "pointer", fontFamily: FONT, transition: "all 0.15s" }}>{l}</button>
            ))}
          </div>
          <div style={{ width: 1, height: 18, background: C.line, margin: "0 2px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 0, borderRadius: 6, overflow: "hidden", border: `1px solid ${C.primary}40` }}>
            <button onClick={aiScout} disabled={scouting} style={{
              padding: "5px 12px", fontSize: 12, fontWeight: 700, fontFamily: FONT,
              background: scouting ? C.primarySoft : C.primary,
              color: scouting ? C.primary : C.white,
              border: "none", cursor: scouting ? "wait" : "pointer",
              transition: "all 0.15s",
            }}>{scouting ? "Scouting..." : "\u2609 Scout"}</button>
            <select value={scoutMarket} onChange={e => setScoutMarket(e.target.value)}
              style={{ padding: "5px 6px", fontSize: 11, fontWeight: 600, fontFamily: FONT, border: "none", borderLeft: `1px solid ${C.primary}30`, background: C.primarySoft, color: C.primary, cursor: "pointer", outline: "none" }}>
              <option value="both">🌐 All</option>
              <option value="sa">🇿🇦 SA</option>
              <option value="global">🌍 Global</option>
            </select>
          </div>
          {onRunAI && <Btn onClick={() => setShowUrlTool(!showUrlTool)} v="ghost" style={{ fontSize: 11, padding: "4px 10px", color: C.blue, borderColor: C.blue + "30" }}>{"\uD83D\uDD17"} URL</Btn>}
          {onRunAI && (
            <Btn onClick={scoreAllGrants} disabled={scoringAll} v="ghost" style={{
              fontSize: 11, padding: "4px 10px",
              color: scoringAll ? C.primary : C.amber,
              borderColor: (scoringAll ? C.primary : C.amber) + "30",
              animation: scoringAll ? "ge-pulse 1.4s ease-in-out infinite" : "none",
            }}>
              {scoringAll ? `${scoreProgress.done}/${scoreProgress.total}` : "⚡ Score All"}
            </Btn>
          )}
          <Btn onClick={() => { if (batchAction) { setBatchAction(null); setSelectedIds(new Set()); } else { setBatchAction("select"); } }}
            v="ghost" style={{ fontSize: 11, padding: "4px 10px", color: batchAction ? C.primary : C.t4, borderColor: batchAction ? C.primary + "30" : undefined }}>
            {batchAction ? "Done" : "Select"}
          </Btn>
        </div>
      )}

      {/* Filter chips — only show when there are grants to filter */}
      {grants.length > 0 && (() => {
        const toggleFilter = (f) => setActiveFilters(prev => {
          const next = new Set(prev);
          next.has(f) ? next.delete(f) : next.add(f);
          return next;
        });
        const chipBase = { padding: "3px 8px", borderRadius: 100, fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: FONT, transition: "all 0.15s ease" };
        const chipStyle = (f) => activeFilters.has(f)
          ? { ...chipBase, border: `1px solid ${C.primary}`, background: C.primarySoft, color: C.primary }
          : { ...chipBase, border: `1px solid ${C.line}`, background: C.white, color: C.t3 };
        return (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
            <button onClick={() => toggleFilter("due-week")} style={chipStyle("due-week")}>Due this week</button>
            <button onClick={() => toggleFilter("due-month")} style={chipStyle("due-month")}>Due this month</button>
            <button onClick={() => toggleFilter("no-deadline")} style={chipStyle("no-deadline")}>No deadline</button>
            <button onClick={() => toggleFilter("no-draft")} style={chipStyle("no-draft")}>No draft</button>
            <button onClick={() => toggleFilter("unassigned")} style={chipStyle("unassigned")}>Unassigned</button>
            {ownerNames.map(oid => {
              const m = getMember(oid);
              return <button key={oid} onClick={() => toggleFilter(`owner:${oid}`)} style={chipStyle(`owner:${oid}`)}>{m?.name || oid}</button>;
            })}
            {archivedCount > 0 && (
              <button onClick={() => setShowArchived(!showArchived)} style={{
                ...chipBase,
                border: `1px solid ${showArchived ? C.t4 : C.line}`,
                background: showArchived ? C.warm200 : C.white,
                color: showArchived ? C.t3 : C.t4,
              }}>📦 {archivedCount} archived</button>
            )}
            {activeFilters.size > 0 && (
              <button onClick={() => setActiveFilters(new Set())} style={{ ...chipStyle("clear"), color: C.red, borderColor: C.red + "40" }}>Clear all</button>
            )}
          </div>
        );
      })()}

      {/* Batch action bar */}
      {selectedIds.size > 0 && (
        <div style={{
          display: "flex", gap: 8, alignItems: "center", marginBottom: 10,
          padding: "8px 14px", background: `linear-gradient(135deg, ${C.primarySoft} 0%, ${C.white} 100%)`,
          borderRadius: 10, border: `1px solid ${C.primary}20`,
          boxShadow: C.cardShadow,
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.primary }}>{selectedIds.size} selected</span>
          <div style={{ width: 1, height: 20, background: C.line }} />
          <span style={{ fontSize: 11, color: C.t3, fontWeight: 600 }}>Move to:</span>
          {STAGES.filter(s => !CLOSED_STAGES.includes(s.id)).map(s => (
            <button key={s.id} onClick={() => {
              for (const id of selectedIds) onUpdateGrant(id, { stage: s.id });
              setSelectedIds(new Set());
            }}
              style={{
                padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600,
                background: s.bg || C.bg, color: s.c, border: `1px solid ${s.c}30`,
                cursor: "pointer", fontFamily: FONT,
              }}>{s.label}</button>
          ))}
          <div style={{ width: 1, height: 20, background: C.line }} />
          <span style={{ fontSize: 11, color: C.t3, fontWeight: 600 }}>Assign:</span>
          <select onChange={e => {
            if (!e.target.value) return;
            for (const id of selectedIds) onUpdateGrant(id, { owner: e.target.value });
            setSelectedIds(new Set());
            e.target.value = "";
          }} style={{ padding: "3px 8px", fontSize: 11, border: `1px solid ${C.line}`, borderRadius: 6, fontFamily: FONT }}>
            <option value="">Pick...</option>
            {(team || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <div style={{ marginLeft: "auto" }} />
          <button onClick={() => setSelectedIds(new Set())}
            style={{ fontSize: 11, color: C.t4, background: "none", border: "none", cursor: "pointer", fontFamily: FONT, fontWeight: 600 }}>Cancel</button>
        </div>
      )}

      {/* Score All progress bar */}
      {scoringAll && (
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", marginBottom: 14,
          background: `linear-gradient(135deg, ${C.amberSoft}60 0%, ${C.white} 100%)`,
          borderRadius: 10, border: `1px solid ${C.amber}20`, boxShadow: C.cardShadow,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
            background: C.amberSoft, color: C.amber, fontSize: 14, fontWeight: 700, flexShrink: 0,
            animation: "ge-pulse 1.4s ease-in-out infinite",
          }}>⚡</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>Scoring all grants</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.amber, fontFamily: MONO }}>{scoreProgress.done}/{scoreProgress.total}</span>
            </div>
            <div style={{ height: 4, background: C.line, borderRadius: 2, overflow: "hidden" }}>
              <div style={{
                height: "100%", borderRadius: 2, transition: "width 0.3s ease",
                background: `linear-gradient(90deg, ${C.amber}, ${C.ok})`,
                width: `${scoreProgress.total > 0 ? (scoreProgress.done / scoreProgress.total * 100) : 0}%`,
              }} />
            </div>
            {scoreProgress.current && (
              <div style={{ fontSize: 11, color: C.t3, marginTop: 3 }}>Scoring fit for {scoreProgress.current}...</div>
            )}
          </div>
        </div>
      )}

      {/* URL Extract tool — paste a grant URL to auto-create */}
      {showUrlTool && onRunAI && (
        <div style={{
          display: "flex", gap: 8, marginBottom: 14, alignItems: "center",
          padding: "10px 14px", background: `linear-gradient(135deg, ${C.blueSoft}40 0%, ${C.white} 100%)`,
          borderRadius: 10, boxShadow: C.cardShadow, border: `1px solid ${C.blue}15`,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
            background: C.blueSoft, color: C.blue, fontSize: 13, fontWeight: 700, flexShrink: 0,
            animation: urlBusy ? "ge-pulse 1.4s ease-in-out infinite" : "none",
          }}>{urlBusy ? "\u2026" : "\uD83D\uDD17"}</div>
          <input
            value={urlInput} onChange={e => setUrlInput(e.target.value)}
            placeholder="Paste a grant URL to auto-fill details..."
            style={{
              flex: 1, padding: "8px 12px", fontSize: 13, border: `1px solid ${C.line}`,
              borderRadius: 8, fontFamily: FONT, background: C.white,
            }}
            onKeyDown={e => {
              if (e.key === "Enter" && urlInput.trim() && !urlBusy) {
                e.preventDefault();
                (async () => {
                  setUrlBusy(true);
                  try {
                    const r = await onRunAI("urlextract", { name: "", funder: "", type: "", ask: 0, focus: [], geo: [], rel: "Cold", notes: "", deadline: null, stage: "scouted" }, urlInput.trim());
                    const parsed = JSON.parse(r);
                    const fBudget = parsed.ask || 0;
                    const g = {
                      id: uid(), name: parsed.name || "Untitled Grant", funder: parsed.funder || "",
                      type: parsed.type || "Foundation", stage: "scouted",
                      ask: 0, funderBudget: fBudget, askSource: null, aiRecommendedAsk: null,
                      deadline: parsed.deadline || null,
                      focus: parsed.focus || [], geo: [], rel: "Cold", pri: 3, hrs: 0,
                      notes: parsed.notes || "", applyUrl: parsed.applyUrl || urlInput.trim(),
                      log: [{ d: td(), t: `Created from URL · funder budget R${fBudget.toLocaleString()} · ask TBD` }],
                      market: parsed.type === "International" ? "global" : "sa",
                      on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null,
                    };
                    onAddGrant(g);
                    setUrlInput("");
                    setShowUrlTool(false);
                  } catch (e) {
                    onToast?.("Could not parse grant from URL. Try adding manually.", { type: "error" });
                  }
                  setUrlBusy(false);
                })();
              }
            }}
          />
          <Btn
            onClick={async () => {
              if (!urlInput.trim() || urlBusy) return;
              setUrlBusy(true);
              try {
                const r = await onRunAI("urlextract", { name: "", funder: "", type: "", ask: 0, focus: [], geo: [], rel: "Cold", notes: "", deadline: null, stage: "scouted" }, urlInput.trim());
                const parsed = JSON.parse(r);
                const fBudget = parsed.ask || 0;
                const g = {
                  id: uid(), name: parsed.name || "Untitled Grant", funder: parsed.funder || "",
                  type: parsed.type || "Foundation", stage: "scouted",
                  ask: 0, funderBudget: fBudget, askSource: null, aiRecommendedAsk: null,
                  deadline: parsed.deadline || null,
                  focus: parsed.focus || [], geo: [], rel: "Cold", pri: 3, hrs: 0,
                  notes: parsed.notes || "", applyUrl: parsed.applyUrl || urlInput.trim(),
                  log: [{ d: td(), t: `Created from URL · funder budget R${fBudget.toLocaleString()} · ask TBD` }],
                  market: parsed.type === "International" ? "global" : "sa",
                  on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null,
                };
                onAddGrant(g);
                setUrlInput("");
                setShowUrlTool(false);
              } catch (e) {
                alert("Could not parse grant from URL. Try adding manually.");
              }
              setUrlBusy(false);
            }}
            disabled={!urlInput.trim() || urlBusy}
            style={{ fontSize: 12, padding: "6px 14px", background: C.blue, borderColor: C.blue }}
          >{urlBusy ? "Extracting..." : "Extract"}</Btn>
          <Btn onClick={() => { setShowUrlTool(false); setUrlInput(""); }} v="ghost" style={{ fontSize: 12, padding: "6px 10px" }}>Cancel</Btn>
        </div>
      )}

      {/* Add grant inline */}
      {showAdd && (
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
                    {[{ id: "sa", l: "\uD83C\uDDFF\uD83C\uDDE6 SA" }, { id: "global", l: "\uD83C\uDF0D Global" }].map(m => (
                      <button key={m.id} onClick={() => setNewMarket(m.id)} style={{
                        padding: "6px 12px", fontSize: 10, fontWeight: 700, border: "none", cursor: "pointer",
                        background: newMarket === m.id ? C.primary : C.white, color: newMarket === m.id ? C.white : C.t3,
                      }}>{m.l}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
                      }}>{selectedPTypes.has(cp.id) ? "\u2713 Selected" : "Select"}</button>
                    <button onClick={() => {
                        setCustomProgrammes(prev => prev.filter((_, j) => j !== i));
                        const next = new Map(selectedPTypes); next.delete(cp.id); setSelectedPTypes(next); setNewAsk("");
                      }}
                      style={{ background: "none", border: "none", color: C.t4, cursor: "pointer", fontSize: 14 }}>{"\u00D7"}</button>
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
                    {newFunder} {"\u00B7"} {newType} {"\u00B7"} {newRel} {"\u00B7"} {newMarket === "global" ? "\uD83C\uDF0D Global" : "\uD83C\uDDFF\uD83C\uDDE6 SA"}
                    {newDeadline && ` \u00B7 Due ${new Date(newDeadline + "T00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}`}
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
                          {v.cohorts > 1 ? ` \u00D7${v.cohorts}` : ""}
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
                    }}>{autoAI[action.key] ? "\u2713" : ""}</span>
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
      )}

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
                    {scoutBriefLoading ? "Generating..." : "↻ Regenerate"}
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
              const accessIcon = acc === "open" ? "✓" : acc.includes("relationship") ? "→" : acc.includes("invitation") ? "✕" : "?";
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
                        {s.added && <span style={{ fontSize: 10, fontWeight: 600, color: C.ok }}>{"✓"}</span>}
                        {isRejected && <span style={{ fontSize: 10, fontWeight: 600, color: C.t4, background: C.raised, padding: "1px 7px", borderRadius: 100 }}>Rejected</span>}
                      </div>
                      <div style={{ fontSize: 12, color: C.t3 }}>
                        {s.funder}{(s.funderBudget || s.ask) ? ` · ~R${Number(s.funderBudget || s.ask).toLocaleString()}` : ""}{s.deadline ? ` · ${new Date(s.deadline).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}` : ""}
                      </div>
                      <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.4, marginTop: 3 }}>{s.reason}</div>
                      {s.accessNote && (
                        <div style={{ fontSize: 11, color: accessC, lineHeight: 1.4, marginTop: 3, fontStyle: "italic" }}>
                          {acc === "open" ? "📋" : acc.includes("relationship") ? "🤝" : acc.includes("invitation") ? "🚫" : "❓"} {s.accessNote}
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "flex-start" }}>
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
                          ✕
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
              <span style={{ fontSize: 32 }}>☉</span>
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
              ☉ Scout for opportunities
            </Btn>

            {/* Divider */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "28px auto", maxWidth: 300 }}>
              <div style={{ flex: 1, height: 1, background: C.line }} />
              <span style={{ fontSize: 11, color: C.t4, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>or</span>
              <div style={{ flex: 1, height: 1, background: C.line }} />
            </div>

            {/* Secondary options */}
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button onClick={() => setShowAdd(true)} style={{
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
              {onRunAI && (
                <button onClick={() => setShowUrlTool(true)} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "8px 16px",
                  borderRadius: 8, border: `1px solid ${C.line}`, background: C.white,
                  cursor: "pointer", fontFamily: FONT, fontSize: 13, fontWeight: 600, color: C.t2,
                  transition: "all 0.15s ease",
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.blue + "60"; e.currentTarget.style.background = C.blueSoft; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.line; e.currentTarget.style.background = C.white; }}
                >
                  <span style={{ fontSize: 14 }}>🔗</span> Paste a grant URL
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Empty state — search/filter yielded no results */}
      {grants.length > 0 && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: "40px 20px", color: C.t3 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.t2, marginBottom: 4 }}>No matching grants</div>
          <div style={{ fontSize: 13, color: C.t4 }}>
            {q ? `No results for "${q}"` : `No ${sf} grants found`}
            {" · "}
            <button onClick={() => { setQ(""); setSf("all"); }} style={{ color: C.primary, background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: FONT, fontSize: 13 }}>Clear filters</button>
          </div>
        </div>
      )}

      {/* Kanban view — stage-colored columns and cards */}
      {pView === "kanban" && filtered.length > 0 && (
        <div style={{ display: "flex", gap: 10, flex: 1, overflowX: "auto", paddingBottom: 10 }}>
          {activeStages.map(stage => {
            const stageGrants = sorted.filter(g => g.stage === stage.id);
            const stageTotal = stageGrants.reduce((s, g) => s + effectiveAsk(g), 0);
            return (
              <div key={stage.id}
                onDragOver={e => e.preventDefault()}
                onDrop={() => handleDrop(stage.id)}
                style={{
                  minWidth: 220, maxWidth: 280, flex: 1, display: "flex", flexDirection: "column",
                  background: (stage.bg || C.bg) + "40", borderRadius: 10, padding: 8,
                  border: `1px solid ${stage.c}30`,
                }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: stage.c }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.t2, textTransform: "uppercase", letterSpacing: 0.5 }}>{stage.label}</span>
                    <span style={{ fontSize: 11, color: C.t4, fontWeight: 600 }}>({stageGrants.length})</span>
                  </div>
                  <span style={{ fontSize: 10, color: C.t4, fontFamily: MONO }}>{fmtK(stageTotal)}</span>
                </div>
                <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                  {stageGrants.map(g => {
                    const d = dL(g.deadline);
                    const m = getMember(g.owner);
                    const isSelected = selectedIds.has(g.id);
                    return (
                      <div key={g.id} draggable onDragStart={() => setDragId(g.id)}
                        onClick={(e) => {
                          if (batchAction) {
                            e.stopPropagation();
                            setSelectedIds(prev => { const n = new Set(prev); n.has(g.id) ? n.delete(g.id) : n.add(g.id); return n; });
                          } else {
                            onSelectGrant(g.id);
                          }
                        }}
                        style={{
                          background: isSelected ? `${C.primary}08` : C.white, borderRadius: 8, padding: "8px 10px",
                          border: `1px solid ${isSelected ? C.primary : stage.c}30`,
                          cursor: "pointer",
                          boxShadow: C.cardShadow,
                          transition: "box-shadow 0.15s, transform 0.15s",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.boxShadow = C.cardShadowHover; e.currentTarget.style.transform = "translateY(-1px)"; }}
                        onMouseLeave={e => { e.currentTarget.style.boxShadow = C.cardShadow; e.currentTarget.style.transform = "none"; }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          {batchAction && (
                            <div style={{
                              width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 1,
                              border: `1px solid ${isSelected ? C.primary : C.line}`,
                              background: isSelected ? C.primary : "transparent",
                              display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              {isSelected && <span style={{ color: C.white, fontSize: 10, fontWeight: 700 }}>{"\u2713"}</span>}
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.dark, marginBottom: 4, lineHeight: 1.3 }}>{g.name}</div>
                            <div style={{ fontSize: 11, color: C.t3, marginBottom: 6, display: "flex", alignItems: "center", gap: 6 }}>
                              {g.funder}{g.market === "global" ? " \uD83C\uDF0D" : ""}
                              {g.applyUrl && (
                                <a href={g.applyUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                  style={{ fontSize: 9, fontWeight: 700, color: C.blue, background: C.blue + "12", padding: "1px 6px", borderRadius: 4, textDecoration: "none", whiteSpace: "nowrap" }}
                                  title={g.applyUrl}
                                >{"\u2197"} Apply</a>
                              )}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <Avatar member={m} size={20} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: g.ask > 0 ? C.t2 : C.t4, fontFamily: MONO }}>{g.ask > 0 ? fmtK(g.ask) : g.funderBudget ? `~${fmtK(g.funderBudget)}` : "TBD"}</span>
                          </div>
                          <DeadlineBadge d={d} deadline={g.deadline} stage={g.stage} />
                        </div>
                        {!["won", "lost", "deferred", "archived"].includes(g.stage) && (() => {
                          const r = grantReadiness(g, complianceDocs);
                          return r.missing.length > 0 ? <ReadinessChips missing={r.missing} /> : null;
                        })()}
                        {!CLOSED_STAGES.includes(g.stage) && <GateIndicator stage={g.stage} ownerRole={m.role} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List view — navy header */}
      {pView === "list" && filtered.length > 0 && (
        <div style={{ background: C.white, borderRadius: 10, border: "none", overflow: "hidden", boxShadow: C.cardShadow }}>
          <div style={{
            display: "grid", gridTemplateColumns: "2fr 1.5fr 140px 100px 90px 70px",
            padding: "10px 16px", background: C.navy, borderRadius: "10px 10px 0 0",
            fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: 0.5, textTransform: "uppercase",
          }}>
            <span>Grant</span><span>Funder</span><span>Type</span><span>Ask</span><span>Deadline</span><span>Stage</span>
          </div>
          {sorted.map((g, idx) => {
            const d = dL(g.deadline);
            const m = getMember(g.owner);
            const stg = STAGES.find(s => s.id === g.stage);
            return (
              <div key={g.id} onClick={() => onSelectGrant(g.id)}
                style={{
                  display: "grid", gridTemplateColumns: "2fr 1.5fr 140px 100px 90px 70px",
                  padding: "10px 16px", borderBottom: `1px solid ${C.line}`,
                  cursor: "pointer", alignItems: "center", transition: "background 0.1s",
                  background: idx % 2 === 1 ? C.warm100 : "transparent",
                }}
                onMouseEnter={e => e.currentTarget.style.background = C.hover}
                onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 1 ? C.warm100 : "transparent"}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Avatar member={m} size={22} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.dark, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
                </div>
                <span style={{ fontSize: 12, color: C.t3 }}>{g.funder}</span>
                <TypeBadge type={g.type} />
                <span style={{ fontSize: 13, fontWeight: 600, fontFamily: MONO, color: g.ask > 0 ? C.t1 : C.t4 }}>{g.ask > 0 ? fmtK(g.ask) : g.funderBudget ? `~${fmtK(g.funderBudget)}` : "TBD"}</span>
                <DeadlineBadge d={d} deadline={g.deadline} stage={g.stage} />
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: stg?.c || C.t4 }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: stg?.c || C.t3 }}>{stg?.label || g.stage}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Person view — grouped by team member */}
      {pView === "person" && filtered.length > 0 && (() => {
        return (
          <div style={{ display: "flex", gap: 10, flex: 1, overflowX: "auto", paddingBottom: 10 }}>
            {personEntries.map(([ownerId, ownerGrants]) => {
              const m = getMember(ownerId);
              const total = ownerGrants.reduce((s, g) => s + effectiveAsk(g), 0);
              const cIdx = m.name ? m.name.charCodeAt(0) % AVATAR_COLORS.length : AVATAR_COLORS.length - 1;
              const ac = AVATAR_COLORS[cIdx];

              return (
                <div key={ownerId} style={{
                  minWidth: 240, maxWidth: 300, flex: 1, display: "flex", flexDirection: "column",
                  background: ac.bg + "30", borderRadius: 10, padding: 8,
                  border: `1px solid ${ac.accent}30`,
                }}>
                  {/* Person header */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 8px 6px", marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar member={m} size={28} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.dark, lineHeight: 1.2 }}>{m.name}</div>
                        {m.role && m.role !== "none" && (
                          <div style={{ fontSize: 10, fontWeight: 600, color: C.t4, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 1 }}>
                            {m.role === "director" ? "Director" : m.role === "hop" ? "Head of Prog" : m.role === "pm" ? "Prog Manager" : m.role}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.t3 }}>{ownerGrants.length}</div>
                      <div style={{ fontSize: 9, color: C.t4, fontFamily: MONO }}>{fmtK(total)}</div>
                    </div>
                  </div>

                  {/* Grants */}
                  <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                    {ownerGrants.map(g => {
                      const d = dL(g.deadline);
                      const stg = STAGES.find(s => s.id === g.stage);
                      return (
                        <div key={g.id} draggable onDragStart={() => setDragId(g.id)}
                          onClick={() => onSelectGrant(g.id)}
                          style={{
                            background: C.white, borderRadius: 8, padding: "8px 10px",
                            border: `1px solid ${(stg?.c || C.t4)}30`,
                            cursor: "pointer", boxShadow: C.cardShadow,
                            transition: "box-shadow 0.15s, transform 0.15s",
                          }}
                          onMouseEnter={e => { e.currentTarget.style.boxShadow = C.cardShadowHover; e.currentTarget.style.transform = "translateY(-1px)"; }}
                          onMouseLeave={e => { e.currentTarget.style.boxShadow = C.cardShadow; e.currentTarget.style.transform = "none"; }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: stg?.c || C.t4, flexShrink: 0 }} />
                            <span style={{ fontSize: 10, fontWeight: 600, color: stg?.c || C.t3, textTransform: "uppercase", letterSpacing: 0.3 }}>{stg?.label || g.stage}</span>
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.dark, marginBottom: 4, lineHeight: 1.3 }}>{g.name}</div>
                          <div style={{ fontSize: 11, color: C.t3, marginBottom: 6 }}>{g.funder}</div>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: g.ask > 0 ? C.t2 : C.t4, fontFamily: MONO }}>{g.ask > 0 ? fmtK(g.ask) : g.funderBudget ? `~${fmtK(g.funderBudget)}` : "TBD"}</span>
                            <DeadlineBadge d={d} deadline={g.deadline} stage={g.stage} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}
    </div>
  );
}
