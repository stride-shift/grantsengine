import { Router } from 'express';
import {
  getGrants, upsertGrant, deleteGrant, replaceAllGrants,
  getApprovals, createApproval, updateApproval,
  getComplianceDocs, upsertComplianceDoc,
  getAgentRuns,
  kvGet, kvSet,
  logActivity, getGrantById,
} from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { resolveOrg } from '../middleware/org.js';

const router = Router();

// All data routes are org-scoped and require auth
const orgAuth = [resolveOrg, requireAuth];

// Wrap async route handlers to catch unhandled errors
const w = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// ── Grants ──

router.get('/org/:slug/grants', ...orgAuth, w(async (req, res) => {
  res.json(await getGrants(req.orgId));
}));

router.put('/org/:slug/grants', ...orgAuth, w(async (req, res) => {
  const grants = req.body;
  if (!Array.isArray(grants)) return res.status(400).json({ error: 'Expected array' });
  await replaceAllGrants(req.orgId, grants);
  res.json({ ok: true });
}));

router.put('/org/:slug/grants/:id', ...orgAuth, w(async (req, res) => {
  const grant = req.body;
  if (!grant) return res.status(400).json({ error: 'Grant data required' });

  // Detect stage changes before upserting
  const existing = await getGrantById(req.params.id, req.orgId);
  const id = await upsertGrant(req.orgId, { ...grant, id: req.params.id });

  // Log activity (best-effort)
  if (existing && existing.stage !== grant.stage && grant.stage) {
    logActivity(req.orgId, 'stage_change', {
      memberId: req.memberId, sessionToken: req.session?.token, grantId: id,
      meta: { grant_name: grant.name, from_stage: existing.stage, to_stage: grant.stage },
    }).catch(() => {});
  } else {
    logActivity(req.orgId, 'grant_update', {
      memberId: req.memberId, sessionToken: req.session?.token, grantId: id,
      meta: { grant_name: grant.name },
    }).catch(() => {});
  }

  res.json({ ok: true, id });
}));

router.post('/org/:slug/grants', ...orgAuth, w(async (req, res) => {
  const grant = req.body;
  if (!grant || !grant.name) return res.status(400).json({ error: 'Grant name required' });
  const id = await upsertGrant(req.orgId, grant);

  logActivity(req.orgId, 'grant_create', {
    memberId: req.memberId, sessionToken: req.session?.token, grantId: id,
    meta: { grant_name: grant.name },
  }).catch(() => {});

  res.status(201).json({ ok: true, id });
}));

router.delete('/org/:slug/grants/:id', ...orgAuth, w(async (req, res) => {
  const existing = await getGrantById(req.params.id, req.orgId);
  await deleteGrant(req.params.id, req.orgId);

  logActivity(req.orgId, 'grant_delete', {
    memberId: req.memberId, sessionToken: req.session?.token, grantId: req.params.id,
    meta: { grant_name: existing?.name || '' },
  }).catch(() => {});

  res.json({ ok: true });
}));

// ── Approvals ──

router.get('/org/:slug/approvals', ...orgAuth, w(async (req, res) => {
  res.json(await getApprovals(req.orgId));
}));

router.post('/org/:slug/approvals', ...orgAuth, w(async (req, res) => {
  const id = await createApproval(req.orgId, req.body);
  res.status(201).json({ id });
}));

router.put('/org/:slug/approvals/:id', ...orgAuth, w(async (req, res) => {
  await updateApproval(req.params.id, req.orgId, req.body);
  res.json({ ok: true });
}));

// ── Compliance Docs ──

router.get('/org/:slug/compliance', ...orgAuth, w(async (req, res) => {
  res.json(await getComplianceDocs(req.orgId));
}));

router.put('/org/:slug/compliance/:id', ...orgAuth, w(async (req, res) => {
  const id = await upsertComplianceDoc(req.orgId, { ...req.body, id: req.params.id });
  res.json({ ok: true, id });
}));

router.post('/org/:slug/compliance', ...orgAuth, w(async (req, res) => {
  const id = await upsertComplianceDoc(req.orgId, req.body);
  res.status(201).json({ id });
}));

// ── Agent Runs ──

router.get('/org/:slug/agent-runs', ...orgAuth, w(async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(await getAgentRuns(req.orgId, limit));
}));

// ── KV Store ──

router.get('/org/:slug/kv/:key', ...orgAuth, w(async (req, res) => {
  const value = await kvGet(req.orgId, req.params.key);
  res.json(value);
}));

router.put('/org/:slug/kv/:key', ...orgAuth, w(async (req, res) => {
  await kvSet(req.orgId, req.params.key, req.body);
  res.json({ ok: true });
}));

export default router;
