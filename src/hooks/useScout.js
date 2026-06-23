import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { uid, td, isGroundingRedirect, isUsableUrl, normaliseFunder } from "@/utils";
import { scoutPrompt, scoutBriefPrompt } from "@/prompts";
import { kvGet, kvSet, verifyUrls } from "@/api";
import { CLOSED_STAGES } from "@/data/constants";
import useAsyncAction from "@/hooks/useAsyncAction";
import useKvState from "@/hooks/useKvState";

/* ── Constants ── */
export const SCOUT_TYPE_MAP = { corporate: "Corporate CSI", csi: "Corporate CSI", government: "Government/SETA", seta: "Government/SETA", international: "International", foundation: "Foundation", tech: "Tech Company", credit: "Tech Credit", "in-kind": "In-Kind", partnership: "Partnership", development: "Development Agency", impact: "Impact Investor" };

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

/* ── Scout data-quality helpers ── */
// Levenshtein distance for fuzzy title matching
const levenshtein = (a, b) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = []; for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      m[i][j] = b.charAt(i - 1) === a.charAt(j - 1)
        ? m[i - 1][j - 1]
        : Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
    }
  }
  return m[b.length][a.length];
};

const titlesSimilar = (a, b) => {
  const na = normaliseFunder(a), nb = normaliseFunder(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length < 8 || nb.length < 8) return false;
  return levenshtein(na, nb) < 4;
};

// Detect a URL that's just the funder's homepage (no application path)
const isHomepageOnly = (url) => {
  if (!url) return false;
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, "");
    return path === "" || path === "/" || path === "/index" || path === "/home";
  } catch { return false; }
};

