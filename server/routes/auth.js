import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import {
  getOrgBySlug, getOrgAuth, setOrgPassword, createSession, deleteSession, getSession,
  getMemberWithAuth, setMemberPassword, createMemberSession, endSession, logActivity,
  getTeamMembers, createResetToken, validateResetToken, markResetTokenUsed,
  getOrgAndMemberByEmail,
} from '../db.js';
import { sendResetEmail } from '../email.js';
import { requireAuth } from '../middleware/auth.js';
import { resolveOrg } from '../middleware/org.js';

const router = Router();

// Legacy SHA-256 hash (for migration only — new passwords use bcrypt)
const sha256 = (pw) => crypto.createHash('sha256').update(pw).digest('hex');
// Bcrypt hash for new passwords
const hashPw = async (pw) => bcrypt.hash(pw, 10);
// Compare: try bcrypt first, fallback to SHA-256 for legacy hashes
const comparePw = async (pw, hash) => {
  // Bcrypt hashes start with $2b$ or $2a$
  if (hash.startsWith('$2')) return bcrypt.compare(pw, hash);
  // Legacy SHA-256 comparison
  return sha256(pw) === hash;
};

// Wrap async route handlers to catch unhandled errors
const w = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// ── Org-level (legacy shared password) ──

router.post('/org/:slug/auth/login', w(async (req, res) => {
  const { slug } = req.params;
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  const org = await getOrgBySlug(slug);
  if (!org) return res.status(404).json({ error: 'Organisation not found' });

  const auth = await getOrgAuth(org.id);
  if (!auth) return res.status(401).json({ error: 'No password set for this organisation' });

  const valid = await comparePw(password, auth.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  // Auto-upgrade legacy SHA-256 hash to bcrypt on successful login
  if (!auth.password_hash.startsWith('$2')) {
    const upgraded = await hashPw(password);
    await setOrgPassword(org.id, upgraded);
  }

  const session = await createSession(org.id);

  await logActivity(org.id, 'login', {
    sessionToken: session.token,
    meta: { method: 'shared-password' },
  });

  res.json({ token: session.token, expires: session.expires, org: { id: org.id, slug: org.slug, name: org.name } });
}));

router.post('/org/:slug/auth/logout', w(async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    const session = await getSession(token);
    if (session) {
      await logActivity(session.org_id, 'logout', {
        memberId: session.member_id,
        sessionToken: token,
      });
    }
    // Mark session as ended (preserves history for admin dashboard)
    await endSession(token);
  }
  res.json({ ok: true });
}));

router.get('/auth/verify', w(async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });

  const session = await getSession(token);
  if (!session) return res.status(401).json({ error: 'Invalid or expired session' });

  res.json({ ok: true, orgId: session.org_id, memberId: session.member_id || null });
}));

router.post('/org/:slug/auth/set-password', w(async (req, res) => {
  const { slug } = req.params;
  const { password } = req.body;
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const org = await getOrgBySlug(slug);
  if (!org) return res.status(404).json({ error: 'Organisation not found' });

  const existing = await getOrgAuth(org.id);
  if (existing) return res.status(400).json({ error: 'Password already set. Contact admin to reset.' });

  await setOrgPassword(org.id, await hashPw(password));
  const session = await createSession(org.id);
  res.json({ token: session.token, expires: session.expires, org: { id: org.id, slug: org.slug, name: org.name } });
}));

// ── Email-based login (org-agnostic; resolves the org from a globally-unique email) ──
// The primary login path: user enters email + password, no org picking. The legacy
// org-scoped member-login below remains as a migration fallback until every member
// has a backfilled email + password.
router.post('/auth/login', w(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const row = await getOrgAndMemberByEmail(email);
  // Generic message — never reveal whether the email exists or has a password set.
  if (!row || !row.password_hash) return res.status(401).json({ error: 'Invalid email or password' });

  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  const session = await createMemberSession(row.org_id, row.member_id);

  await logActivity(row.org_id, 'login', {
    memberId: row.member_id,
    sessionToken: session.token,
    meta: { member_name: row.name, method: 'email' },
  });

  res.json({
    token: session.token,
    expires: session.expires,
    slug: row.slug,
    org: { id: row.org_id, slug: row.slug },
    member: { id: row.member_id, name: row.name, role: row.role, initials: row.initials },
  });
}));

// ── Member-level (individual login) — legacy / migration fallback ──

router.post('/org/:slug/auth/member-login', w(async (req, res) => {
  const { slug } = req.params;
  const { memberId, password } = req.body;
  if (!memberId || !password) return res.status(400).json({ error: 'Member ID and password required' });

  const org = await getOrgBySlug(slug);
  if (!org) return res.status(404).json({ error: 'Organisation not found' });

  const member = await getMemberWithAuth(org.id, memberId);
  if (!member) return res.status(404).json({ error: 'Team member not found' });
  if (!member.password_hash) return res.status(401).json({ error: 'No password set for this user. Ask a director to set one.' });

  const valid = await bcrypt.compare(password, member.password_hash);
  if (!valid) return res.status(401).json({ error: 'Incorrect password' });

  const session = await createMemberSession(org.id, member.id);

  await logActivity(org.id, 'login', {
    memberId: member.id,
    sessionToken: session.token,
    meta: { member_name: member.name },
  });

  res.json({
    token: session.token,
    expires: session.expires,
    org: { id: org.id, slug: org.slug, name: org.name },
    member: { id: member.id, name: member.name, role: member.role, initials: member.initials },
  });
}));

