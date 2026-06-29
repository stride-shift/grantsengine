import pg from 'pg';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

// AI fields stored in the ai_data JSON column
export const AI_KEYS = ['aiDraft','aiDraftAt','draftHistory','aiResearch','aiResearchAt','aiResearchStructured','researchHistory','aiFitscore','aiFitscoreAt','fitscoreHistory','aiFollowup','aiFollowupAt','followupHistory','aiWinloss','aiWinlossAt','aiConceptNote','aiConceptNoteAt','askSource','aiRecommendedAsk','aiAskReasoning','funderBudget','askYears','budgetTable','aiSections','aiSectionsOrder','aiSectionsAt','funderFeedback','funderBrief','includeGlossary','attachedDocs','_archivedFrom','vetting','outstandingActions','engagementMode','readability','viewLog','acceptsUnsolicited','recurringCycle','clonedFrom','requiredDocs','requiredDocsAt','applyLinkKind','applyLinkKindAt'];

export const extractAiData = (grant) => {
  const aiData = {};
  for (const k of AI_KEYS) {
    if (grant[k] !== undefined && grant[k] !== null) aiData[k] = grant[k];
  }
  return JSON.stringify(aiData);
};

// Lazy pool — created on first use so env vars are available (Vercel + local dev)
let _pool = null;
export function pool() {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL not set');
    // new URL() rejects the Cloud SQL unix-socket form because it has no host:
    //   postgresql://user:pass@/dbname?host=/cloudsql/PROJECT:REGION:INSTANCE
    // Try the standard parser first; if it throws (hostless) or carries a `host`
    // query param, parse the socket form by hand instead.
    let parsed = null;
    try { parsed = new URL(url); } catch { /* hostless Cloud SQL socket form — handled below */ }
    const cfg = {};
    if (!parsed || parsed.searchParams.get('host')) {
      // Cloud SQL unix socket: scheme://USER:PASS@/DBNAME?host=/cloudsql/CONN
      // The connection is local to the instance, so no TLS is used.
      const m = /^[^:]+:\/\/([^@]*)@\/([^?#]+)(?:\?([^#]*))?/.exec(url);
      if (!m) throw new Error('Invalid DATABASE_URL: could not parse Cloud SQL socket form');
      const [, userinfo, dbname, query = ''] = m;
      const ci = userinfo.indexOf(':');
      cfg.user = decodeURIComponent(ci >= 0 ? userinfo.slice(0, ci) : userinfo);
      cfg.password = decodeURIComponent(ci >= 0 ? userinfo.slice(ci + 1) : '');
      cfg.database = decodeURIComponent(dbname);
      cfg.host = new URLSearchParams(query).get('host'); // e.g. /cloudsql/PROJECT:REGION:INSTANCE
    } else {
      // TCP (Supabase / public IP): host:port + optional TLS.
      cfg.user = decodeURIComponent(parsed.username);
      cfg.password = decodeURIComponent(parsed.password);
      cfg.database = parsed.pathname.slice(1);
      cfg.host = parsed.hostname;
      cfg.port = parseInt(parsed.port) || 5432;
      // TLS: if a CA cert is supplied (PGSSLROOTCERT path or SUPABASE_CA_CERT PEM),
      // verify the server certificate properly. Otherwise fall back to an encrypted-
      // but-unverified connection (Supabase default) so existing deploys keep working.
      let ssl = false;
      if (url.includes('supabase') || process.env.PGSSLMODE === 'require') {
        const caPem = process.env.SUPABASE_CA_CERT
          || (process.env.PGSSLROOTCERT && fs.existsSync(process.env.PGSSLROOTCERT)
              ? fs.readFileSync(process.env.PGSSLROOTCERT, 'utf8')
              : null);
        ssl = caPem ? { ca: caPem, rejectUnauthorized: true } : { rejectUnauthorized: false };
        if (!caPem) console.warn('[db] TLS certificate verification disabled — set SUPABASE_CA_CERT or PGSSLROOTCERT to enable it.');
      }
      cfg.ssl = ssl;
    }
    _pool = new Pool(cfg);
  }
  return _pool;
}

// ── Schema init (run once on startup) ──

export const initDb = async () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  await pool().query(schema);

  // Data migration: only Alison should be director (admin). David and Barbara are board members.
  await pool().query(`UPDATE team_members SET role = 'board' WHERE id IN ('david', 'barbara') AND role = 'director'`);

  // Data migration: move grants with AI drafts from scouted/qualifying to drafting
  await pool().query(`UPDATE grants SET stage = 'drafting' WHERE stage IN ('scouted', 'qualifying') AND ai_data::text LIKE '%"aiDraft"%' AND ai_data::text NOT LIKE '%"aiDraft":""%' AND ai_data::text NOT LIKE '%"aiDraft":null%'`);
};

// ── Helpers ──

export const uid = () => crypto.randomBytes(8).toString('hex');

// Safe JSON.parse — returns fallback on malformed data instead of crashing
export const safeJSON = (str, fallback) => {
  if (!str) return fallback;
  try { return JSON.parse(str); }
  catch { return fallback; }
};
