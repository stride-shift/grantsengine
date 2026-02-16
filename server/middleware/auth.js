import { getSession } from '../db.js';

export const requireAuth = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const session = await getSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  if (req.orgId && session.org_id !== req.orgId) {
    return res.status(403).json({ error: 'Access denied — wrong organisation' });
  }

  req.session = session;
  req.orgId = session.org_id;
  next();
};
