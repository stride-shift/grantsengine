import nodemailer from 'nodemailer';
import crypto from 'crypto';

let _transport = null;

function getTransport() {
  if (!_transport) {
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!user || !pass) {
      console.warn('[email] SMTP_USER / SMTP_PASS not set — emails will be logged to console only');
      return null;
    }
    _transport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
  }
  return _transport;
}

const STAGE_LABELS = {
  scouted: "Scouted", vetting: "Vetting", qualifying: "Qualifying", drafting: "Drafting",
  review: "Review", submitted: "Submitted", awaiting: "Awaiting", won: "Won",
  lost: "Lost", resubmit: "Resubmit", deferred: "Deferred", archived: "Not Relevant",
};

const STAGE_COLORS = {
  scouted: "#6B7280", vetting: "#0EA5E9", qualifying: "#2563EB", drafting: "#C17817",
  review: "#6D28D9", submitted: "#DB2777", awaiting: "#0891B2", won: "#16A34A",
  lost: "#DC2626", resubmit: "#B45309", deferred: "#9CA3AF", archived: "#D1D5DB",
};

const APP_URL = process.env.APP_URL || 'https://grantsengine.vercel.app';

// Supabase public URLs for email assets
const BG_URL = 'https://ymqejaufpoiaedgjwohe.supabase.co/storage/v1/object/public/logos/email/email-bg.png';
const GE_LOGO_URL = 'https://ymqejaufpoiaedgjwohe.supabase.co/storage/v1/object/public/logos/email/grants-engine-logo.png';

