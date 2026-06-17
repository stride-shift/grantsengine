/**
 * Grant scraper — Phase 1 proof-of-concept (NO database writes)
 *
 * Scrapes each configured source, parses + link-verifies via Claude and the
 * playwright-service, and prints scout-shaped results plus a per-source summary
 * so you can eyeball real yield and link quality before wiring into the nightly job.
 *
 * Prerequisites (env):
 *   ANTHROPIC_API_KEY        — preferred (Claude Haiku parsing/verification)
 *   OPENAI_API_KEY           — fallback parser when no real Anthropic key is set
 *   PLAYWRIGHT_SERVICE_URL   — only for 'funder'/HTML sources + link verification
 *   PLAYWRIGHT_SECRET        — matches the playwright-service PLAYWRIGHT_SECRET
 *
 * API sources (grants.gov, EU SEDIA) and RSS sources run with just an AI key.
 *
 * Run:  node server/scraper/poc.js          (all sources)
 *       node server/scraper/poc.js dgmt      (one source by key)
 */

import 'dotenv/config';
import { SOURCES } from './sources.js';
import { scrapeGrants } from './scrapeGrants.js';

function checkEnv() {
  const claudeKey = process.env.ANTHROPIC_API_KEY || '';
  const claudeReal = claudeKey.startsWith('sk-ant-') && !claudeKey.includes('your-claude-key');
  if (!claudeReal && !process.env.OPENAI_API_KEY) {
    console.error('\nMissing ANTHROPIC_API_KEY (Claude Haiku, preferred) and OPENAI_API_KEY (fallback) — set one in .env.\n');
    process.exit(1);
  }
  if (!claudeReal) {
    console.warn('\n[note] No real ANTHROPIC_API_KEY — parsing falls back to OpenAI.');
    console.warn('       Add a Claude key to .env to use Haiku (cheaper + web-search verification).\n');
  }
  if (!process.env.PLAYWRIGHT_SERVICE_URL || !process.env.PLAYWRIGHT_SECRET) {
    console.warn('\n[note] playwright-service not configured — API/RSS sources will run;');
    console.warn('       funder/HTML sources will error and links will be left unverified.\n');
  }
}

async function main() {
  checkEnv();

  const onlyKey = process.argv[2];
  const sources = onlyKey ? SOURCES.filter((s) => s.key === onlyKey) : SOURCES;
  if (sources.length === 0) {
    console.error(`No source matches "${onlyKey}". Known: ${SOURCES.map((s) => s.key).join(', ')}`);
    process.exit(1);
  }

  const totals = { found: 0, verified: 0, highFit: 0 };
  const allGrants = [];

  for (const source of sources) {
    process.stdout.write(`\n── ${source.label} (${source.key}) ──\n`);
    try {
      const { targetUrl, found, verified, grants } = await scrapeGrants(source);
      const highFit = grants.filter((g) => g.fitScore >= 65).length;
      totals.found += found;
      totals.verified += verified;
      totals.highFit += highFit;
      allGrants.push(...grants);

      console.log(`scraped: ${targetUrl}`);
      console.log(`found ${found} → ${verified} link-verified → ${highFit} high-fit (>=65)`);
      for (const g of grants) {
        const budget = g.funderBudget ? `R${g.funderBudget.toLocaleString()}` : 'budget n/a';
        console.log(`  • [${g.fitScore}%] ${g.name} — ${g.funder} · ${budget} · ${g.deadline || 'no deadline'} · ${g.access}`);
        console.log(`      ${g.url || '(no url)'}`);
      }
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
    }
  }

  console.log(`\n══ TOTAL: found ${totals.found} → ${totals.verified} verified → ${totals.highFit} high-fit ══`);
  console.log('\n── Full JSON (scout-shaped) ──');
  console.log(JSON.stringify(allGrants, null, 2));
}

main().catch((err) => {
  console.error('POC failed:', err);
  process.exit(1);
});
