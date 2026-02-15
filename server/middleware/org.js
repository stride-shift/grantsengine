import { getOrgBySlug } from '../db.js';

// Resolve :slug param to org_id, attach req.org and req.orgId
export const resolveOrg = (req, res, next) => {
  const { slug } = req.params;
  if (!slug) {
    return res.status(400).json({ error: 'Organisation slug required' });
  }

  const org = getOrgBySlug(slug);
  if (!org) {
    return res.status(404).json({ error: `Organisation "${slug}" not found` });
  }

  req.org = org;
  req.orgId = org.id;
  next();
};
