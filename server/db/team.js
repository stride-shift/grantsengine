import { pool, uid } from './pool.js';

// ── Team helpers ──

export const getTeamMembers = async (orgId) => {
  const { rows } = await pool().query('SELECT * FROM team_members WHERE org_id = $1 ORDER BY name', [orgId]);
  return rows;
};

export const upsertTeamMember = async (orgId, member) => {
  const id = member.id || uid();
  // access_level gates the Admin page (super_admin | admin | user), separate from
  // the pipeline `role`. On UPDATE only overwrite it when the caller supplied a
  // value, so a plain profile edit doesn't silently downgrade an admin.
  await pool().query(
    `INSERT INTO team_members (id, org_id, name, initials, role, email, phone, persona, access_level)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'user'))
     ON CONFLICT (id) DO UPDATE SET name=$3, initials=$4, role=$5, email=$6, phone=$7, persona=$8,
       access_level=COALESCE($9, team_members.access_level)`,
    [id, orgId, member.name, member.initials, member.role || 'pm',
     member.email || null, member.phone || null, member.persona || null,
     member.access_level || null]
  );
  return id;
};

// Set just the platform access level for a member (super_admin | admin | user).
export const setMemberAccessLevel = async (orgId, memberId, level) => {
  await pool().query(
    'UPDATE team_members SET access_level = $1 WHERE id = $2 AND org_id = $3',
    [level, memberId, orgId]
  );
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
