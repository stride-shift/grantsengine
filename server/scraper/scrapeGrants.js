/**
 * Grant scraper — core
 *
 * Pipeline per source:
 *   1. fetch content — grant-database API or RSS feed (plain HTTP) or HTML via playwright-service
 *   2. parseWithAI (Claude Haiku + web_search; OpenAI fallback) → candidate grants
 *   3. drop past-deadline results; playwright-service /verify-link → drop dead URLs
 *   4. map to the existing scout-result shape + attach calcScoutFitScore
 *
 * Returns scout-shaped objects (the same shape scoutResultToGrant consumes),
 * each annotated with fitScore, sourceKey, and linkStatus.
 */

import { callClaude, callOpenAI } from '../lib/ai.js';
import { serviceAuthHeaders } from '../lib/gcpAuth.js';
import { calcScoutFitScore } from '../jobs/scout.js';

// ── AI parser: Claude Haiku preferred, OpenAI fallback ──
// Uses Claude Haiku (+ web_search) when a real ANTHROPIC_API_KEY is configured.
// Falls back to the app's existing OpenAI key when the Anthropic key is missing,
// still the .env.example placeholder, or rejected with a 401.
let claudeAuthFailed = false;

function claudeConfigured() {
  const key = process.env.ANTHROPIC_API_KEY || '';
  return !claudeAuthFailed && key.startsWith('sk-ant-') && !key.includes('your-claude-key');
}

async function parseWithAI(system, user, { maxTokens = 4000 } = {}) {
  if (claudeConfigured()) {
    try {
      return await callClaude(system, user, { search: true, maxTokens });
    } catch (err) {
      if (err?.status === 401) {
        claudeAuthFailed = true;
        console.warn('[Scraper] ANTHROPIC_API_KEY rejected (401) — falling back to OpenAI');
      } else {
        throw err;
      }
    }
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('No working ANTHROPIC_API_KEY or OPENAI_API_KEY for the scraper');
  }
  return callOpenAI(system, user, { search: false, maxTokens });
}

const PW_URL = process.env.PLAYWRIGHT_SERVICE_URL;
const PW_KEY = process.env.PLAYWRIGHT_SECRET;
const PW_CONFIGURED = !!(PW_URL && PW_KEY);

