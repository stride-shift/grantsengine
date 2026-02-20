import pg from 'pg';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

// AI fields stored in the ai_data JSON column
const AI_KEYS = ['aiDraft','aiDraftAt','draftHistory','aiResearch','aiResearchAt','researchHistory','aiFitscore','aiFitscoreAt','fitscoreHistory','aiFollowup','aiFollowupAt','followupHistory','aiWinloss','aiWinlossAt','askSource','aiRecommendedAsk','funderBudget'];

const extractAiData = (grant) => {
  const aiData = {};
  for (const k of AI_KEYS) {
    if (grant[k] !== undefined && grant[k] !== null) aiData[k] = grant[k];
  }
  return JSON.stringify(aiData);
};

// Lazy pool — created on first use so env vars are available (Vercel + local dev)
let _pool = null;
function pool() {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL not set');
    const parsed = new URL(url);
    _pool = new Pool({
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      host: parsed.hostname,
      port: parseInt(parsed.port) || 5432,
      database: parsed.pathname.slice(1),
      ssl: url.includes('supabase') ? { rejectUnauthorized: false } : false,
    });
  }
  return _pool;
}

// ── Schema init (run once on startup) ──

export const initDb = async () => {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool().query(schema);

  // Data migration: only Alison should be director (admin). David and Barbara are board members.
  await pool().query(`UPDATE team_members SET role = 'board' WHERE id IN ('david', 'barbara') AND role = 'director'`);

  // Data migration: move grants with AI drafts from scouted/qualifying to drafting
  await pool().query(`UPDATE grants SET stage = 'drafting' WHERE stage IN ('scouted', 'qualifying') AND ai_data::text LIKE '%"aiDraft"%' AND ai_data::text NOT LIKE '%"aiDraft":""%' AND ai_data::text NOT LIKE '%"aiDraft":null%'`);
};

// ── Helpers ──

const uid = () => crypto.randomBytes(8).toString('hex');

// ── Org helpers ──

export const getOrgBySlug = async (slug) => {
  const { rows } = await pool().query('SELECT * FROM orgs WHERE slug = $1', [slug]);
  return rows[0] || null;
};

export const getOrgById = async (id) => {
  const { rows } = await pool().query('SELECT * FROM orgs WHERE id = $1', [id]);
  return rows[0] || null;
};

export const getAllOrgs = async () => {
  const { rows } = await pool().query('SELECT id, slug, name, website, logo_url, industry, country, currency, setup_phase FROM orgs ORDER BY name');
  return rows;
};

