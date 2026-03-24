import { Router } from 'express';
import {
  getGrants, upsertGrant, deleteGrant, replaceAllGrants,
  getApprovals, createApproval, updateApproval,
  getComplianceDocs, upsertComplianceDoc,
  getAgentRuns,
  kvGet, kvSet,
  logActivity, getGrantById, getTeamMembers,
} from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { resolveOrg } from '../middleware/org.js';
import { sendStageChangeEmail, sendAssignmentEmail, sendGrantCreatedEmail, sendGrantDeletedEmail, sendCalendarCancellation, sendOwnershipRemovedEmail } from '../email.js';

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

const CLOSED_STAGES = ['won', 'lost', 'deferred', 'archived'];

router.put('/org/:slug/grants/:id', ...orgAuth, w(async (req, res) => {
  const grant = req.body;
  if (!grant) return res.status(400).json({ error: 'Grant data required' });

  const existing = await getGrantById(req.params.id, req.orgId);
  const id = await upsertGrant(req.orgId, { ...grant, id: req.params.id });

  const stageChanged = existing && grant.stage && existing.stage !== grant.stage;
  const ownerChanged = existing && grant.owner && grant.owner !== existing.owner && grant.owner !== 'team';
  const grantName = grant.name || existing?.name || '';
  const grantFunder = grant.funder || existing?.funder || '';
  const deadline = grant.deadline || existing?.deadline || null;
  const isActive = !CLOSED_STAGES.includes(grant.stage || existing?.stage);

  // Log activity
  if (stageChanged) {
    logActivity(req.orgId, 'stage_change', {
      memberId: req.memberId, sessionToken: req.session?.token, grantId: id,
      meta: { grant_name: grantName, from_stage: existing.stage, to_stage: grant.stage },
    }).catch(() => {});
  } else {
    logActivity(req.orgId, 'grant_update', {
      memberId: req.memberId, sessionToken: req.session?.token, grantId: id,
      meta: { grant_name: grantName },
    }).catch(() => {});
  }

  const newStage = grant.stage || existing?.stage;
  const wasActive = !CLOSED_STAGES.includes(existing?.stage);
  const justClosed = stageChanged && !isActive && wasActive;
  const justSubmitted = stageChanged && grant.stage === 'submitted';

  // ── Meaningful stage change notification ──
  // Only if: stage actually changed, grant has owner, grant is still active, not submitted/closed
  if (stageChanged && isActive && !justSubmitted) {
    const owner = grant.owner || existing.owner;
    if (owner && owner !== 'team') {
      (async () => {
        try {
          const members = await getTeamMembers(req.orgId);
          const ownerMember = members.find(m => m.id === owner);
          if (!ownerMember?.email) return;
          const movedBy = members.find(m => m.id === req.memberId);
          await sendStageChangeEmail(
            ownerMember.email, ownerMember.name,
            grantName, grantFunder,
            existing.stage, grant.stage,
            movedBy?.name || null, id, deadline
          );
        } catch (e) { console.error('[email] Stage notification failed:', e.message); }
      })();
    }
  }

  // ── Grant submitted or closed: cancel calendar task ──
  if (justSubmitted || justClosed) {
    const owner = grant.owner || existing.owner;
    if (owner && owner !== 'team') {
      (async () => {
        try {
          const members = await getTeamMembers(req.orgId);
          const ownerMember = members.find(m => m.id === owner);
          if (!ownerMember?.email) return;
          sendCalendarCancellation(ownerMember.email, id).catch(() => {});
          // Optional confirmation email for submitted
          if (justSubmitted) {
            const movedBy = members.find(m => m.id === req.memberId);
            await sendStageChangeEmail(
              ownerMember.email, ownerMember.name,
              grantName, grantFunder,
              existing.stage, grant.stage,
              movedBy?.name || null, id, null // no calendar for submitted
            );
          }
        } catch (e) { console.error('[email] Submit/close notification failed:', e.message); }
      })();
    }
  }

  // ── Owner changed ──
  if (ownerChanged) {
    (async () => {
      try {
        const members = await getTeamMembers(req.orgId);
        const newOwner = members.find(m => m.id === grant.owner);

        // Old owner: ownership removed email + cancel calendar
        if (existing.owner && existing.owner !== 'team') {
          const oldOwner = members.find(m => m.id === existing.owner);
          if (oldOwner?.email) {
            sendOwnershipRemovedEmail(oldOwner.email, oldOwner.name, grantName, grantFunder, newOwner?.name || null).catch(() => {});
            sendCalendarCancellation(oldOwner.email, id).catch(() => {});
          }
        }

        // New owner: assignment email + calendar (if deadline exists)
        if (!newOwner?.email) return;
        const assignedBy = members.find(m => m.id === req.memberId);
        await sendAssignmentEmail(
          newOwner.email, newOwner.name,
          grantName, grantFunder,
          assignedBy?.name || null, id, deadline, newStage
        );
      } catch (e) { console.error('[email] Assignment notification failed:', e.message); }
    })();
  }

  // ── Deadline changed (without owner change): update calendar for current owner ──
  const deadlineChanged = existing && grant.deadline && grant.deadline !== existing.deadline;
  if (deadlineChanged && !ownerChanged && isActive) {
    const currentOwner = grant.owner || existing.owner;
    if (currentOwner && currentOwner !== 'team') {
      (async () => {
        try {
          const members = await getTeamMembers(req.orgId);
          const ownerMember = members.find(m => m.id === currentOwner);
          if (!ownerMember?.email) return;
          await sendAssignmentEmail(
            ownerMember.email, ownerMember.name,
            grantName, grantFunder,
            null, id, grant.deadline, newStage
          );
        } catch (e) { console.error('[email] Deadline update notification failed:', e.message); }
      })();
    }
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

  // ── New grant: email everyone except creator, no calendar task ──
  (async () => {
    try {
      const members = await getTeamMembers(req.orgId);
      const createdBy = members.find(m => m.id === req.memberId);
      for (const m of members) {
        if (!m.email || m.id === 'team' || m.id === req.memberId) continue;
        sendGrantCreatedEmail(m.email, m.name, grant.name, grant.funder || '', createdBy?.name || null, id).catch(() => {});
      }
    } catch (e) { console.error('[email] Grant created notification failed:', e.message); }
  })();

  res.status(201).json({ ok: true, id });
}));

router.delete('/org/:slug/grants/:id', ...orgAuth, w(async (req, res) => {
  const existing = await getGrantById(req.params.id, req.orgId);
  await deleteGrant(req.params.id, req.orgId);

  logActivity(req.orgId, 'grant_delete', {
    memberId: req.memberId, sessionToken: req.session?.token, grantId: req.params.id,
    meta: { grant_name: existing?.name || '' },
  }).catch(() => {});

  // ── Delete: notify owner + cancel calendar ──
  if (existing?.owner && existing.owner !== 'team') {
    (async () => {
      try {
        const members = await getTeamMembers(req.orgId);
        const ownerMember = members.find(m => m.id === existing.owner);
        if (!ownerMember?.email) return;
        const deletedBy = members.find(m => m.id === req.memberId);
        await sendGrantDeletedEmail(ownerMember.email, ownerMember.name, existing.name, existing.funder || '', deletedBy?.name || null);
        sendCalendarCancellation(ownerMember.email, req.params.id).catch(() => {});
      } catch (e) { console.error('[email] Grant deleted notification failed:', e.message); }
    })();
  }

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
