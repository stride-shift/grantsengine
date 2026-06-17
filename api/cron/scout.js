import { initDb } from '../../server/db.js';
import { runAutoScout } from '../../server/jobs/scout.js';

let _dbReady = null;
const ensureDb = () => {
  if (!_dbReady) _dbReady = initDb().catch(e => { console.error('initDb failed:', e.message); _dbReady = null; });
  return _dbReady;
};

// Vercel Cron: nightly auto-scout. Scheduled at 22:00 UTC = 00:00 SAST (see vercel.json).
export default async function handler(req, res) {
  // Verify the request is from Vercel Cron (or has the secret)
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  await ensureDb();

  try {
    console.log('[cron] Running nightly auto-scout...');
    await runAutoScout();
    console.log('[cron] Auto-scout complete');
    res.json({ ok: true, ran: new Date().toISOString() });
  } catch (e) {
    console.error('[cron] Auto-scout failed:', e.message);
    res.status(500).json({ error: e.message });
  }
}
