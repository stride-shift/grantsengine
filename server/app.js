import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import orgRoutes from './routes/orgs.js';
import dataRoutes from './routes/data.js';
import aiRoutes from './routes/ai.js';
import uploadRoutes from './routes/uploads.js';
import adminRoutes from './routes/admin.js';
import gcalRoutes from './routes/gcal.js';
import autofillRoutes from './routes/autofill.js';
import cronRoutes from './routes/cron.js';
import superadminRoutes from './routes/superadmin.js';
import pool from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ── Security middleware ──
app.use(helmet({ contentSecurityPolicy: false })); // CSP off — Vite injects inline scripts
app.use(cors({
  origin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true,
}));

// Rate limiting on login endpoints only — 20 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/org/:slug/auth/login', authLimiter);
app.use('/api/org/:slug/auth/set-password', authLimiter);
app.use('/api/org/:slug/auth/member-login', authLimiter);
// Email-based login (org-agnostic primary path)
app.use('/api/auth/login', authLimiter);
app.use('/api/org/:slug/auth/member-set-password', authLimiter);
// Throttle the emailed password-reset request flow (replaces the removed admin-key path)
app.use('/api/org/:slug/auth/request-reset', rateLimit({
  windowMs: 60 * 60 * 1000, max: 5,
  message: { error: 'Too many password reset attempts. Try again in 1 hour.' },
  standardHeaders: true, legacyHeaders: false,
}));
// Email-based (org-agnostic) reset request — same 5/hour cap
app.use('/api/auth/request-reset', rateLimit({
  windowMs: 60 * 60 * 1000, max: 5,
  message: { error: 'Too many password reset attempts. Try again in 1 hour.' },
  standardHeaders: true, legacyHeaders: false,
}));
// (Super-admin login is unified into /api/auth/login, which is already rate-limited above.)
app.use('/api/org/:slug/ai/messages', rateLimit({
  windowMs: 60 * 1000, max: 30,
  message: { error: 'AI rate limit reached. Wait a moment before trying again.' },
  standardHeaders: true, legacyHeaders: false,
}));
app.use('/api/org/:slug/uploads/youtube', rateLimit({
  windowMs: 60 * 1000, max: 10,
  message: { error: 'YouTube extraction rate limit reached. Wait a moment.' },
  standardHeaders: true, legacyHeaders: false,
}));

app.use(express.json({ limit: '10mb' }));

// ── API routes ──
app.use('/api', authRoutes);
app.use('/api', orgRoutes);
app.use('/api', dataRoutes);
app.use('/api', aiRoutes);
app.use('/api', uploadRoutes);
app.use('/api', adminRoutes);
app.use('/api', gcalRoutes);
app.use('/api', autofillRoutes);
app.use('/api', cronRoutes);
app.use('/api', superadminRoutes);

// Health check (includes DB connectivity)
app.get('/api/health', async (req, res) => {
  let dbOk = false;
  try {
    await pool().query('SELECT 1');
    dbOk = true;
  } catch { /* DB unreachable */ }
  res.json({ ok: dbOk, apiKeyConfigured: !!process.env.OPENAI_API_KEY, dbConnected: dbOk });
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
