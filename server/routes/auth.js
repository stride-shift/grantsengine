import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import {
  getOrgBySlug, getOrgAuth, setOrgPassword, createSession, deleteSession, getSession,
  getMemberWithAuth, setMemberPassword, createMemberSession, endSession, logActivity,
} from '../db.js';

const router = Router();

const hashPw = (pw) => crypto.createHash('sha256').update(pw).digest('hex');

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

  if (hashPw(password) !== auth.password_hash) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const session = await createSession(org.id);
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
      await endSession(token);
    }
    await deleteSession(token);
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
  if (!password || password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

  const org = await getOrgBySlug(slug);
  if (!org) return res.status(404).json({ error: 'Organisation not found' });

  const existing = await getOrgAuth(org.id);
  if (existing) return res.status(400).json({ error: 'Password already set. Contact admin to reset.' });

  await setOrgPassword(org.id, hashPw(password));
  const session = await createSession(org.id);
  res.json({ token: session.token, expires: session.expires, org: { id: org.id, slug: org.slug, name: org.name } });
}));

// ── Member-level (individual login) ──

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

router.post('/org/:slug/auth/member-set-password', w(async (req, res) => {
  const { slug } = req.params;
  const { memberId, password } = req.body;
  if (!memberId || !password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const org = await getOrgBySlug(slug);
  if (!org) return res.status(404).json({ error: 'Organisation not found' });

  const member = await getMemberWithAuth(org.id, memberId);
  if (!member) return res.status(404).json({ error: 'Team member not found' });

  const hash = await bcrypt.hash(password, 10);
  await setMemberPassword(memberId, hash);

  // Auto-login after setting password
  const session = await createMemberSession(org.id, member.id);

  await logActivity(org.id, 'login', {
    memberId: member.id,
    sessionToken: session.token,
    meta: { member_name: member.name, first_login: true },
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