async function pw(path, body) {
  if (!PW_CONFIGURED) throw new Error('PLAYWRIGHT_SERVICE_URL / PLAYWRIGHT_SECRET not configured');
  const res = await fetch(`${PW_URL}${path}`, {
    method: 'POST',
    headers: await serviceAuthHeaders(PW_URL, PW_KEY),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`playwright-service ${path} ${res.status}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

// Verify a batch of URLs via the playwright-service /verify-link endpoint.
// Returns a Map(url -> { ok, status, ... }). Returns an EMPTY map when the
// service isn't configured (or on error), so callers naturally fall back to
// "keep unverified" rather than dropping everything. Used by both the scraper
// and the AI web-search scout so model-produced links get the same liveness +
// SSRF check before they reach the pipeline.
export async function verifyLinks(urls) {
  const map = new Map();
  if (!PW_CONFIGURED) return map;
  const unique = [...new Set((urls || []).filter(Boolean))];
  if (!unique.length) return map;
  try {
    const { results } = await pw('/verify-link', { urls: unique });
    for (const r of results || []) map.set(r.url, r);
  } catch { /* best-effort — leave unverified */ }
  return map;
}

// ── Minimal dependency-free RSS reader ──
// Returns the same { pageText, links } shape the HTML scrape returns, so the
// rest of the pipeline is identical regardless of source kind.
function stripCdata(s) {
  const m = s.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return m ? m[1] : s;
}
function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}
function tagText(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decodeEntities(stripCdata(m[1])).trim() : '';
}

async function fetchRss(feedUrl, { maxItems = 8, maxChars = 24000 } = {}) {
  const res = await fetch(feedUrl, { headers: { 'User-Agent': 'grants-engine-scraper/1.0' } });
  if (!res.ok) throw new Error(`RSS ${feedUrl} ${res.status}`);
  const xml = await res.text();

  const itemBlocks = (xml.match(/<item[\s\S]*?<\/item>/gi) || []).slice(0, maxItems);
  const links = [];
  const seen = new Set();
  const addLink = (href, text) => {
    if (/^https?:\/\//.test(href) && !seen.has(href)) { seen.add(href); links.push({ href, text: (text || '').slice(0, 120) }); }
  };

  let pageText = '';
  for (const block of itemBlocks) {
    const title = tagText(block, 'title');
    const link = tagText(block, 'link');
    const html = tagText(block, 'content:encoded') || tagText(block, 'description');
    if (link) addLink(link, title);
    for (const m of html.matchAll(/href=["']([^"']+)["']/gi)) addLink(m[1], '');
    const text = decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    pageText += `\n\n## ${title}\n(link: ${link})\n${text}`;
    if (pageText.length > maxChars) break;
  }
  return { pageText: pageText.slice(0, maxChars), links: links.slice(0, 300) };
}

// ── Structured grant-database API fetchers ──
// Both return the same { pageText, links } shape as the RSS/HTML paths so the
// Haiku parse + verify pipeline is identical regardless of source kind.

function stripHtml(s) {
  return decodeEntities(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.json();
}

// Grants.gov public Search2 API — free, no key. Search per query, then pull
// full synopses (eligibility, award ceiling, deadline) for the newest hits.
async function fetchGrantsGov(source, { maxDetails = 8, maxChars = 24000 } = {}) {
  const hitsById = new Map();
  for (const keyword of source.queries) {
    const { data } = await postJson('https://api.grants.gov/v1/api/search2', {
      keyword, oppStatuses: 'posted', rows: 15,
    });
    for (const hit of data?.oppHits || []) {
      if (!hitsById.has(hit.id)) hitsById.set(hit.id, hit);
    }
  }
  const hits = [...hitsById.values()]
    .sort((a, b) => new Date(b.openDate || 0) - new Date(a.openDate || 0))
    .slice(0, maxDetails);

  const links = [];
  let pageText = '';
  for (const hit of hits) {
    const url = `https://www.grants.gov/search-results-detail/${hit.id}`;
    links.push({ href: url, text: (hit.title || '').slice(0, 120) });
    let detail = hit.closeDate ? `Deadline: ${hit.closeDate}` : '';
    try {
      const { data } = await postJson('https://api.grants.gov/v1/api/fetchOpportunity', {
        opportunityId: Number(hit.id),
      });
      const s = data?.synopsis || {};
      const eligibility = [
        ...(s.applicantTypes || []).map((t) => t.description),
        stripHtml(s.applicantEligibilityDesc).slice(0, 400),
      ].filter(Boolean).join('; ');
      detail = [
        s.awardCeiling ? `Award ceiling: USD ${s.awardCeiling}` : '',
        s.responseDate ? `Deadline: ${s.responseDate}` : detail,
        eligibility ? `Eligibility: ${eligibility}` : '',
        stripHtml(s.synopsisDesc).slice(0, 1200),
      ].filter(Boolean).join('\n');
    } catch { /* keep the bare search hit */ }
    pageText += `\n\n## ${hit.title}\nFunder: ${hit.agency || hit.agencyCode || 'US federal agency'}\n(link: ${url})\n${detail}`;
    if (pageText.length > maxChars) break;
  }
  return { pageText: pageText.slice(0, maxChars), links };
}

// EU Funding & Tenders portal (SEDIA) search API — uses the public apiKey=SEDIA.
// type 1/2 = calls & topics; status 31094501/31094502 = forthcoming/open.
async function fetchSedia(source, { maxChars = 24000 } = {}) {
  const links = [];
  const seen = new Set();
  let pageText = '';
  for (const text of source.queries) {
    const url = `https://api.tech.ec.europa.eu/search-api/prod/rest/search?apiKey=SEDIA&text=${encodeURIComponent(text)}&pageSize=10&pageNumber=1`;
    const json = await postJson(url, {
      query: {
        bool: {
          must: [
            { terms: { type: ['1', '2'] } },
            { terms: { status: ['31094501', '31094502'] } },
          ],
        },
      },
      languages: ['en'],
    });
    for (const r of json.results || []) {
      if (!r.url) continue;
      // Rewrite machine-readable data URLs to the human portal page
      const portalUrl = r.url.replace(
        /https:\/\/ec\.europa\.eu\/info\/funding-tenders\/opportunities\/data\/topicDetails\/([^./]+)\.json/i,
        'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/$1'
      );
      if (seen.has(portalUrl)) continue;
      seen.add(portalUrl);
      r.url = portalUrl;
      const md = r.metadata || {};
      const title = stripHtml(r.summary || r.content || '').slice(0, 200);
      if (!title) continue;
      const deadline = (md.deadlineDate || [])[0] || (md.es_SortDate || [])[0] || '';
      const identifier = (md.identifier || md.callIdentifier || [])[0] || '';
      links.push({ href: r.url, text: title.slice(0, 120) });
      pageText += `\n\n## ${title}\nFunder: European Commission${identifier ? ` (call ${identifier})` : ''}\n(link: ${r.url})\n${deadline ? `Deadline/date: ${deadline}\n` : ''}${stripHtml(r.content || '').slice(0, 600)}`;
      if (pageText.length > maxChars) break;
    }
  }
  return { pageText: pageText.slice(0, maxChars), links: links.slice(0, 300) };
}

// South African National Treasury eTenders OCDS API — free, official, no key.
// Releases are procurement notices; pre-filter to skills/training-adjacent ones
// so the AI only judges plausible fits for a training NPO.
const ETENDERS_KEYWORDS = /training|skills development|learnership|youth|education|digital literacy|work readiness|internship|e-learning|capacit(?:y|ation) building/i;

async function fetchEtenders(source, { days = 14, maxItems = 12, maxChars = 24000 } = {}) {
  const dateTo = new Date().toISOString().slice(0, 10);
  const dateFrom = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const matched = [];
  for (let page = 1; page <= 4 && matched.length < maxItems; page++) {
    const url = `https://ocds-api.etenders.gov.za/api/OCDSReleases?dateFrom=${dateFrom}&dateTo=${dateTo}&PageNumber=${page}&PageSize=500`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`eTenders ${url} ${res.status}`);
    const { releases = [] } = await res.json();
    for (const r of releases) {
      const t = r.tender || {};
      if (t.status !== 'active') continue;
      if (!ETENDERS_KEYWORDS.test(`${t.title || ''} ${t.description || ''}`)) continue;
      matched.push(r);
      if (matched.length >= maxItems) break;
    }
    if (releases.length < 500) break;
  }

  const links = [];
  let pageText = '';
  for (const r of matched) {
    const t = r.tender;
    const docUrl = (t.documents || [])[0]?.url || null;
    if (docUrl) links.push({ href: docUrl, text: (t.description || t.title || '').slice(0, 120) });
    const close = t.tenderPeriod?.endDate ? t.tenderPeriod.endDate.slice(0, 10) : '';
    const buyer = r.buyer?.name || t.procuringEntity?.name || 'SA government entity';
    pageText += [
      `\n\n## ${(t.description || t.title || '').slice(0, 160)}`,
      `Funder: ${buyer}`,
      `Bid number: ${t.title || t.id}${t.province ? ` · ${t.province}` : ''}${t.procurementMethodDetails ? ` · ${t.procurementMethodDetails}` : ''}`,
      close ? `Deadline: ${close}` : '',
      docUrl ? `(link: ${docUrl})` : '',
      (t.description || '').slice(0, 600),
    ].filter(Boolean).join('\n');
    if (pageText.length > maxChars) break;
  }
  return { pageText: pageText.slice(0, maxChars), links };
}

// World Bank Projects API — free, no key. Filter to South Africa (countrycode_exact=ZA).
// Paginate via the `os` offset param (NOT `page`). The canonical, always-correct
// link is the project-detail page built from the project id.
async function fetchWorldBank(source, { maxItems = 15, maxChars = 24000 } = {}) {
  const fl = 'id,project_name,project_abstract,boardapprovaldate,closingdate,totalcommamt,sector,countryshortname';
  const url = `https://search.worldbank.org/api/v3/projects?format=json&countrycode_exact=ZA&rows=${maxItems}&os=0&fl=${encodeURIComponent(fl)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'grants-engine-scraper/1.0' } });
  if (!res.ok) throw new Error(`worldbank ${res.status}`);
  const json = await res.json();
  const projects = Array.isArray(json.projects) ? json.projects : Object.values(json.projects || {});

  const links = [];
  let pageText = '';
  for (const p of projects) {
    const id = p.id || p.project_id;
    if (!id) continue;
    // Canonical project-detail URL (guaranteed correct, not a redirect).
    const link = `https://projects.worldbank.org/en/projects-operations/project-detail/${id}`;
    links.push({ href: link, text: (p.project_name || '').slice(0, 120) });
    const close = p.closingdate ? String(p.closingdate).slice(0, 10) : '';
    const amt = p.totalcommamt ? `Commitment: USD ${p.totalcommamt}` : '';
    const sector = Array.isArray(p.sector) ? p.sector.map(s => s.Name || s.name).filter(Boolean).join(', ') : '';
    const abstract = stripHtml(p.project_abstract?.cdata || p.project_abstract || '').slice(0, 800);
    pageText += `\n\n## ${p.project_name || id}\nFunder: World Bank\n(link: ${link})\n${close ? `Closing: ${close}\n` : ''}${amt}${sector ? `\nSector: ${sector}` : ''}\n${abstract}`;
    if (pageText.length > maxChars) break;
  }
  return { pageText: pageText.slice(0, maxChars), links };
}

