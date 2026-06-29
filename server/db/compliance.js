import { pool, uid, safeJSON } from './pool.js';

// ── Approval helpers ──

export const getApprovals = async (orgId) => {
  const { rows } = await pool().query('SELECT * FROM approvals WHERE org_id = $1 ORDER BY created_at DESC', [orgId]);
  return rows.map(r => ({ ...r, reviews: safeJSON(r.reviews, []) }));
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
