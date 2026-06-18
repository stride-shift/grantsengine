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
 * A source may set `requiresEnv: 'SOME_ENV_VAR'` — it is skipped at runtime
 * unless that env var is present (used for APIs that need a free signup key).
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
  {
    key: 'worldbank',
    label: 'World Bank — projects in South Africa',
    kind: 'api',
    api: 'worldbank',
    // Public Projects API (no key). Filters to ZA. These are development-bank
    // operations, not grants per se — relevant where d-lab could be an
    // implementing partner on a skills/education component.
    parseHint: 'These are World Bank development projects financed in South Africa. Treat "World Bank" as the funder unless a co-financier is named. Only include projects with a youth, education, skills-development, employment or digital component where a training NPO could plausibly be an implementing partner or sub-grantee — skip pure infrastructure, energy, transport, water and financial-sector operations. Set type to "Development Agency" and access to "Relationship first".',
    market: 'sa',
  },
  {
    key: 'iati',
    label: 'IATI Datastore — development funders active in SA',
    kind: 'api',
    api: 'iati',
    // Free, but needs a no-cost subscription key (developer.iatistandard.org).
    // Skipped automatically until IATI_API_KEY is set.
    requiresEnv: 'IATI_API_KEY',
    parseHint: 'These are international development-aid activities recorded in IATI with South Africa as a recipient country. Treat the reporting/funding organisation as the funder. Focus on youth, education, skills, digital and employment activities. Set type to "Development Agency".',
    market: 'global',
  },

  // ── RSS feeds (free, structured, no signup) ──
  {
    key: 'fundsforngos-sa',
    label: 'fundsforNGOs — South Africa tag',
    kind: 'rss',
    feedUrl: 'https://www2.fundsforngos.org/tag/south-africa/feed/',
    market: 'sa',
  },
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

  // ── SA listing pages (HTML scrape — no feed/API exists) ──
  {
    key: 'ngopulse',
    label: 'NGO Pulse (SANGONeT) — grants & calls for proposals',
    kind: 'aggregator',
    // Homepage carries dated SA grant/CFP listings from many funders. No RSS/API.
    // postLinkPattern tries to jump to the calls/grants section; if nothing
    // matches, resolveTargetUrl falls back to scraping the listing page itself.
    listUrl: 'https://ngopulse.net/',
    postLinkPattern: /grant|funding|call for proposal|request for proposal|\brfp\b/i,
    market: 'sa',
  },
  {
    key: 'inyathelo',
    label: 'Inyathelo — funding opportunities',
    kind: 'funder',
    // HTML-only list of opportunities. Funder varies per item, so the parser is
    // told to capture each one. NOTE: listing freshness is unverified — monitor
    // its per-source count and drop if it stops yielding current opportunities.
    funder: '(various)',
    url: 'https://askinyathelo.org.za/funding-opportunities/',
    parseHint: 'This is a round-up page listing funding opportunities from many different funders. Capture the specific funder named for each opportunity (do not use "Inyathelo" as the funder — it is only the aggregator).',
    market: 'sa',
  },
];
