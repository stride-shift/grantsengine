import dotenv from 'dotenv';
dotenv.config({ override: true });

import app from './app.js';
import { cleanExpiredSessions, getOrgBySlug } from './db.js';

const PORT = process.env.PORT || 3001;

// Clean expired sessions every hour
setInterval(() => cleanExpiredSessions(), 60 * 60 * 1000);

app.listen(PORT, async () => {
  console.log(`Grant Platform server on http://localhost:${PORT}`);
  console.log(`Mode: ${process.env.NODE_ENV || 'development'}`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn('Warning: No GEMINI_API_KEY in .env — AI features will not work');
  }
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
