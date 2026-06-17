/**
 * Grant scraper — source configuration
 *
 * Four kinds of source:
 *  - 'api':        a structured grant-database API (free, public, no signup).
 *                  Pulls the most recent posted opportunities directly, so
 *                  results are always real and current. Preferred path.
 *  - 'rss':        a WordPress-style RSS feed of funding opportunities. Free,
 *                  structured, full-content, no login, no ToS issue, no browser
 *                  needed.
 *  - 'aggregator': an HTML listing page that links to a recent round-up post.
 *                  The scraper opens the listing, finds the most recent post
 *                  whose link text matches `postLinkPattern`, and scrapes that.
 *  - 'funder':     a single funder's "apply / open calls" page, scraped directly.
 *
 * 'api' and 'rss' sources work with only ANTHROPIC_API_KEY set.
 * 'aggregator'/'funder' sources (and link verification) additionally need the
 * playwright-service.
 *
 * URLs/selectors are best-effort and will need occasional maintenance — the
 * POC's per-source counts tell us which sources are worth keeping.
 */

export const SOURCES = [
  // ── Structured grant-database APIs (no API key needed — verified public) ──
  {
    key: 'grantsgov',
    label: 'Grants.gov — US federal (foreign-eligible only)',
    kind: 'api',
    api: 'grantsgov',
    // Keyword searches against the public search2 endpoint. Most US federal
    // grants exclude foreign orgs — the parse prompt filters on eligibility.
    queries: ['South Africa', 'Africa digital skills', 'Africa workforce development'],
    market: 'global',
  },
  {
    key: 'eu-sedia',
    label: 'EU Funding & Tenders portal',
    kind: 'api',
    api: 'sedia',
    // SEDIA search API with the public apiKey=SEDIA. South African entities
    // can participate in many Horizon Europe / Global Gateway calls.
    queries: ['youth digital skills Africa', 'vocational training South Africa'],
    market: 'global',
  },
  {
    key: 'etenders',
    label: 'SA National Treasury eTenders (skills & training)',
    kind: 'api',
    api: 'etenders',
    // Official OCDS API (free, public). These are government RFPs/EOIs rather
    // than philanthropic grants — relevant where d-lab could be the training
    // service provider (SETA-adjacent, Government/SETA pipeline type).
    parseHint: 'These are South African government procurement notices from the National Treasury eTenders portal. They are service contracts, not philanthropic grants — set "type" to "Government/SETA" and "access" to "Open". Only include notices where a youth digital-skills training NPO could plausibly be the appointed service provider (training delivery, learnerships, skills development, work readiness, e-learning content). Skip pure IT systems, equipment, construction, maintenance, and professional-services procurement.',
    market: 'sa',
  },

  // ── RSS feeds (free, structured, no signup) ──
  {
    key: 'fundsforngos',
    label: 'fundsforNGOs — latest grants',
    kind: 'rss',
    feedUrl: 'https://www2.fundsforngos.org/feed/',
    market: 'global',
  },
  {
    key: 'africanngos',
    label: 'African NGOs — funding opportunities',
    kind: 'rss',
    feedUrl: 'https://africanngos.org/feed/',
    market: 'global',
  },
  {
    key: 'africa-grants',
    label: 'Africa Grants',
    kind: 'rss',
    feedUrl: 'https://africa-grants.com/feed/',
    market: 'global',
  },
  {
    key: 'opportunities-for-youth',
    label: 'Opportunities for Youth',
    kind: 'rss',
    feedUrl: 'https://opportunitiesforyouth.org/feed/',
    market: 'global',
  },

  // ── Curated funder pages (HTML scrape via playwright-service) ──
  {
    key: 'dgmt',
    label: 'DG Murray Trust',
    kind: 'funder',
    funder: 'DG Murray Trust',
    url: 'https://dgmt.co.za/apply-for-funding/',
    market: 'sa',
  },
  {
    key: 'raith',
    label: 'RAITH Foundation',
    kind: 'funder',
    funder: 'RAITH Foundation',
    url: 'https://raith.org.za/apply/',
    market: 'sa',
  },
];
