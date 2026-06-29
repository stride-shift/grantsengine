import { pool, uid, extractAiData, safeJSON } from './pool.js';

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
    focus: safeJSON(row.focus, []),
    geo: safeJSON(row.geo, []),
    rel: row.rel,
    pri: row.pri,
    hrs: row.hrs,
    notes: row.notes,
    log: safeJSON(row.log, []),
    on: row.on_factors,
    of: safeJSON(row.off_factors, []),
    owner: row.owner,
    docs: safeJSON(row.docs, {}),
    fups: safeJSON(row.fups, []),
    subDate: row.sub_date,
    applyUrl: row.apply_url,
    market: row.market || 'sa',
    source: row.source || 'scout',
    created_at: row.created_at,
    updated_at: row.updated_at,
    ...safeJSON(row.ai_data, {}),
  }));
};

export const upsertGrant = async (orgId, grant) => {
  const id = grant.id || uid();
  const aiData = extractAiData(grant);
  await pool().query(
    `INSERT INTO grants
      (id, org_id, name, funder, type, stage, ask, deadline, focus, geo, rel, pri, hrs, notes, log, on_factors, off_factors, owner, docs, fups, sub_date, apply_url, ai_data, market, source, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,NOW())
     ON CONFLICT (id) DO UPDATE SET
      org_id=$2, name=$3, funder=$4, type=$5, stage=$6, ask=$7, deadline=$8, focus=$9, geo=$10, rel=$11, pri=$12, hrs=$13, notes=$14, log=$15, on_factors=$16, off_factors=$17, owner=$18, docs=$19, fups=$20, sub_date=$21, apply_url=$22, ai_data=$23, market=$24, source=$25, updated_at=NOW()`,
    [id, orgId, grant.name, grant.funder || null, grant.type || null,
     grant.stage || 'scouted', grant.ask || 0, grant.deadline || null,
     JSON.stringify(grant.focus || []), JSON.stringify(grant.geo || []),
     grant.rel || 'Cold', grant.pri || 3, grant.hrs || 0,
     grant.notes || '', JSON.stringify(grant.log || []),
     grant.on || '', JSON.stringify(grant.of || []),
     grant.owner || 'team', JSON.stringify(grant.docs || {}),
     JSON.stringify(grant.fups || []), grant.subDate || null, grant.applyUrl || null,
     aiData, grant.market || 'sa', grant.source || 'scout']
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
        `INSERT INTO grants (id, org_id, name, funder, type, stage, ask, deadline, focus, geo, rel, pri, hrs, notes, log, on_factors, off_factors, owner, docs, fups, sub_date, apply_url, ai_data, market, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
        [id, orgId, g.name, g.funder || null, g.type || null,
         g.stage || 'scouted', g.ask || 0, g.deadline || null,
         JSON.stringify(g.focus || []), JSON.stringify(g.geo || []),
         g.rel || 'Cold', g.pri || 3, g.hrs || 0,
         g.notes || '', JSON.stringify(g.log || []),
         g.on || '', JSON.stringify(g.of || []),
         g.owner || 'team', JSON.stringify(g.docs || {}),
         JSON.stringify(g.fups || []), g.subDate || null, g.applyUrl || null,
         aiData, g.market || 'sa', g.source || 'scout']
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

// ── Grant lookup (for stage change detection) ──

export const getGrantById = async (id, orgId) => {
  const { rows } = await pool().query('SELECT id, stage, name, funder, owner, deadline FROM grants WHERE id = $1 AND org_id = $2', [id, orgId]);
  return rows[0] || null;
};
