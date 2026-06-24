import dotenv from 'dotenv';
dotenv.config({ override: true });

import { createClient } from '@supabase/supabase-js';
import cron from 'node-cron';
import app from './app.js';
import { initDb, cleanExpiredSessions, getOrgBySlug } from './db.js';
import { runAutoScout } from './jobs/scout.js';
import { runDeadlineReminders } from './jobs/deadlineReminders.js';

const PORT = process.env.PORT || 3001;

// Clean expired sessions every hour (with error handling to prevent crashes)
setInterval(async () => {
  try { await cleanExpiredSessions(); }
  catch (e) { console.error('Session cleanup failed:', e.message); }
}, 60 * 60 * 1000);

// Ensure Supabase Storage buckets exist
async function ensureBuckets() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.warn('Warning: No Supabase credentials — file uploads will not work');
    return;
  }
  const supabase = createClient(url, key);
  for (const [name, isPublic] of [['uploads', false], ['logos', true]]) {
    const { error } = await supabase.storage.createBucket(name, { public: isPublic });
    if (error && !error.message?.includes('already exists')) {
      console.error(`Failed to create "${name}" bucket:`, error.message);
    } else {
      console.log(`Storage bucket "${name}" ready`);
    }
  }
}

app.listen(PORT, async () => {
  console.log(`Grant Platform server on http://localhost:${PORT}`);
  console.log(`Mode: ${process.env.NODE_ENV || 'development'}`);
  if (!process.env.OPENAI_API_KEY) {
    console.warn('Warning: No OPENAI_API_KEY in .env — AI features will not work');
  }
  // Run schema migrations (adds any new columns/tables)
  await initDb();
  // Ensure storage buckets exist
  await ensureBuckets();
  // Auto-seed on first run if no orgs exist
  const dlab = await getOrgBySlug('dlab');
  if (dlab) {
    console.log(`Seed org found: ${dlab.name} (${dlab.slug})`);
  } else {
    console.log('No orgs found — auto-seeding d-lab NPC...');
    try {
      const { runSeed } = await import('./seed-fn.js');
      await runSeed();
      console.log('Auto-seed complete. Login at /org/dlab (seed credentials are in server/seed-fn.js — change them after first login).');
    } catch (e) {
      console.error('Auto-seed failed:', e.message);
      console.log('Run manually: node server/seed.js');
    }
  }

  // ── Scheduled jobs ──
  // In-process node-cron only fires on a long-lived host (local / VM / always-on).
  // On Cloud Run (K_SERVICE is set) idle containers are frozen, so the timers can't
  // be trusted — Cloud Scheduler hits POST /api/cron/{scout,reminders} instead
  // (server/routes/cron.js). Skip the in-process timers there to avoid double-firing.
  if (process.env.K_SERVICE) {
    console.log('Cloud Run detected — in-process cron disabled; Cloud Scheduler drives /api/cron/*');
  } else {
    // Nightly auto-scout: midnight SAST
    cron.schedule('0 0 * * *', async () => {
      console.log('[Cron] Nightly auto-scout triggered');
      try {
        await runAutoScout();
      } catch (e) {
        console.error('[Cron] Auto-scout failed:', e.message);
      }
    }, { timezone: 'Africa/Johannesburg' });
    console.log('Nightly auto-scout scheduled for 00:00 SAST');

    // Deadline reminders: every 30 minutes
    cron.schedule('*/30 * * * *', async () => {
      console.log('[Cron] Deadline reminder check');
      try { await runDeadlineReminders(); }
      catch (e) { console.error('[Cron] Deadline reminders failed:', e.message); }
    }, { timezone: 'Africa/Johannesburg' });
    console.log('Deadline reminders scheduled (every 30 min)');
  }
});
