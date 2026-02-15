import { getSession } from '../db.js';

// Validate session token from Authorization header or cookie
// Attaches req.session and req.orgId on success
export const requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const session = getSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  // Enforce tenant isolation: session org must match route org
  if (req.orgId && session.org_id !== req.orgId) {
    return res.status(403).json({ error: 'Access denied — wrong organisation' });
  }

  req.session = session;
  req.orgId = session.org_id;
  next();
};
