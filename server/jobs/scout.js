/**
 * Automated Scout Job — runs nightly via cron
 *
 * Searches for new grant opportunities using the same prompt and logic
 * as the frontend scout, but runs server-side without user interaction.
 * Only auto-adds High-fit results. Medium-fit results are logged but not added.
 */

import { scoutPrompt } from '../../src/prompts.js';
import { callOpenAI } from '../routes/ai.js';
import { SOURCES } from '../scraper/sources.js';
import { scrapeGrants } from '../scraper/scrapeGrants.js';
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
  let totalFound = 0;
  const seenNames = new Set(grants.map(g => `${(g.funder || '').toLowerCase()}::${(g.name || '').toLowerCase()}`));

  // Auto-add High fit (score >= 65). Dedupe at the (funder, name) level via
  // seenNames — NOT at the funder level, so renewal/new opportunities from a
  // funder already in the pipeline (the bread-and-butter for a returning-funder
  // NPO) still come through. Only an exact funder+name repeat is suppressed.
  const addHighFit = async (scored, label) => {
    for (const s of scored.filter(x => x.fitScore >= 65)) {
      const funderKey = (s.funder || '').toLowerCase();
      const nameKey = `${funderKey}::${(s.name || '').toLowerCase()}`;
      if (seenNames.has(nameKey)) {
        console.log(`[Scout] ${org.slug}: skip ${s.funder} — "${s.name}" (already in pipeline)`);
        continue;
      }
      const grant = scoutResultToGrant(s);
      try {
        await upsertGrant(org.id, grant);
        seenNames.add(nameKey);
        totalAdded++;
        console.log(`[Scout] ${org.slug}: added "${s.name}" from ${s.funder} (fit: ${s.fitScore}%, ${label})`);
      } catch (err) {
        console.error(`[Scout] ${org.slug}: failed to add ${s.name}:`, err.message);
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
      await addHighFit(scored, market);
    }
  }

  // 4. Audit log
  try {
    await logAgentRun(org.id, {
      agent_type: 'auto-scout',
      grant_id: null,
      prompt_summary: `Nightly auto-scout: ${SOURCES.length} scraper sources + ${markets.join('+')} markets`,
      result_summary: `Found ${totalFound}, added ${totalAdded} high-fit opportunities`,
      tokens_in: 0,
      tokens_out: 0,
      duration_ms: 0,
      status: 'completed',
      member_id: null,
    });
  } catch { /* best-effort */ }

  console.log(`[Scout] ${org.slug}: done — found ${totalFound}, added ${totalAdded}`);
}