/* ── ICS Calendar Helpers ── */
function icsDate(d) {
  const dt = new Date(d);
  return dt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escICS(str) {
  return (str || '').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
}

// Generate ICS calendar task for a grant deadline.
// Single event on deadline day at 9am, with a 1-day-before alarm.
// Uses stable UID so re-sending with same grantId updates rather than duplicates.
// sequence param allows updating existing events (increment to update).
function generateGrantICS({ grantName, funder, stage, deadline, ownerName, grantUrl, grantId, sequence = 0 }) {
  const now = icsDate(new Date());
  const deadlineDate = new Date(deadline + 'T09:00:00');
  const uid = `grant-${grantId || 'unknown'}@grantsengine`;
  const desc = escICS(`Grant: ${grantName}\nFunder: ${funder}\nStage: ${stage}\nDeadline: ${deadline}\nOwner: ${ownerName || 'Unassigned'}\nAction: Review and progress this grant before deadline.\n\n${grantUrl}`);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Grants Engine//NONSGML v1.0//EN',
    'METHOD:PUBLISH',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${icsDate(deadlineDate)}`,
    `DTEND:${icsDate(new Date(deadlineDate.getTime() + 3600000))}`,
    `SUMMARY:${escICS('Grant action due: ' + grantName)}`,
    `DESCRIPTION:${desc}`,
    `URL:${grantUrl}`,
    `SEQUENCE:${sequence}`,
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escICS('Tomorrow: ' + grantName + ' deadline')}`,
    'END:VALARM',
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

// Generate ICS cancellation for a grant (when owner changes).
function generateCancelICS({ grantId, sequence = 1 }) {
  const now = icsDate(new Date());
  const uid = `grant-${grantId || 'unknown'}@grantsengine`;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Grants Engine//NONSGML v1.0//EN',
    'METHOD:CANCEL',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${now}`,
    `DTEND:${now}`,
    `SEQUENCE:${sequence}`,
    'STATUS:CANCELLED',
    'SUMMARY:Cancelled',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
}

export const sendStageChangeEmail = async (toEmail, memberName, grantName, funder, fromStage, toStage, movedByName, grantId, deadline) => {
  const transport = getTransport();
  const fromLabel = STAGE_LABELS[fromStage] || fromStage;
  const toLabel = STAGE_LABELS[toStage] || toStage;
  const fromColor = STAGE_COLORS[fromStage] || "#6B7280";
  const toColor = STAGE_COLORS[toStage] || "#3B4A3F";
  const isWon = toStage === "won";
  const isLost = toStage === "lost";

  const subject = isWon ? `Won: ${grantName}` : isLost ? `Lost: ${grantName}` : `${grantName} → ${toLabel}`;
  const grantUrl = grantId ? `${APP_URL}?grant=${grantId}` : APP_URL;

  let contextMsg = `${movedByName || "Someone"} moved this grant forward — it's now ready for qualification review.`;
  if (isWon) contextMsg = `Congratulations! This grant has been won. Time to celebrate and plan next steps.`;
  if (isLost) contextMsg = `Unfortunately this grant was not successful. Review feedback and consider reapplying.`;
  if (toStage === "drafting") contextMsg = `${movedByName || "Someone"} moved this grant forward — it's now ready for draft proposal writing.`;
  if (toStage === "review") contextMsg = `${movedByName || "Someone"} moved this grant forward — it's now ready for review.`;
  if (toStage === "submitted") contextMsg = `${movedByName || "Someone"} submitted this grant — track follow-ups with the funder.`;
  if (toStage === "qualifying") contextMsg = `${movedByName || "Someone"} moved this grant forward — it's now ready for qualification review.`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <!-- Outer wrapper with starry background -->
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #ffffff;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table cellpadding="0" cellspacing="0" border="0" width="480" style="max-width: 480px; background-image: url('${BG_URL}'); background-size: cover; background-position: center; background-color: #0a1628; border-radius: 20px; overflow: hidden;">
          <tr><td>

            <!-- Header: GE logo -->
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding: 28px 28px 20px;">
              <tr>
                <td style="text-align: center; vertical-align: middle;">
                  <img src="${GE_LOGO_URL}" alt="Grants Engine" height="80" style="height: 80px; display: block; margin: 0 auto;" />
                </td>
              </tr>
            </table>

            <!-- Greeting -->
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding: 12px 28px 8px;">
              <tr><td>
                <p style="color: #ffffff; font-size: 16px; margin: 0 0 8px; font-weight: 400;">Hi ${memberName},</p>
                <p style="color: rgba(255,255,255,0.6); font-size: 14px; margin: 0 0 24px; line-height: 1.5;">
                  Your grant just progressed in <strong style="color: #ffffff;">Grants Engine</strong> &#10024;
                </p>
              </td></tr>
            </table>

            <!-- Grant card (glass effect) -->
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding: 0 20px;">
              <tr><td>
                <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 24px;">
                  <tr><td>

                    <!-- Grant name & funder -->
                    <p style="font-size: 20px; font-weight: 700; color: #ffffff; margin: 0 0 4px;">${grantName}</p>
                    <p style="font-size: 13px; color: rgba(255,255,255,0.4); margin: 0 0 22px;">${funder}</p>

                    <!-- Stage pills -->
                    <table cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td width="40%" style="text-align: center;">
                          <div style="display: inline-block; padding: 10px 20px; border: 1px solid ${fromColor}50; border-radius: 20px; background: ${fromColor}15;">
                            <span style="font-size: 14px; font-weight: 600; color: ${fromColor};">${fromLabel}</span>
                            <span style="font-size: 11px; color: rgba(255,255,255,0.3); margin-left: 4px;">&#10003;</span>
                          </div>
                        </td>
                        <td width="20%" style="text-align: center;">
                          <span style="font-size: 18px; color: rgba(255,255,255,0.2);">&#8594;</span>
                        </td>
                        <td width="40%" style="text-align: center;">
                          <div style="display: inline-block; padding: 10px 20px; border: 2px solid ${toColor}80; border-radius: 20px; background: ${toColor}20; box-shadow: 0 0 24px ${toColor}30;">
                            <span style="font-size: 14px; font-weight: 700; color: ${toColor};">${isWon ? "&#127881; " : ""}${toLabel}</span>
                          </div>
                        </td>
                      </tr>
                    </table>

                    <!-- Context message -->
                    <p style="font-size: 13px; color: rgba(255,255,255,0.5); margin: 20px 0 0; line-height: 1.6;">
                      ${contextMsg}
                    </p>

                  </td></tr>
                </table>
              </td></tr>
            </table>

            <!-- CTA Button -->
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding: 28px 20px;">
              <tr><td align="center">
                <a href="${grantUrl}" style="display: inline-block; padding: 16px 48px; background: rgba(74, 222, 128, 0.15); border: 1px solid rgba(74, 222, 128, 0.4); border-radius: 12px; color: #4ADE80; font-size: 15px; font-weight: 700; text-decoration: none; letter-spacing: 0.3px;">
                  Review Grant in Grants Engine
                </a>
              </td></tr>
            </table>

            <!-- Footer -->
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding: 8px 28px 32px; background: rgba(0,0,0,0.5);">
              <tr><td style="text-align: center; padding-top: 16px;">
                <p style="font-size: 12px; color: rgba(255,255,255,0.45); margin: 0 0 12px; line-height: 1.6;">
                  If you're assigned to this grant, now's a great time to take the next step.
                </p>
                <p style="font-size: 11px; color: rgba(255,255,255,0.4); margin: 0;">
                  &mdash; Grants Engine
                </p>
              </td></tr>
            </table>

          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  if (!transport) {
    console.log('[email] Would send stage change notification to:', toEmail, '|', subject);
    return;
  }

  const mailOpts = {
    from: `Grants Engine <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject,
    html,
  };

  // Calendar tasks ONLY if deadline exists
  if (deadline) {
    const ics = generateGrantICS({
      grantName, funder, stage: toLabel, deadline,
      ownerName: memberName, grantUrl, grantId, suffix: toStage,
    });
    mailOpts.icalEvent = { filename: 'invite.ics', method: 'PUBLISH', content: Buffer.from(ics) };
  }

  await transport.sendMail(mailOpts);
  console.log('[email] Stage change notification sent to:', toEmail, deadline ? `(calendar: ${deadline})` : '(no deadline, no calendar)');
};

/* ── Shared email shell for simple notification emails ── */
function simpleEmailHtml({ memberName, headline, body, ctaLabel, ctaUrl, footerMsg }) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #ffffff;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table cellpadding="0" cellspacing="0" border="0" width="480" style="max-width: 480px; background-image: url('${BG_URL}'); background-size: cover; background-position: center; background-color: #0a1628; border-radius: 20px; overflow: hidden;">
          <tr><td>
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding: 28px 28px 20px;">
              <tr><td style="text-align: center;"><img src="${GE_LOGO_URL}" alt="Grants Engine" height="80" style="height: 80px; display: block; margin: 0 auto;" /></td></tr>
            </table>
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding: 12px 28px 8px;">
              <tr><td>
                <p style="color: #ffffff; font-size: 16px; margin: 0 0 8px;">Hi ${memberName},</p>
                <p style="color: rgba(255,255,255,0.6); font-size: 14px; margin: 0 0 24px; line-height: 1.5;">${headline}</p>
              </td></tr>
            </table>
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding: 0 20px;">
              <tr><td>
                <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 24px;">
                  <tr><td>${body}</td></tr>
                </table>
              </td></tr>
            </table>
            ${ctaLabel ? `
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding: 28px 20px;">
              <tr><td align="center">
                <a href="${ctaUrl}" style="display: inline-block; padding: 16px 48px; background: rgba(74, 222, 128, 0.15); border: 1px solid rgba(74, 222, 128, 0.4); border-radius: 12px; color: #4ADE80; font-size: 15px; font-weight: 700; text-decoration: none;">${ctaLabel}</a>
              </td></tr>
            </table>` : ''}
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding: 8px 28px 32px; background: rgba(0,0,0,0.5);">
              <tr><td style="text-align: center; padding-top: 16px;">
                <p style="font-size: 12px; color: rgba(255,255,255,0.45); margin: 0 0 12px; line-height: 1.6;">${footerMsg || ''}</p>
                <p style="font-size: 11px; color: rgba(255,255,255,0.4); margin: 0;">&mdash; Grants Engine</p>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendEmail(toEmail, subject, html, tag, icsContent) {
  const transport = getTransport();
  if (!transport) { console.log(`[email] Would send ${tag} to:`, toEmail, '|', subject); return; }
  const opts = { from: `Grants Engine <${process.env.SMTP_USER}>`, to: toEmail, subject, html };
  if (icsContent) {
    opts.icalEvent = { filename: 'invite.ics', method: 'PUBLISH', content: Buffer.from(icsContent) };
  }
  await transport.sendMail(opts);
  console.log(`[email] ${tag} sent to:`, toEmail);
}

/* ── Grant assigned to someone ── */
export const sendAssignmentEmail = async (toEmail, memberName, grantName, funder, assignedByName, grantId, deadline, stage) => {
  const grantUrl = grantId ? `${APP_URL}?grant=${grantId}` : APP_URL;
  const stageLabel = STAGE_LABELS[stage] || stage || 'Scouted';
  const html = simpleEmailHtml({
    memberName,
    headline: `You've been assigned to a grant in <strong style="color: #ffffff;">Grants Engine</strong>`,
    body: `
      <p style="font-size: 20px; font-weight: 700; color: #ffffff; margin: 0 0 4px;">${grantName}</p>
      <p style="font-size: 13px; color: rgba(255,255,255,0.4); margin: 0 0 16px;">${funder}</p>
      <div style="display: inline-block; padding: 8px 16px; border-radius: 20px; background: rgba(14, 165, 233, 0.15); border: 1px solid rgba(14, 165, 233, 0.4);">
        <span style="font-size: 13px; font-weight: 600; color: #0EA5E9;">Assigned to you</span>
      </div>
      <p style="font-size: 12px; color: rgba(255,255,255,0.4); margin: 12px 0 0;">Stage: ${stageLabel}${deadline ? ` · Deadline: ${deadline}` : ''}</p>
      <p style="font-size: 13px; color: rgba(255,255,255,0.5); margin: 8px 0 0; line-height: 1.6;">
        ${assignedByName || 'Someone'} assigned this grant to you. Review the details and take the next step.
      </p>`,
    ctaLabel: 'View Grant in Grants Engine',
    ctaUrl: grantUrl,
    footerMsg: "You're receiving this because you've been assigned to this grant.",
  });

  // Calendar tasks ONLY if deadline exists
  let ics = null;
  if (deadline) {
    ics = generateGrantICS({
      grantName, funder, stage: stageLabel, deadline,
      ownerName: memberName, grantUrl, grantId, suffix: 'assign',
    });
  }

  await sendEmail(toEmail, `Assigned to you: ${grantName}`, html, 'Assignment notification', ics);
};

/* ── New grant created ── */
export const sendGrantCreatedEmail = async (toEmail, memberName, grantName, funder, createdByName, grantId) => {
  const grantUrl = grantId ? `${APP_URL}?grant=${grantId}` : APP_URL;
  const html = simpleEmailHtml({
    memberName,
    headline: `A new grant has been added to <strong style="color: #ffffff;">Grants Engine</strong>`,
    body: `
      <p style="font-size: 20px; font-weight: 700; color: #ffffff; margin: 0 0 4px;">${grantName}</p>
      <p style="font-size: 13px; color: rgba(255,255,255,0.4); margin: 0 0 16px;">${funder}</p>
      <div style="display: inline-block; padding: 8px 16px; border-radius: 20px; background: rgba(74, 222, 128, 0.15); border: 1px solid rgba(74, 222, 128, 0.4);">
        <span style="font-size: 13px; font-weight: 600; color: #4ADE80;">New Grant</span>
      </div>
      <p style="font-size: 13px; color: rgba(255,255,255,0.5); margin: 16px 0 0; line-height: 1.6;">
        ${createdByName || 'Someone'} added this grant to the pipeline. Check it out and decide next steps.
      </p>`,
    ctaLabel: 'View Grant in Grants Engine',
    ctaUrl: grantUrl,
    footerMsg: "You're receiving this because you're part of the grants team.",
  });
  await sendEmail(toEmail, `New grant: ${grantName} (${funder})`, html, 'Grant created notification');
};

/* ── Grant deleted ── */
export const sendGrantDeletedEmail = async (toEmail, memberName, grantName, funder, deletedByName) => {
  const html = simpleEmailHtml({
    memberName,
    headline: `A grant has been removed from <strong style="color: #ffffff;">Grants Engine</strong>`,
    body: `
      <p style="font-size: 20px; font-weight: 700; color: #ffffff; margin: 0 0 4px;">${grantName}</p>
      <p style="font-size: 13px; color: rgba(255,255,255,0.4); margin: 0 0 16px;">${funder}</p>
      <div style="display: inline-block; padding: 8px 16px; border-radius: 20px; background: rgba(220, 38, 38, 0.15); border: 1px solid rgba(220, 38, 38, 0.4);">
        <span style="font-size: 13px; font-weight: 600; color: #DC2626;">Deleted</span>
      </div>
      <p style="font-size: 13px; color: rgba(255,255,255,0.5); margin: 16px 0 0; line-height: 1.6;">
        ${deletedByName || 'Someone'} removed this grant from the pipeline.
      </p>`,
    ctaLabel: null,
    ctaUrl: null,
    footerMsg: "You're receiving this because you were the owner of this grant.",
  });
  await sendEmail(toEmail, `Deleted: ${grantName}`, html, 'Grant deleted notification');
};

/* ── Ownership removed (sent to old owner when grant is reassigned) ── */
export const sendOwnershipRemovedEmail = async (toEmail, memberName, grantName, funder, newOwnerName) => {
  const html = simpleEmailHtml({
    memberName,
    headline: `You've been removed from a grant in <strong style="color: #ffffff;">Grants Engine</strong>`,
    body: `
      <p style="font-size: 20px; font-weight: 700; color: #ffffff; margin: 0 0 4px;">${grantName}</p>
      <p style="font-size: 13px; color: rgba(255,255,255,0.4); margin: 0 0 16px;">${funder}</p>
      <div style="display: inline-block; padding: 8px 16px; border-radius: 20px; background: rgba(156, 163, 175, 0.15); border: 1px solid rgba(156, 163, 175, 0.4);">
        <span style="font-size: 13px; font-weight: 600; color: #9CA3AF;">Ownership removed</span>
      </div>
      <p style="font-size: 13px; color: rgba(255,255,255,0.5); margin: 16px 0 0; line-height: 1.6;">
        This grant has been reassigned${newOwnerName ? ` to ${newOwnerName}` : ''}. You no longer need to action it.
      </p>`,
    ctaLabel: null,
    ctaUrl: null,
    footerMsg: "You're receiving this because you were previously the owner of this grant.",
  });
  await sendEmail(toEmail, `Ownership removed: ${grantName}`, html, 'Ownership removed notification');
};

/* ── Deadline reminder: 1 day before ── */
export const sendDayBeforeEmail = async (toEmail, memberName, grantName, funder, deadline, stage, grantId) => {
  const grantUrl = grantId ? `${APP_URL}?grant=${grantId}` : APP_URL;
  const stageLabel = STAGE_LABELS[stage] || stage || '';
  const html = simpleEmailHtml({
    memberName,
    headline: `<strong style="color: #FBBF24;">${grantName}</strong> closes <strong style="color: #ffffff;">tomorrow</strong>`,
    body: `
      <p style="font-size: 20px; font-weight: 700; color: #ffffff; margin: 0 0 4px;">${grantName}</p>
      <p style="font-size: 13px; color: rgba(255,255,255,0.4); margin: 0 0 16px;">${funder}</p>
      <div style="display: inline-block; padding: 8px 16px; border-radius: 20px; background: rgba(251, 191, 36, 0.15); border: 1px solid rgba(251, 191, 36, 0.4);">
        <span style="font-size: 13px; font-weight: 600; color: #FBBF24;">Deadline: ${deadline}</span>
      </div>
      <p style="font-size: 12px; color: rgba(255,255,255,0.4); margin: 12px 0 0;">Stage: ${stageLabel}</p>
      <p style="font-size: 13px; color: rgba(255,255,255,0.5); margin: 8px 0 0; line-height: 1.6;">
        This grant closes tomorrow. Make sure everything is submitted or progressed before the deadline.
      </p>`,
    ctaLabel: 'Review Grant Now',
    ctaUrl: grantUrl,
    footerMsg: "You're receiving this because you own this grant and the deadline is tomorrow.",
  });
  await sendEmail(toEmail, `Tomorrow: ${grantName} deadline`, html, 'Day-before reminder');
};

/* ── Deadline reminder: 2 hours before ── */
export const send2HoursBeforeEmail = async (toEmail, memberName, grantName, funder, deadline, stage, grantId) => {
  const grantUrl = grantId ? `${APP_URL}?grant=${grantId}` : APP_URL;
  const stageLabel = STAGE_LABELS[stage] || stage || '';
  const html = simpleEmailHtml({
    memberName,
    headline: `<strong style="color: #DC2626;">${grantName}</strong> closes in <strong style="color: #ffffff;">2 hours</strong>`,
    body: `
      <p style="font-size: 20px; font-weight: 700; color: #ffffff; margin: 0 0 4px;">${grantName}</p>
      <p style="font-size: 13px; color: rgba(255,255,255,0.4); margin: 0 0 16px;">${funder}</p>
      <div style="display: inline-block; padding: 8px 16px; border-radius: 20px; background: rgba(220, 38, 38, 0.15); border: 1px solid rgba(220, 38, 38, 0.4);">
        <span style="font-size: 13px; font-weight: 600; color: #DC2626;">Closing: ${deadline} at 09:00</span>
      </div>
      <p style="font-size: 12px; color: rgba(255,255,255,0.4); margin: 12px 0 0;">Stage: ${stageLabel}</p>
      <p style="font-size: 13px; color: rgba(255,255,255,0.5); margin: 8px 0 0; line-height: 1.6;">
        Final reminder — this grant closes in 2 hours. Take action now if anything is outstanding.
      </p>`,
    ctaLabel: 'Take Action Now',
    ctaUrl: grantUrl,
    footerMsg: "FINAL REMINDER: This grant closes in 2 hours.",
  });
  await sendEmail(toEmail, `URGENT: ${grantName} closes in 2 hours`, html, '2-hours-before reminder');
};

/* ── Deadline missing reminder (owner has grant >48hrs with no deadline) ── */
export const sendDeadlineMissingEmail = async (toEmail, memberName, grantName, funder, stage, grantId) => {
  const grantUrl = grantId ? `${APP_URL}?grant=${grantId}` : APP_URL;
  const stageLabel = STAGE_LABELS[stage] || stage || '';
  const html = simpleEmailHtml({
    memberName,
    headline: `<strong style="color: #FBBF24;">${grantName}</strong> has no deadline set`,
    body: `
      <p style="font-size: 20px; font-weight: 700; color: #ffffff; margin: 0 0 4px;">${grantName}</p>
      <p style="font-size: 13px; color: rgba(255,255,255,0.4); margin: 0 0 16px;">${funder}</p>
      <div style="display: inline-block; padding: 8px 16px; border-radius: 20px; background: rgba(251, 191, 36, 0.15); border: 1px solid rgba(251, 191, 36, 0.4);">
        <span style="font-size: 13px; font-weight: 600; color: #FBBF24;">No deadline</span>
      </div>
      <p style="font-size: 12px; color: rgba(255,255,255,0.4); margin: 12px 0 0;">Stage: ${stageLabel}</p>
      <p style="font-size: 13px; color: rgba(255,255,255,0.5); margin: 8px 0 0; line-height: 1.6;">
        This grant has been assigned to you for over 48 hours but has no deadline. Please add a deadline so reminders can be scheduled.
      </p>`,
    ctaLabel: 'Add Deadline Now',
    ctaUrl: grantUrl,
    footerMsg: "You're receiving this because you own a grant with no deadline.",
  });
  await sendEmail(toEmail, `Deadline missing: ${grantName}`, html, 'Deadline missing reminder');
};

/* ── Send calendar cancellation to old owner ── */
export const sendCalendarCancellation = async (toEmail, grantId) => {
  const ics = generateCancelICS({ grantId, sequence: 99 });
  await sendEmail(toEmail, 'Calendar update: grant reassigned', '', 'Calendar cancellation', ics);
};

export const sendResetEmail = async (toEmail, resetUrl, memberName) => {
  const transport = getTransport();

  const subject = 'Reset your Grants Engine password';
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: #ffffff;">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table cellpadding="0" cellspacing="0" border="0" width="480" style="max-width: 480px; background-image: url('${BG_URL}'); background-size: cover; background-position: center; background-color: #0a1628; border-radius: 20px; overflow: hidden;">
          <tr><td>

            <!-- Header -->
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding: 28px 28px 20px;">
              <tr>
                <td style="text-align: center; vertical-align: middle;">
                  <img src="${GE_LOGO_URL}" alt="Grants Engine" height="80" style="height: 80px; display: block; margin: 0 auto;" />
                </td>
              </tr>
            </table>

            <!-- Greeting -->
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding: 12px 28px 8px;">
              <tr><td>
                <p style="color: #ffffff; font-size: 16px; margin: 0 0 8px;">Hi ${memberName},</p>
                <p style="color: rgba(255,255,255,0.6); font-size: 14px; margin: 0 0 24px; line-height: 1.5;">
                  We received a request to reset your <strong style="color: #fff;">Grants Engine</strong> password.
                </p>
              </td></tr>
            </table>

            <!-- Info card -->
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding: 0 20px;">
              <tr><td>
                <table cellpadding="0" cellspacing="0" border="0" width="100%" style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 24px;">
                  <tr><td>
                    <p style="font-size: 17px; font-weight: 700; color: #ffffff; margin: 0 0 10px;">Password Reset</p>
                    <p style="font-size: 13px; color: rgba(255,255,255,0.5); margin: 0; line-height: 1.6;">
                      Click the button below to choose a new password. This link expires in <strong style="color: rgba(255,255,255,0.7);">1 hour</strong>.
                    </p>
                  </td></tr>
                </table>
              </td></tr>
            </table>

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding: 28px 20px;">
              <tr><td align="center">
                <a href="${resetUrl}" style="display: inline-block; padding: 16px 48px; background: rgba(74, 222, 128, 0.15); border: 1px solid rgba(74, 222, 128, 0.4); border-radius: 12px; color: #4ADE80; font-size: 15px; font-weight: 700; text-decoration: none;">
                  Reset Password
                </a>
              </td></tr>
            </table>

            <!-- Footer -->
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding: 8px 28px 32px; background: rgba(0,0,0,0.5);">
              <tr><td style="text-align: center; padding-top: 16px;">
                <p style="font-size: 12px; color: rgba(255,255,255,0.45); margin: 0 0 12px; line-height: 1.6;">
                  If you didn't request this, you can safely ignore this email. Your password won't change.
                </p>
                <p style="font-size: 11px; color: rgba(255,255,255,0.4); margin: 0;">
                  &mdash; Grants Engine
                </p>
              </td></tr>
            </table>

          </td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  if (!transport) {
    console.log('[email] Would send reset email to:', toEmail);
    console.log('[email] Reset URL:', resetUrl);
    return;
  }

  await transport.sendMail({
    from: `Grants Engine <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject,
    html,
  });
  console.log('[email] Reset email sent to:', toEmail);
};
