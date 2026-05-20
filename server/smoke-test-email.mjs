import { sendStageChangeEmail, sendAssignmentEmail } from './email.js';

const to = process.argv[2];
if (!to) {
  console.error('Usage: node server/smoke-test-email.mjs <recipient@example.com>');
  process.exit(1);
}
if (!process.env.RESEND_API_KEY) {
  console.error('RESEND_API_KEY env var is not set.');
  process.exit(1);
}

const deadline = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
const fakeGrantId = 'smoke-test-' + Math.random().toString(36).slice(2, 10);

console.log('\n[smoke] TEST 1: stage-change with ICS calendar invite →', to);
await sendStageChangeEmail(to, 'Test User', 'Smoke Test Grant', 'Test Funder Foundation',
  'qualifying', 'drafting', 'Smoke Test Sender', fakeGrantId, deadline);

console.log('\n[smoke] TEST 2: assignment (no ICS) →', to);
await sendAssignmentEmail(to, 'Test User', 'Smoke Test Grant', 'Test Funder Foundation',
  'Smoke Test Sender', fakeGrantId, null, 'drafting');

console.log('\n[smoke] Done. Check inbox + spam.');
