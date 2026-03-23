import { Router } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import {
  getAllOrgs, getOrgBySlug, createOrg, updateOrg, deleteOrg,
  getOrgProfile, updateOrgProfile,
  getOrgConfig, updateOrgConfig,
  getTeamMembers, upsertTeamMember, deleteTeamMember,
  getPipelineConfig, upsertPipelineConfig,
} from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { resolveOrg } from '../middleware/org.js';

const router = Router();

// Director-only check for team management
const requireDirector = async (req, res, next) => {
  if (!req.memberId) return res.status(403).json({ error: 'Individual login required' });
  const team = await getTeamMembers(req.orgId);
  const me = team.find(m => m.id === req.memberId);
  if (!me || me.role !== 'director') return res.status(403).json({ error: 'Admin access required' });
  next();
};

// Wrap async route handlers to catch unhandled errors
const w = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Multer for logo uploads (images only, 5MB max)
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

function getLogoStorage() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  return createClient(url, key).storage.from('logos');
}

router.get('/orgs', w(async (req, res) => {
  // Public listing — return minimal info only (no internal details)
  const orgs = await getAllOrgs();
  res.json(orgs.map(o => ({ id: o.id, name: o.name, slug: o.slug, logo_url: o.logo_url })));
}));

router.post('/orgs', w(async (req, res) => {
  // Require super-admin key to create new orgs
  const adminKey = req.headers['x-admin-key'];
  const expected = process.env.SUPER_ADMIN_KEY;
  if (!expected || adminKey !== expected) {
    return res.status(403).json({ error: 'Admin key required to create organisations' });
  }

  const { name, slug, website, industry, country, currency, logo_url } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'Name and slug required' });
  if (!/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ error: 'Slug must be lowercase alphanumeric with hyphens' });
  if (await getOrgBySlug(slug)) return res.status(409).json({ error: `Slug "${slug}" already taken` });

  const id = await createOrg({ name, slug, website, industry, country, currency });

  // If a logo URL was provided (e.g. favicon), save it
  if (logo_url) {
    await updateOrg(id, { logo_url });
  }

  res.status(201).json({ id, slug, name, logo_url: logo_url || null });
}));

// ── Super-admin: delete an org (cascades all data) ──
router.delete('/orgs/:slug', w(async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  const expected = process.env.SUPER_ADMIN_KEY;
  if (!expected || adminKey !== expected) {
    return res.status(403).json({ error: 'Invalid admin key' });
  }
  const org = await getOrgBySlug(req.params.slug);
  if (!org) return res.status(404).json({ error: 'Org not found' });
  await deleteOrg(org.id);
  res.json({ ok: true, deleted: org.slug });
}));

router.get('/org/:slug', resolveOrg, requireAuth, (req, res) => {
  res.json(req.org);
});

router.put('/org/:slug', resolveOrg, requireAuth, w(async (req, res) => {
  await updateOrg(req.orgId, req.body);
  res.json({ ok: true });
}));

