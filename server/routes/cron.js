import { Router } from 'express';
import { runAutoScout } from '../jobs/scout.js';
import { runDeadlineReminders } from '../jobs/deadlineReminders.js';

// Cron endpoints for hosts where in-process timers can't be trusted (Cloud Run,
// which freezes idle containers). Cloud Scheduler POSTs here on schedule with
// `Authorization: Bearer <CRON_SECRET>`. On a long-lived host the in-process
// node-cron in server/index.js drives these jobs instead (and is disabled on
// Cloud Run, where K_SERVICE is set, to avoid double-firing).
const router = Router();

// Fail closed: these trigger heavy jobs, so refuse unless a secret is configured AND matches.
function authed(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers['authorization'] === `Bearer ${secret}`;
}

router.post('/cron/scout', async (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    await runAutoScout();
    res.json({ ok: true, ran: new Date().toISOString() });
  } catch (e) {
    console.error('[cron] Auto-scout failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/cron/reminders', async (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    await runDeadlineReminders();
    res.json({ ok: true, ran: new Date().toISOString() });
  } catch (e) {
    console.error('[cron] Deadline reminders failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

export default router;
