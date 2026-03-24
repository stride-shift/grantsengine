import { initDb } from '../../server/db.js';
import { runDeadlineReminders } from '../../server/jobs/deadlineReminders.js';

let _dbReady = null;
const ensureDb = () => {
  if (!_dbReady) _dbReady = initDb().catch(e => { console.error('initDb failed:', e.message); _dbReady = null; });
  return _dbReady;
};

export default async function handler(req, res) {
  // Verify the request is from Vercel Cron (or has the secret)
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  await ensureDb();

  try {
    console.log('[cron] Running deadline reminders...');
    await runDeadlineReminders();
    console.log('[cron] Deadline reminders complete');
    res.json({ ok: true, ran: new Date().toISOString() });
  } catch (e) {
    console.error('[cron] Failed:', e.message);
    res.status(500).json({ error: e.message });
  }
}
