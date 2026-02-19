import { getSession, touchSession } from '../db.js';

// Track last-touched per token to avoid hammering DB
const _lastTouched = new Map();
const TOUCH_INTERVAL_MS = 60_000;
const EVICT_INTERVAL_MS = 10 * 60_000; // clean stale entries every 10 minutes
const STALE_MS = 30 * 60_000; // entries older than 30 min are stale

// Periodic eviction of stale entries to prevent memory leak
setInterval(() => {
  const cutoff = Date.now() - STALE_MS;
  for (const [token, ts] of _lastTouched) {
    if (ts < cutoff) _lastTouched.delete(token);
  }
}, EVICT_INTERVAL_MS);

export const requireAuth = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const session = await getSession(token);
  if (!session) {
    _lastTouched.delete(token); // clean up invalidated tokens
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  if (req.orgId && session.org_id !== req.orgId) {
    return res.status(403).json({ error: 'Access denied — wrong organisation' });
  }

  req.session = session;
  req.orgId = session.org_id;
  req.memberId = session.member_id || null;

  // Throttled session touch — update last_active_at at most once per minute
  const now = Date.now();
  if (!_lastTouched.has(token) || now - _lastTouched.get(token) > TOUCH_INTERVAL_MS) {
    _lastTouched.set(token, now);
    touchSession(token).catch(() => {}); // fire-and-forget
  }

  next();
};
