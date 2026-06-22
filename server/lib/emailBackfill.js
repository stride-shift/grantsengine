// Pure planning logic for the email backfill tool (no DB/email imports, so it's
// unit-testable). Given the current members and a { memberId: email } map, it
// computes what to apply, what collides, what's invalid, what's already set, and
// which members would still lack an email afterwards.

const norm = (e) => (e || "").trim().toLowerCase();
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * @param members array of { id, org_id, name, email, password_hash? }
 * @param map     { [memberId]: email } assignments to apply
 * @returns { apply, collisions, invalid, skipped, missing }
 */
export function planEmailBackfill(members, map = {}) {
  const byId = new Map(members.map((m) => [m.id, m]));

  // Reserve every currently-used (non-blank) email so we can detect collisions —
  // both against existing rows and between two entries in the same map.
  const reserved = new Map(); // normalisedEmail -> memberId
  for (const m of members) {
    const e = norm(m.email);
    if (e) reserved.set(e, m.id);
  }

  const apply = [];
  const collisions = [];
  const invalid = [];
  const skipped = [];

  for (const [id, rawEmail] of Object.entries(map)) {
    const member = byId.get(id);
    const email = (rawEmail || "").trim();
    const ne = norm(email);

    if (!member) { invalid.push({ id, email, reason: "no such member" }); continue; }
    if (!ne || !EMAIL_RE.test(email)) { invalid.push({ id, email, reason: "invalid email format" }); continue; }
    if (norm(member.email) === ne) { skipped.push({ id, email, reason: "already set" }); continue; }

    const owner = reserved.get(ne);
    if (owner && owner !== id) { collisions.push({ id, email, conflictsWith: owner }); continue; }

    apply.push({ id, email, orgId: member.org_id });
    reserved.set(ne, id); // reserve so a later map entry can't claim the same email
  }

  // Who still has no usable email once the plan is applied?
  const willHave = new Set([
    ...members.filter((m) => norm(m.email)).map((m) => m.id),
    ...apply.map((a) => a.id),
  ]);
  const missing = members
    .filter((m) => !willHave.has(m.id))
    .map((m) => ({ id: m.id, name: m.name, org_id: m.org_id }));

  return { apply, collisions, invalid, skipped, missing };
}

export { norm as normaliseEmail, EMAIL_RE };