export const createOrg = async (data) => {
  const id = uid();
  await pool().query(
    `INSERT INTO orgs (id, slug, name, website, industry, country, currency) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, data.slug, data.name, data.website || null, data.industry || null, data.country || 'South Africa', data.currency || 'ZAR']
  );
  await pool().query('INSERT INTO org_profiles (org_id) VALUES ($1)', [id]);
  await pool().query('INSERT INTO org_config (org_id) VALUES ($1)', [id]);
  return id;
};

export const updateOrg = async (id, data) => {
  const fields = [];
  const vals = [];
  let i = 1;
  for (const [k, v] of Object.entries(data)) {
    if (['slug', 'name', 'website', 'logo_url', 'industry', 'country', 'currency', 'setup_phase'].includes(k)) {
      fields.push(`${k} = $${i++}`);
      vals.push(v);
    }
  }
  if (!fields.length) return;
  fields.push('updated_at = NOW()');
  vals.push(id);
  await pool().query(`UPDATE orgs SET ${fields.join(', ')} WHERE id = $${i}`, vals);
};

// ── Auth helpers ──

export const setOrgPassword = async (orgId, hash) => {
  await pool().query(
    `INSERT INTO org_auth (org_id, password_hash) VALUES ($1, $2) ON CONFLICT (org_id) DO UPDATE SET password_hash = $2`,
    [orgId, hash]
  );
};

export const getOrgAuth = async (orgId) => {
  const { rows } = await pool().query('SELECT password_hash FROM org_auth WHERE org_id = $1', [orgId]);
  return rows[0] || null;
};

export const createSession = async (orgId) => {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await pool().query('INSERT INTO sessions (token, org_id, expires_at) VALUES ($1, $2, $3)', [token, orgId, expires]);
  return { token, expires };
};

export const getSession = async (token) => {
  const { rows } = await pool().query('SELECT * FROM sessions WHERE token = $1 AND expires_at > NOW() AND ended_at IS NULL', [token]);
  return rows[0] || null;
};

export const deleteSession = async (token) => {
  await pool().query('DELETE FROM sessions WHERE token = $1', [token]);
};

export const cleanExpiredSessions = async () => {
  await pool().query('DELETE FROM sessions WHERE expires_at <= NOW()');
};

// ── Profile helpers ──

export const getOrgProfile = async (orgId) => {
  const { rows } = await pool().query('SELECT * FROM org_profiles WHERE org_id = $1', [orgId]);
  return rows[0] || null;
};

export const updateOrgProfile = async (orgId, data) => {
  const fields = [];
  const vals = [];
  let i = 1;
  for (const [k, v] of Object.entries(data)) {
    if (['mission', 'programmes', 'impact_stats', 'tone', 'anti_patterns', 'past_funders', 'context_full', 'context_slim'].includes(k)) {
      fields.push(`${k} = $${i++}`);
      vals.push(typeof v === 'object' ? JSON.stringify(v) : v);
    }
  }
  if (!fields.length) return;
  fields.push('updated_at = NOW()');
  vals.push(orgId);
  await pool().query(`UPDATE org_profiles SET ${fields.join(', ')} WHERE org_id = $${i}`, vals);
};

// ── Config helpers ──

export const getOrgConfig = async (orgId) => {
  const { rows } = await pool().query('SELECT * FROM org_config WHERE org_id = $1', [orgId]);
  return rows[0] || null;
};

export const updateOrgConfig = async (orgId, data) => {
  const fields = [];
  const vals = [];
  let i = 1;
  const allowed = ['email_enabled', 'email_addresses', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass',
    'whatsapp_enabled', 'whatsapp_numbers', 'twilio_sid', 'twilio_token', 'twilio_from',
    'inapp_enabled', 'quiet_hours_start', 'quiet_hours_end'];
  for (const [k, v] of Object.entries(data)) {
    if (allowed.includes(k)) {
      fields.push(`${k} = $${i++}`);
      vals.push(typeof v === 'object' ? JSON.stringify(v) : v);
    }
  }
  if (!fields.length) return;
  fields.push('updated_at = NOW()');
  vals.push(orgId);
  await pool().query(`UPDATE org_config SET ${fields.join(', ')} WHERE org_id = $${i}`, vals);
};

// ── Team helpers ──

export const getTeamMembers = async (orgId) => {
  const { rows } = await pool().query('SELECT * FROM team_members WHERE org_id = $1 ORDER BY name', [orgId]);
  return rows;
};

export const upsertTeamMember = async (orgId, member) => {
  const id = member.id || uid();
  await pool().query(
    `INSERT INTO team_members (id, org_id, name, initials, role, email, phone, persona)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET name=$3, initials=$4, role=$5, email=$6, phone=$7, persona=$8`,
    [id, orgId, member.name, member.initials, member.role || 'pm',
     member.email || null, member.phone || null, member.persona || null]
  );
  return id;
};

export const deleteTeamMember = async (id, orgId) => {
  await pool().query('DELETE FROM team_members WHERE id = $1 AND org_id = $2', [id, orgId]);
};

// ── Grant helpers ──

export const getGrants = async (orgId) => {
  const { rows } = await pool().query('SELECT * FROM grants WHERE org_id = $1 ORDER BY created_at', [orgId]);
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
    ...JSON.parse(row.ai_data || '{}'),
  }));
};

export const upsertGrant = async (orgId, grant) => {
  const id = grant.id || uid();
  const aiData = extractAiData(grant);
  await pool().query(
    `INSERT INTO grants
      (id, org_id, name, funder, type, stage, ask, deadline, focus, geo, rel, pri, hrs, notes, log, on_factors, off_factors, owner, docs, fups, sub_date, apply_url, ai_data, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,NOW())
     ON CONFLICT (id) DO UPDATE SET
      org_id=$2, name=$3, funder=$4, type=$5, stage=$6, ask=$7, deadline=$8, focus=$9, geo=$10, rel=$11, pri=$12, hrs=$13, notes=$14, log=$15, on_factors=$16, off_factors=$17, owner=$18, docs=$19, fups=$20, sub_date=$21, apply_url=$22, ai_data=$23, updated_at=NOW()`,
    [id, orgId, grant.name, grant.funder || null, grant.type || null,
     grant.stage || 'scouted', grant.ask || 0, grant.deadline || null,
     JSON.stringify(grant.focus || []), JSON.stringify(grant.geo || []),
     grant.rel || 'Cold', grant.pri || 3, grant.hrs || 0,
     grant.notes || '', JSON.stringify(grant.log || []),
     grant.on || '', JSON.stringify(grant.of || []),
     grant.owner || 'team', JSON.stringify(grant.docs || {}),
     JSON.stringify(grant.fups || []), grant.subDate || null, grant.applyUrl || null,
     aiData]
  );
  return id;
};

export const deleteGrant = async (id, orgId) => {
  await pool().query('DELETE FROM grants WHERE id = $1 AND org_id = $2', [id, orgId]);
};

export const replaceAllGrants = async (orgId, grants) => {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM grants WHERE org_id = $1', [orgId]);
    for (const g of grants) {
      const id = g.id || uid();
      const aiData = extractAiData(g);
      await client.query(
        `INSERT INTO grants (id, org_id, name, funder, type, stage, ask, deadline, focus, geo, rel, pri, hrs, notes, log, on_factors, off_factors, owner, docs, fups, sub_date, apply_url, ai_data)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
        [id, orgId, g.name, g.funder || null, g.type || null,
         g.stage || 'scouted', g.ask || 0, g.deadline || null,
         JSON.stringify(g.focus || []), JSON.stringify(g.geo || []),
         g.rel || 'Cold', g.pri || 3, g.hrs || 0,
         g.notes || '', JSON.stringify(g.log || []),
         g.on || '', JSON.stringify(g.of || []),
         g.owner || 'team', JSON.stringify(g.docs || {}),
         JSON.stringify(g.fups || []), g.subDate || null, g.applyUrl || null,
         aiData]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

// ── Pipeline config helpers ──

export const getPipelineConfig = async (orgId) => {
  const { rows } = await pool().query('SELECT * FROM pipeline_config WHERE org_id = $1', [orgId]);
  return rows[0] || null;
};

export const upsertPipelineConfig = async (orgId, config) => {
  await pool().query(
    `INSERT INTO pipeline_config (org_id, stages, gates, funder_types, win_factors, loss_factors, doc_requirements, roles, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
     ON CONFLICT (org_id) DO UPDATE SET stages=$2, gates=$3, funder_types=$4, win_factors=$5, loss_factors=$6, doc_requirements=$7, roles=$8, updated_at=NOW()`,
    [orgId, JSON.stringify(config.stages), JSON.stringify(config.gates || {}),
     JSON.stringify(config.funder_types || []), JSON.stringify(config.win_factors || []),
     JSON.stringify(config.loss_factors || []), JSON.stringify(config.doc_requirements || {}),
     JSON.stringify(config.roles || {})]
  );
};

// ── Approval helpers ──

export const getApprovals = async (orgId) => {
  const { rows } = await pool().query('SELECT * FROM approvals WHERE org_id = $1 ORDER BY created_at DESC', [orgId]);
  return rows.map(r => ({ ...r, reviews: JSON.parse(r.reviews || '[]') }));
};

export const createApproval = async (orgId, data) => {
  const id = uid();
  await pool().query(
    `INSERT INTO approvals (id, org_id, grant_id, gate, status, requested_by, reviews) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, orgId, data.grant_id, data.gate, 'pending', data.requested_by || null, '[]']
  );
  return id;
};

export const updateApproval = async (id, orgId, data) => {
  const fields = [];
  const vals = [];
  let i = 1;
  if (data.status) { fields.push(`status = $${i++}`); vals.push(data.status); }
  if (data.reviews) { fields.push(`reviews = $${i++}`); vals.push(JSON.stringify(data.reviews)); }
  if (!fields.length) return;
  fields.push('updated_at = NOW()');
  vals.push(id, orgId);
  await pool().query(`UPDATE approvals SET ${fields.join(', ')} WHERE id = $${i++} AND org_id = $${i}`, vals);
};

// ── Compliance doc helpers ──

export const getComplianceDocs = async (orgId) => {
  const { rows } = await pool().query('SELECT * FROM compliance_docs WHERE org_id = $1 ORDER BY name', [orgId]);
  return rows;
};

export const upsertComplianceDoc = async (orgId, doc) => {
  const id = doc.id || uid();
  await pool().query(
    `INSERT INTO compliance_docs (id, org_id, doc_id, name, status, expiry, uploaded_date, file_name, file_size, notes, upload_id, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
     ON CONFLICT (id) DO UPDATE SET doc_id=$3, name=$4, status=$5, expiry=$6, uploaded_date=$7, file_name=$8, file_size=$9, notes=$10, upload_id=$11, updated_at=NOW()`,
    [id, orgId, doc.doc_id, doc.name, doc.status || 'missing',
     doc.expiry || null, doc.uploaded_date || null, doc.file_name || null,
     doc.file_size || null, doc.notes || null, doc.upload_id || null]
  );
  return id;
};

// ── Member auth helpers ──

export const getMemberWithAuth = async (orgId, memberId) => {
  const { rows } = await pool().query(
    'SELECT * FROM team_members WHERE id = $1 AND org_id = $2',
    [memberId, orgId]
  );
  return rows[0] || null;
};

export const setMemberPassword = async (memberId, hash) => {
  await pool().query('UPDATE team_members SET password_hash = $1 WHERE id = $2', [hash, memberId]);
};

export const createMemberSession = async (orgId, memberId) => {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await pool().query(
    'INSERT INTO sessions (token, org_id, member_id, expires_at, last_active_at) VALUES ($1, $2, $3, $4, NOW())',
    [token, orgId, memberId, expires]
  );
  return { token, expires };
};

export const touchSession = async (token) => {
  await pool().query('UPDATE sessions SET last_active_at = NOW() WHERE token = $1', [token]);
};

export const endSession = async (token) => {
  await pool().query('UPDATE sessions SET ended_at = NOW() WHERE token = $1', [token]);
};

export const getActiveSessions = async (orgId) => {
  const { rows } = await pool().query(
    `SELECT s.member_id, s.created_at, s.last_active_at,
            tm.name AS member_name, tm.initials, tm.role
     FROM sessions s
     LEFT JOIN team_members tm ON tm.id = s.member_id
     WHERE s.org_id = $1 AND s.expires_at > NOW() AND s.ended_at IS NULL
     ORDER BY s.last_active_at DESC NULLS LAST`,
    [orgId]
  );
  return rows;
};

export const getSessionHistory = async (orgId, limit = 30) => {
  const { rows } = await pool().query(
    `SELECT s.member_id, s.created_at, s.last_active_at, s.ended_at,
            tm.name AS member_name, tm.initials, tm.role,
            EXTRACT(EPOCH FROM (COALESCE(s.ended_at, s.last_active_at, s.created_at) - s.created_at)) / 60 AS duration_mins
     FROM sessions s
     LEFT JOIN team_members tm ON tm.id = s.member_id
     WHERE s.org_id = $1 AND s.member_id IS NOT NULL
     ORDER BY s.created_at DESC LIMIT $2`,
    [orgId, limit]
  );
  return rows;
};

// ── Activity log helpers ──

export const logActivity = async (orgId, event, opts = {}) => {
  const id = uid();
  try {
    await pool().query(
      `INSERT INTO activity_log (id, org_id, member_id, session_token, event, grant_id, meta)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, orgId, opts.memberId || null, opts.sessionToken || null, event,
       opts.grantId || null, JSON.stringify(opts.meta || {})]
    );
  } catch { /* activity logging is best-effort */ }
  return id;
};

export const getActivityLog = async (orgId, { limit = 100, memberId = null } = {}) => {
  let sql = `SELECT al.*, tm.name AS member_name, tm.initials
             FROM activity_log al
             LEFT JOIN team_members tm ON tm.id = al.member_id
             WHERE al.org_id = $1`;
  const params = [orgId];
  if (memberId) {
    sql += ` AND al.member_id = $2`;
    params.push(memberId);
  }
  sql += ` ORDER BY al.created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);
  const { rows } = await pool().query(sql, params);
  return rows.map(r => ({ ...r, meta: JSON.parse(r.meta || '{}') }));
};

// ── Grant lookup (for stage change detection) ──

export const getGrantById = async (id, orgId) => {
  const { rows } = await pool().query('SELECT id, stage, name FROM grants WHERE id = $1 AND org_id = $2', [id, orgId]);
  return rows[0] || null;
};

// ── Agent run helpers ──

export const logAgentRun = async (orgId, data) => {
  const id = uid();
  await pool().query(
    `INSERT INTO agent_runs (id, org_id, grant_id, agent_type, prompt_summary, result_summary, tokens_in, tokens_out, cost_usd, duration_ms, status, member_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, orgId, data.grant_id || null, data.agent_type,
     data.prompt_summary || null, data.result_summary || null,
     data.tokens_in || 0, data.tokens_out || 0,
     data.cost_usd || 0, data.duration_ms || 0,
     data.status || 'completed', data.member_id || null]
  );
  return id;
};

