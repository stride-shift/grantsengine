import { Router } from 'express';
import bcrypt from 'bcryptjs';
import {
  getSuperAdminByEmail, createSuperAdminSession, deleteSuperAdminSession,
  getAllOrgs, getOrgUsage, getActivityLog, getActiveSessions, getSessionHistory,
  getAgentRuns, setOrgSubscription,
} from '../db.js';
import { requireSuperAdmin } from '../middleware/superadmin.js';

const router = Router();

// Wrap async route handlers to catch unhandled errors (same pattern as auth.js)
const w = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// ── Login (public) ──
router.post('/superadmin/login', w(async (req, res) => {
  const { email, password } = req.body;
  // Generic error — never reveal whether the email exists (no enumeration).
  if (!email || !password) return res.status(401).json({ error: 'Invalid email or password' });

  const admin = await getSuperAdminByEmail(email);
  if (!admin) return res.status(401).json({ error: 'Invalid email or password' });

  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  const session = await createSuperAdminSession(admin.id);
  res.json({
    token: session.token,
    expires: session.expires,
    admin: { name: admin.name, email: admin.email },
  });
}));

// ── Logout ──
router.post('/superadmin/logout', requireSuperAdmin, w(async (req, res) => {
  await deleteSuperAdminSession(req.superAdminToken);
  res.json({ ok: true });
}));

// ── Verify session ──
router.get('/superadmin/verify', requireSuperAdmin, w(async (req, res) => {
  res.json({ admin: req.superAdmin });
}));

// ── List all orgs with usage ──
router.get('/superadmin/orgs', requireSuperAdmin, w(async (req, res) => {
  const orgs = await getAllOrgs();
  const withUsage = await Promise.all(orgs.map(async (org) => ({
    id: org.id,
    slug: org.slug,
    name: org.name,
    logo_url: org.logo_url,
    industry: org.industry,
    country: org.country,
    org_type: org.org_type,
    subscription_plan: org.subscription_plan,
    subscription_status: org.subscription_status,
    trial_expires_at: org.trial_expires_at,
    readonly_lock: org.readonly_lock,
    created_at: org.created_at,
    usage: await getOrgUsage(org.id),
  })));
  res.json(withUsage);
}));

// ── Per-org activity log ──
router.get('/superadmin/orgs/:orgId/activity', requireSuperAdmin, w(async (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const rows = await getActivityLog(req.params.orgId, { limit });
  res.json(rows);
}));

// ── Per-org sessions (active + recent history) ──
router.get('/superadmin/orgs/:orgId/sessions', requireSuperAdmin, w(async (req, res) => {
  const [active, history] = await Promise.all([
    getActiveSessions(req.params.orgId),
    getSessionHistory(req.params.orgId, 30),
  ]);
  res.json({ active, history });
}));

// ── Per-org usage (aggregates + recent agent runs) ──
router.get('/superadmin/orgs/:orgId/usage', requireSuperAdmin, w(async (req, res) => {
  const [usage, agentRuns] = await Promise.all([
    getOrgUsage(req.params.orgId),
    getAgentRuns(req.params.orgId, 20),
  ]);
  res.json({ ...usage, agentRuns });
}));

// ── Update an org's subscription / read-only lock ──
router.put('/superadmin/orgs/:orgId/subscription', requireSuperAdmin, w(async (req, res) => {
  // Only forward keys the caller actually supplied — passing `undefined` through
  // would null out columns, since setOrgSubscription builds SET clauses from every
  // allowed key present in the object.
  const allowed = ['subscription_plan', 'subscription_status', 'readonly_lock', 'trial_expires_at', 'subscription_period_end'];
  const updates = {};
  for (const k of allowed) {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  }
  await setOrgSubscription(req.params.orgId, updates);
  res.json({ ok: true });
}));

export default router;