// IATI Datastore v3 (Solr) — free but needs a no-cost subscription key, passed
// in the Ocp-Apim-Subscription-Key header. Surfaces development funders with
// South Africa as a recipient country. Gated by requiresEnv:'IATI_API_KEY'.
async function fetchIati(source, { maxItems = 15, maxChars = 24000 } = {}) {
  const key = process.env.IATI_API_KEY;
  if (!key) throw new Error('IATI_API_KEY not set');
  const q = 'recipient_country_code:ZA AND (title_narrative:youth OR title_narrative:skills OR title_narrative:education OR title_narrative:employment OR title_narrative:digital)';
  const fl = 'iati_identifier,title_narrative,description_narrative,reporting_org_narrative,activity_date_iso_date,activity_date_type';
  const url = `https://api.iatistandard.org/datastore/activity/select?q=${encodeURIComponent(q)}&rows=${maxItems}&fl=${encodeURIComponent(fl)}`;
  const res = await fetch(url, {
    headers: { 'Ocp-Apim-Subscription-Key': key, 'User-Agent': 'grants-engine-scraper/1.0' },
  });
  if (!res.ok) throw new Error(`iati ${res.status}`);
  const json = await res.json();
  const docs = json.response?.docs || json.docs || [];

  const links = [];
  let pageText = '';
  const first = (v) => Array.isArray(v) ? v[0] : v;
  for (const d of docs) {
    const id = first(d.iati_identifier);
    if (!id) continue;
    const title = stripHtml(first(d.title_narrative) || '');
    if (!title) continue;
    // d-portal renders an IATI activity into a human-viewable page.
    const link = `https://d-portal.org/q.html?aid=${encodeURIComponent(id)}`;
    links.push({ href: link, text: title.slice(0, 120) });
    const funder = stripHtml(first(d.reporting_org_narrative) || '');
    const desc = stripHtml(first(d.description_narrative) || '').slice(0, 700);
    pageText += `\n\n## ${title}\nFunder: ${funder || 'IATI reporting organisation'}\n(link: ${link})\n${desc}`;
    if (pageText.length > maxChars) break;
  }
  return { pageText: pageText.slice(0, maxChars), links };
}

