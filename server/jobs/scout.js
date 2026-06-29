/**
 * Automated Scout Job — runs nightly via cron
 *
 * Searches for new grant opportunities using the same prompt and logic
 * as the frontend scout, but runs server-side without user interaction.
 * Only auto-adds High-fit results. Medium-fit results are logged but not added.
 */

import { scoutPrompt } from '../../src/prompts.js';
import { callOpenAI } from '../lib/ai.js';
import { SOURCES } from '../scraper/sources.js';
import { scrapeGrants, verifyLinks } from '../scraper/scrapeGrants.js';
import { getAllOrgs, getGrants, upsertGrant, logAgentRun, getOrgProfile } from '../db.js';
import crypto from 'crypto';

const uid = () => crypto.randomBytes(8).toString('hex');
const td = () => new Date().toISOString().slice(0, 10);

// ── Parse scout results (same logic as frontend) ──
function parseScoutResults(text) {
  try {
    const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const start = clean.indexOf('[');
    const end = clean.lastIndexOf(']');
    if (start >= 0 && end > start) {
      const arr = JSON.parse(clean.substring(start, end + 1));
      if (Array.isArray(arr) && arr.length > 0 && arr[0].name) return arr;
    }
  } catch { /* fall through */ }
  return null;
}

// ── Calculate fit score (same logic as frontend) ──
export function calcScoutFitScore(s) {
  let score = 40;
  const goodFocus = ['Youth Employment', 'Digital Skills', 'AI/4IR', 'Education', 'STEM', 'Work Readiness'];
  const focusHits = (s.focus || []).filter(f => goodFocus.includes(f)).length;
  score += Math.min(focusHits * 8, 24);
  const budget = Number(s.funderBudget || s.ask) || 0;
  if (budget >= 200000 && budget <= 5000000) score += 12;
  else if (budget > 0 && budget < 200000) score += 4;
  else if (budget > 5000000) score += 6;
  const acc = (s.access || '').toLowerCase();
  if (acc === 'open') score += 10;
  else if (acc.includes('relationship')) score += 4;
  if (s.fit === 'High') score += 10;
  else if (s.fit === 'Medium') score += 4;
  const typ = (s.type || '').toLowerCase();
  if (typ.includes('foundation') || typ.includes('csi')) score += 4;
  if (typ.includes('seta')) score += 3;
  if (s.deadline) {
    const dl = new Date(s.deadline);
    const now = new Date();
    if (dl > now) score += 4;
    const daysLeft = (dl - now) / 86400000;
    if (daysLeft > 14 && daysLeft < 180) score += 3;
  }
  return Math.min(100, Math.max(0, Math.round(score)));
}

// ── Type mapping (same as frontend) ──
const SCOUT_TYPE_MAP = {
  corporate: 'Corporate CSI', csi: 'Corporate CSI',
  government: 'Government/SETA', seta: 'Government/SETA',
  international: 'International', global: 'International',
  foundation: 'Foundation', trust: 'Foundation',
  tech: 'Tech Company',
};

export function mapType(rawType) {
  const key = Object.keys(SCOUT_TYPE_MAP).find(k => (rawType || '').toLowerCase().includes(k));
  return SCOUT_TYPE_MAP[key] || 'Foundation';
}

// ── Build a grant object from scout result ──
export function scoutResultToGrant(s) {
  const funderBudget = Number(s.funderBudget || s.ask) || 0;
  const accessLine = s.access ? `\nAccess: ${s.access}${s.accessNote ? ' — ' + s.accessNote : ''}` : '';
  const notes = `${s.reason || ''}${s.url ? '\nApply: ' + s.url : ''}${accessLine}`;
  const scoutedMarket = s.market || (s.type === 'International' ? 'global' : 'sa');

  return {
    id: uid(),
    name: s.name || 'New Grant',
    funder: s.funder || 'Unknown',
    type: mapType(s.type),
    stage: 'scouted',
    ask: 0,
    funderBudget,
    askSource: null,
    aiRecommendedAsk: null,
    deadline: s.deadline || null,
    focus: s.focus || ['Youth Employment', 'Digital Skills'],
    geo: [],
    rel: 'Cold',
    pri: 3,
    hrs: 0,
    notes,
    market: scoutedMarket,
    log: [{ d: td(), t: `Auto-scouted${s.sourceKey ? ` via ${s.sourceKey}` : ''} · funder budget R${funderBudget.toLocaleString()}${s.access ? ` · ${s.access}` : ''} · fit ${s.fitScore || '?'}%` }],
    on: '',
    of: [],
    owner: 'team',
    docs: {},
    fups: [],
    subDate: null,
    applyUrl: s.url || '',
    applyLinkKind: s.applyLinkKind || 'unknown',
    applyLinkKindAt: s.applyLinkKind && s.applyLinkKind !== 'unknown' ? new Date().toISOString() : null,
  };
}

