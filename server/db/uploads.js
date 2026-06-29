import { pool, uid } from './pool.js';

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
    `INSERT INTO uploads (id, org_id, grant_id, filename, original_name, mime_type, size, extracted_text, category, visibility)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, orgId, data.grant_id || null, data.filename, data.original_name,
     data.mime_type || null, data.size || 0, data.extracted_text || null,
     data.category || null, data.visibility || 'public']
  );
  return id;
};

export const deleteUploadById = async (id, orgId) => {
  await pool().query('DELETE FROM uploads WHERE id = $1 AND org_id = $2', [id, orgId]);
};

export const updateUploadCategory = async (id, orgId, category) => {
  await pool().query('UPDATE uploads SET category = $1 WHERE id = $2 AND org_id = $3', [category, id, orgId]);
};

export const updateUploadText = async (id, orgId, text) => {
  await pool().query('UPDATE uploads SET extracted_text = $1 WHERE id = $2 AND org_id = $3', [text, id, orgId]);
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
