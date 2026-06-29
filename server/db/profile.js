import { pool } from './pool.js';

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
    if (['mission', 'programmes', 'impact_stats', 'tone', 'anti_patterns', 'past_funders', 'context_full', 'context_slim', 'legal_address', 'reg_numbers'].includes(k)) {
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