// ── Main scout job ──
export async function runAutoScout() {
  const start = Date.now();
  console.log(`[Scout] Starting automated scout at ${new Date().toISOString()}`);

  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    console.warn('[Scout] No OPENAI_API_KEY or ANTHROPIC_API_KEY — skipping');
    return;
  }

  let orgs;
  try {
    orgs = await getAllOrgs();
  } catch (err) {
    console.error('[Scout] Failed to load orgs:', err.message);
    return;
  }

  // Scrape real sources once (grant-database APIs + RSS feeds + funder pages),
  // then share the results across all orgs — each org scores/dedupes its own.
  // Parsing uses Claude Haiku when ANTHROPIC_API_KEY is set, else OpenAI.
  const scraped = await scrapeAllSources();

  for (const org of orgs) {
    try {
      await scoutForOrg(org, scraped);
    } catch (err) {
      console.error(`[Scout] Failed for org ${org.slug}:`, err.message);
    }
  }

  console.log(`[Scout] Completed in ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

// ── Scrape every configured source; tolerate per-source failures ──
async function scrapeAllSources() {
  const all = [];
  for (const source of SOURCES) {
    // Skip sources that need an env key that isn't configured (e.g. IATI).
    if (source.requiresEnv && !process.env[source.requiresEnv]) {
      console.log(`[Scout] scraper:${source.key}: skipped (${source.requiresEnv} not set)`);
      continue;
    }
    try {
      const { found, grants } = await scrapeGrants(source);
      console.log(`[Scout] scraper:${source.key}: ${found} found, ${grants.length} usable`);
      all.push(...grants);
    } catch (err) {
      console.error(`[Scout] scraper:${source.key} failed:`, err.message);
    }
  }
  return all;
}

async function scoutForOrg(org, scraped = []) {
  const CLOSED = ['won', 'lost', 'deferred', 'archived'];

  // 1. Load existing grants + org profile for context
  const grants = await getGrants(org.id);
  const existingFunders = [...new Set(
    grants.filter(g => !CLOSED.includes(g.stage)).map(g => (g.funder || '').toLowerCase())
  )].join(', ');

  let orgContext = "";
  try {
    const profile = await getOrgProfile(org.id);
    orgContext = profile?.context_slim || profile?.mission || org.name || "";
  } catch { /* profile not set — use empty context */ }

  let totalAdded = 0;
  let totalUpdated = 0;
  let totalFlagged = 0;
  let totalFound = 0;

  const norm = (v) => (v || '').toString().toLowerCase().trim();
  const normUrl = (u) => norm(u).replace(/[#?].*$/, '').replace(/\/+$/, '');

  // Identity indexes over the org's existing grants: prefer apply-URL match,
  // fall back to funder+name. This lets us tell "same opportunity" (reconcile)
  // from "genuinely new" (add) — and the maps are updated as we go so a result
  // appearing twice in one run (e.g. from a feed and the AI scout) is reconciled
  // against what we just added, not duplicated.
  const byUrl = new Map();
  const byName = new Map();
  const indexGrant = (g) => {
    if (g.applyUrl) byUrl.set(normUrl(g.applyUrl), g);
    byName.set(`${norm(g.funder)}::${norm(g.name)}`, g);
  };
  grants.forEach(indexGrant);

  // Untouched = still 'scouted' and unassigned → safe for the bot to auto-update.
  const isUntouched = (g) => g.stage === 'scouted' && (!g.owner || g.owner === 'team');

  // Reconcile one high-fit result against the pipeline.
  const reconcile = async (s, label) => {
    const sUrl = s.url ? normUrl(s.url) : '';
    const existing = (sUrl && byUrl.get(sUrl)) || byName.get(`${norm(s.funder)}::${norm(s.name)}`);

    // (a) No match → brand-new opportunity → add it.
    if (!existing) {
      const grant = scoutResultToGrant(s);
      await upsertGrant(org.id, grant);
      indexGrant(grant);
      totalAdded++;
      console.log(`[Scout] ${org.slug}: added "${s.name}" from ${s.funder} (fit ${s.fitScore}%, ${label})`);
      return;
    }

    // (b) Match → compare the factual fields to decide unchanged vs updated.
    const changes = [];
    const newDeadline = s.deadline || null;
    if (newDeadline && newDeadline !== (existing.deadline || null)) {
      changes.push({ field: 'deadline', from: existing.deadline || '—', to: newDeadline });
    }
    const newBudget = Number(s.funderBudget || s.ask) || 0;
    if (newBudget && newBudget !== Number(existing.funderBudget || 0)) {
      changes.push({ field: 'funderBudget', from: Number(existing.funderBudget || 0), to: newBudget });
    }
    if (s.url && normUrl(s.url) !== normUrl(existing.applyUrl || '')) {
      changes.push({ field: 'applyUrl', from: existing.applyUrl || '—', to: s.url });
    }

    if (changes.length === 0) return; // genuinely the same, nothing changed → ignore

    const summary = changes.map(c =>
      c.field === 'funderBudget' ? `funder budget R${Number(c.from).toLocaleString()} → R${Number(c.to).toLocaleString()}`
      : c.field === 'applyUrl' ? 'apply link updated'
      : `deadline ${c.from} → ${c.to}`
    ).join('; ');

    if (isUntouched(existing)) {
      // Auto-apply the new facts onto the still-untouched card + log what changed.
      for (const c of changes) {
        if (c.field === 'deadline') existing.deadline = c.to;
        else if (c.field === 'funderBudget') existing.funderBudget = c.to;
        else if (c.field === 'applyUrl') {
          existing.applyUrl = c.to;
          // The link changed — refresh its quality classification from this scout pass.
          existing.applyLinkKind = s.applyLinkKind || 'unknown';
          existing.applyLinkKindAt = s.applyLinkKind && s.applyLinkKind !== 'unknown' ? new Date().toISOString() : null;
        }
      }
      existing.log = [...(existing.log || []), { d: td(), t: `Scout update (${label}): ${summary}` }];
      await upsertGrant(org.id, existing);
      totalUpdated++;
      console.log(`[Scout] ${org.slug}: updated "${existing.name}" — ${summary}`);
    } else {
      // Human-owned/advanced → never overwrite; append a review flag to its log.
      existing.log = [...(existing.log || []), { d: td(), t: `⚠ Scout flag (${label}): funder may have changed ${summary} — review` }];
      await upsertGrant(org.id, existing);
      totalFlagged++;
      console.log(`[Scout] ${org.slug}: flagged "${existing.name}" for review — ${summary}`);
    }
  };

  // Reconcile every High-fit result (score >= 65); medium-fit is logged only.
  const addHighFit = async (scored, label) => {
    for (const s of scored.filter(x => x.fitScore >= 65)) {
      try {
        await reconcile(s, label);
      } catch (err) {
        console.error(`[Scout] ${org.slug}: reconcile failed for "${s.name}":`, err.message);
      }
    }
    const medFit = scored.filter(s => s.fitScore >= 40 && s.fitScore < 65);
    if (medFit.length > 0) {
      console.log(`[Scout] ${org.slug}/${label}: ${medFit.length} medium-fit results not auto-added: ${medFit.map(s => s.funder).join(', ')}`);
    }
  };

  // 2. Scraped sources first — real listings from grant APIs/feeds (already scored)
  if (scraped.length > 0) {
    totalFound += scraped.length;
    await addHighFit(scraped, 'scraper');
  }

  // 3. AI web-search scout for both markets
  const markets = ['sa', 'global'];
  if (process.env.OPENAI_API_KEY) {
    for (const market of markets) {
      console.log(`[Scout] ${org.slug}: searching ${market} market...`);

      const prompt = scoutPrompt({ existingFunders, market, orgContext });

      let text;
      try {
        text = await callOpenAI(prompt.system, prompt.user, {
          search: prompt.search,
          maxTokens: prompt.maxTok,
        });
      } catch (err) {
        console.error(`[Scout] ${org.slug}/${market}: OpenAI call failed:`, err.message);
        continue;
      }

      const parsed = parseScoutResults(text);
      if (!parsed || parsed.length === 0) {
        console.log(`[Scout] ${org.slug}/${market}: no results parsed`);
        continue;
      }

      totalFound += parsed.length;
      const scored = parsed.map(s => ({ ...s, fitScore: calcScoutFitScore(s) }));

      // Parity with the scraper path: drop past-deadline results, and verify the
      // model-produced links via the playwright-service (drops verified-dead
      // links; keeps them when the service is unavailable). Also runs the SSRF
      // guard before any navigation.
      const statusMap = await verifyLinks(scored.map(s => s.url));
      const todayStr = td();
      const clean = scored.filter(s => {
        if (s.deadline && s.deadline < todayStr) return false;
        const st = s.url ? statusMap.get(s.url) : null;
        if (st && !st.ok) {
          console.log(`[Scout] ${org.slug}/${market}: dropped dead link for "${s.name}" (${st.status})`);
          return false;
        }
        return true;
      });
      // Carry the apply-page classification from verification onto each result.
      for (const s of clean) {
        const st = s.url ? statusMap.get(s.url) : null;
        s.applyLinkKind = st ? (st.applyKind || 'unknown') : 'unknown';
      }
      await addHighFit(clean, market);
    }
  }

  // 4. Audit log
  try {
    await logAgentRun(org.id, {
      agent_type: 'auto-scout',
      grant_id: null,
      prompt_summary: `Nightly auto-scout: ${SOURCES.length} scraper sources + ${markets.join('+')} markets`,
      result_summary: `Found ${totalFound}; added ${totalAdded}, updated ${totalUpdated}, flagged ${totalFlagged}`,
      tokens_in: 0,
      tokens_out: 0,
      duration_ms: 0,
      status: 'completed',
      member_id: null,
    });
  } catch { /* best-effort */ }

  console.log(`[Scout] ${org.slug}: done — found ${totalFound}, added ${totalAdded}, updated ${totalUpdated}, flagged ${totalFlagged}`);
}
