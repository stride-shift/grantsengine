import { useEffect, useRef } from "react";
import { isUsableUrl, isHomepageOnly, normaliseFunder, grantCompleteness, sanitizeNotes, detectUnsolicited, isAIError } from "../utils";
import { verifyUrls } from "../api";

// ── Background hygiene job — runs ONCE per (member, org) session after grants load.
// Four silent passes, in order:
//   1. Sanitize notes  — strip internal jargon (e.g. "1 x Type 3 cohort with stipends")
//   2. Dedupe          — same funder = same grant; keep most-complete, archive the rest
//   3. URL hygiene     — every active grant gets a working applyUrl. Missing URLs,
//                        dead links, AND bare-homepage URLs all trigger an AI search.
//                        Specific pages (form/info_page/contact) win over homepages.
//                        Verified before saving.
//   4. Funder brief    — pre-fetch published RFPs for Gov/SETA/International/Foundation
//                        grants that don't have one yet.
// No UI, no progress bar, no buttons. The user just sees the pipeline get cleaner.
//
// The gate is a ref keyed by (memberId + a version string). Bumping the version
// forces a re-run on next page load for everyone, which is what we want after
// any change to the URL/brief logic (e.g. the bare-homepage promotion).
//
// Lifted verbatim from App.jsx (Phase 4, move-only). The caller injects the
// pieces of App state/behaviour it closes over: setGrants (functional update),
// dSave (debounced persist), runAI, currentMember, grants, and toast.
const HYGIENE_VERSION = "v2-prefer-specific-urls";

