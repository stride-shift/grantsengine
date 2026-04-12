import { Router } from 'express';
import { google } from 'googleapis';
import { requireAuth } from '../middleware/auth.js';
import { resolveOrg } from '../middleware/org.js';
import { getMemberGcalTokens, setMemberGcalTokens, getMemberById, getGrants, getTeamMembers } from '../db.js';

const router = Router();
const orgAuth = [resolveOrg, requireAuth];

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret) return null;
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// GET /api/auth/google/url — get the OAuth authorization URL
// Pass memberId + slug so callback knows who to store tokens for
router.get('/auth/google/url', async (req, res) => {
  const oauth2 = getOAuth2Client();
  if (!oauth2) return res.status(500).json({ error: 'Google OAuth not configured' });

  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    state: JSON.stringify({ slug: req.query.slug || 'dlab', memberId: req.query.memberId || '' }),
  });
  res.json({ url });
});

// GET /api/auth/google/callback — handle OAuth callback, store tokens per member
router.get('/auth/google/callback', async (req, res) => {
  const { code, state } = req.query;
  const oauth2 = getOAuth2Client();
  if (!oauth2 || !code) return res.status(400).send('Missing authorization code');

  let memberId = '';
  try {
    const parsed = JSON.parse(state);
    memberId = parsed.memberId;
  } catch { /* state might be plain slug for backward compat */ }

  try {
    const { tokens } = await oauth2.getToken(code);
    if (memberId) {
      await setMemberGcalTokens(memberId, tokens);
      console.log(`[GCal] Tokens saved for member ${memberId}`);
    }
    res.send(`<html><body><script>window.close(); window.opener && window.opener.postMessage('gcal-connected','*');</script><p>Google Calendar connected! You can close this window.</p></body></html>`);
  } catch (err) {
    console.error('[GCal] OAuth error:', err.message);
    res.status(500).send('Failed to connect Google Calendar: ' + err.message);
  }
});

// GET /api/org/:slug/gcal/status — check if current member has Google Calendar connected
router.get('/org/:slug/gcal/status', ...orgAuth, async (req, res) => {
  if (!req.memberId) return res.json({ connected: false });
  const tokens = await getMemberGcalTokens(req.memberId);
  res.json({ connected: !!(tokens?.access_token || tokens?.refresh_token) });
});

// POST /api/org/:slug/gcal/disconnect — remove current member's Google Calendar connection
router.post('/org/:slug/gcal/disconnect', ...orgAuth, async (req, res) => {
  if (req.memberId) await setMemberGcalTokens(req.memberId, null);
  res.json({ ok: true });
});

// Helper: get authenticated calendar client for a specific member
async function getCalendarForMember(memberId) {
  if (!memberId) return null;
  const tokens = await getMemberGcalTokens(memberId);
  if (!tokens?.access_token && !tokens?.refresh_token) return null;

  const oauth2 = getOAuth2Client();
  if (!oauth2) return null;
  oauth2.setCredentials(tokens);

  // Auto-refresh tokens
  oauth2.on('tokens', async (newTokens) => {
    const existing = await getMemberGcalTokens(memberId);
    await setMemberGcalTokens(memberId, { ...existing, ...newTokens });
  });

  return google.calendar({ version: 'v3', auth: oauth2 });
}

function makeEventId(grantId) {
  // Google Calendar event IDs must be lowercase alphanumeric, 5-1024 chars
  return 'ge' + grantId.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 20);
}

function buildEvent(grant) {
  const askStr = grant.ask ? ` | Ask: R${Number(grant.ask).toLocaleString()}` : '';
  return {
    summary: `DEADLINE: ${grant.name} (${grant.funder})`,
    description: `Stage: ${grant.stage || 'active'}${askStr}\nOwner: ${grant.owner || 'team'}${grant.applyUrl ? `\nApply: ${grant.applyUrl}` : ''}`,
    start: { date: (grant.deadline || '').slice(0, 10) },
    end: { date: (grant.deadline || '').slice(0, 10) },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 1440 },
        { method: 'popup', minutes: 120 },
      ],
    },
  };
}

