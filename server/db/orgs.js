import { pool, uid } from './pool.js';

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
  const { rows } = await pool().query('SELECT id, slug, name, website, logo_url, industry, country, currency, org_type, setup_phase, subscription_plan, subscription_status, trial_started_at, trial_expires_at, subscription_period_end, readonly_lock, subscription_updated_at, created_at FROM orgs ORDER BY name');
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

export const deleteOrg = async (id) => {
  // All child tables have ON DELETE CASCADE — this cleans up everything
  await pool().query('DELETE FROM orgs WHERE id = $1', [id]);
};

export const updateOrg = async (id, data) => {
  const fields = [];
  const vals = [];
  let i = 1;
  for (const [k, v] of Object.entries(data)) {
    if (['slug', 'name', 'website', 'logo_url', 'industry', 'country', 'currency', 'org_type', 'setup_phase'].includes(k)) {
      fields.push(`${k} = $${i++}`);
      vals.push(v);
    }
  }
  if (!fields.length) return;
  fields.push('updated_at = NOW()');
  vals.push(id);
  await pool().query(`UPDATE orgs SET ${fields.join(', ')} WHERE id = $${i}`, vals);
};

// Super-admin: set an org's subscription plan/status/period and the read-only lock.
export const setOrgSubscription = async (id, data) => {
  const allowed = ['subscription_plan', 'subscription_status', 'subscription_period_end', 'trial_expires_at', 'readonly_lock'];
  const fields = [];
  const vals = [];
  let i = 1;
  for (const [k, v] of Object.entries(data)) {
    if (allowed.includes(k)) {
      fields.push(`${k} = $${i++}`);
      vals.push(v);
    }
  }
  if (!fields.length) return;
  fields.push('subscription_updated_at = NOW()');
  vals.push(id);
  await pool().query(`UPDATE orgs SET ${fields.join(', ')} WHERE id = $${i}`, vals);
};

// Cross-org usage aggregate for the super-admin dashboard.
export const getOrgUsage = async (orgId) => {
  const [grantsRes, membersRes, runsRes, activityRes] = await Promise.all([
    pool().query('SELECT COUNT(*)::int AS n FROM grants WHERE org_id = $1', [orgId]),
    pool().query('SELECT COUNT(*)::int AS n FROM team_members WHERE org_id = $1', [orgId]),
    pool().query(
      `SELECT COUNT(*)::int AS ai_calls,
              COALESCE(SUM(tokens_in), 0)::int AS tokens_in,
              COALESCE(SUM(tokens_out), 0)::int AS tokens_out,
              COALESCE(SUM(cost_usd), 0)::float AS cost_usd
         FROM agent_runs WHERE org_id = $1`,
      [orgId]
    ),
    pool().query('SELECT MAX(created_at) AS last_activity_at FROM activity_log WHERE org_id = $1', [orgId]),
  ]);
  return {
    grants: grantsRes.rows[0].n,
    members: membersRes.rows[0].n,
    aiCalls: runsRes.rows[0].ai_calls,
    tokensIn: runsRes.rows[0].tokens_in,
    tokensOut: runsRes.rows[0].tokens_out,
    costUsd: runsRes.rows[0].cost_usd,
    lastActivityAt: activityRes.rows[0].last_activity_at || null,
  };
};
