import { Router } from 'express';
import { google } from 'googleapis';
import { requireAuth } from '../middleware/auth.js';
import { resolveOrg } from '../middleware/org.js';
import { kvGet, kvSet, getGrants } from '../db.js';

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
router.get('/auth/google/url', async (req, res) => {
  const oauth2 = getOAuth2Client();
  if (!oauth2) return res.status(500).json({ error: 'Google OAuth not configured' });

  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    state: req.query.slug || 'dlab',
  });
  res.json({ url });
});

// GET /api/auth/google/callback — handle OAuth callback
router.get('/auth/google/callback', async (req, res) => {
  const { code, state } = req.query;
  const slug = state || 'dlab';
  const oauth2 = getOAuth2Client();
  if (!oauth2 || !code) return res.status(400).send('Missing authorization code');

  try {
    const { tokens } = await oauth2.getToken(code);
    // Store tokens in KV per org
    const { resolveOrg: resolveOrgFn } = await import('../middleware/org.js');
    const { getOrgBySlug } = await import('../db.js');
    const org = await getOrgBySlug(slug);
    if (org) {
      await kvSet(org.id, 'google_calendar_tokens', tokens);
    }
    // Redirect back to the app
    res.send(`<html><body><script>window.close(); window.opener && window.opener.postMessage('gcal-connected','*');</script><p>Google Calendar connected! You can close this window.</p></body></html>`);
  } catch (err) {
    console.error('[GCal] OAuth error:', err.message);
    res.status(500).send('Failed to connect Google Calendar: ' + err.message);
  }
});

// GET /api/org/:slug/gcal/status — check if Google Calendar is connected
router.get('/org/:slug/gcal/status', ...orgAuth, async (req, res) => {
  const tokens = await kvGet(req.orgId, 'google_calendar_tokens');
  res.json({ connected: !!(tokens?.access_token || tokens?.refresh_token) });
});

// POST /api/org/:slug/gcal/disconnect — remove Google Calendar connection
router.post('/org/:slug/gcal/disconnect', ...orgAuth, async (req, res) => {
  await kvSet(req.orgId, 'google_calendar_tokens', null);
  res.json({ ok: true });
});

// Helper: get authenticated calendar client
async function getCalendarClient(orgId) {
  const tokens = await kvGet(orgId, 'google_calendar_tokens');
  if (!tokens?.access_token && !tokens?.refresh_token) return null;

  const oauth2 = getOAuth2Client();
  if (!oauth2) return null;
  oauth2.setCredentials(tokens);

  // Handle token refresh
  oauth2.on('tokens', async (newTokens) => {
    const existing = await kvGet(orgId, 'google_calendar_tokens');
    await kvSet(orgId, 'google_calendar_tokens', { ...existing, ...newTokens });
  });

  return google.calendar({ version: 'v3', auth: oauth2 });
}

// POST /api/org/:slug/gcal/sync — sync a grant's deadline to Google Calendar
router.post('/org/:slug/gcal/sync', ...orgAuth, async (req, res) => {
  const { grantId, grantName, funder, deadline, owner, ask, stage, applyUrl } = req.body;
  if (!grantId || !deadline) return res.status(400).json({ error: 'grantId and deadline required' });

  const calendar = await getCalendarClient(req.orgId);
  if (!calendar) return res.status(400).json({ error: 'Google Calendar not connected' });

  const eventId = `ge-${grantId.replace(/[^a-z0-9]/gi, '').slice(0, 20)}`;
  const askStr = ask ? ` | Ask: R${Number(ask).toLocaleString()}` : '';
  const event = {
    summary: `DEADLINE: ${grantName} (${funder})`,
    description: `Stage: ${stage || 'active'}${askStr}\nOwner: ${owner || 'team'}${applyUrl ? `\nApply: ${applyUrl}` : ''}`,
    start: { date: deadline },
    end: { date: deadline },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 1440 }, // 1 day before
        { method: 'popup', minutes: 120 },  // 2 hours before
      ],
    },
  };

  try {
    // Try to update existing event first
    try {
      await calendar.events.update({
        calendarId: 'primary',
        eventId,
        requestBody: event,
      });
      return res.json({ ok: true, action: 'updated', eventId });
    } catch {
      // Event doesn't exist, create it
      event.id = eventId;
      await calendar.events.insert({
        calendarId: 'primary',
        requestBody: event,
      });
      return res.json({ ok: true, action: 'created', eventId });
    }
  } catch (err) {
    console.error('[GCal] Sync error:', err.message);
    res.status(500).json({ error: 'Calendar sync failed: ' + err.message });
  }
});

// DELETE /api/org/:slug/gcal/event/:grantId — remove a grant's calendar event
router.delete('/org/:slug/gcal/event/:grantId', ...orgAuth, async (req, res) => {
  const calendar = await getCalendarClient(req.orgId);
  if (!calendar) return res.status(400).json({ error: 'Google Calendar not connected' });

  const eventId = `ge-${req.params.grantId.replace(/[^a-z0-9]/gi, '').slice(0, 20)}`;
  try {
    await calendar.events.delete({ calendarId: 'primary', eventId });
    res.json({ ok: true });
  } catch {
    res.json({ ok: true }); // Event might not exist, that's fine
  }
});

// POST /api/org/:slug/gcal/sync-all — sync all active grants with deadlines
router.post('/org/:slug/gcal/sync-all', ...orgAuth, async (req, res) => {
  const calendar = await getCalendarClient(req.orgId);
  if (!calendar) return res.status(400).json({ error: 'Google Calendar not connected' });

  const grants = await getGrants(req.orgId);
  const CLOSED = ['won', 'lost', 'deferred', 'archived'];
  const active = grants.filter(g => !CLOSED.includes(g.stage) && g.deadline);

  let synced = 0, errors = 0;
  for (const g of active) {
    const eventId = `ge-${g.id.replace(/[^a-z0-9]/gi, '').slice(0, 20)}`;
    const askStr = g.ask ? ` | Ask: R${Number(g.ask).toLocaleString()}` : '';
    const event = {
      summary: `DEADLINE: ${g.name} (${g.funder})`,
      description: `Stage: ${g.stage}${askStr}\nOwner: ${g.owner || 'team'}${g.applyUrl ? `\nApply: ${g.applyUrl}` : ''}`,
      start: { date: g.deadline.slice(0, 10) },
      end: { date: g.deadline.slice(0, 10) },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 1440 }, { method: 'popup', minutes: 120 }] },
    };
    try {
      try {
        await calendar.events.update({ calendarId: 'primary', eventId, requestBody: event });
      } catch {
        event.id = eventId;
        await calendar.events.insert({ calendarId: 'primary', requestBody: event });
      }
      synced++;
    } catch {
      errors++;
    }
  }
  res.json({ ok: true, synced, errors, total: active.length });
});

export default router;
