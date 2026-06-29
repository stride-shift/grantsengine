import { pool, uid } from './pool.js';

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
