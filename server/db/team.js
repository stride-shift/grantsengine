import { pool, uid } from './pool.js';

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

export const getMemberRole = async (orgId, memberId) => {
  if (!memberId) return null;
  const { rows } = await pool().query(
    'SELECT role FROM team_members WHERE id = $1 AND org_id = $2', [memberId, orgId]);
  return rows[0]?.role || null;
};

// Google Calendar tokens per member
export const getMemberGcalTokens = async (memberId) => {
  const { rows } = await pool().query('SELECT gcal_tokens FROM team_members WHERE id = $1', [memberId]);
  return rows[0]?.gcal_tokens || null;
};

export const setMemberGcalTokens = async (memberId, tokens) => {
  await pool().query('UPDATE team_members SET gcal_tokens = $1 WHERE id = $2', [JSON.stringify(tokens), memberId]);
};

export const getMemberById = async (memberId) => {
  const { rows } = await pool().query('SELECT * FROM team_members WHERE id = $1', [memberId]);
  return rows[0] || null;
};
