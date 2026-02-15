import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'grants.db');

fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema: 14 tables ──

db.exec(`
  -- Organisations
  CREATE TABLE IF NOT EXISTS orgs (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    website TEXT,
    industry TEXT,
    country TEXT DEFAULT 'South Africa',
    currency TEXT DEFAULT 'ZAR',
    setup_phase INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Org profiles (AI-enriched, cached context)
  CREATE TABLE IF NOT EXISTS org_profiles (
    org_id TEXT PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
    mission TEXT,
    programmes TEXT DEFAULT '[]',
    impact_stats TEXT DEFAULT '{}',
    tone TEXT,
    anti_patterns TEXT,
    past_funders TEXT,
    context_full TEXT,
    context_slim TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Org config (notifications, SMTP, Twilio)
  CREATE TABLE IF NOT EXISTS org_config (
    org_id TEXT PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
    email_enabled INTEGER DEFAULT 0,
    email_addresses TEXT DEFAULT '[]',
    smtp_host TEXT,
    smtp_port INTEGER,
    smtp_user TEXT,
    smtp_pass TEXT,
    whatsapp_enabled INTEGER DEFAULT 0,
    whatsapp_numbers TEXT DEFAULT '[]',
    twilio_sid TEXT,
    twilio_token TEXT,
    twilio_from TEXT,
    inapp_enabled INTEGER DEFAULT 1,
    quiet_hours_start INTEGER,
    quiet_hours_end INTEGER,
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Team members
  CREATE TABLE IF NOT EXISTS team_members (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    initials TEXT NOT NULL,
    role TEXT DEFAULT 'pm',
    email TEXT,
    phone TEXT,
    persona TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Org auth (shared password per org)
  CREATE TABLE IF NOT EXISTS org_auth (
    org_id TEXT PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL
  );

  -- Sessions
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );

  -- Grants
  CREATE TABLE IF NOT EXISTS grants (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    funder TEXT,
    type TEXT,
    stage TEXT DEFAULT 'scouted',
    ask REAL DEFAULT 0,
    deadline TEXT,
    focus TEXT DEFAULT '[]',
    geo TEXT DEFAULT '[]',
    rel TEXT DEFAULT 'Cold',
    pri INTEGER DEFAULT 3,
    hrs REAL DEFAULT 0,
    notes TEXT DEFAULT '',
    log TEXT DEFAULT '[]',
    on_factors TEXT DEFAULT '',
    off_factors TEXT DEFAULT '[]',
    owner TEXT DEFAULT 'team',
    docs TEXT DEFAULT '{}',
    fups TEXT DEFAULT '[]',
    sub_date TEXT,
    apply_url TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_grants_org ON grants(org_id);
  CREATE INDEX IF NOT EXISTS idx_grants_stage ON grants(org_id, stage);

  -- Funder strategies (per-org funder angles)
  CREATE TABLE IF NOT EXISTS funder_strategies (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    funder_name TEXT NOT NULL,
    funder_type TEXT,
    lead TEXT,
    hook TEXT,
    sections TEXT,
    lang TEXT,
    budget_emphasis TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_fstrat_org ON funder_strategies(org_id);

  -- Approvals (gate sign-offs)
  CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    grant_id TEXT NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
    gate TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    requested_by TEXT,
    reviews TEXT DEFAULT '[]',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_approvals_org ON approvals(org_id);

  -- Uploads (file metadata + extracted text)
  CREATE TABLE IF NOT EXISTS uploads (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    grant_id TEXT,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT,
    size INTEGER,
    extracted_text TEXT,
    category TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_uploads_org ON uploads(org_id);

  -- Compliance docs (per-org doc statuses)
  CREATE TABLE IF NOT EXISTS compliance_docs (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    doc_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'missing',
    expiry TEXT,
    uploaded_date TEXT,
    file_name TEXT,
    file_size INTEGER,
    notes TEXT,
    upload_id TEXT REFERENCES uploads(id),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_cdocs_org ON compliance_docs(org_id);

  -- Pipeline config (per-org stages, gates, etc.)
  CREATE TABLE IF NOT EXISTS pipeline_config (
    org_id TEXT PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,
    stages TEXT NOT NULL,
    gates TEXT DEFAULT '{}',
    funder_types TEXT DEFAULT '[]',
    win_factors TEXT DEFAULT '[]',
    loss_factors TEXT DEFAULT '[]',
    doc_requirements TEXT DEFAULT '{}',
    roles TEXT DEFAULT '{}',
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Agent runs (audit trail)
  CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    grant_id TEXT,
    agent_type TEXT NOT NULL,
    prompt_summary TEXT,
    result_summary TEXT,
    tokens_in INTEGER DEFAULT 0,
    tokens_out INTEGER DEFAULT 0,
    cost_usd REAL DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    status TEXT DEFAULT 'completed',
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_aruns_org ON agent_runs(org_id);

  -- KV store (composite key: org_id + key)
  CREATE TABLE IF NOT EXISTS kv (
    org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    PRIMARY KEY (org_id, key)
  );
`);

