import { pool, safeJSON } from './pool.js';

// ── KV helpers (org-scoped) ──

export const kvGet = async (orgId, key) => {
  const { rows } = await pool().query('SELECT value FROM kv WHERE org_id = $1 AND key = $2', [orgId, key]);
  return rows[0] ? safeJSON(rows[0].value, null) : null;
};

export const kvSet = async (orgId, key, value) => {
  await pool().query(
    `INSERT INTO kv (org_id, key, value) VALUES ($1,$2,$3) ON CONFLICT (org_id, key) DO UPDATE SET value = $3`,
    [orgId, key, JSON.stringify(value)]
  );
};