router.get('/org/:slug/profile', resolveOrg, requireAuth, w(async (req, res) => {
  const profile = await getOrgProfile(req.orgId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  const safeJSON = (str, fb) => { try { return JSON.parse(str || (typeof fb === 'string' ? fb : JSON.stringify(fb))); } catch { return fb; } };
  res.json({
    ...profile,
    programmes: safeJSON(profile.programmes, []),
    impact_stats: safeJSON(profile.impact_stats, {}),
  });
}));

router.put('/org/:slug/profile', resolveOrg, requireAuth, w(async (req, res) => {
  await updateOrgProfile(req.orgId, req.body);
  res.json({ ok: true });
}));

router.get('/org/:slug/config', resolveOrg, requireAuth, w(async (req, res) => {
  const config = await getOrgConfig(req.orgId);
  if (!config) return res.status(404).json({ error: 'Config not found' });
  const sj2 = (str, fb) => { try { return JSON.parse(str || JSON.stringify(fb)); } catch { return fb; } };
  res.json({
    ...config,
    email_addresses: sj2(config.email_addresses, []),
    whatsapp_numbers: sj2(config.whatsapp_numbers, []),
    smtp_pass: config.smtp_pass ? '••••••' : null,
    twilio_token: config.twilio_token ? '••••••' : null,
  });
}));

router.put('/org/:slug/config', resolveOrg, requireAuth, w(async (req, res) => {
  await updateOrgConfig(req.orgId, req.body);
  res.json({ ok: true });
}));

// Public team list (for login screen — no auth required, no password_hash)
router.get('/org/:slug/team/public', resolveOrg, w(async (req, res) => {
  const team = await getTeamMembers(req.orgId);
  res.json(team.filter(m => m.id !== 'team').map(m => ({
    id: m.id, name: m.name, initials: m.initials, role: m.role, hasPassword: !!m.password_hash, hasEmail: !!m.email,
  })));
}));

router.get('/org/:slug/team', resolveOrg, requireAuth, w(async (req, res) => {
  const team = await getTeamMembers(req.orgId);
  // Strip password_hash — never send to browser
  res.json(team.map(({ password_hash, ...m }) => m));
}));

router.put('/org/:slug/team/:id', resolveOrg, requireAuth, requireDirector, w(async (req, res) => {
  const id = await upsertTeamMember(req.orgId, { ...req.body, id: req.params.id });
  res.json({ id });
}));

router.post('/org/:slug/team', resolveOrg, requireAuth, requireDirector, w(async (req, res) => {
  const id = await upsertTeamMember(req.orgId, req.body);
  res.status(201).json({ id });
}));

router.delete('/org/:slug/team/:id', resolveOrg, requireAuth, requireDirector, w(async (req, res) => {
  // Prevent deleting yourself
  if (req.params.id === req.memberId) return res.status(400).json({ error: 'Cannot delete your own account' });
  await deleteTeamMember(req.params.id, req.orgId);
  res.json({ ok: true });
}));

router.get('/org/:slug/pipeline-config', resolveOrg, requireAuth, w(async (req, res) => {
  const config = await getPipelineConfig(req.orgId);
  if (!config) return res.json(null);
  const sj = (str, fb) => { try { return JSON.parse(str || (typeof fb === 'string' ? fb : JSON.stringify(fb))); } catch { return fb; } };
  res.json({
    ...config,
    stages: sj(config.stages, []),
    gates: sj(config.gates, {}),
    funder_types: sj(config.funder_types, []),
    win_factors: sj(config.win_factors, []),
    loss_factors: sj(config.loss_factors, []),
    doc_requirements: sj(config.doc_requirements, {}),
    roles: sj(config.roles, {}),
  });
}));

router.put('/org/:slug/pipeline-config', resolveOrg, requireAuth, w(async (req, res) => {
  await upsertPipelineConfig(req.orgId, req.body);
  res.json({ ok: true });
}));

// ── Logo endpoints ──

// PUT /api/org/:slug/logo — upload a logo image
router.put('/org/:slug/logo', resolveOrg, requireAuth, logoUpload.single('logo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image provided' });
    const storage = getLogoStorage();
    if (!storage) return res.status(500).json({ error: 'Storage not configured' });

    const rawExt = (req.file.originalname.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i)?.[1] || 'png').toLowerCase();
    const filename = `${crypto.randomBytes(8).toString('hex')}.${rawExt}`;
    const storagePath = `${req.orgId}/${filename}`;

    const { error: upErr } = await storage.upload(storagePath, req.file.buffer, {
      contentType: req.file.mimetype, upsert: true,
    });
    if (upErr) return res.status(500).json({ error: 'Logo upload failed' });

    const { data } = storage.getPublicUrl(storagePath);
    const logo_url = data.publicUrl;

    await updateOrg(req.orgId, { logo_url });
    res.json({ logo_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/org/:slug/logo/from-website — auto-fetch favicon from website
router.post('/org/:slug/logo/from-website', resolveOrg, requireAuth, async (req, res) => {
  try {
    const { website } = req.body;
    if (!website) return res.status(400).json({ error: 'Website URL required' });

    let domain;
    try {
      domain = new URL(website.startsWith('http') ? website : `https://${website}`).hostname;
    } catch {
      return res.status(400).json({ error: 'Invalid website URL' });
    }

    // Fetch favicon from Google's service (128px) — with 10s timeout
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
    const ac = new AbortController();
    const faviconTimeout = setTimeout(() => ac.abort(), 10_000);
    let response;
    try {
      response = await fetch(faviconUrl, { signal: ac.signal });
    } finally { clearTimeout(faviconTimeout); }
    if (!response.ok) return res.status(404).json({ error: 'Could not fetch favicon' });

    const buffer = Buffer.from(await response.arrayBuffer());
    // Google returns a default globe icon (small ~1KB) when no favicon exists
    if (buffer.length < 200) return res.status(404).json({ error: 'No favicon found for this domain' });

    const storage = getLogoStorage();
    if (!storage) return res.status(500).json({ error: 'Storage not configured' });

    const storagePath = `${req.orgId}/favicon.png`;
    const { error: upErr } = await storage.upload(storagePath, buffer, {
      contentType: 'image/png', upsert: true,
    });
    if (upErr) return res.status(500).json({ error: 'Failed to save favicon' });

    const { data } = storage.getPublicUrl(storagePath);
    const logo_url = data.publicUrl;

    await updateOrg(req.orgId, { logo_url });
    res.json({ logo_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
