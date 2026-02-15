import { Router } from 'express';
import crypto from 'crypto';
import { getOrgBySlug, getOrgAuth, setOrgPassword, createSession, deleteSession, getSession } from '../db.js';

const router = Router();

// Hash password with SHA-256 (simple, no external dep needed for Phase 1)
const hashPw = (pw) => crypto.createHash('sha256').update(pw).digest('hex');

// POST /api/org/:slug/auth/login
router.post('/org/:slug/auth/login', (req, res) => {
  const { slug } = req.params;
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Password required' });

  const org = getOrgBySlug(slug);
  if (!org) return res.status(404).json({ error: 'Organisation not found' });

  const auth = getOrgAuth(org.id);
  if (!auth) return res.status(401).json({ error: 'No password set for this organisation' });

  if (hashPw(password) !== auth.password_hash) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  const session = createSession(org.id);
  res.json({ token: session.token, expires: session.expires, org: { id: org.id, slug: org.slug, name: org.name } });
});

// POST /api/org/:slug/auth/logout
router.post('/org/:slug/auth/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) deleteSession(token);
  res.json({ ok: true });
});

// GET /api/auth/verify — check if current token is valid
router.get('/auth/verify', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });

  const session = getSession(token);
  if (!session) return res.status(401).json({ error: 'Invalid or expired session' });

  const org = getOrgBySlug(null); // We need org by id
  // Get org directly from the session
  res.json({ ok: true, orgId: session.org_id });
});

// POST /api/org/:slug/auth/set-password — set initial password (only if none exists)
router.post('/org/:slug/auth/set-password', (req, res) => {
  const { slug } = req.params;
  const { password } = req.body;
  if (!password || password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

  const org = getOrgBySlug(slug);
  if (!org) return res.status(404).json({ error: 'Organisation not found' });

  const existing = getOrgAuth(org.id);
  if (existing) return res.status(400).json({ error: 'Password already set. Contact admin to reset.' });

  setOrgPassword(org.id, hashPw(password));
  const session = createSession(org.id);
  res.json({ token: session.token, expires: session.expires, org: { id: org.id, slug: org.slug, name: org.name } });
});

export { hashPw };
export default router;