export const getAgentRuns = async (orgId, limit = 50) => {
  const { rows } = await pool().query('SELECT * FROM agent_runs WHERE org_id = $1 ORDER BY created_at DESC LIMIT $2', [orgId, limit]);
  return rows;
};

// ── KV helpers (org-scoped) ──

export const kvGet = async (orgId, key) => {
  const { rows } = await pool().query('SELECT value FROM kv WHERE org_id = $1 AND key = $2', [orgId, key]);
  return rows[0] ? JSON.parse(rows[0].value) : null;
};

export const kvSet = async (orgId, key, value) => {
  await pool().query(
    `INSERT INTO kv (org_id, key, value) VALUES ($1,$2,$3) ON CONFLICT (org_id, key) DO UPDATE SET value = $3`,
    [orgId, key, JSON.stringify(value)]
  );
};

// ── Funder strategy helpers ──

export const getFunderStrategies = async (orgId) => {
  const { rows } = await pool().query('SELECT * FROM funder_strategies WHERE org_id = $1 ORDER BY funder_name', [orgId]);
  return rows;
};

export const upsertFunderStrategy = async (orgId, strat) => {
  const id = strat.id || uid();
  await pool().query(
    `INSERT INTO funder_strategies (id, org_id, funder_name, funder_type, lead, hook, sections, lang, budget_emphasis, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
     ON CONFLICT (id) DO UPDATE SET funder_name=$3, funder_type=$4, lead=$5, hook=$6, sections=$7, lang=$8, budget_emphasis=$9, updated_at=NOW()`,
    [id, orgId, strat.funder_name, strat.funder_type || null,
     strat.lead || null, strat.hook || null, strat.sections || null,
     strat.lang || null, strat.budget_emphasis || null]
  );
  return id;
};

