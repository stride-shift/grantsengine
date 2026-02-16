import { Router } from 'express';
import {
  getGrants, upsertGrant, deleteGrant, replaceAllGrants,
  getApprovals, createApproval, updateApproval,
  getComplianceDocs, upsertComplianceDoc,
  getAgentRuns,
  kvGet, kvSet,
} from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { resolveOrg } from '../middleware/org.js';

const router = Router();

// All data routes are org-scoped and require auth
const orgAuth = [resolveOrg, requireAuth];

// ── Grants ──

router.get('/org/:slug/grants', ...orgAuth, async (req, res) => {
  res.json(await getGrants(req.orgId));
});

router.put('/org/:slug/grants', ...orgAuth, async (req, res) => {
  const grants = req.body;
  if (!Array.isArray(grants)) return res.status(400).json({ error: 'Expected array' });
  await replaceAllGrants(req.orgId, grants);
  res.json({ ok: true });
});

router.put('/org/:slug/grants/:id', ...orgAuth, async (req, res) => {
  const grant = req.body;
  if (!grant) return res.status(400).json({ error: 'Grant data required' });
  const id = await upsertGrant(req.orgId, { ...grant, id: req.params.id });
  res.json({ ok: true, id });
});

router.post('/org/:slug/grants', ...orgAuth, async (req, res) => {
  const grant = req.body;
  if (!grant || !grant.name) return res.status(400).json({ error: 'Grant name required' });
  const id = await upsertGrant(req.orgId, grant);
  res.status(201).json({ ok: true, id });
});

router.delete('/org/:slug/grants/:id', ...orgAuth, async (req, res) => {
  await deleteGrant(req.params.id, req.orgId);
  res.json({ ok: true });
});

// ── Approvals ──

router.get('/org/:slug/approvals', ...orgAuth, async (req, res) => {
  res.json(await getApprovals(req.orgId));
});

router.post('/org/:slug/approvals', ...orgAuth, async (req, res) => {
  const id = await createApproval(req.orgId, req.body);
  res.status(201).json({ id });
});

router.put('/org/:slug/approvals/:id', ...orgAuth, async (req, res) => {
  await updateApproval(req.params.id, req.orgId, req.body);
  res.json({ ok: true });
});

// ── Compliance Docs ──

router.get('/org/:slug/compliance', ...orgAuth, async (req, res) => {
  res.json(await getComplianceDocs(req.orgId));
});

router.put('/org/:slug/compliance/:id', ...orgAuth, async (req, res) => {
  const id = await upsertComplianceDoc(req.orgId, { ...req.body, id: req.params.id });
  res.json({ ok: true, id });
});

router.post('/org/:slug/compliance', ...orgAuth, async (req, res) => {
  const id = await upsertComplianceDoc(req.orgId, req.body);
  res.status(201).json({ id });
});

// ── Agent Runs ──

router.get('/org/:slug/agent-runs', ...orgAuth, async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(await getAgentRuns(req.orgId, limit));
});

// ── KV Store ──

router.get('/org/:slug/kv/:key', ...orgAuth, async (req, res) => {
  const value = await kvGet(req.orgId, req.params.key);
  res.json(value);
});

router.put('/org/:slug/kv/:key', ...orgAuth, async (req, res) => {
  await kvSet(req.orgId, req.params.key, req.body);
  res.json({ ok: true });
});

export default router;
