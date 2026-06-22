/*
  Email backfill tool — assigns login emails to existing team members so they can
  use the new email+password login (see RESTRUCTURE_LOGIN_PLAN.md).

  DRY-RUN BY DEFAULT — prints an audit + the planned changes and writes nothing.

  Usage:
    node server/backfill-emails.js                      # audit only (all orgs, all members)
    node server/backfill-emails.js --map emails.json    # plan from { "memberId": "email", ... }
    node server/backfill-emails.js --map emails.json --apply        # actually write the emails
    node server/backfill-emails.js --send-setup --base-url https://app.example.com --apply
                                                        # email a password-setup link to members
                                                        # who have an email but no password yet

  Safe to re-run: assignments that are already set are skipped; collisions (an email
  already used by another member, across ANY org) are reported and never written.
*/
import 'dotenv/config';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  getAllOrgs, getTeamMembers, setMemberEmail, getMemberWithAuth, createResetToken,
} from './db.js';
import { sendResetEmail } from './email.js';
import { planEmailBackfill } from './lib/emailBackfill.js';

const arg = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] || true) : null;
};

async function loadAllMembers() {
  const orgs = await getAllOrgs();
  const all = [];
  for (const org of orgs) {
    const members = await getTeamMembers(org.id);
    for (const m of members) {
      if (m.id === 'team') continue; // the "Unassigned" placeholder is not a login
      all.push({ ...m, org_slug: org.slug });
    }
  }
  return { orgs, members: all };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const sendSetup = process.argv.includes('--send-setup');
  const baseUrl = arg('--base-url') || process.env.APP_BASE_URL || 'http://localhost:3000';
  const mapPath = arg('--map');
  const map = mapPath ? JSON.parse(fs.readFileSync(mapPath, 'utf8')) : {};

  const { members } = await loadAllMembers();
  console.log(`\n${members.length} login-capable members across all orgs.\n`);

  // Audit: who lacks an email today
  const noEmail = members.filter((m) => !(m.email || '').trim());
  if (noEmail.length) {
    console.log(`Members with NO email (${noEmail.length}):`);
    for (const m of noEmail) console.log(`  - ${m.org_slug}/${m.id}  ${m.name}`);
    console.log('');
  }

  const plan = planEmailBackfill(members, map);

  const show = (label, rows, fmt) => {
    if (!rows.length) return;
    console.log(`${label} (${rows.length}):`);
    for (const r of rows) console.log('  - ' + fmt(r));
    console.log('');
  };
  show('WOULD SET', plan.apply, (r) => `${r.id} → ${r.email}`);
  show('COLLISIONS (skipped — email already used)', plan.collisions, (r) => `${r.id} → ${r.email} (conflicts with ${r.conflictsWith})`);
  show('INVALID (skipped)', plan.invalid, (r) => `${r.id} → "${r.email}" (${r.reason})`);
  show('ALREADY SET (skipped)', plan.skipped, (r) => `${r.id} → ${r.email}`);
  show('STILL MISSING AN EMAIL after this plan', plan.missing, (r) => `${r.org_slug || ''}${r.id} ${r.name}`);

  if (!apply) {
    console.log('DRY RUN — nothing written. Re-run with --apply to commit the "WOULD SET" changes.\n');
    return;
  }

  // Apply
  let written = 0;
  for (const a of plan.apply) {
    await setMemberEmail(a.id, a.email);
    written++;
    console.log(`  set ${a.id} → ${a.email}`);
  }
  console.log(`\nApplied ${written} email assignment(s).`);

  // Optional: email a setup link to members who now have an email but no password.
  if (sendSetup) {
    let sent = 0;
    for (const m of members) {
      const email = (map[m.id] || m.email || '').trim();
      if (!email) continue;
      const full = await getMemberWithAuth(m.org_id, m.id);
      if (full?.password_hash) continue; // already has a password
      try {
        const token = await createResetToken(m.id, m.org_id);
        await sendResetEmail(email, `${baseUrl}?reset=${token}&slug=${m.org_slug}`, m.name);
        sent++;
        console.log(`  setup link → ${email}`);
      } catch (err) {
        console.error(`  FAILED setup link for ${m.id}: ${err.message}`);
      }
    }
    console.log(`\nSent ${sent} setup link(s).`);
  }
}

// Run only when invoked directly (so the module can be imported in tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

export { loadAllMembers, planEmailBackfill };
