import { pool, uid } from './pool.js';

// ═══ Auto-Fill Jobs ═══
export const createAutofillJob = async (orgId, data) => {
  const id = data.id || uid();
  await pool().query(
    `INSERT INTO autofill_jobs (id, grant_id, org_id, apply_url, form_type, detected_fields, field_mappings, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, data.grant_id, orgId, data.apply_url || null, data.form_type || null,
     JSON.stringify(data.detected_fields || []), JSON.stringify(data.field_mappings || []),
     data.status || 'pending']
  );
  return id;
};

export const getAutofillJob = async (id, orgId) => {
  const { rows } = await pool().query(
    'SELECT * FROM autofill_jobs WHERE id = $1 AND org_id = $2', [id, orgId]);
  return rows[0] || null;
};

export const getAutofillJobsByGrant = async (grantId, orgId) => {
  const { rows } = await pool().query(
    'SELECT * FROM autofill_jobs WHERE grant_id = $1 AND org_id = $2 ORDER BY created_at DESC', [grantId, orgId]);
  return rows;
};

export const updateAutofillJob = async (id, orgId, updates) => {
  const fields = [];
  const values = [];
  let i = 1;
  for (const [k, v] of Object.entries(updates)) {
    const jsonKeys = ['detected_fields', 'field_mappings', 'screenshots'];
    fields.push(`${k} = $${i}`);
    values.push(jsonKeys.includes(k) ? JSON.stringify(v) : v);
    i++;
  }
  fields.push(`updated_at = NOW()`);
  values.push(id, orgId);
  await pool().query(
    `UPDATE autofill_jobs SET ${fields.join(', ')} WHERE id = $${i} AND org_id = $${i + 1}`,
    values
  );
};
