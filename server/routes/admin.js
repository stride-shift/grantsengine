import { Router } from 'express';
import { getActiveSessions, getSessionHistory, getActivityLog, getTeamMembers, logActivity } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { resolveOrg } from '../middleware/org.js';

const router = Router();
const w = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Director-only check (runs after requireAuth)
const requireDirector = async (req, res, next) => {
  if (!req.memberId) return res.status(403).json({ error: 'Individual login required (not shared password)' });
  const team = await getTeamMembers(req.orgId);
  const me = team.find(m => m.id === req.memberId);
  if (!me || me.role !== 'director') return res.status(403).json({ error: 'Director access required' });
  next();
};

const adminAuth = [resolveOrg, requireAuth, requireDirector];

// ── Active sessions (who's online now) ──
router.get('/org/:slug/admin/sessions/active', ...adminAuth, w(async (req, res) => {
  res.json(await getActiveSessions(req.orgId));
}));

// ── Session history (recent logins with duration) ──
router.get('/org/:slug/admin/sessions/history', ...adminAuth, w(async (req, res) => {
  const limit = parseInt(req.query.limit) || 30;
  res.json(await getSessionHistory(req.orgId, limit));
}));

// ── Activity feed ──
router.get('/org/:slug/admin/activity', ...adminAuth, w(async (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const memberId = req.query.member_id || null;
  res.json(await getActivityLog(req.orgId, { limit, memberId }));
}));

// ── Log export event (called from frontend when .docx is downloaded) ──
router.post('/org/:slug/admin/log-export', resolveOrg, requireAuth, w(async (req, res) => {
  await logActivity(req.orgId, 'export', {
    memberId: req.memberId,
    sessionToken: req.session?.token,
    grantId: req.body?.grantId || null,
    meta: { filename: req.body?.filename || '' },
  });
  res.json({ ok: true });
}));

export default router;