// ── Upload helpers ──

export const getUploadsByOrg = async (orgId) => {
  const { rows } = await pool().query('SELECT * FROM uploads WHERE org_id = $1 AND grant_id IS NULL ORDER BY created_at DESC', [orgId]);
  return rows;
};

export const getUploadsByGrant = async (orgId, grantId) => {
  const { rows } = await pool().query('SELECT * FROM uploads WHERE org_id = $1 AND grant_id = $2 ORDER BY created_at DESC', [orgId, grantId]);
  return rows;
};

export const getUploadById = async (id, orgId) => {
  const { rows } = await pool().query('SELECT * FROM uploads WHERE id = $1 AND org_id = $2', [id, orgId]);
  return rows[0] || null;
};

export const createUpload = async (orgId, data) => {
  const id = data.id || uid();
  await pool().query(
    `INSERT INTO uploads (id, org_id, grant_id, filename, original_name, mime_type, size, extracted_text, category)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, orgId, data.grant_id || null, data.filename, data.original_name,
     data.mime_type || null, data.size || 0, data.extracted_text || null,
     data.category || null]
  );
  return id;
};

export const deleteUploadById = async (id, orgId) => {
  await pool().query('DELETE FROM uploads WHERE id = $1 AND org_id = $2', [id, orgId]);
};

export const getOrgUploadsText = async (orgId) => {
  const { rows } = await pool().query(
    `SELECT id, original_name, category, extracted_text FROM uploads
     WHERE org_id = $1 AND grant_id IS NULL AND extracted_text IS NOT NULL
     ORDER BY created_at DESC`, [orgId]);
  return rows;
};

export const getGrantUploadsText = async (orgId, grantId) => {
  const { rows } = await pool().query(
    `SELECT id, original_name, category, extracted_text FROM uploads
     WHERE org_id = $1 AND grant_id = $2 AND extracted_text IS NOT NULL
     ORDER BY created_at DESC`, [orgId, grantId]);
  return rows;
};

export { pool as default, uid };