async function upsertEvent(calendar, grantId, event) {
  const eventId = makeEventId(grantId);
  try {
    await calendar.events.update({ calendarId: 'primary', eventId, requestBody: event });
    return 'updated';
  } catch {
    try {
      event.id = eventId;
      await calendar.events.insert({ calendarId: 'primary', requestBody: event });
      return 'created';
    } catch (e) {
      console.error('[GCal] Upsert failed:', e.message);
      return 'error';
    }
  }
}

async function deleteEvent(calendar, grantId) {
  try {
    await calendar.events.delete({ calendarId: 'primary', eventId: makeEventId(grantId) });
  } catch { /* event might not exist */ }
}

// POST /api/org/:slug/gcal/sync — sync a single grant to its owner's calendar
router.post('/org/:slug/gcal/sync', ...orgAuth, async (req, res) => {
  const { grantId, grantName, funder, deadline, owner, ask, stage, applyUrl } = req.body;
  if (!grantId || !deadline) return res.status(400).json({ error: 'grantId and deadline required' });

  // Push to the grant owner's calendar (not the requester's)
  const targetMember = owner && owner !== 'team' ? owner : req.memberId;
  const calendar = await getCalendarForMember(targetMember);
  if (!calendar) return res.json({ ok: true, skipped: true, reason: 'Owner has no Google Calendar connected' });

  const event = buildEvent({ name: grantName, funder, deadline, owner, ask, stage, applyUrl });
  const result = await upsertEvent(calendar, grantId, event);
  res.json({ ok: true, action: result });
});

// POST /api/org/:slug/gcal/reassign — when owner changes, move event between calendars
router.post('/org/:slug/gcal/reassign', ...orgAuth, async (req, res) => {
  const { grantId, oldOwner, newOwner, grantName, funder, deadline, ask, stage, applyUrl } = req.body;
  if (!grantId) return res.status(400).json({ error: 'grantId required' });

  // Remove from old owner's calendar
  if (oldOwner && oldOwner !== 'team') {
    const oldCal = await getCalendarForMember(oldOwner);
    if (oldCal) await deleteEvent(oldCal, grantId);
  }

  // Add to new owner's calendar (if they have a deadline)
  if (newOwner && newOwner !== 'team' && deadline) {
    const newCal = await getCalendarForMember(newOwner);
    if (newCal) {
      const event = buildEvent({ name: grantName, funder, deadline, owner: newOwner, ask, stage, applyUrl });
      await upsertEvent(newCal, grantId, event);
    }
  }

  res.json({ ok: true });
});

// POST /api/org/:slug/gcal/sync-all — sync all grants to their respective owners' calendars
router.post('/org/:slug/gcal/sync-all', ...orgAuth, async (req, res) => {
  const grants = await getGrants(req.orgId);
  const CLOSED = ['won', 'lost', 'deferred', 'archived'];
  const active = grants.filter(g => !CLOSED.includes(g.stage) && g.deadline);

  // Cache calendar clients per member
  const calCache = {};
  const getCal = async (memberId) => {
    if (!memberId || memberId === 'team') return null;
    if (calCache[memberId] !== undefined) return calCache[memberId];
    calCache[memberId] = await getCalendarForMember(memberId);
    return calCache[memberId];
  };

  let synced = 0, skipped = 0, errors = 0;
  for (const g of active) {
    const cal = await getCal(g.owner);
    if (!cal) { skipped++; continue; }
    const event = buildEvent(g);
    const result = await upsertEvent(cal, g.id, event);
    if (result === 'error') errors++;
    else synced++;
  }

  // Also sync to the requester's calendar for their own grants
  const reqCal = await getCal(req.memberId);
  if (reqCal) {
    const myGrants = active.filter(g => g.owner === req.memberId);
    // Already synced above, skip
  }

  res.json({ ok: true, synced, skipped, errors, total: active.length });
});

// DELETE /api/org/:slug/gcal/event/:grantId — remove from current member's calendar
router.delete('/org/:slug/gcal/event/:grantId', ...orgAuth, async (req, res) => {
  const calendar = await getCalendarForMember(req.memberId);
  if (!calendar) return res.json({ ok: true });
  await deleteEvent(calendar, req.params.grantId);
  res.json({ ok: true });
});

export default router;
