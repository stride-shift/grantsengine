import { Router } from 'express';
import {
  getAllOrgs, getOrgBySlug, createOrg, updateOrg,
  getOrgProfile, updateOrgProfile,
  getOrgConfig, updateOrgConfig,
  getTeamMembers, upsertTeamMember, deleteTeamMember,
  getPipelineConfig, upsertPipelineConfig,
} from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { resolveOrg } from '../middleware/org.js';

const router = Router();

// GET /api/orgs — list all orgs (public, for org selector)
router.get('/orgs', (req, res) => {
  const orgs = getAllOrgs();
  res.json(orgs);
});

// POST /api/orgs — create new org
router.post('/orgs', (req, res) => {
  const { name, slug, website, industry, country, currency } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'Name and slug required' });

  // Validate slug format
  if (!/^[a-z0-9-]+$/.test(slug)) return res.status(400).json({ error: 'Slug must be lowercase alphanumeric with hyphens' });

  // Check uniqueness
  if (getOrgBySlug(slug)) return res.status(409).json({ error: `Slug "${slug}" already taken` });

  const id = createOrg({ name, slug, website, industry, country, currency });
  res.status(201).json({ id, slug, name });
});

// ── Org-scoped routes (require auth + org resolution) ──

// GET /api/org/:slug — get org details
router.get('/org/:slug', resolveOrg, requireAuth, (req, res) => {
  res.json(req.org);
});

// PUT /api/org/:slug — update org
router.put('/org/:slug', resolveOrg, requireAuth, (req, res) => {
  updateOrg(req.orgId, req.body);
  res.json({ ok: true });
});

// ── Profile ──

router.get('/org/:slug/profile', resolveOrg, requireAuth, (req, res) => {
  const profile = getOrgProfile(req.orgId);
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  // Parse JSON fields
  res.json({
    ...profile,
    programmes: JSON.parse(profile.programmes || '[]'),
    impact_stats: JSON.parse(profile.impact_stats || '{}'),
  });
});

router.put('/org/:slug/profile', resolveOrg, requireAuth, (req, res) => {
  updateOrgProfile(req.orgId, req.body);
  res.json({ ok: true });
});

// ── Config ──

router.get('/org/:slug/config', resolveOrg, requireAuth, (req, res) => {
  const config = getOrgConfig(req.orgId);
  if (!config) return res.status(404).json({ error: 'Config not found' });
  // Parse JSON fields, mask sensitive data
  res.json({
    ...config,
    email_addresses: JSON.parse(config.email_addresses || '[]'),
    whatsapp_numbers: JSON.parse(config.whatsapp_numbers || '[]'),
    smtp_pass: config.smtp_pass ? '••••••' : null,
    twilio_token: config.twilio_token ? '••••••' : null,
  });
});

router.put('/org/:slug/config', resolveOrg, requireAuth, (req, res) => {
  updateOrgConfig(req.orgId, req.body);
  res.json({ ok: true });
});

// ── Team ──

router.get('/org/:slug/team', resolveOrg, requireAuth, (req, res) => {
  res.json(getTeamMembers(req.orgId));
});

router.put('/org/:slug/team/:id', resolveOrg, requireAuth, (req, res) => {
  const id = upsertTeamMember(req.orgId, { ...req.body, id: req.params.id });
  res.json({ id });
});

router.post('/org/:slug/team', resolveOrg, requireAuth, (req, res) => {
  const id = upsertTeamMember(req.orgId, req.body);
  res.status(201).json({ id });
});

router.delete('/org/:slug/team/:id', resolveOrg, requireAuth, (req, res) => {
  deleteTeamMember(req.params.id, req.orgId);
  res.json({ ok: true });
});

// ── Pipeline Config ──

router.get('/org/:slug/pipeline-config', resolveOrg, requireAuth, (req, res) => {
  const config = getPipelineConfig(req.orgId);
  if (!config) return res.json(null);
  res.json({
    ...config,
    stages: JSON.parse(config.stages || '[]'),
    gates: JSON.parse(config.gates || '{}'),
    funder_types: JSON.parse(config.funder_types || '[]'),
    win_factors: JSON.parse(config.win_factors || '[]'),
    loss_factors: JSON.parse(config.loss_factors || '[]'),
    doc_requirements: JSON.parse(config.doc_requirements || '{}'),
    roles: JSON.parse(config.roles || '{}'),
  });
});

router.put('/org/:slug/pipeline-config', resolveOrg, requireAuth, (req, res) => {
  upsertPipelineConfig(req.orgId, req.body);
  res.json({ ok: true });
});

export default router;
