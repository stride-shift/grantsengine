import { Router } from 'express';
import {
  getGrants, upsertGrant, deleteGrant, replaceAllGrants,
  getApprovals, createApproval, updateApproval,
  getComplianceDocs, upsertComplianceDoc,
  getAgentRuns,
  kvGet, kvSet,
  logActivity, getGrantById, getTeamMembers,
  createUpload,
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

  // No existing grant = new insert via PUT, skip all comparisons
  if (!existing) {
    logActivity(req.orgId, 'grant_update', {
      memberId: req.memberId, sessionToken: req.session?.token, grantId: id,
      meta: { grant_name: grant.name },
    }).catch(() => {});
    return res.json({ ok: true, id });
  }

  // Only detect changes for fields that were actually sent by the frontend
  const stageChanged = grant.stage !== undefined && grant.stage !== existing.stage;
  const ownerChanged = grant.owner !== undefined && grant.owner !== existing.owner && grant.owner !== 'team';
  const grantName = grant.name || existing.name || '';
  const grantFunder = grant.funder || existing.funder || '';
  const deadline = (grant.deadline !== undefined ? grant.deadline : existing.deadline) || null;
  const isActive = !CLOSED_STAGES.includes(grant.stage || existing.stage);

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

  // ── Auto-archive proposal to library on submission ──
  if (justSubmitted) {
    (async () => {
      try {
        // Get the full grant to check for AI draft
        const fullGrant = await getGrantById(id, req.orgId);
        const aiDraft = fullGrant?.aiDraft;
        if (aiDraft && aiDraft.trim()) {
          await createUpload(req.orgId, {
            grant_id: id,
            filename: `proposal-${id}.txt`,
            original_name: `${grantName} - ${grantFunder} - Proposal.txt`,
            mime_type: 'text/plain',
            size: Buffer.byteLength(aiDraft, 'utf8'),
            extracted_text: aiDraft.slice(0, 15000),
            category: 'proposal',
          });
          console.log(`[Proposal Library] Auto-archived proposal for "${grantName}" (${grantFunder})`);
        }
      } catch (e) { console.error('[Proposal Library] Auto-archive failed:', e.message); }
    })();
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
  const deadlineChanged = grant.deadline !== undefined && grant.deadline !== existing.deadline;
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

// ── ICS Calendar Feed (no auth — used by external calendar apps) ──
// Subscribe URL: /api/org/:slug/calendar.ics?owner=nolan
// The feed is public per org slug — no secrets in grant data exposed (just names, funders, deadlines)

function formatICSDate(dateStr) {
  // Convert YYYY-MM-DD to ICS date format (YYYYMMDD) — all-day event at 9am
  const d = new Date(dateStr + 'T09:00:00');
  if (isNaN(d.getTime())) return null;
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeICS(str) {
  return (str || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

router.get('/org/:slug/calendar.ics', resolveOrg, w(async (req, res) => {
  const owner = req.query.owner || null;
  const grants = await getGrants(req.orgId);

  // Filter: active grants with deadlines, optionally by owner
  const active = grants.filter(g => {
    if (CLOSED_STAGES.includes(g.stage)) return false;
    if (owner && g.owner !== owner) return false;
    return true;
  });

  // Build events from deadlines and follow-ups
  const events = [];

  for (const g of active) {
    // Deadline event
    if (g.deadline) {
      const dtStart = formatICSDate(g.deadline);
      if (dtStart) {
        const askStr = g.ask ? ` | Ask: R${Number(g.ask).toLocaleString()}` : '';
        events.push([
          'BEGIN:VEVENT',
          `UID:grant-deadline-${g.id}@grantsengine`,
          `DTSTART:${dtStart}`,
          `SUMMARY:${escapeICS(`DEADLINE: ${g.name} (${g.funder})`)}`  ,
          `DESCRIPTION:${escapeICS(`Stage: ${g.stage}${askStr} | Owner: ${g.owner || 'team'}\nApply: ${g.applyUrl || 'N/A'}`)}`,
          g.applyUrl ? `URL:${g.applyUrl}` : null,
          'BEGIN:VALARM',
          'TRIGGER:-P1D',
          'ACTION:DISPLAY',
          `DESCRIPTION:Grant deadline tomorrow: ${escapeICS(g.name)}`,
          'END:VALARM',
          'END:VEVENT',
        ].filter(Boolean).join('\r\n'));
      }
    }

    // Follow-up events
    if (Array.isArray(g.fups)) {
      for (const fup of g.fups) {
        if (!fup.date || fup.done) continue;
        const dtStart = formatICSDate(fup.date);
        if (dtStart) {
          events.push([
            'BEGIN:VEVENT',
            `UID:grant-fup-${g.id}-${fup.date}@grantsengine`,
            `DTSTART:${dtStart}`,
            `SUMMARY:${escapeICS(`FOLLOW-UP: ${g.name} (${g.funder})`)}`,
            `DESCRIPTION:${escapeICS(`${fup.label || 'Follow up'} | Stage: ${g.stage}`)}`,
            'END:VEVENT',
          ].join('\r\n'));
        }
      }
    }
  }

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GrantEngine//Calendar//EN',
    `X-WR-CALNAME:Grant Engine${owner ? ` (${owner})` : ''}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');

  res.set({
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': `inline; filename="grants${owner ? `-${owner}` : ''}.ics"`,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  });
  res.send(ics);
}));

export default router;
