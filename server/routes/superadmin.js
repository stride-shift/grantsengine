import { Router } from 'express';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import {
  getAllOrgs, getOrgUsage, getActivityLog, getActiveSessions, getSessionHistory,
  getAgentRuns, setOrgSubscription, createOrg, getOrgBySlug, getOrgById,
  getTeamMembers, getMemberById, upsertTeamMember, deleteTeamMember, deleteOrg, createResetToken,
  getSuperAdminByEmail, deleteSuperAdminSession, createSuperAdmin,
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

// ── Standalone super-admin login ──
// Login is unified into POST /api/auth/login: an email with no org member that
// matches a super_admins row authenticates there and gets a super-admin session
// (response: { superAdmin: true, token, ... }). There is no separate login here.

// ── Standalone super-admin logout ──
router.post('/superadmin/logout', requireSuperAdmin, w(async (req, res) => {
  if (req.superAdminToken) await deleteSuperAdminSession(req.superAdminToken);
  res.json({ ok: true });
}));

// ── Verify a super-admin credential (either standalone or org-member) ──
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
  const { name, email, role, accessLevel } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  // Platform access level (super_admin | admin | user), separate from pipeline role.
  const validLevels = ['super_admin', 'admin', 'user'];
  const level = validLevels.includes(accessLevel) ? accessLevel : 'user';

  // TEXT id matching the convention used elsewhere (db.uid → 16 hex chars).
  const id = crypto.randomBytes(8).toString('hex');
  const initials = initialsFromName(name);
  await upsertTeamMember(orgId, {
    id, name, email: email || null, role: role || 'pm', initials,
    access_level: level === 'super_admin' ? 'super_admin' : level,
  });

  // A super_admin access level promotes them to a standalone platform admin too,
  // so they can use the dedicated super-admin login. Random temp password — they
  // set a real one via the setup email below. Ignore if already a super-admin.
  if (level === 'super_admin' && email) {
    try {
      if (!(await getSuperAdminByEmail(email))) {
        const tempHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
        await createSuperAdmin({ email, name, passwordHash: tempHash });
      }
    } catch (err) {
      console.error('[superadmin] Failed to create standalone super-admin for new member:', err.message);
      // Don't fail the request — the org member exists regardless.
    }
  }

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

  res.status(201).json({ id, name, email: email || null, role: role || 'pm', initials, access_level: level === 'super_admin' ? 'super_admin' : level });
}));

// ── List an org's members ──
// Strips password_hash from every row and drops the synthetic `team` placeholder.
router.get('/superadmin/orgs/:orgId/members', requireSuperAdmin, w(async (req, res) => {
  const team = await getTeamMembers(req.params.orgId);
  res.json(
    team
      .filter((m) => m.id !== 'team')
      .map(({ password_hash, ...m }) => m)
  );
}));

// ── Edit an existing member ──
// Merges supplied fields over the existing record (unspecified fields keep their
// current value — never blanked), recomputes initials from the final name, and
// persists. accessLevel is COALESCEd in upsertTeamMember, so omitting it won't
// downgrade. Promoting to super_admin also ensures a standalone platform admin
// exists (so they get cross-org login); downgrading does NOT remove that account.
router.put('/superadmin/orgs/:orgId/members/:memberId', requireSuperAdmin, w(async (req, res) => {
  const { orgId, memberId } = req.params;
  const { name, email, role, accessLevel } = req.body;

  // getMemberById queries by id alone; confirm the row belongs to this org.
  const existing = await getMemberById(memberId);
  if (!existing || existing.org_id !== orgId) {
    return res.status(404).json({ error: 'Member not found' });
  }

  // Merge: prefer the supplied value, else keep the existing one.
  const merged = {
    name: name !== undefined ? name : existing.name,
    email: email !== undefined ? email : existing.email,
    role: role !== undefined ? role : existing.role,
  };
  const initials = initialsFromName(merged.name);

  await upsertTeamMember(orgId, {
    id: memberId,
    name: merged.name,
    email: merged.email || null,
    role: merged.role || 'pm',
    initials,
    // Pass accessLevel only when supplied; undefined → COALESCE keeps the current level.
    access_level: accessLevel,
  });

  // Promotion to super_admin → ensure a standalone platform admin too. Random temp
  // password; they set a real one via create-superadmin.js or a future flow.
  if (accessLevel === 'super_admin' && merged.email) {
    try {
      if (!(await getSuperAdminByEmail(merged.email))) {
        const tempHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
        await createSuperAdmin({ email: merged.email, name: merged.name, passwordHash: tempHash });
      }
    } catch (err) {
      console.error('[superadmin] Failed to sync standalone super-admin on member update:', err.message);
      // Don't fail the request — the member update succeeded regardless.
    }
  }

  const updated = await getMemberById(memberId);
  const { password_hash, ...safe } = updated;
  res.json(safe);
}));

// ── Delete a member ──
router.delete('/superadmin/orgs/:orgId/members/:memberId', requireSuperAdmin, w(async (req, res) => {
  const { orgId, memberId } = req.params;
  // The synthetic `team` row is a shared placeholder, not a real member — never delete it.
  if (memberId === 'team') return res.status(400).json({ error: 'Cannot delete the shared team placeholder' });
  await deleteTeamMember(memberId, orgId);
  res.json({ ok: true });
}));

// ── Create a standalone super-admin (no org) ──
// A platform account in super_admins with no org membership. Created with a random
// temp password — until a password-set flow exists, use create-superadmin.js to set
// a known one (noted in the response message). 409 if the email is already a super-admin.
router.post('/superadmin/admins', requireSuperAdmin, w(async (req, res) => {
  const { email, name } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  if (await getSuperAdminByEmail(email)) {
    return res.status(409).json({ error: 'A super-admin with that email already exists' });
  }

  const tempHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
  await createSuperAdmin({ email, name: name || null, passwordHash: tempHash });

  res.status(201).json({
    ok: true,
    email,
    message: 'Super-admin created with a temporary password. Set a known password with `node server/create-superadmin.js <email> <password> "<name>"` (it reports if the email already exists) until a self-service password-set flow is available.',
  });
}));

// ── Delete an org (cascades to all child rows) ──
router.delete('/superadmin/orgs/:orgId', requireSuperAdmin, w(async (req, res) => {
  await deleteOrg(req.params.orgId);
  res.json({ ok: true });
}));

export default router;