// ── Helpers ──

const uid = () => crypto.randomBytes(8).toString('hex');

// ── Org helpers ──

export const getOrgBySlug = (slug) =>
  db.prepare('SELECT * FROM orgs WHERE slug = ?').get(slug);

export const getOrgById = (id) =>
  db.prepare('SELECT * FROM orgs WHERE id = ?').get(id);

export const getAllOrgs = () =>
  db.prepare('SELECT id, slug, name, website, industry, country, currency, setup_phase FROM orgs ORDER BY name').all();

export const createOrg = (data) => {
  const id = uid();
  db.prepare(`INSERT INTO orgs (id, slug, name, website, industry, country, currency)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    id, data.slug, data.name, data.website || null,
    data.industry || null, data.country || 'South Africa', data.currency || 'ZAR'
  );
  // Create empty profile and config
  db.prepare('INSERT INTO org_profiles (org_id) VALUES (?)').run(id);
  db.prepare('INSERT INTO org_config (org_id) VALUES (?)').run(id);
  return id;
};

export const updateOrg = (id, data) => {
  const fields = [];
  const vals = [];
  for (const [k, v] of Object.entries(data)) {
    if (['slug', 'name', 'website', 'industry', 'country', 'currency', 'setup_phase'].includes(k)) {
      fields.push(`${k} = ?`);
      vals.push(v);
    }
  }
  if (!fields.length) return;
  fields.push("updated_at = datetime('now')");
  vals.push(id);
  db.prepare(`UPDATE orgs SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
};

// ── Auth helpers ──

export const setOrgPassword = (orgId, hash) =>
  db.prepare('INSERT OR REPLACE INTO org_auth (org_id, password_hash) VALUES (?, ?)').run(orgId, hash);

export const getOrgAuth = (orgId) =>
  db.prepare('SELECT password_hash FROM org_auth WHERE org_id = ?').get(orgId);

export const createSession = (orgId) => {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, org_id, expires_at) VALUES (?, ?, ?)').run(token, orgId, expires);
  return { token, expires };
};

export const getSession = (token) =>
  db.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > datetime(\'now\')').get(token);

export const deleteSession = (token) =>
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);

export const cleanExpiredSessions = () =>
  db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run();

// ── Profile helpers ──

export const getOrgProfile = (orgId) =>
  db.prepare('SELECT * FROM org_profiles WHERE org_id = ?').get(orgId);

export const updateOrgProfile = (orgId, data) => {
  const fields = [];
  const vals = [];
  for (const [k, v] of Object.entries(data)) {
    if (['mission', 'programmes', 'impact_stats', 'tone', 'anti_patterns', 'past_funders', 'context_full', 'context_slim'].includes(k)) {
      fields.push(`${k} = ?`);
      vals.push(typeof v === 'object' ? JSON.stringify(v) : v);
    }
  }
  if (!fields.length) return;
  fields.push("updated_at = datetime('now')");
  vals.push(orgId);
  db.prepare(`UPDATE org_profiles SET ${fields.join(', ')} WHERE org_id = ?`).run(...vals);
};

// ── Config helpers ──

export const getOrgConfig = (orgId) =>
  db.prepare('SELECT * FROM org_config WHERE org_id = ?').get(orgId);

export const updateOrgConfig = (orgId, data) => {
  const fields = [];
  const vals = [];
  const allowed = ['email_enabled', 'email_addresses', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass',
    'whatsapp_enabled', 'whatsapp_numbers', 'twilio_sid', 'twilio_token', 'twilio_from',
    'inapp_enabled', 'quiet_hours_start', 'quiet_hours_end'];
  for (const [k, v] of Object.entries(data)) {
    if (allowed.includes(k)) {
      fields.push(`${k} = ?`);
      vals.push(typeof v === 'object' ? JSON.stringify(v) : v);
    }
  }
  if (!fields.length) return;
  fields.push("updated_at = datetime('now')");
  vals.push(orgId);
  db.prepare(`UPDATE org_config SET ${fields.join(', ')} WHERE org_id = ?`).run(...vals);
};

// ── Team helpers ──

export const getTeamMembers = (orgId) =>
  db.prepare('SELECT * FROM team_members WHERE org_id = ? ORDER BY name').all(orgId);

