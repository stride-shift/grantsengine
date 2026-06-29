import crypto from 'crypto';
import { pool, uid } from './pool.js';

// ── Auth helpers ──

export const setOrgPassword = async (orgId, hash) => {
  await pool().query(
    `INSERT INTO org_auth (org_id, password_hash) VALUES ($1, $2) ON CONFLICT (org_id) DO UPDATE SET password_hash = $2`,
    [orgId, hash]
  );
};

export const getOrgAuth = async (orgId) => {
  const { rows } = await pool().query('SELECT password_hash FROM org_auth WHERE org_id = $1', [orgId]);
  return rows[0] || null;
};

export const createSession = async (orgId) => {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await pool().query('INSERT INTO sessions (token, org_id, expires_at) VALUES ($1, $2, $3)', [token, orgId, expires]);
  return { token, expires };
};

export const getSession = async (token) => {
  const { rows } = await pool().query('SELECT * FROM sessions WHERE token = $1 AND expires_at > NOW() AND ended_at IS NULL', [token]);
  return rows[0] || null;
};

export const deleteSession = async (token) => {
  await pool().query('DELETE FROM sessions WHERE token = $1', [token]);
};

export const cleanExpiredSessions = async () => {
  await pool().query('DELETE FROM sessions WHERE expires_at <= NOW()');
};

// ── Member auth helpers ──

export const getMemberWithAuth = async (orgId, memberId) => {
  const { rows } = await pool().query(
    'SELECT * FROM team_members WHERE id = $1 AND org_id = $2',
    [memberId, orgId]
  );
  return rows[0] || null;
};

// Email → (org, member) resolution for org-agnostic email+password login.
// Relies on the global-unique email index (case-insensitive); returns one row or null.
export const getOrgAndMemberByEmail = async (email) => {
  if (!email) return null;
  // The email column normally holds a single address, but some legacy rows store a
  // comma-separated list (e.g. "primary@x.com, alt@y.com"). Match the supplied
  // address against ANY individual entry — split on comma, trim, case-insensitive —
  // so those members still resolve for login / password reset.
  const { rows } = await pool().query(
    `SELECT tm.id AS member_id, tm.org_id, tm.name, tm.role, tm.initials,
            tm.password_hash, o.slug
       FROM team_members tm
       JOIN orgs o ON o.id = tm.org_id
      WHERE LOWER(TRIM($1)) IN (
              SELECT LOWER(TRIM(e))
                FROM unnest(string_to_array(COALESCE(tm.email, ''), ',')) AS e
            )
      LIMIT 1`,
    [email]
  );
  return rows[0] || null;
};

export const setMemberPassword = async (memberId, hash) => {
  await pool().query('UPDATE team_members SET password_hash = $1 WHERE id = $2', [hash, memberId]);
};

// Set a member's email (used by the email backfill tool). Stored lower-cased to
// match the case-insensitive unique index and the email→org login lookup.
export const setMemberEmail = async (memberId, email) => {
  await pool().query('UPDATE team_members SET email = $1 WHERE id = $2', [String(email).trim().toLowerCase(), memberId]);
};

export const createMemberSession = async (orgId, memberId) => {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await pool().query(
    'INSERT INTO sessions (token, org_id, member_id, expires_at, last_active_at) VALUES ($1, $2, $3, $4, NOW())',
    [token, orgId, memberId, expires]
  );
  return { token, expires };
};

export const touchSession = async (token) => {
  await pool().query('UPDATE sessions SET last_active_at = NOW() WHERE token = $1', [token]);
};

export const endSession = async (token) => {
  await pool().query('UPDATE sessions SET ended_at = NOW() WHERE token = $1', [token]);
};

export const getActiveSessions = async (orgId) => {
  const { rows } = await pool().query(
    `SELECT s.member_id, s.created_at, s.last_active_at,
            tm.name AS member_name, tm.initials, tm.role
     FROM sessions s
     LEFT JOIN team_members tm ON tm.id = s.member_id
     WHERE s.org_id = $1 AND s.expires_at > NOW() AND s.ended_at IS NULL
     ORDER BY s.last_active_at DESC NULLS LAST`,
    [orgId]
  );
  return rows;
};

export const getSessionHistory = async (orgId, limit = 30) => {
  const { rows } = await pool().query(
    `SELECT s.member_id, s.created_at, s.last_active_at, s.ended_at,
            tm.name AS member_name, tm.initials, tm.role,
            EXTRACT(EPOCH FROM (COALESCE(s.ended_at, s.last_active_at, s.created_at) - s.created_at)) / 60 AS duration_mins
     FROM sessions s
     LEFT JOIN team_members tm ON tm.id = s.member_id
     WHERE s.org_id = $1 AND s.member_id IS NOT NULL
     ORDER BY s.created_at DESC LIMIT $2`,
    [orgId, limit]
  );
  return rows;
};

// ── Super-admin helpers ──

export const createSuperAdmin = async ({ email, passwordHash, name }) => {
  const id = uid();
  await pool().query(
    'INSERT INTO super_admins (id, email, password_hash, name) VALUES ($1, $2, $3, $4)',
    [id, String(email).trim().toLowerCase(), passwordHash, name || null]
  );
  return id;
};

export const getSuperAdminByEmail = async (email) => {
  if (!email) return null;
  const { rows } = await pool().query(
    'SELECT * FROM super_admins WHERE LOWER(email) = LOWER(TRIM($1))',
    [email]
  );
  return rows[0] || null;
};

export const createSuperAdminSession = async (superAdminId) => {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await pool().query(
    'INSERT INTO super_admin_sessions (token, super_admin_id, expires_at) VALUES ($1, $2, $3)',
    [token, superAdminId, expires]
  );
  return { token, expires };
};

export const getSuperAdminSession = async (token) => {
  if (!token) return null;
  const { rows } = await pool().query(
    `SELECT s.token, s.super_admin_id, s.created_at, s.expires_at,
            sa.id AS admin_id, sa.email, sa.name
       FROM super_admin_sessions s
       JOIN super_admins sa ON sa.id = s.super_admin_id
      WHERE s.token = $1 AND s.expires_at > NOW()`,
    [token]
  );
  return rows[0] || null;
};

export const deleteSuperAdminSession = async (token) => {
  await pool().query('DELETE FROM super_admin_sessions WHERE token = $1', [token]);
};

// ── Password reset token helpers ──

export const createResetToken = async (memberId, orgId) => {
  // Invalidate any existing tokens for this member
  await pool().query('UPDATE password_reset_tokens SET used = TRUE WHERE member_id = $1 AND used = FALSE', [memberId]);
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
  await pool().query(
    'INSERT INTO password_reset_tokens (token, member_id, org_id, expires_at) VALUES ($1, $2, $3, $4)',
    [token, memberId, orgId, expires]
  );
  return token;
};

export const validateResetToken = async (token) => {
  const { rows } = await pool().query(
    'SELECT * FROM password_reset_tokens WHERE token = $1 AND used = FALSE AND expires_at > NOW()',
    [token]
  );
  return rows[0] || null;
};

export const markResetTokenUsed = async (token) => {
  await pool().query('UPDATE password_reset_tokens SET used = TRUE WHERE token = $1', [token]);
};
