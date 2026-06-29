import { pool, uid, safeJSON } from './pool.js';

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
  return rows.map(r => ({ ...r, meta: safeJSON(r.meta, {}) }));
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
