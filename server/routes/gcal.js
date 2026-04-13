import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { requireAuth } from '../middleware/auth.js';
import { resolveOrg } from '../middleware/org.js';
import { getMemberGcalTokens, setMemberGcalTokens, getGrants } from '../db.js';

const router = Router();
const orgAuth = [resolveOrg, requireAuth];

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret) return null;
  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

// ── Raw Calendar API via fetch ──
async function calendarApi(accessToken, method, path, body) {
  const url = `https://www.googleapis.com/calendar/v3${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: res.ok, status: res.status, data: res.status === 204 ? null : await res.json().catch(() => null) };
}

// Ensure token is fresh, refresh if needed. Returns { access_token } or null.
async function getFreshToken(memberId) {
  const tokens = await getMemberGcalTokens(memberId);
  if (!tokens?.access_token && !tokens?.refresh_token) return null;

  const oauth2 = getOAuth2Client();
  if (!oauth2) return null;

  oauth2.setCredentials(tokens);

  // Check if access token is expired (expiry_date is in ms)
  if (tokens.expiry_date && tokens.expiry_date < Date.now() + 60000) {
    try {
      const { credentials } = await oauth2.refreshAccessToken();
      const merged = { ...tokens, ...credentials };
      await setMemberGcalTokens(memberId, merged);
      return merged.access_token;
    } catch (err) {
      console.error('[GCal] Token refresh failed:', err.message);
      return null;
    }
  }

  return tokens.access_token;
}

// GET /api/auth/google/url
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

// GET /api/auth/google/callback
router.get('/auth/google/callback', async (req, res) => {
  const { code, state } = req.query;
  const oauth2 = getOAuth2Client();
  if (!oauth2 || !code) return res.status(400).send('Missing authorization code');

  let memberId = '';
  try { memberId = JSON.parse(state).memberId; } catch {}

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

// GET /api/org/:slug/gcal/status
router.get('/org/:slug/gcal/status', ...orgAuth, async (req, res) => {
  if (!req.memberId) return res.json({ connected: false });
  const tokens = await getMemberGcalTokens(req.memberId);
  res.json({ connected: !!(tokens?.access_token || tokens?.refresh_token) });
});

// POST /api/org/:slug/gcal/disconnect
router.post('/org/:slug/gcal/disconnect', ...orgAuth, async (req, res) => {
  if (req.memberId) await setMemberGcalTokens(req.memberId, null);
  res.json({ ok: true });
});

function makeEventId(grantId) {
  return 'ge' + (grantId || '').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 20);
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

async function upsertEvent(accessToken, grantId, event) {
  const eventId = makeEventId(grantId);
  // Try update first
  const upd = await calendarApi(accessToken, 'PUT', `/calendars/primary/events/${eventId}`, event);
  if (upd.ok) return 'updated';

  // Fall back to insert with custom id
  const body = { ...event, id: eventId };
  const ins = await calendarApi(accessToken, 'POST', '/calendars/primary/events', body);
  if (ins.ok) return 'created';
  return 'error';
}

async function deleteCalEvent(accessToken, grantId) {
  await calendarApi(accessToken, 'DELETE', `/calendars/primary/events/${makeEventId(grantId)}`);
}

// POST /api/org/:slug/gcal/sync
router.post('/org/:slug/gcal/sync', ...orgAuth, async (req, res) => {
  const { grantId, grantName, funder, deadline, owner, ask, stage, applyUrl } = req.body;
  if (!grantId || !deadline) return res.status(400).json({ error: 'grantId and deadline required' });

  const targetMember = owner && owner !== 'team' ? owner : req.memberId;
  const token = await getFreshToken(targetMember);
  if (!token) return res.json({ ok: true, skipped: true, reason: 'Owner has no Google Calendar connected' });

  const event = buildEvent({ name: grantName, funder, deadline, owner, ask, stage, applyUrl });
  const result = await upsertEvent(token, grantId, event);
  res.json({ ok: true, action: result });
});

// POST /api/org/:slug/gcal/reassign
router.post('/org/:slug/gcal/reassign', ...orgAuth, async (req, res) => {
  const { grantId, oldOwner, newOwner, grantName, funder, deadline, ask, stage, applyUrl } = req.body;
  if (!grantId) return res.status(400).json({ error: 'grantId required' });

  if (oldOwner && oldOwner !== 'team') {
    const oldToken = await getFreshToken(oldOwner);
    if (oldToken) await deleteCalEvent(oldToken, grantId);
  }

  if (newOwner && newOwner !== 'team' && deadline) {
    const newToken = await getFreshToken(newOwner);
    if (newToken) {
      const event = buildEvent({ name: grantName, funder, deadline, owner: newOwner, ask, stage, applyUrl });
      await upsertEvent(newToken, grantId, event);
    }
  }

  res.json({ ok: true });
});

// POST /api/org/:slug/gcal/sync-all
router.post('/org/:slug/gcal/sync-all', ...orgAuth, async (req, res) => {
  const grants = await getGrants(req.orgId);
  const CLOSED = ['won', 'lost', 'deferred', 'archived'];
  const active = grants.filter(g => !CLOSED.includes(g.stage) && g.deadline);

  const tokenCache = {};
  const getToken = async (memberId) => {
    if (!memberId || memberId === 'team') return null;
    if (tokenCache[memberId] !== undefined) return tokenCache[memberId];
    tokenCache[memberId] = await getFreshToken(memberId);
    return tokenCache[memberId];
  };

  let synced = 0, skipped = 0, errors = 0;
  for (const g of active) {
    const token = await getToken(g.owner);
    if (!token) { skipped++; continue; }
    const event = buildEvent(g);
    const result = await upsertEvent(token, g.id, event);
    if (result === 'error') errors++;
    else synced++;
  }

  res.json({ ok: true, synced, skipped, errors, total: active.length });
});

// DELETE /api/org/:slug/gcal/event/:grantId
router.delete('/org/:slug/gcal/event/:grantId', ...orgAuth, async (req, res) => {
  const token = await getFreshToken(req.memberId);
  if (!token) return res.json({ ok: true });
  await deleteCalEvent(token, req.params.grantId);
  res.json({ ok: true });
});

export default router;
