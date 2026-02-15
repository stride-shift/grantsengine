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

router.get('/org/:slug/grants', ...orgAuth, (req, res) => {
  res.json(getGrants(req.orgId));
});

router.put('/org/:slug/grants', ...orgAuth, (req, res) => {
  const grants = req.body;
  if (!Array.isArray(grants)) return res.status(400).json({ error: 'Expected array' });
  replaceAllGrants(req.orgId, grants);
  res.json({ ok: true });
});

router.put('/org/:slug/grants/:id', ...orgAuth, (req, res) => {
  const grant = req.body;
  if (!grant) return res.status(400).json({ error: 'Grant data required' });
  const id = upsertGrant(req.orgId, { ...grant, id: req.params.id });
  res.json({ ok: true, id });
});

router.post('/org/:slug/grants', ...orgAuth, (req, res) => {
  const grant = req.body;
  if (!grant || !grant.name) return res.status(400).json({ error: 'Grant name required' });
  const id = upsertGrant(req.orgId, grant);
  res.status(201).json({ ok: true, id });
});

router.delete('/org/:slug/grants/:id', ...orgAuth, (req, res) => {
  deleteGrant(req.params.id, req.orgId);
  res.json({ ok: true });
});

// ── Approvals ──

router.get('/org/:slug/approvals', ...orgAuth, (req, res) => {
  res.json(getApprovals(req.orgId));
});

router.post('/org/:slug/approvals', ...orgAuth, (req, res) => {
  const id = createApproval(req.orgId, req.body);
  res.status(201).json({ id });
});

router.put('/org/:slug/approvals/:id', ...orgAuth, (req, res) => {
  updateApproval(req.params.id, req.orgId, req.body);
  res.json({ ok: true });
});

// ── Compliance Docs ──

router.get('/org/:slug/compliance', ...orgAuth, (req, res) => {
  res.json(getComplianceDocs(req.orgId));
});

router.put('/org/:slug/compliance/:id', ...orgAuth, (req, res) => {
  const id = upsertComplianceDoc(req.orgId, { ...req.body, id: req.params.id });
  res.json({ ok: true, id });
});

router.post('/org/:slug/compliance', ...orgAuth, (req, res) => {
  const id = upsertComplianceDoc(req.orgId, req.body);
  res.status(201).json({ id });
});

// ── Agent Runs ──

router.get('/org/:slug/agent-runs', ...orgAuth, (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(getAgentRuns(req.orgId, limit));
});

// ── KV Store ──

router.get('/org/:slug/kv/:key', ...orgAuth, (req, res) => {
  const value = kvGet(req.orgId, req.params.key);
  res.json(value);
});

router.put('/org/:slug/kv/:key', ...orgAuth, (req, res) => {
  kvSet(req.orgId, req.params.key, req.body);
  res.json({ ok: true });
});

export default router;