const API_FETCHERS = { grantsgov: fetchGrantsGov, sedia: fetchSedia, etenders: fetchEtenders, worldbank: fetchWorldBank, iati: fetchIati };

function parseJsonArray(text) {
  const clean = (text || '').replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const start = clean.indexOf('[');
  const end = clean.lastIndexOf(']');
  if (start >= 0 && end > start) {
    try {
      const arr = JSON.parse(clean.slice(start, end + 1));
      if (Array.isArray(arr)) return arr;
    } catch { /* fall through */ }
  }
  return [];
}

// ── Build the parse prompt (reuses the anti-hallucination rules from scoutPrompt) ──
function buildParsePrompt({ source, pageText, links }) {
  const linkList = links
    .slice(0, 120)
    .map((l) => `- ${l.href}${l.text ? ` — ${l.text}` : ''}`)
    .join('\n');

  const funderHint = source.parseHint
    ? `\n${source.parseHint}`
    : source.kind === 'funder'
      ? `\nThis page belongs to the funder "${source.funder}". Use that as the funder for every opportunity unless the page clearly names a different one.`
      : source.kind === 'api'
        ? `\nThis content comes from an official grant database (${source.label}), so every listing is a real, currently-posted opportunity. Pay close attention to ELIGIBILITY: skip any opportunity restricted to US-based or EU-member-state organisations unless the text explicitly allows foreign, international, African, or South African organisations to apply.`
        : `\nThis is a round-up listing many different funders. Capture the specific funder for each opportunity.`;

  const system = `You extract REAL grant funding opportunities from scraped web/RSS content for a South African youth-skills NPO (d-lab). You return ONLY a JSON array — no markdown, no prose, no backticks.

You are given the TEXT of recent posts and the list of LINKS found in them. Extract every distinct funding opportunity the text describes.

CRITICAL — NEVER FABRICATE:
- "deadline": only if the text states one. Format YYYY-MM-DD. If none is stated, use null. Never guess.
- "funderBudget": grant size in ZAR as an integer (convert from USD/EUR/GBP if the text gives a foreign amount; assume USD≈18, EUR≈20, GBP≈23 ZAR). If no amount is published, use 0. Never invent.
- "url": MUST be one of the LINKS provided below that points to this specific opportunity or its application/details page. If no matching link exists, use null — do NOT guess a URL.
- Do not output an opportunity that the text does not actually describe.

For each opportunity return an object:
{"name":"[opportunity/programme name]","funder":"[organisation]","type":"[Foundation|Corporate CSI|Government/SETA|International|Development Agency|Tech Company|Impact Investor]","funderBudget":[ZAR integer or 0],"deadline":"[YYYY-MM-DD or null]","fit":"[High|Medium|Low]","reason":"[1 sentence: why it fits or doesn't fit a youth digital-skills NPO]","url":"[a real link from the list, or null]","focus":["tag1","tag2"],"access":"[Open|Relationship first|By invitation|Unknown]","accessNote":"[1 sentence on how to apply]"}

Set fit High only if it plausibly funds youth employment, digital/AI skills, education, or work-readiness in South Africa/Africa. If the opportunity is geographically restricted to somewhere that excludes South Africa (US-only, EU-member-states-only, or a single other country), set fit Low. Mark clearly-irrelevant sectors (pure health, environment, arts with no skills angle) as Low. Skip scholarships/fellowships for individuals — d-lab is an organisation. Return [] if there are no fundable opportunities for an org like this.`;

  const user = `SOURCE: ${source.label}${funderHint}

CONTENT:
"""
${pageText}
"""

LINKS:
${linkList}

Return the JSON array now.`;

  return { system, user };
}

