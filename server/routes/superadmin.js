import { Router } from 'express';
import crypto from 'crypto';
import {
  getAllOrgs, getOrgUsage, getActivityLog, getActiveSessions, getSessionHistory,
  getAgentRuns, setOrgSubscription, createOrg, getOrgBySlug, getOrgById,
  upsertTeamMember, deleteOrg, createResetToken,
} from '../db.js';
import { sendResetEmail } from '../email.js';
import { requireSuperAdmin } from '../middleware/superadmin.js';

const router = Router();

// Wrap async route handlers to catch unhandled errors (same pattern as auth.js)
const w = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Derive initials from a name: first letter of up to the first two words, uppercased.
const initialsFromName = (name) =>
  (name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '?';

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

// ── Provision a new org ──
router.post('/superadmin/orgs', requireSuperAdmin, w(async (req, res) => {
  const { name, slug, website, industry, country, currency } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'Name and slug are required' });
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Slug must contain only lowercase letters, numbers and hyphens' });
  }

  const existing = await getOrgBySlug(slug);
  if (existing) return res.status(409).json({ error: 'An organisation with that slug already exists' });

  const id = await createOrg({ name, slug, website, industry, country, currency });
  res.status(201).json({ id, slug, name });
}));

// ── Provision a member in an org (sends a password-setup / reset email) ──
router.post('/superadmin/orgs/:orgId/members', requireSuperAdmin, w(async (req, res) => {
  const { orgId } = req.params;
  const { name, email, role } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  // TEXT id matching the convention used elsewhere (db.uid → 16 hex chars).
  const id = crypto.randomBytes(8).toString('hex');
  const initials = initialsFromName(name);
  await upsertTeamMember(orgId, { id, name, email: email || null, role: role || 'pm', initials });

  // Best-effort: email a reset/setup link so the member can set their own password.
  // Mirrors the request-reset handler's URL shape (?reset=<token>&slug=<orgSlug>).
  if (email) {
    try {
      const org = await getOrgById(orgId);
      const token = await createResetToken(id, orgId);
      const origin = req.headers.origin || `${req.protocol}://${req.headers.host}`;
      const resetUrl = `${origin}?reset=${token}&slug=${org?.slug || ''}`;
      await sendResetEmail(email, resetUrl, name);
    } catch (err) {
      console.error('[superadmin] Failed to send setup email for new member:', err.message);
      // Don't fail the request — the member is created; the email can be re-sent.
    }
  }

  res.status(201).json({ id, name, email: email || null, role: role || 'pm', initials });
}));

// ── Delete an org (cascades to all child rows) ──
router.delete('/superadmin/orgs/:orgId', requireSuperAdmin, w(async (req, res) => {
  await deleteOrg(req.params.orgId);
  res.json({ ok: true });
}));

export default router;
