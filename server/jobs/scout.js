/**
 * Automated Scout Job — runs nightly via cron
 *
 * Searches for new grant opportunities using the same prompt and logic
 * as the frontend scout, but runs server-side without user interaction.
 * Only auto-adds High-fit results. Medium-fit results are logged but not added.
 */

import { scoutPrompt } from '../../src/prompts.js';
import { callGemini } from '../routes/ai.js';
import { getAllOrgs, getGrants, upsertGrant, logAgentRun } from '../db.js';
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
function calcScoutFitScore(s) {
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

function mapType(rawType) {
  const key = Object.keys(SCOUT_TYPE_MAP).find(k => (rawType || '').toLowerCase().includes(k));
  return SCOUT_TYPE_MAP[key] || 'Foundation';
}

// ── Build a grant object from scout result ──
function scoutResultToGrant(s) {
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
    log: [{ d: td(), t: `Auto-scouted · funder budget R${funderBudget.toLocaleString()}${s.access ? ` · ${s.access}` : ''} · fit ${s.fitScore || '?'}%` }],
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

  if (!process.env.GEMINI_API_KEY) {
    console.warn('[Scout] No GEMINI_API_KEY — skipping');
    return;
  }

  let orgs;
  try {
    orgs = await getAllOrgs();
  } catch (err) {
    console.error('[Scout] Failed to load orgs:', err.message);
    return;
  }

  for (const org of orgs) {
    try {
      await scoutForOrg(org);
    } catch (err) {
      console.error(`[Scout] Failed for org ${org.slug}:`, err.message);
    }
  }

  console.log(`[Scout] Completed in ${((Date.now() - start) / 1000).toFixed(1)}s`);
}

async function scoutForOrg(org) {
  const CLOSED = ['won', 'lost', 'deferred', 'archived'];

  // 1. Load existing grants
  const grants = await getGrants(org.id);
  const existingFunders = [...new Set(
    grants.filter(g => !CLOSED.includes(g.stage)).map(g => (g.funder || '').toLowerCase())
  )].join(', ');

  // 2. Run scout for both markets
  const markets = ['sa', 'global'];
  let totalAdded = 0;
  let totalFound = 0;

  for (const market of markets) {
    console.log(`[Scout] ${org.slug}: searching ${market} market...`);

    const prompt = scoutPrompt({ existingFunders, market });

    let text;
    try {
      text = await callGemini(prompt.system, prompt.user, {
        search: prompt.search,
        maxTokens: prompt.maxTok,
      });
    } catch (err) {
      console.error(`[Scout] ${org.slug}/${market}: Gemini call failed:`, err.message);
      continue;
    }

    const parsed = parseScoutResults(text);
    if (!parsed || parsed.length === 0) {
      console.log(`[Scout] ${org.slug}/${market}: no results parsed`);
      continue;
    }

    totalFound += parsed.length;

    // 3. Score and filter — only auto-add High fit (score >= 65)
    const scored = parsed.map(s => ({ ...s, fitScore: calcScoutFitScore(s) }));
    const highFit = scored.filter(s => s.fitScore >= 65);
    const existing = grants.map(g => (g.funder || '').toLowerCase());

    for (const s of highFit) {
      // Skip duplicates — same funder already in pipeline
      if (existing.includes((s.funder || '').toLowerCase())) {
        console.log(`[Scout] ${org.slug}: skip ${s.funder} (already in pipeline)`);
        continue;
      }

      const grant = scoutResultToGrant(s);
      try {
        await upsertGrant(org.id, grant);
        existing.push((s.funder || '').toLowerCase()); // prevent dupes within same run
        totalAdded++;
        console.log(`[Scout] ${org.slug}: added "${s.name}" from ${s.funder} (fit: ${s.fitScore}%)`);
      } catch (err) {
        console.error(`[Scout] ${org.slug}: failed to add ${s.name}:`, err.message);
      }
    }

    // Log medium-fit as info
    const medFit = scored.filter(s => s.fitScore >= 40 && s.fitScore < 65);
    if (medFit.length > 0) {
      console.log(`[Scout] ${org.slug}/${market}: ${medFit.length} medium-fit results not auto-added: ${medFit.map(s => s.funder).join(', ')}`);
    }
  }

  // 4. Audit log
  try {
    await logAgentRun(org.id, {
      agent_type: 'auto-scout',
      grant_id: null,
      prompt_summary: `Nightly auto-scout: ${markets.join('+')} markets`,
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
