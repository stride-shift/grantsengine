import dotenv from 'dotenv';
dotenv.config({ override: true });
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import orgRoutes from './routes/orgs.js';
import dataRoutes from './routes/data.js';
import aiRoutes from './routes/ai.js';
import uploadRoutes from './routes/uploads.js';
import { cleanExpiredSessions, getOrgBySlug } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: '10mb' }));

// ── API routes ──
app.use('/api', authRoutes);
app.use('/api', orgRoutes);
app.use('/api', dataRoutes);
app.use('/api', aiRoutes);
app.use('/api', uploadRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, apiKeyConfigured: !!process.env.ANTHROPIC_API_KEY });
});

// ── Production: serve Vite build ──
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.use((req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Clean expired sessions every hour
setInterval(() => cleanExpiredSessions(), 60 * 60 * 1000);

app.listen(PORT, () => {
  console.log(`Grant Platform server on http://localhost:${PORT}`);
  console.log(`Mode: ${process.env.NODE_ENV || 'development'}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('Warning: No ANTHROPIC_API_KEY in .env — AI features will not work');
  }
  // Auto-seed on first run if no orgs exist (needed for Railway / fresh deploys)
  const dlab = getOrgBySlug('dlab');
  if (dlab) {
    console.log(`Seed org found: ${dlab.name} (${dlab.slug})`);
  } else {
    console.log('No orgs found — auto-seeding d-lab NPC...');
    try {
      const { runSeed } = await import('./seed-fn.js');
      runSeed();
      console.log('Auto-seed complete. Login: /org/dlab with password: dlab2026');
    } catch (e) {
      console.error('Auto-seed failed:', e.message);
      console.log('Run manually: node server/seed.js');
    }
  }
});