export const upsertTeamMember = (orgId, member) => {
  const id = member.id || uid();
  db.prepare(`INSERT OR REPLACE INTO team_members (id, org_id, name, initials, role, email, phone, persona)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, orgId, member.name, member.initials, member.role || 'pm',
    member.email || null, member.phone || null, member.persona || null
  );
  return id;
};

export const deleteTeamMember = (id, orgId) =>
  db.prepare('DELETE FROM team_members WHERE id = ? AND org_id = ?').run(id, orgId);

// ── Grant helpers ──

export const getGrants = (orgId) => {
  const rows = db.prepare('SELECT * FROM grants WHERE org_id = ? ORDER BY created_at').all(orgId);
  return rows.map(row => ({
    id: row.id,
    name: row.name,
    funder: row.funder,
    type: row.type,
    stage: row.stage,
    ask: row.ask,
    deadline: row.deadline,
    focus: JSON.parse(row.focus || '[]'),
    geo: JSON.parse(row.geo || '[]'),
    rel: row.rel,
    pri: row.pri,
    hrs: row.hrs,
    notes: row.notes,
    log: JSON.parse(row.log || '[]'),
    on: row.on_factors,
    of: JSON.parse(row.off_factors || '[]'),
    owner: row.owner,
    docs: JSON.parse(row.docs || '{}'),
    fups: JSON.parse(row.fups || '[]'),
    subDate: row.sub_date,
    applyUrl: row.apply_url,
  }));
};

export const upsertGrant = (orgId, grant) => {
  const id = grant.id || uid();
  db.prepare(`INSERT OR REPLACE INTO grants
    (id, org_id, name, funder, type, stage, ask, deadline, focus, geo, rel, pri, hrs, notes, log, on_factors, off_factors, owner, docs, fups, sub_date, apply_url, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(
    id, orgId, grant.name, grant.funder || null, grant.type || null,
    grant.stage || 'scouted', grant.ask || 0, grant.deadline || null,
    JSON.stringify(grant.focus || []), JSON.stringify(grant.geo || []),
    grant.rel || 'Cold', grant.pri || 3, grant.hrs || 0,
    grant.notes || '', JSON.stringify(grant.log || []),
    grant.on || '', JSON.stringify(grant.of || []),
    grant.owner || 'team', JSON.stringify(grant.docs || {}),
    JSON.stringify(grant.fups || []), grant.subDate || null, grant.applyUrl || null
  );
  return id;
};

export const deleteGrant = (id, orgId) =>
  db.prepare('DELETE FROM grants WHERE id = ? AND org_id = ?').run(id, orgId);

export const replaceAllGrants = db.transaction((orgId, grants) => {
  db.prepare('DELETE FROM grants WHERE org_id = ?').run(orgId);
  const insert = db.prepare(`INSERT INTO grants
    (id, org_id, name, funder, type, stage, ask, deadline, focus, geo, rel, pri, hrs, notes, log, on_factors, off_factors, owner, docs, fups, sub_date, apply_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const g of grants) {
    insert.run(g.id || uid(), orgId, g.name, g.funder || null, g.type || null,
      g.stage || 'scouted', g.ask || 0, g.deadline || null,
      JSON.stringify(g.focus || []), JSON.stringify(g.geo || []),
      g.rel || 'Cold', g.pri || 3, g.hrs || 0,
      g.notes || '', JSON.stringify(g.log || []),
      g.on || '', JSON.stringify(g.of || []),
      g.owner || 'team', JSON.stringify(g.docs || {}),
      JSON.stringify(g.fups || []), g.subDate || null, g.applyUrl || null);
  }
});

// ── Pipeline config helpers ──

export const getPipelineConfig = (orgId) =>
  db.prepare('SELECT * FROM pipeline_config WHERE org_id = ?').get(orgId);

export const upsertPipelineConfig = (orgId, config) => {
  db.prepare(`INSERT OR REPLACE INTO pipeline_config
    (org_id, stages, gates, funder_types, win_factors, loss_factors, doc_requirements, roles, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(
    orgId,
    JSON.stringify(config.stages),
    JSON.stringify(config.gates || {}),
    JSON.stringify(config.funder_types || []),
    JSON.stringify(config.win_factors || []),
    JSON.stringify(config.loss_factors || []),
    JSON.stringify(config.doc_requirements || {}),
    JSON.stringify(config.roles || {})
  );
};

// ── Approval helpers ──

export const getApprovals = (orgId) => {
  const rows = db.prepare('SELECT * FROM approvals WHERE org_id = ? ORDER BY created_at DESC').all(orgId);
  return rows.map(r => ({ ...r, reviews: JSON.parse(r.reviews || '[]') }));
};

export const createApproval = (orgId, data) => {
  const id = uid();
  db.prepare(`INSERT INTO approvals (id, org_id, grant_id, gate, status, requested_by, reviews)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    id, orgId, data.grant_id, data.gate, 'pending', data.requested_by || null, '[]'
  );
  return id;
};

export const updateApproval = (id, orgId, data) => {
  const fields = [];
  const vals = [];
  if (data.status) { fields.push('status = ?'); vals.push(data.status); }
  if (data.reviews) { fields.push('reviews = ?'); vals.push(JSON.stringify(data.reviews)); }
  if (!fields.length) return;
  fields.push("updated_at = datetime('now')");
  vals.push(id, orgId);
  db.prepare(`UPDATE approvals SET ${fields.join(', ')} WHERE id = ? AND org_id = ?`).run(...vals);
};

// ── Compliance doc helpers ──

export const getComplianceDocs = (orgId) =>
  db.prepare('SELECT * FROM compliance_docs WHERE org_id = ? ORDER BY name').all(orgId);

export const upsertComplianceDoc = (orgId, doc) => {
  const id = doc.id || uid();
  db.prepare(`INSERT OR REPLACE INTO compliance_docs
    (id, org_id, doc_id, name, status, expiry, uploaded_date, file_name, file_size, notes, upload_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(
    id, orgId, doc.doc_id, doc.name, doc.status || 'missing',
    doc.expiry || null, doc.uploaded_date || null, doc.file_name || null,
    doc.file_size || null, doc.notes || null, doc.upload_id || null
  );
  return id;
};

// ── Agent run helpers ──

export const logAgentRun = (orgId, data) => {
  const id = uid();
  db.prepare(`INSERT INTO agent_runs
    (id, org_id, grant_id, agent_type, prompt_summary, result_summary, tokens_in, tokens_out, cost_usd, duration_ms, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, orgId, data.grant_id || null, data.agent_type,
    data.prompt_summary || null, data.result_summary || null,
    data.tokens_in || 0, data.tokens_out || 0,
    data.cost_usd || 0, data.duration_ms || 0,
    data.status || 'completed'
  );
  return id;
};

export const getAgentRuns = (orgId, limit = 50) =>
  db.prepare('SELECT * FROM agent_runs WHERE org_id = ? ORDER BY created_at DESC LIMIT ?').all(orgId, limit);

// ── KV helpers (org-scoped) ──

export const kvGet = (orgId, key) => {
  const row = db.prepare('SELECT value FROM kv WHERE org_id = ? AND key = ?').get(orgId, key);
  return row ? JSON.parse(row.value) : null;
};

export const kvSet = (orgId, key, value) => {
  db.prepare('INSERT OR REPLACE INTO kv (org_id, key, value) VALUES (?, ?, ?)').run(orgId, key, JSON.stringify(value));
};

// ── Funder strategy helpers ──

export const getFunderStrategies = (orgId) =>
  db.prepare('SELECT * FROM funder_strategies WHERE org_id = ? ORDER BY funder_name').all(orgId);

export const upsertFunderStrategy = (orgId, strat) => {
  const id = strat.id || uid();
  db.prepare(`INSERT OR REPLACE INTO funder_strategies
    (id, org_id, funder_name, funder_type, lead, hook, sections, lang, budget_emphasis, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`).run(
    id, orgId, strat.funder_name, strat.funder_type || null,
    strat.lead || null, strat.hook || null, strat.sections || null,
    strat.lang || null, strat.budget_emphasis || null
  );
  return id;
};

// ── Upload helpers ──

export const getUploadsByOrg = (orgId) =>
  db.prepare('SELECT * FROM uploads WHERE org_id = ? AND grant_id IS NULL ORDER BY created_at DESC').all(orgId);

export const getUploadsByGrant = (orgId, grantId) =>
  db.prepare('SELECT * FROM uploads WHERE org_id = ? AND grant_id = ? ORDER BY created_at DESC').all(orgId, grantId);

export const getUploadById = (id, orgId) =>
  db.prepare('SELECT * FROM uploads WHERE id = ? AND org_id = ?').get(id, orgId);

export const createUpload = (orgId, data) => {
  const id = data.id || uid();
  db.prepare(`INSERT INTO uploads (id, org_id, grant_id, filename, original_name, mime_type, size, extracted_text, category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, orgId, data.grant_id || null, data.filename, data.original_name,
    data.mime_type || null, data.size || 0, data.extracted_text || null,
    data.category || null
  );
  return id;
};

export const deleteUploadById = (id, orgId) =>
  db.prepare('DELETE FROM uploads WHERE id = ? AND org_id = ?').run(id, orgId);

export const getOrgUploadsText = (orgId) =>
  db.prepare(`SELECT id, original_name, category, extracted_text FROM uploads
    WHERE org_id = ? AND grant_id IS NULL AND extracted_text IS NOT NULL
    ORDER BY created_at DESC`).all(orgId);

export const getGrantUploadsText = (orgId, grantId) =>
  db.prepare(`SELECT id, original_name, category, extracted_text FROM uploads
    WHERE org_id = ? AND grant_id = ? AND extracted_text IS NOT NULL
    ORDER BY created_at DESC`).all(orgId, grantId);

export { db as default, uid };