// Authenticated password set/change. The caller must already be logged in and
// may only change their OWN password (or, if a director, any member's).
// First-time setup for a member who has no password goes through the email
// reset-token flow (request-reset → reset-password), NOT this endpoint — this
// closes the previous unauthenticated account-takeover path.
router.post('/org/:slug/auth/member-set-password', resolveOrg, requireAuth, w(async (req, res) => {
  const { memberId, password } = req.body;
  if (!memberId || !password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const team = await getTeamMembers(req.orgId);
  const me = team.find(m => m.id === req.memberId);
  const isSelf = req.memberId && req.memberId === memberId;
  const isDirector = me && me.role === 'director';
  if (!isSelf && !isDirector) {
    return res.status(403).json({ error: 'You can only set your own password. Ask a director to reset another member.' });
  }

  const member = await getMemberWithAuth(req.orgId, memberId);
  if (!member) return res.status(404).json({ error: 'Team member not found' });

  const hash = await bcrypt.hash(password, 10);
  await setMemberPassword(memberId, hash);

  await logActivity(req.orgId, 'password_set', {
    memberId: req.memberId,
    sessionToken: req.session?.token,
    meta: { target_id: memberId, self: isSelf },
  });

  res.json({ ok: true });
}));

// Director-only: reset a member's password
router.post('/org/:slug/auth/admin-reset-password', resolveOrg, requireAuth, w(async (req, res) => {
  // Check caller is director
  const team = await getTeamMembers(req.orgId);
  const me = team.find(m => m.id === req.memberId);
  if (!me || me.role !== 'director') return res.status(403).json({ error: 'Admin access required' });

  const { memberId, password } = req.body;
  if (!memberId || !password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  // Can't reset own password through this endpoint
  if (memberId === req.memberId) return res.status(400).json({ error: 'Use the normal password change to update your own password' });

  const member = await getMemberWithAuth(req.orgId, memberId);
  if (!member) return res.status(404).json({ error: 'Team member not found' });

  const hash = await bcrypt.hash(password, 10);
  await setMemberPassword(memberId, hash);

  await logActivity(req.orgId, 'admin_action', {
    memberId: req.memberId,
    sessionToken: req.session?.token,
    meta: { action: 'password_reset', target_member: member.name, target_id: memberId },
  });

  res.json({ ok: true });
}));

// NOTE: the legacy self-service "forgot-password via SUPER_ADMIN_KEY" endpoint was
// removed — it let a single shared key reset any member in any org and auto-login.
// Password recovery now goes exclusively through the emailed reset-token flow below
// (request-reset → reset-password), or a director using admin-reset-password.

// ── Request password reset (sends email link) ──
router.post('/org/:slug/auth/request-reset', w(async (req, res) => {
  const { slug } = req.params;
  const { memberId } = req.body;
  if (!memberId) return res.status(400).json({ error: 'Member ID required' });

  const org = await getOrgBySlug(slug);
  if (!org) return res.status(404).json({ error: 'Organisation not found' });

  const member = await getMemberWithAuth(org.id, memberId);
  // Always return success to avoid leaking whether email exists
  if (!member || !member.email) {
    return res.json({ ok: true });
  }

  const token = await createResetToken(member.id, org.id);

  // Build reset URL — use Origin header or fallback
  const origin = req.headers.origin || `${req.protocol}://${req.headers.host}`;
  const resetUrl = `${origin}?reset=${token}&slug=${slug}`;

  try {
    await sendResetEmail(member.email, resetUrl, member.name);
  } catch (err) {
    console.error('[auth] Failed to send reset email:', err.message);
    // Still return ok — don't reveal email delivery status
  }

  await logActivity(org.id, 'password_reset_requested', {
    memberId: member.id,
    meta: { member_name: member.name, method: 'email' },
  });

  res.json({ ok: true });
}));

// ── Reset password with token (from email link) ──
router.post('/org/:slug/auth/reset-password', w(async (req, res) => {
  const { slug } = req.params;
  const { token, newPassword } = req.body;

  if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const resetToken = await validateResetToken(token);
  if (!resetToken) return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });

  const org = await getOrgBySlug(slug);
  if (!org || org.id !== resetToken.org_id) return res.status(400).json({ error: 'Invalid reset link' });

  const member = await getMemberWithAuth(org.id, resetToken.member_id);
  if (!member) return res.status(404).json({ error: 'Team member not found' });

  const hash = await bcrypt.hash(newPassword, 10);
  await setMemberPassword(member.id, hash);
  await markResetTokenUsed(token);

  // Auto-login
  const session = await createMemberSession(org.id, member.id);

  await logActivity(org.id, 'password_reset', {
    memberId: member.id,
    sessionToken: session.token,
    meta: { member_name: member.name, method: 'email_link' },
  });

  res.json({
    token: session.token,
    expires: session.expires,
    org: { id: org.id, slug: org.slug, name: org.name },
    member: { id: member.id, name: member.name, role: member.role, initials: member.initials },
  });
}));

export { hashPw };
export default router;
