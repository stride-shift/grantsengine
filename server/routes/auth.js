import { Router } from 'express';
import crypto from 'crypto';
import { getOrgBySlug, getOrgAuth, setOrgPassword, createSession, deleteSession, getSession } from '../db.js';

const router = Router();

const hashPw = (pw) => crypto.createHash('sha256').update(pw).digest('hex');

router.post('/org/:slug/auth/login', async (req, res) => {
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
});

router.post('/org/:slug/auth/logout', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) await deleteSession(token);
  res.json({ ok: true });
});

router.get('/auth/verify', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });

  const session = await getSession(token);
  if (!session) return res.status(401).json({ error: 'Invalid or expired session' });

  res.json({ ok: true, orgId: session.org_id });
});

router.post('/org/:slug/auth/set-password', async (req, res) => {
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
});

export { hashPw };
export default router;
