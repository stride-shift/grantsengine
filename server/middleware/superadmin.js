import { getSession, getMemberWithAuth, getSuperAdminByEmail, getSuperAdminSession } from '../db.js';

// Gate for platform-level super-admin routes. Accepts EITHER credential:
//   1. A standalone super-admin session (super_admin_sessions) — the dedicated
//      platform login at POST /superadmin/login. These admins need not belong to
//      any org.
//   2. An org member session whose email is registered in super_admins — so a
//      super-admin who is also an org member can use the in-app Admin sub-tab.
// Reads the Bearer token only — query-string tokens leak into logs/history/Referer.
export const requireSuperAdmin = async (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // 1. Standalone super-admin session.
  const saSession = await getSuperAdminSession(token);
  if (saSession) {
    req.superAdmin = {
      id: saSession.admin_id,
      email: saSession.email,
      name: saSession.name,
      kind: 'standalone',
    };
    req.superAdminToken = token;
    return next();
  }

  // 2. Org member session whose email is a registered super-admin.
  const session = await getSession(token);
  if (session) {
    const member = await getMemberWithAuth(session.org_id, session.member_id);
    if (member?.email && (await getSuperAdminByEmail(member.email))) {
      req.session = session;
      req.superAdmin = {
        memberId: member.id,
        email: member.email,
        name: member.name,
        kind: 'member',
      };
      return next();
    }
  }

  return res.status(403).json({ error: 'Super-admin access required' });
};
