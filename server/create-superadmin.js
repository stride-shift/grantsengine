/*
  Super-admin seed tool — creates a platform-level super-admin who manages
  subscriptions and views cross-org usage (see server/routes/superadmin.js).

  Usage:
    node server/create-superadmin.js <email> <password> "<name>"

  Or via env (handy for CI / non-interactive provisioning):
    SUPERADMIN_EMAIL=... SUPERADMIN_PASSWORD=... SUPERADMIN_NAME="..." node server/create-superadmin.js

  Password is bcrypt-hashed (10 rounds). Safe to re-run: if the email already
  exists it reports and exits without overwriting.
*/
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { getSuperAdminByEmail, createSuperAdmin } from './db.js';

async function main() {
  const email = (process.argv[2] || process.env.SUPERADMIN_EMAIL || '').trim();
  const password = process.argv[3] || process.env.SUPERADMIN_PASSWORD || '';
  const name = process.argv[4] || process.env.SUPERADMIN_NAME || null;

  if (!email || !password) {
    console.error('Usage: node server/create-superadmin.js <email> <password> "<name>"');
    console.error('   or set SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD / SUPERADMIN_NAME');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const existing = await getSuperAdminByEmail(email);
  if (existing) {
    console.log(`Super-admin already exists: ${existing.email} (no changes made).`);
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await createSuperAdmin({ email, passwordHash, name });
  console.log(`Created super-admin: ${email.trim().toLowerCase()}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to create super-admin:', err.message);
  process.exit(1);
});