export default function useHygiene({ grants, runAI, currentMember, setGrants, dSave, toast }) {
  const repairRanForRef = useRef(null);
  useEffect(() => {
    if (!grants || grants.length === 0) return;
    if (!runAI || !currentMember?.id) return;
    const gateKey = `${currentMember.id}|${HYGIENE_VERSION}`;
    if (repairRanForRef.current === gateKey) return;
    repairRanForRef.current = gateKey;

    const CLOSED = new Set(["won", "lost", "deferred", "archived"]);
    const initialGrants = grants;
    // Local mutable working copy so that successive passes touching the same
    // grant accumulate their patches in the server payload. Building the payload
    // from the frozen initialGrants snapshot would let a later pass clobber an
    // earlier pass's fields server-side. (The UI already merges correctly via
    // the functional setGrants below.)
    const working = new Map(initialGrants.map(g => [g.id, { ...g }]));

    const persist = (id, patch) => {
      setGrants(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x));
      const merged = { ...(working.get(id) || initialGrants.find(x => x.id === id) || {}), ...patch };
      working.set(id, merged);
      // silent: true — this is background work, server hiccups shouldn't toast
      // the user. We log to console instead so failures are still debuggable.
      dSave(id, merged, { silent: true });
    };

    (async () => {
      // ─── Pass 1: sanitize notes (regex, instant) ───
      let cleanedNotes = 0;
      for (const g of initialGrants) {
        const cleaned = sanitizeNotes(g.notes);
        if (cleaned !== g.notes && (cleaned || "").length !== (g.notes || "").length) {
          persist(g.id, { notes: cleaned });
          cleanedNotes++;
        }
      }

      // ─── Pass 1.5: deadline validation (instant) ───
      // Active grants with a deadline that has already passed by >90 days are
      // very likely stale — auto-archive with a note in the log so the team can
      // restore them if needed. Past-deadline grants within 90 days get an
      // outstanding action surfaced by OutstandingActions; we don't move those.
      const now = Date.now();
      let staleArchived = 0;
      for (const g of initialGrants) {
        if (CLOSED.has(g.stage)) continue;
        if (!g.deadline) continue;
        const d = new Date(g.deadline);
        if (isNaN(d.getTime())) continue;
        const daysPast = Math.floor((now - d.getTime()) / 86400000);
        if (daysPast > 90) {
          persist(g.id, {
            stage: "archived",
            _archivedFrom: g.stage,
            log: [...(g.log || []), { d: new Date().toISOString().slice(0, 10), t: `Auto-archived: deadline was ${daysPast} days past with stage still ${g.stage}`, by: "system" }],
          });
          staleArchived++;
        }
      }
      if (staleArchived > 0) console.log(`[hygiene] auto-archived ${staleArchived} stale (90d+ past deadline) grants`);

      // ─── Pass 1.6: detect "accepts unsolicited proposals" from notes (instant) ───
      // Only sets the field if it's unset AND we have a strong signal.
      let unsolicitedSet = 0;
      for (const g of initialGrants) {
        if (CLOSED.has(g.stage)) continue;
        if (g.acceptsUnsolicited === "yes" || g.acceptsUnsolicited === "no") continue;
        const detected = detectUnsolicited(g);
        if (detected !== "unknown") {
          persist(g.id, { acceptsUnsolicited: detected });
          unsolicitedSet++;
        }
      }
      if (unsolicitedSet > 0) console.log(`[hygiene] detected unsolicited-proposal policy on ${unsolicitedSet} grants`);

      // ─── Pass 2: dedupe by normalised funder name (instant) ───
      // For each cluster of active grants sharing a normalised funder, keep the most-
      // complete and archive the rest. Closed grants are left alone.
      const clusters = new Map();
      for (const g of initialGrants) {
        if (CLOSED.has(g.stage)) continue;
        const key = normaliseFunder(g.funder);
        if (!key) continue;
        if (!clusters.has(key)) clusters.set(key, []);
        clusters.get(key).push(g);
      }
      let archived = 0;
      for (const [, group] of clusters) {
        if (group.length < 2) continue;
        // Sort so the most-complete (highest score) is index 0; archive every other.
        group.sort((a, b) => grantCompleteness(b) - grantCompleteness(a));
        for (let i = 1; i < group.length; i++) {
          const d = group[i];
          persist(d.id, { stage: "archived", _archivedFrom: d.stage });
          archived++;
        }
      }

      // ─── Pass 3: URL hygiene (AI + verifyUrls, rate-limited) ───
      // After dedupe, only operate on grants we've kept (not archived in this pass).
      const archivedIds = new Set();
      for (const [, group] of clusters) {
        if (group.length < 2) continue;
        for (let i = 1; i < group.length; i++) archivedIds.add(group[i].id);
      }

      const liveGrants = initialGrants.filter(g => !CLOSED.has(g.stage) && !archivedIds.has(g.id));

      // First batch-check every existing applyUrl in one HEAD/GET sweep.
      const existingUrls = [...new Set(liveGrants.filter(g => isUsableUrl(g.applyUrl)).map(g => g.applyUrl))];
      let urlHealth = new Map();
      if (existingUrls.length > 0) {
        try {
          const results = await verifyUrls(existingUrls);
          for (const r of results) urlHealth.set(r.url, r);
        } catch { /* best-effort */ }
      }

      let fixed = 0, cleared = 0;
      for (let i = 0; i < liveGrants.length; i++) {
        const g = liveGrants[i];
        const current = g.applyUrl;
        // A "healthy" URL needs to (a) load, (b) not be a grounding redirect, AND
        // (c) not be a bare funder homepage — bare homepages were the wrong-default
        // result of the old priority-less verifier and should be re-resolved to a
        // more specific page (grants page, application form, etc.).
        const healthy = current && isUsableUrl(current) && !isHomepageOnly(current) && (urlHealth.get(current)?.ok === true);
        if (healthy) continue;

        // Ask AI for candidate URLs, try each until one loads.
        let savedNew = false;
        try {
          const raw = await runAI("findApplyUrl", g);
          if (isAIError(raw)) { await new Promise(r => setTimeout(r, 4500)); continue; }
          const txt = String(raw || "");

          // Parse structured candidates and keep pageType info so we can prefer specific
          // pages over the homepage when picking the winner.
          let typedCandidates = []; // [{ url, pageType }, ...]
          try {
            const cleaned = txt.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
            const sIdx = cleaned.indexOf("{"), eIdx = cleaned.lastIndexOf("}");
            if (sIdx >= 0 && eIdx > sIdx) {
              const parsed = JSON.parse(cleaned.slice(sIdx, eIdx + 1));
              if (Array.isArray(parsed.candidates)) {
                typedCandidates = parsed.candidates
                  .filter(c => c.url)
                  .map(c => ({ url: c.url, pageType: c.pageType || "info_page" }));
              } else if (parsed.url) {
                typedCandidates = [{ url: parsed.url, pageType: parsed.pageType || "info_page" }];
              }
            }
          } catch { /* fall through */ }

          // Extract URLs from raw text as fallback
          const seenUrls = new Set(typedCandidates.map(c => c.url));
          const urlMatches = (txt.match(/https?:\/\/[^\s"'<>)\]]+/gi) || []).map(u => u.replace(/[.,;:)\]}>]+$/, ""));
          for (const u of urlMatches) {
            if (!seenUrls.has(u)) { typedCandidates.push({ url: u, pageType: "info_page" }); seenUrls.add(u); }
          }

          // Synthesize funder homepage guesses as absolute-last-resort fallback
          const slug = (g.funder || "").toLowerCase()
            .replace(/\b(the|foundation|trust|fund|group|company|corporation|corp|inc|ltd|pty|sa|africa)\b/g, "")
            .replace(/[^a-z0-9]/g, "").trim();
          if (slug && slug.length >= 3) {
            for (const u of [`https://www.${slug}.co.za`, `https://${slug}.co.za`, `https://www.${slug}.com`, `https://www.${slug}.org`, `https://www.${slug}.org.za`]) {
              if (!seenUrls.has(u)) { typedCandidates.push({ url: u, pageType: "homepage" }); seenUrls.add(u); }
            }
          }

          // Filter to usable URLs, then sort by page-type priority so the homepage
          // is the LAST resort, not the first verified one.
          typedCandidates = typedCandidates.filter(c => isUsableUrl(c.url));
          const TYPE_PRIORITY = { form: 0, info_page: 1, contact: 2, homepage: 3 };
          typedCandidates.sort((a, b) => (TYPE_PRIORITY[a.pageType] ?? 1) - (TYPE_PRIORITY[b.pageType] ?? 1));

          if (typedCandidates.length > 0) {
            try {
              const check = await verifyUrls(typedCandidates.map(c => c.url));
              const statusMap = new Map((check || []).map(r => [r.url, r]));
              for (const c of typedCandidates) {
                if (statusMap.get(c.url)?.ok === true) {
                  persist(g.id, { applyUrl: c.url });
                  savedNew = true;
                  fixed++;
                  break;
                }
              }
            } catch { /* fall through */ }
          }
        } catch { /* swallow */ }

        // If we couldn't find a better URL: clear only if the current URL is actually
        // broken (didn't load). A bare-homepage URL that loads is still better than
        // nothing, so keep it rather than wiping the field.
        if (!savedNew && current && !healthy) {
          const currentLoads = urlHealth.get(current)?.ok === true;
          if (!currentLoads) {
            persist(g.id, { applyUrl: "" });
            cleared++;
          }
        }

        // Rate-limit between AI calls
        if (i < liveGrants.length - 1) await new Promise(r => setTimeout(r, 4500));
      }

      // ─── Pass 4: fetch published funder briefs for grants that don't have one yet ───
      // Same rate limit as URL hygiene. Runs after URL fixing so the AI has fresh
      // funder URLs to search from. Only attempts grants where briefs are likely to
      // exist (Government/SETA and International funders publish RFPs; most corporate
      // CSI funders don't).
      let briefsFilled = 0;
      const grantsNeedingBrief = liveGrants.filter(g => {
        if (g.funderBrief && g.funderBrief.trim().length > 50) return false;
        return ["Government/SETA", "International", "Foundation"].includes(g.type);
      });
      for (let i = 0; i < grantsNeedingBrief.length; i++) {
        const g = grantsNeedingBrief[i];
        try {
          const raw = await runAI("fetchFunderBrief", g);
          if (isAIError(raw)) { await new Promise(r => setTimeout(r, 4500)); continue; }
          const txt = String(raw || "").replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
          const sIdx = txt.indexOf("{"), eIdx = txt.lastIndexOf("}");
          let parsed = null;
          try { if (sIdx >= 0 && eIdx > sIdx) parsed = JSON.parse(txt.slice(sIdx, eIdx + 1)); } catch {}
          if (parsed?.brief && parsed.brief.length > 100) {
            const note = parsed.sourceUrl ? `\n\n---\nSource: ${parsed.sourceUrl}` : "";
            persist(g.id, { funderBrief: parsed.brief + note });
            briefsFilled++;
          }
        } catch { /* swallow */ }
        if (i < grantsNeedingBrief.length - 1) await new Promise(r => setTimeout(r, 4500));
      }

      // Final, single discrete toast — only if something actually changed
      const bits = [];
      if (cleanedNotes) bits.push(`cleaned ${cleanedNotes} note${cleanedNotes === 1 ? "" : "s"}`);
      if (archived) bits.push(`archived ${archived} duplicate${archived === 1 ? "" : "s"}`);
      if (fixed) bits.push(`fixed ${fixed} link${fixed === 1 ? "" : "s"}`);
      if (cleared) bits.push(`cleared ${cleared} dead link${cleared === 1 ? "" : "s"}`);
      if (briefsFilled) bits.push(`fetched ${briefsFilled} funder brief${briefsFilled === 1 ? "" : "s"}`);
      if (bits.length) toast(`Pipeline tidy-up: ${bits.join(", ")}.`, { type: "success", duration: 5000 });
    })();
  }, [grants, runAI, currentMember?.id]);
}
