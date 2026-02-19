import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import orgRoutes from './routes/orgs.js';
import dataRoutes from './routes/data.js';
import aiRoutes from './routes/ai.js';
import uploadRoutes from './routes/uploads.js';
import adminRoutes from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '10mb' }));

// ── API routes ──
app.use('/api', authRoutes);
app.use('/api', orgRoutes);
app.use('/api', dataRoutes);
app.use('/api', aiRoutes);
app.use('/api', uploadRoutes);
app.use('/api', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, apiKeyConfigured: !!process.env.GEMINI_API_KEY });
});

// ── Global error handler — catches unhandled errors from all routes ──
app.use((err, req, res, _next) => {
  console.error(`[API Error] ${req.method} ${req.path}:`, err.message || err);
  if (!res.headersSent) {
    res.status(err.status || 500).json({
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    });
  }
});

// ── Production: serve Vite build ──
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '..', 'dist');
  app.use(express.static(distPath));
  app.use((req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

export default app;
