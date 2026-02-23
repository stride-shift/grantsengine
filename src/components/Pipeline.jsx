import { useState, useMemo, useEffect, useRef } from "react";
import { C, FONT, MONO } from "../theme";
import { fmt, fmtK, dL, uid, td, effectiveAsk } from "../utils";
import { Btn, DeadlineBadge, TypeBadge, Avatar, Label } from "./index";
import { scoutPrompt } from "../prompts";
import { detectType, PTYPES } from "../data/funderStrategy";

const VIEW_OPTIONS = [["kanban", "Board"], ["list", "List"], ["person", "Person"]];
const CLOSED_STAGES = ["won", "lost", "deferred"];
const SCOUT_TYPE_MAP = { corporate: "Corporate CSI", csi: "Corporate CSI", government: "Government/SETA", seta: "Government/SETA", international: "International", foundation: "Foundation", tech: "Tech Company" };
const AVATAR_COLORS = [
  { bg: C.redSoft, accent: C.red },
  { bg: C.blueSoft, accent: C.blue },
  { bg: C.amberSoft, accent: C.amber },
  { bg: "#E6F5EE", accent: "#1A7A42" },
  { bg: "#ECFEFF", accent: "#0891B2" },
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
      background: `linear-gradient(135deg, ${C.white} 0%, ${C.purpleSoft} 100%)`,
      borderRadius: 14, padding: "28px 32px", marginBottom: 14,
      border: `1px solid ${C.purple}15`, boxShadow: C.cardShadow,
    }}>
      {/* Header with animated dots */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: `linear-gradient(135deg, ${C.purple} 0%, ${C.blue}CC 100%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "ge-pulse 2s ease-in-out infinite",
          }}>
            <span style={{ fontSize: 15, color: "#fff" }}>{"\u2609"}</span>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>Scouting new opportunities</div>
            <div style={{ fontSize: 12, color: C.t3, marginTop: 1, transition: "opacity 0.3s", opacity: 1 }}>{step}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 6, height: 6, borderRadius: "50%", background: C.purple,
              animation: "ge-pulse 1.4s ease-in-out infinite",
              animationDelay: `${i * 0.2}s`,
            }} />
          ))}
        </div>
      </div>

      {/* Insight card */}
      <div style={{
        display: "flex", gap: 20, alignItems: "center",
        padding: "20px 24px", background: C.white, borderRadius: 12,
        border: `1px solid ${C.line}`,
        transition: "opacity 0.3s ease", opacity: fade ? 1 : 0,
        minHeight: 90,
      }}>
        <div style={{
          minWidth: 72, textAlign: "center", padding: "8px 0",
        }}>
          <div style={{
            fontSize: 28, fontWeight: 800, color: C.purple, fontFamily: MONO,
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
          height: "100%", background: `linear-gradient(90deg, ${C.purple}, ${C.blue})`,
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

export default function Pipeline({ grants, team, stages, funderTypes, onSelectGrant, onUpdateGrant, onAddGrant, onRunAI, api }) {
  const [pView, setPView] = useState("kanban");
  const [q, setQ] = useState("");
  const [sf, setSf] = useState("all");
  const [pSort, setPSort] = useState("default");
  const [dragId, setDragId] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newFunder, setNewFunder] = useState("");
  const [newType, setNewType] = useState(funderTypes?.[0] || "Foundation");
  const [newAsk, setNewAsk] = useState("");
  const [scouting, setScouting] = useState(false);
  const [scoutResults, setScoutResults] = useState([]);
  const [urlInput, setUrlInput] = useState("");
  const [urlBusy, setUrlBusy] = useState(false);
  const [showUrlTool, setShowUrlTool] = useState(false);

  const STAGES = stages || [];

  // Build team lookup once per team change (avoids O(n) find per grant card)
  const teamById = useMemo(() => {
    const m = new Map();
    if (team) for (const t of team) m.set(t.id, t);
    return m;
  }, [team]);
  const fallbackMember = teamById.get("team") || { name: "Unassigned", initials: "\u2014" };
  const getMember = (id) => teamById.get(id) || fallbackMember;

  const filtered = useMemo(() => {
    let gs = [...grants];
    if (q) {
      const lq = q.toLowerCase();
      gs = gs.filter(g => g.name?.toLowerCase().includes(lq) || g.funder?.toLowerCase().includes(lq) || g.notes?.toLowerCase().includes(lq));
    }
    if (sf !== "all") gs = gs.filter(g => g.type === sf);
    return gs;
  }, [grants, q, sf]);

  const sorted = useMemo(() => {
    let gs = [...filtered];
    if (pSort === "deadline") gs.sort((a, b) => (a.deadline || "9").localeCompare(b.deadline || "9"));
    else if (pSort === "ask") gs.sort((a, b) => (b.ask || 0) - (a.ask || 0));
    else if (pSort === "priority") gs.sort((a, b) => (b.pri || 0) - (a.pri || 0));
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

  const handleDrop = (stageId) => {
    if (!dragId) return;
    const g = grants.find(x => x.id === dragId);
    if (g && g.stage !== stageId) {
      onUpdateGrant(dragId, { stage: stageId, log: [...(g.log || []), { d: td(), t: `Moved to ${stageId}` }] });
    }
    setDragId(null);
  };

  const [addError, setAddError] = useState("");

  const addGrant = () => {
    const trimName = (newName || "").trim();
    const trimFunder = (newFunder || "").trim();
    if (!trimName || trimName.length < 2) { setAddError("Grant name must be at least 2 characters"); return; }
    if (!trimFunder) { setAddError("Funder name is required"); return; }
    setAddError("");
    const enteredAsk = parseInt(newAsk.replace(/[,\s]/g, "")) || 0;
    const g = {
      id: uid(), name: trimName, funder: trimFunder, type: newType,
      stage: "scouted", ask: enteredAsk, funderBudget: enteredAsk || null,
      askSource: enteredAsk ? "manual" : null, aiRecommendedAsk: null,
      deadline: null,
      focus: [], geo: [], rel: "Cold", pri: 3, hrs: 0, notes: "",
      log: [{ d: td(), t: "Grant created" }], on: "", of: [],
      owner: "team", docs: {}, fups: [], subDate: null, applyUrl: "",
    };
    onAddGrant(g);
    setNewName(""); setNewFunder(""); setNewAsk(""); setShowAdd(false);
  };

  /* ── Scout: AI search for new grant opportunities ── */
  const aiScout = async () => {
    setScouting(true);
    setScoutResults([]);
    const existing = grants
      .filter(g => !CLOSED_STAGES.includes(g.stage))
      .map(g => g.funder.toLowerCase());
    const existingFunders = [...new Set(existing)].join(", ");

    const p = scoutPrompt({ existingFunders });
    const r = await api(p.system, p.user, p.search, p.maxTok);

    let parsed = parseScoutResults(r);
    if (!parsed) parsed = SCOUT_FALLBACK;

    setScoutResults(
      parsed.map(s => ({
        ...s,
        inPipeline: existing.includes((s.funder || "").toLowerCase()),
        added: false,
      }))
    );
    setScouting(false);
  };

  const addScoutToPipeline = (s) => {
    const gType = SCOUT_TYPE_MAP[Object.keys(SCOUT_TYPE_MAP).find(k => (s.type || "").toLowerCase().includes(k))] || "Foundation";
    const funderBudget = Number(s.funderBudget || s.ask) || 0;
    const accessLine = s.access ? `\nAccess: ${s.access}${s.accessNote ? " — " + s.accessNote : ""}` : "";
    const notes = `${s.reason || ""}${s.url ? "\nApply: " + s.url : ""}${accessLine}`;
    // Store funder's raw budget — ask will be set after proposal generation
    const newG = {
      id: uid(), name: s.name || "New Grant", funder: s.funder || "Unknown", type: gType,
      stage: "scouted", ask: 0, funderBudget, askSource: null, aiRecommendedAsk: null,
      deadline: s.deadline || null,
      focus: s.focus || ["Youth Employment", "Digital Skills"], geo: [], rel: "Cold", pri: 3, hrs: 0,
      notes,
      log: [{ d: td(), t: `Scouted by AI · funder budget R${funderBudget.toLocaleString()}${s.access ? ` · ${s.access}` : ""} · ask TBD` }],
      on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null, applyUrl: s.url || "",
    };
    onAddGrant(newG);
    setScoutResults(prev => prev.map(x => x.name === s.name && x.funder === s.funder ? { ...x, added: true } : x));
  };

  const activeStages = STAGES.filter(s => !CLOSED_STAGES.includes(s.id));
  const closedStages = STAGES.filter(s => CLOSED_STAGES.includes(s.id));

  return (
    <div style={{ padding: "28px 32px", height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.dark, letterSpacing: -0.5 }}>Pipeline</div>
          <div style={{ width: 32, height: 4, background: C.primary, borderRadius: 2, marginTop: 4 }} />
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search grants..."
            style={{ padding: "6px 12px", fontSize: 13, border: `1.5px solid ${C.line}`, borderRadius: 10, width: 180, fontFamily: FONT, outline: "none", transition: "border-color 0.15s" }}
            onFocus={e => e.target.style.borderColor = C.primary}
            onBlur={e => e.target.style.borderColor = C.line}
          />
          <select value={sf} onChange={e => setSf(e.target.value)}
            style={{ padding: "6px 10px", fontSize: 12, border: `1.5px solid ${C.line}`, borderRadius: 10, fontFamily: FONT, background: C.white }}>
            <option value="all">All types</option>
            {(funderTypes || []).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={pSort} onChange={e => setPSort(e.target.value)}
            style={{ padding: "6px 10px", fontSize: 12, border: `1.5px solid ${C.line}`, borderRadius: 10, fontFamily: FONT, background: C.white }}>
            <option value="default">Default</option>
            <option value="deadline">By deadline</option>
            <option value="ask">By amount</option>
            <option value="priority">By priority</option>
          </select>
          <div style={{ display: "flex", border: `1.5px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
            {VIEW_OPTIONS.map(([k,l]) => (
              <button key={k} onClick={() => setPView(k)} style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, background: pView === k ? C.primary : C.white, color: pView === k ? "#fff" : C.t3, border: "none", cursor: "pointer", fontFamily: FONT, transition: "all 0.15s" }}>{l}</button>
            ))}
          </div>
          <Btn onClick={aiScout} disabled={scouting} v="ghost" style={{ fontSize: 12, padding: "6px 14px", color: C.purple, borderColor: C.purple + "40" }}>{scouting ? "Scouting..." : "\u2609 Scout"}</Btn>
          {onRunAI && <Btn onClick={() => setShowUrlTool(!showUrlTool)} v="ghost" style={{ fontSize: 12, padding: "6px 14px", color: C.blue, borderColor: C.blue + "40" }}>{"\uD83D\uDD17"} URL</Btn>}
          <Btn onClick={() => setShowAdd(!showAdd)} v="primary" style={{ fontSize: 12, padding: "6px 14px" }}>+ Add</Btn>
        </div>
      </div>

      {/* URL Extract tool — paste a grant URL to auto-create */}
      {showUrlTool && onRunAI && (
        <div style={{
          display: "flex", gap: 8, marginBottom: 14, alignItems: "center",
          padding: "12px 16px", background: `linear-gradient(135deg, ${C.blueSoft}40 0%, ${C.white} 100%)`,
          borderRadius: 14, boxShadow: C.cardShadow, border: `1.5px solid ${C.blue}15`,
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
                      on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null,
                    };
                    onAddGrant(g);
                    setUrlInput("");
                    setShowUrlTool(false);
                  } catch (e) {
                    alert("Could not parse grant from URL. Try adding manually.");
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
                const g = {
                  id: uid(), name: parsed.name || "Untitled Grant", funder: parsed.funder || "",
                  type: parsed.type || "Foundation", stage: "scouted",
                  ask: parsed.ask || 0, deadline: parsed.deadline || null,
                  focus: parsed.focus || [], geo: [], rel: "Cold", pri: 3, hrs: 0,
                  notes: parsed.notes || "", applyUrl: parsed.applyUrl || urlInput.trim(),
                  log: [{ d: td(), t: `Created from URL: ${urlInput.trim().slice(0, 60)}` }],
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
        <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", padding: "10px 14px", background: C.white, borderRadius: 14, border: "none", boxShadow: C.cardShadow }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Grant name" autoFocus
            style={{ flex: 2, padding: "6px 10px", fontSize: 13, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: FONT }} />
          <input value={newFunder} onChange={e => setNewFunder(e.target.value)} placeholder="Funder"
            style={{ flex: 1.5, padding: "6px 10px", fontSize: 13, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: FONT }} />
          <select value={newType} onChange={e => setNewType(e.target.value)}
            style={{ padding: "6px 8px", fontSize: 12, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: FONT }}>
            {(funderTypes || []).map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <input value={newAsk} onChange={e => setNewAsk(e.target.value)} placeholder="Ask (R)" type="number"
            style={{ width: 100, padding: "6px 10px", fontSize: 13, border: `1px solid ${C.line}`, borderRadius: 8, fontFamily: MONO }} />
          <Btn onClick={addGrant} disabled={!newName?.trim()} style={{ fontSize: 12, padding: "6px 14px" }}>Add</Btn>
          <Btn onClick={() => { setShowAdd(false); setAddError(""); }} v="ghost" style={{ fontSize: 12, padding: "6px 10px" }}>Cancel</Btn>
          {addError && <span style={{ fontSize: 11, color: C.red, fontWeight: 500 }}>{addError}</span>}
        </div>
      )}

      {/* Scout loading */}
      {scouting && <ScoutLoader />}

      {/* Scout results */}
      {!scouting && scoutResults.length > 0 && (
        <div style={{ background: C.white, borderRadius: 14, padding: "18px 22px", marginBottom: 14, border: "none", boxShadow: C.cardShadow }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>Scouted opportunities</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.purple, background: C.purpleSoft, padding: "2px 10px", borderRadius: 100 }}>{scoutResults.length} found</span>
              {scoutResults.filter(s => s.added).length > 0 && (
                <span style={{ fontSize: 12, fontWeight: 600, color: C.ok, background: C.okSoft, padding: "2px 10px", borderRadius: 100 }}>
                  {scoutResults.filter(s => s.added).length} added
                </span>
              )}
              {scoutResults.filter(s => s.deadline && new Date(s.deadline) < new Date()).length > 0 && (
                <span style={{ fontSize: 12, fontWeight: 600, color: C.red, background: C.redSoft, padding: "2px 10px", borderRadius: 100 }}>
                  {scoutResults.filter(s => s.deadline && new Date(s.deadline) < new Date()).length} expired
                </span>
              )}
              {(() => {
                const open = scoutResults.filter(s => (s.access || "").toLowerCase() === "open").length;
                const rel = scoutResults.filter(s => (s.access || "").toLowerCase().includes("relationship")).length;
                const inv = scoutResults.filter(s => (s.access || "").toLowerCase().includes("invitation")).length;
                if (!open && !rel && !inv) return null;
                return <>
                  {open > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: C.ok, background: C.okSoft, padding: "2px 8px", borderRadius: 100 }}>✓ {open} open</span>}
                  {rel > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: C.amber, background: C.amberSoft, padding: "2px 8px", borderRadius: 100 }}>→ {rel} relationship</span>}
                  {inv > 0 && <span style={{ fontSize: 11, fontWeight: 600, color: C.red, background: C.redSoft, padding: "2px 8px", borderRadius: 100 }}>✕ {inv} invite-only</span>}
                </>;
              })()}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn v="ghost" style={{ fontSize: 12, padding: "5px 12px" }} onClick={aiScout} disabled={scouting}>{scouting ? "Searching..." : "Search again"}</Btn>
              <button onClick={() => setScoutResults([])} style={{ fontSize: 12, color: C.t4, background: "none", border: "none", cursor: "pointer", fontFamily: FONT }}>Dismiss</button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {scoutResults.map((s, i) => {
              const fitC = s.fit === "High" ? C.ok : s.fit === "Medium" ? C.amber : C.t4;
              const expired = s.deadline && new Date(s.deadline) < new Date();
              const alreadyIn = s.inPipeline || s.added;
              const acc = (s.access || "").toLowerCase();
              const accessC = acc === "open" ? C.ok : acc.includes("relationship") ? C.amber : acc.includes("invitation") ? C.red : C.t4;
              const accessIcon = acc === "open" ? "✓" : acc.includes("relationship") ? "→" : acc.includes("invitation") ? "✕" : "?";
              const isByInvite = acc.includes("invitation");
              return (
                <div key={i} style={{
                  padding: "12px 14px", background: s.added ? `${C.ok}08` : expired ? `${C.red}05` : isByInvite ? `${C.red}04` : C.bg, borderRadius: 10,
                  border: `1px solid ${s.added ? C.ok + "30" : expired ? C.red + "25" : isByInvite ? C.red + "15" : C.line}`,
                  opacity: (s.inPipeline && !s.added) || expired ? 0.5 : isByInvite ? 0.6 : 1,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: expired ? C.t4 : C.dark, textDecoration: expired ? "line-through" : "none" }}>{s.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: fitC, background: fitC + "15", padding: "1px 7px", borderRadius: 100 }}>{s.fit}</span>
                        {s.access && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: accessC, background: accessC + "15", padding: "1px 7px", borderRadius: 100 }} title={s.accessNote || ""}>{accessIcon} {s.access}</span>
                        )}
                        {expired && <span style={{ fontSize: 10, fontWeight: 600, color: C.red, background: C.redSoft, padding: "1px 7px", borderRadius: 100 }}>Expired</span>}
                        {s.added && <span style={{ fontSize: 10, fontWeight: 600, color: C.ok }}>{"✓"}</span>}
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
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      {s.url && (
                        <a href={s.url} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 11, color: C.purple, textDecoration: "none", padding: "4px 8px", border: `1px solid ${C.purple}25`, borderRadius: 5, fontFamily: FONT, fontWeight: 500 }}>
                          {"↗"}
                        </a>
                      )}
                      {!alreadyIn && !expired && !isByInvite && (
                        <button onClick={() => addScoutToPipeline(s)}
                          style={{ fontSize: 11, color: C.primary, padding: "4px 8px", border: `1px solid ${C.primary}30`, borderRadius: 5, background: "none", cursor: "pointer", fontFamily: FONT, fontWeight: 600 }}>
                          + Add
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty state — no grants at all */}
      {grants.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 20px", color: C.t3 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.dark, marginBottom: 6 }}>No grants yet</div>
          <div style={{ fontSize: 13, color: C.t3, marginBottom: 20, maxWidth: 360, margin: "0 auto 20px" }}>
            Start by adding a grant manually, pasting a URL, or scouting for new opportunities.
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <Btn onClick={() => setShowAdd(true)} v="primary" style={{ fontSize: 13 }}>+ Add Grant</Btn>
            <Btn onClick={aiScout} disabled={scouting} v="ghost" style={{ fontSize: 13, color: C.purple, borderColor: C.purple + "40" }}>☉ Scout</Btn>
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
                  background: (stage.bg || C.bg) + "40", borderRadius: 14, padding: 8,
                  border: `1.5px solid ${stage.c}30`,
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
                    return (
                      <div key={g.id} draggable onDragStart={() => setDragId(g.id)}
                        onClick={() => onSelectGrant(g.id)}
                        style={{
                          background: C.white, borderRadius: 14, padding: "12px 14px",
                          border: `1.5px solid ${stage.c}30`,
                          cursor: "pointer",
                          boxShadow: C.cardShadow,
                          transition: "box-shadow 0.15s, transform 0.15s",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.boxShadow = C.cardShadowHover; e.currentTarget.style.transform = "translateY(-2px)"; }}
                        onMouseLeave={e => { e.currentTarget.style.boxShadow = C.cardShadow; e.currentTarget.style.transform = "none"; }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.dark, marginBottom: 4, lineHeight: 1.3 }}>{g.name}</div>
                        <div style={{ fontSize: 11, color: C.t3, marginBottom: 6 }}>{g.funder}</div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <Avatar member={m} size={20} />
                            <span style={{ fontSize: 12, fontWeight: 600, color: g.ask > 0 ? C.t2 : C.t4, fontFamily: MONO }}>{g.ask > 0 ? fmtK(g.ask) : g.funderBudget ? `~${fmtK(g.funderBudget)}` : "TBD"}</span>
                          </div>
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
      )}

      {/* List view — navy header */}
      {pView === "list" && filtered.length > 0 && (
        <div style={{ background: C.white, borderRadius: 16, border: "none", overflow: "hidden", boxShadow: C.cardShadow }}>
          <div style={{
            display: "grid", gridTemplateColumns: "2fr 1.5fr 140px 100px 90px 70px",
            padding: "10px 16px", background: C.navy, borderRadius: "16px 16px 0 0",
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
                  background: ac.bg + "30", borderRadius: 14, padding: 8,
                  border: `1.5px solid ${ac.accent}30`,
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
                            background: C.white, borderRadius: 14, padding: "12px 14px",
                            border: `1.5px solid ${(stg?.c || C.t4)}30`,
                            cursor: "pointer", boxShadow: C.cardShadow,
                            transition: "box-shadow 0.15s, transform 0.15s",
                          }}
                          onMouseEnter={e => { e.currentTarget.style.boxShadow = C.cardShadowHover; e.currentTarget.style.transform = "translateY(-2px)"; }}
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
