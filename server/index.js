import dotenv from 'dotenv';
dotenv.config({ override: true });

import { createClient } from '@supabase/supabase-js';
import app from './app.js';
import { initDb, cleanExpiredSessions, getOrgBySlug } from './db.js';

const PORT = process.env.PORT || 3001;

// Clean expired sessions every hour
setInterval(() => cleanExpiredSessions(), 60 * 60 * 1000);

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
  if (!process.env.GEMINI_API_KEY) {
    console.warn('Warning: No GEMINI_API_KEY in .env — AI features will not work');
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
      console.log('Auto-seed complete. Login: /org/dlab with password: dlab2026');
    } catch (e) {
      console.error('Auto-seed failed:', e.message);
      console.log('Run manually: node server/seed.js');
    }
  }
});