// Resolve the HTML page to scrape. Aggregators point at a listing; we find the
// most recent post link matching the source's pattern and scrape that.
async function resolveTargetUrl(source) {
  if (source.kind !== 'aggregator') return source.url;
  const { links } = await pw('/scrape', { url: source.listUrl, maxChars: 4000 });
  const match = (links || []).find((l) => source.postLinkPattern.test(l.text || ''));
  return match ? match.href : source.listUrl;
}

/**
 * Scrape one source and return verified, scored, scout-shaped opportunities.
 * @returns {Promise<{ source, targetUrl, found, verified, grants }>}
 */
export async function scrapeGrants(source) {
  // 1. Fetch content (grant-database API or RSS over HTTP, or HTML via playwright-service)
  let pageText, links, targetUrl;
  if (source.kind === 'api') {
    targetUrl = source.label;
    const fetcher = API_FETCHERS[source.api];
    if (!fetcher) throw new Error(`unknown api fetcher "${source.api}"`);
    ({ pageText, links } = await fetcher(source));
  } else if (source.kind === 'rss') {
    targetUrl = source.feedUrl;
    ({ pageText, links } = await fetchRss(source.feedUrl));
  } else {
    targetUrl = await resolveTargetUrl(source);
    ({ pageText, links } = await pw('/scrape', { url: targetUrl }));
  }
  if (!pageText || pageText.length < 100) {
    return { source: source.key, targetUrl, found: 0, verified: 0, grants: [] };
  }

  // 2. Parse with AI (Claude Haiku preferred; web_search on so it can sanity-check facts/links)
  const { system, user } = buildParsePrompt({ source, pageText, links });
  const raw = await parseWithAI(system, user, { maxTokens: 4000 });
  const candidates = parseJsonArray(raw).filter((c) => c && c.name);

  // 3. Verify links via playwright-service — skipped (kept, marked unverified) if PW not configured
  const statusByUrl = {};
  if (PW_CONFIGURED) {
    const urls = [...new Set(candidates.map((c) => c.url).filter(Boolean))];
    if (urls.length) {
      try {
        const { results } = await pw('/verify-link', { urls });
        for (const r of results || []) statusByUrl[r.url] = r;
      } catch { /* verification best-effort; leave statuses empty */ }
    }
  }

  // 4. Map to scout shape, attach fit score
  const grants = [];
  const today = new Date().toISOString().slice(0, 10);
  for (const c of candidates) {
    // Drop opportunities whose deadline has already passed (no deadline is fine)
    if (c.deadline && c.deadline < today) continue;
    const status = c.url ? statusByUrl[c.url] : null;
    // If we verified and the link is dead, drop it. If unverified, keep it.
    if (c.url && PW_CONFIGURED && status && !status.ok) continue;
    const s = {
      name: c.name,
      funder: c.funder || source.funder || 'Unknown',
      type: c.type || 'Foundation',
      funderBudget: Number(c.funderBudget) || 0,
      deadline: c.deadline || null,
      fit: c.fit || 'Medium',
      reason: c.reason || '',
      url: c.url || '',
      focus: Array.isArray(c.focus) ? c.focus : [],
      access: c.access || 'Unknown',
      accessNote: c.accessNote || '',
      market: source.market || 'sa',
    };
    s.fitScore = calcScoutFitScore(s);
    s.sourceKey = source.key;
    s.linkStatus = status ? String(status.status) : (c.url ? 'unverified' : 'no-url');
    s.applyLinkKind = status ? (status.applyKind || 'unknown') : 'unknown';
    grants.push(s);
  }

  return { source: source.key, targetUrl, found: candidates.length, verified: grants.length, grants };
}
