import { getSuperAdminSession } from '../db.js';

// Gate for platform-level super-admin routes. Reads the Bearer token, validates
// the super_admin_sessions row (not expired) and attaches req.superAdmin.
// Kept separate from requireAuth — super-admins are not tied to any org.
export const requireSuperAdmin = async (req, res, next) => {
  // Bearer header only — query-string tokens leak into logs, history and Referer.
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const session = await getSuperAdminSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  req.superAdminToken = token;
  req.superAdmin = { id: session.admin_id, email: session.email, name: session.name };

  next();
};
