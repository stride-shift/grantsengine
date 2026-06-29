import { getSession, getMemberWithAuth, getSuperAdminByEmail } from '../db.js';

// Gate for platform-level super-admin routes. There is no separate super-admin
// login/session anymore — a super-admin is simply a logged-in org member whose
// email is registered in the super_admins table. Reads the Bearer org-session
// token, resolves the member, and checks their email against super_admins.
export const requireSuperAdmin = async (req, res, next) => {
  // Bearer header only — query-string tokens leak into logs, history and Referer.
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const session = await getSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  const member = await getMemberWithAuth(session.org_id, session.member_id);
  if (member?.email && (await getSuperAdminByEmail(member.email))) {
    req.session = session;
    req.superAdmin = { memberId: member.id, email: member.email, name: member.name };
    return next();
  }

  return res.status(403).json({ error: 'Super-admin access required' });
};
