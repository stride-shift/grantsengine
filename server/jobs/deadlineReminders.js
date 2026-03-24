import { getGrants, getTeamMembers, kvGet, kvSet, getAllOrgs } from '../db.js';
import { sendDayBeforeEmail, send2HoursBeforeEmail, sendDeadlineMissingEmail } from '../email.js';

// Checks all active grants and sends timed reminders:
// 1. Day-before deadline email to owner
// 2. 2-hours-before deadline email to owner
// 3. "Deadline missing" nudge if owner has grant >48hrs with no deadline
// Uses KV store to prevent duplicates. Skips grants without owner/deadline/closed.

const CLOSED = ['won', 'lost', 'deferred', 'archived', 'submitted'];

export async function runDeadlineReminders() {
  const now = new Date();
  const orgs = await getAllOrgs();
  const orgIds = orgs.map(o => o.id);

  for (const orgId of orgIds) {
    try {
      const grants = await getGrants(orgId);
      const members = await getTeamMembers(orgId);
      const memberMap = new Map(members.map(m => [m.id, m]));

      for (const g of grants) {
        // Skip: no owner, closed/submitted stage
        if (!g.owner || g.owner === 'team') continue;
        if (CLOSED.includes(g.stage)) continue;

        const owner = memberMap.get(g.owner);
        if (!owner?.email) continue;

        // ── Grants WITH a deadline: day-before + 2-hours-before ──
        if (g.deadline) {
          const deadlineDate = new Date(g.deadline + 'T09:00:00');
          const hoursUntil = (deadlineDate.getTime() - now.getTime()) / 3600000;

          // Day-before: 23-25 hour window
          if (hoursUntil > 23 && hoursUntil <= 25) {
            const key = `reminder-day-${g.id}-${g.deadline}`;
            const sent = await kvGet(orgId, key);
            if (!sent) {
              try {
                await sendDayBeforeEmail(owner.email, owner.name, g.name, g.funder || '', g.deadline, g.stage, g.id);
                await kvSet(orgId, key, now.toISOString());
                console.log(`[reminders] Day-before sent: ${g.name} → ${owner.name}`);
              } catch (e) {
                console.error(`[reminders] Day-before failed for ${g.name}:`, e.message);
              }
            }
          }

          // 2-hours-before: 1.5-2.5 hour window
          if (hoursUntil > 1.5 && hoursUntil <= 2.5) {
            const key = `reminder-2hr-${g.id}-${g.deadline}`;
            const sent = await kvGet(orgId, key);
            if (!sent) {
              try {
                await send2HoursBeforeEmail(owner.email, owner.name, g.name, g.funder || '', g.deadline, g.stage, g.id);
                await kvSet(orgId, key, now.toISOString());
                console.log(`[reminders] 2-hours-before sent: ${g.name} → ${owner.name}`);
              } catch (e) {
                console.error(`[reminders] 2-hours-before failed for ${g.name}:`, e.message);
              }
            }
          }
        }

        // ── Grants WITHOUT a deadline: nudge after 48 hours ──
        if (!g.deadline) {
          // Use the first log entry date as creation/assignment time
          const createdDate = g.log?.[0]?.d;
          if (!createdDate) continue;

          const hoursSinceCreated = (now.getTime() - new Date(createdDate).getTime()) / 3600000;
          if (hoursSinceCreated >= 48) {
            const key = `reminder-nodeadline-${g.id}-${g.owner}`;
            const sent = await kvGet(orgId, key);
            if (!sent) {
              try {
                await sendDeadlineMissingEmail(owner.email, owner.name, g.name, g.funder || '', g.stage, g.id);
                await kvSet(orgId, key, now.toISOString());
                console.log(`[reminders] Deadline missing sent: ${g.name} → ${owner.name}`);
              } catch (e) {
                console.error(`[reminders] Deadline missing failed for ${g.name}:`, e.message);
              }
            }
          }
        }
      }
    } catch (e) {
      console.error(`[reminders] Failed for org ${orgId}:`, e.message);
    }
  }
}