// Detect an AI/API error string so we never persist or display it as a real result
const isApiErrorString = (s) => {
  if (!s) return false;
  return /^(Rate limit reached|Error[: (]|Connection error:|The AI service is temporarily overloaded|No response|Request failed after)/i.test(s.trim());
};

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

/**
 * Scout view-model. Owns the AI scout execution (search + parse + dedup + URL
 * verification + confidence scoring), the scout brief (load/generate/persist),
 * the rejection store, the results state + sort/filter, the derived
 * display/stats, and add-to-pipeline. The component renders from this and only
 * keeps transient UI input state (editable brief text, sort/filter dropdowns).
 *
 * Actions take arguments rather than reading component input state, so the
 * component passes the live values in (scoutMarket, keywords) at call time.
 *
 * @param orgContext   the org profile string injected into scout prompts
 * @param grants       current pipeline grants (for existing-funder dedup)
 * @param onAddGrant   (grant) callback to add a scouted grant to the pipeline
 * @param onScoutingChange optional (bool) callback to mirror busy state upward
 * @param api          (system, user, search, maxTok) AI proxy
 */
export default function useScout({ orgContext, grants, onAddGrant, onScoutingChange, api }) {
  // Mirror busy state upward whenever it changes (parent toolbar button).
  const [scouting, _setScouting] = useState(false);
  const onScoutingChangeRef = useRef(onScoutingChange);
  onScoutingChangeRef.current = onScoutingChange;
  const setScouting = useCallback((v) => { _setScouting(v); onScoutingChangeRef.current?.(v); }, []);

  const [scoutResults, setScoutResults] = useState([]);

  // Sort/filter selection lives in the component (UI dropdowns); the hook only
  // derives display from whatever criteria the component passes in.

  // Scout brief — canonical persisted value lives here; the component owns the
  // transient "dirty" flag and editing of the textarea text via setScoutBrief.
  const [scoutBrief, setScoutBrief] = useState("");

  // Rejection store — KV-backed.
  const { value: scoutRejections, setValue: setScoutRejections } =
    useKvState("scout_rejections", []);

  // Load (and sanitise) the persisted brief on mount.
  useEffect(() => {
    kvGet("scout_brief").catch(() => null).then((brief) => {
      if (!brief) return;
      const text = (typeof brief === "string" ? brief : brief.value || "").trim();
      if (text && !isApiErrorString(text)) setScoutBrief(text);
      else if (text) kvSet("scout_brief", "").catch(() => {}); // purge stale error string
    });
  }, []);

  /* ── Scout Brief: generate org identity distillation ── */
  // Returns the brief string (or "" on failure). Wrapped via useAsyncAction so
  // busy/error are handled consistently; the AI-error predicate matches the
  // original isApiErrorString gate.
  const briefAction = useAsyncAction(
    async () => {
      if (!orgContext) return "";
      const p = scoutBriefPrompt(orgContext);
      const result = await api(p.system, p.user, p.search, p.maxTok);
      return (result || "").trim();
    },
    { isError: isApiErrorString }
  );

  const generateScoutBrief = useCallback(async () => {
    const brief = await briefAction.run();
    // briefAction.run() returns null when the result is an API-error string.
    if (brief && !isApiErrorString(brief)) {
      setScoutBrief(brief);
      kvSet("scout_brief", brief).catch(() => {});
      return brief;
    }
    return "";
  }, [briefAction]);

  // Persist a brief edit (used by the component's textarea on blur / explicit save).
  const saveScoutBrief = useCallback((text) => {
    setScoutBrief(text);
    kvSet("scout_brief", text).catch(() => {});
  }, []);

  const clearScoutRejections = useCallback(() => {
    setScoutRejections([]);
  }, [setScoutRejections]);

  /* ── Scout: reject a result ── */
  const rejectScoutResult = useCallback((s, reasonKey, freeText) => {
    const rejection = {
      funder: s.funder, name: s.name, reason: reasonKey,
      reasonText: freeText || "", date: new Date().toISOString().slice(0, 10),
      focus: s.focus || [],
    };
    setScoutRejections(prev => [...(prev || []), rejection]);
    setScoutResults(prev => prev.map(x =>
      x.name === s.name && x.funder === s.funder ? { ...x, rejected: true, rejectReason: reasonKey } : x
    ));
  }, [setScoutRejections]);

  /* ── Scout: AI search for new grant opportunities ── */
  // Keep the latest values in refs so the action (run via useAsyncAction) always
  // sees fresh brief/rejections/grants without re-creating the callback.
  const scoutBriefRef = useRef(scoutBrief); scoutBriefRef.current = scoutBrief;
  const scoutRejectionsRef = useRef(scoutRejections); scoutRejectionsRef.current = scoutRejections;
  const grantsRef = useRef(grants); grantsRef.current = grants;

  const runScout = useCallback(async ({ market = "both", keywords = "" } = {}) => {
    setScouting(true);
    setScoutResults([]);
    const activeGrants = grantsRef.current.filter(g => !CLOSED_STAGES.includes(g.stage));
    const existing = activeGrants.map(g => g.funder.toLowerCase());
    const existingNormalised = new Set(activeGrants.map(g => normaliseFunder(g.funder)));
    const existingFunders = [...new Set(existing)].join(", ");

    // Auto-generate scout brief if empty
    let brief = scoutBriefRef.current;
    if (!brief && orgContext) {
      brief = await generateScoutBrief();
    }

    const promptArgs = { existingFunders, orgContext, scoutBrief: brief, rejections: scoutRejectionsRef.current, keywords: (keywords || "").trim() };
    let allParsed = [];

    if (market === "both") {
      // Run SA then Global sequentially with a brief pause — keeps us under
      // free-tier Gemini RPM limits (search-grounded calls count heavier).
      const pSA = scoutPrompt({ ...promptArgs, market: "sa" });
      const rSA = await api(pSA.system, pSA.user, pSA.search, pSA.maxTok);
      await new Promise(r => setTimeout(r, 4500));
      const pGlobal = scoutPrompt({ ...promptArgs, market: "global" });
      const rGlobal = await api(pGlobal.system, pGlobal.user, pGlobal.search, pGlobal.maxTok);
      const parsedSA = parseScoutResults(rSA) || [];
      const parsedGlobal = parseScoutResults(rGlobal) || [];
      allParsed = [...parsedSA, ...parsedGlobal];
    } else {
      const p = scoutPrompt({ ...promptArgs, market });
      const r = await api(p.system, p.user, p.search, p.maxTok);
      allParsed = parseScoutResults(r) || [];
    }

    if (!allParsed.length) allParsed = SCOUT_FALLBACK;

    // Phase 2: drop results with no URL — hallucination shield
    allParsed = allParsed.filter(s => s.url && typeof s.url === "string" && s.url.trim().length > 0);

    // Phase 2: stronger de-dup using normalised funder names + fuzzy title match
    const dedup = [];
    for (const s of allParsed) {
      const nf = normaliseFunder(s.funder);
      const isDupe = dedup.some(d => normaliseFunder(d.funder) === nf && titlesSimilar(d.name, s.name));
      if (!isDupe) dedup.push(s);
    }
    allParsed = dedup;

    // Pre-mark results if funder was previously rejected
    const rejectedFunders = new Set((scoutRejectionsRef.current || []).map(r => (r.funder || "").toLowerCase()));

    // Tag confidence based on what we know
    const scored = allParsed.map(s => {
      const fitScore = calcScoutFitScore(s);
      const acc = (s.access || "").toLowerCase();
      // Confidence: combine AI self-rating with heuristics
      const aiConf = (s.sourceConfidence || "").toLowerCase();
      const genericLink = isHomepageOnly(s.url);
      let confidence = "medium";
      if (aiConf === "verified" && acc === "open" && s.url && s.deadline && !genericLink) confidence = "high";
      else if (aiConf === "verified" && s.url && !genericLink) confidence = "high";
      else if (aiConf === "uncertain" || !s.url || acc === "unknown" || genericLink) confidence = "low";
      else if (aiConf === "likely") confidence = "medium";
      const sNorm = normaliseFunder(s.funder);
      return {
        ...s,
        fitScore,
        confidence,
        genericLink,
        urlStatus: null, // will be filled by async verification
        inPipeline: existingNormalised.has(sNorm) || existing.includes((s.funder || "").toLowerCase()),
        rejected: rejectedFunders.has((s.funder || "").toLowerCase()),
        added: false,
      };
    }).sort((a, b) => b.fitScore - a.fitScore);

    setScoutResults(scored);
    setScouting(false);

    // Async URL verification — runs after results are displayed.
    // Also RESOLVES Gemini grounding-redirect URLs to their final destinations:
    // verifyUrls follows redirects, so check.redirect contains the real URL.
    const urlsToCheck = scored.filter(s => s.url && !s.rejected).map(s => s.url);
    if (urlsToCheck.length > 0) {
      try {
        const urlResults = await verifyUrls(urlsToCheck);
        const urlMap = {};
        for (const r of urlResults) urlMap[r.url] = r;
        setScoutResults(prev => prev.map(s => {
          if (!s.url || !urlMap[s.url]) return s;
          const check = urlMap[s.url];
          // If the original was a grounding redirect AND we followed to a real URL, swap it in.
          let resolvedUrl = s.url;
          if (isGroundingRedirect(s.url) && check.redirect && isUsableUrl(check.redirect)) {
            resolvedUrl = check.redirect;
          }
          const urlStatus = check.ok ? "verified" : check.status === 0 ? "dead" : "warning";
          // If after resolution the URL is STILL a grounding redirect or unreachable, the result is unusable.
          const stillBad = isGroundingRedirect(resolvedUrl) || (!check.ok && check.status === 0);
          const confidence = stillBad ? "low" : urlStatus === "dead" ? "low" : s.confidence;
          // Prefer the server's verified apply-page classification; fall back to the
          // URL-path heuristic (genericLink) when verification couldn't judge.
          const applyLinkKind = check.applyKind && check.applyKind !== "unknown"
            ? check.applyKind
            : (s.genericLink ? "homepage-only" : "unknown");
          return { ...s, url: resolvedUrl, urlStatus, confidence, applyLinkKind };
        }));
      } catch { /* URL verification is best-effort */ }
    }
    return scored;
    // generateScoutBrief / api / orgContext are stable enough; refs cover the rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgContext, api, generateScoutBrief, setScouting]);

  // `aiScout` is the public handler exposed via the ref contract. It reads the
  // sort reset behaviour the original had (default to "fit" after a run) — the
  // component owns the sort state, so it passes a reset callback in.
  const aiScout = useCallback(async (opts = {}) => {
    const { onSortReset, ...args } = opts;
    const scored = await runScout(args);
    onSortReset?.("fit");
    return scored;
  }, [runScout]);

  const addScoutToPipeline = useCallback((s) => {
    const gType = SCOUT_TYPE_MAP[Object.keys(SCOUT_TYPE_MAP).find(k => (s.type || "").toLowerCase().includes(k))] || "Foundation";
    const funderBudget = Number(s.funderBudget || s.ask) || 0;
    const accessLine = s.access ? `\nAccess: ${s.access}${s.accessNote ? " — " + s.accessNote : ""}` : "";
    // Only embed the URL in notes / save to applyUrl if it's a real usable URL.
    // Grounding redirects from Gemini look real but only resolve inside the AI session.
    const usableUrl = isUsableUrl(s.url) ? s.url : "";
    const notes = `${s.reason || ""}${usableUrl ? "\nApply: " + usableUrl : ""}${accessLine}`;
    // Store funder's raw budget — ask will be set after proposal generation
    const scoutedMarket = s.market || (s.type === "International" ? "global" : "sa");
    const newG = {
      id: uid(), name: s.name || "New Grant", funder: s.funder || "Unknown", type: gType,
      stage: "scouted", ask: 0, funderBudget, askSource: null, aiRecommendedAsk: null,
      deadline: s.deadline || null,
      focus: s.focus || ["Youth Employment", "Digital Skills"], geo: [], rel: "Cold", pri: 3, hrs: 0,
      notes, market: scoutedMarket, source: "scout",
      log: [{ d: td(), t: `Scouted by AI · funder budget R${funderBudget.toLocaleString()}${s.access ? ` · ${s.access}` : ""} · ask TBD` }],
      on: "", of: [], owner: "team", docs: {}, fups: [], subDate: null, applyUrl: usableUrl,
      applyLinkKind: s.applyLinkKind || (s.genericLink ? "homepage-only" : "unknown"),
      applyLinkKindAt: (s.applyLinkKind && s.applyLinkKind !== "unknown") ? new Date().toISOString() : null,
    };
    onAddGrant(newG);
    setScoutResults(prev => prev.map(x => x.name === s.name && x.funder === s.funder ? { ...x, added: true } : x));
    return newG;
  }, [onAddGrant]);

  const dismissResults = useCallback(() => setScoutResults([]), []);

  // Single-pass scout stats (replaces 5 separate .filter() calls)
  const scoutStats = useMemo(() => {
    let added = 0, expired = 0, open = 0, rel = 0, inv = 0, rejected = 0, urlOk = 0, urlDead = 0, highConf = 0, lowConf = 0;
    const now = new Date();
    for (const s of scoutResults) {
      if (s.rejected) rejected++;
      if (s.added) added++;
      if (s.deadline && new Date(s.deadline) < now) expired++;
      const acc = (s.access || "").toLowerCase();
      if (acc === "open") open++;
      else if (acc.includes("relationship")) rel++;
      else if (acc.includes("invitation")) inv++;
      if (s.urlStatus === "verified") urlOk++;
      else if (s.urlStatus === "dead") urlDead++;
      if (s.confidence === "high") highConf++;
      else if (s.confidence === "low") lowConf++;
    }
    return { added, expired, open, rel, inv, rejected, urlOk, urlDead, highConf, lowConf };
  }, [scoutResults]);

  // Memoized sorted/filtered scout results — rejected cards sort to bottom.
  // `sort`/`fitFilter`/`showUncertain` are passed in (component-owned UI state).
  const scoutDisplay = useCallback(({ sort = "fit", fitFilter = "all", showUncertain = false } = {}) => {
    let results = [...scoutResults];
    if (fitFilter === "high") results = results.filter(s => s.fitScore >= 70);
    else if (fitFilter === "medium") results = results.filter(s => s.fitScore >= 40);
    // Phase 2: hide low-confidence results unless user explicitly opts in
    if (!showUncertain) results = results.filter(s => s.confidence !== "low");
    // Single comparator: rejected cards always sort to bottom, then by selected criterion
    const bySort = (a, b) => {
      if (sort === "deadline") return (a.deadline || "9999").localeCompare(b.deadline || "9999");
      if (sort === "budget") return (Number(b.funderBudget || b.ask) || 0) - (Number(a.funderBudget || a.ask) || 0);
      return b.fitScore - a.fitScore; // default: fit
    };
    results.sort((a, b) => {
      const r = (a.rejected ? 1 : 0) - (b.rejected ? 1 : 0);
      return r !== 0 ? r : bySort(a, b);
    });
    return results;
  }, [scoutResults]);

  // Phase 2: count of hidden low-confidence results so the toggle has context
  const hiddenLowConfCount = useMemo(
    () => scoutResults.filter(s => s.confidence === "low").length,
    [scoutResults]
  );

  return {
    // state
    scouting,
    scoutResults, setScoutResults,
    scoutBrief, setScoutBrief, saveScoutBrief,
    scoutBriefLoading: briefAction.busy,
    scoutRejections,
    // derived
    scoutStats, scoutDisplay, hiddenLowConfCount,
    // actions
    aiScout, runScout,
    generateScoutBrief,
    rejectScoutResult,
    clearScoutRejections,
    addScoutToPipeline,
    dismissResults,
  };
}
