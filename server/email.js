import { Resend } from 'resend';
import crypto from 'crypto';

// Env: RESEND_API_KEY (required to send), EMAIL_FROM (verified-domain sender).
// Missing key → all sends silently no-op (logs only).
let _resend = null;
function getResend() {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) return null;
    _resend = new Resend(key);
  }
  return _resend;
}

const FROM = process.env.EMAIL_FROM || 'Grants Engine <onboarding@resend.dev>';

async function sendViaResend({ to, subject, html, ics, tag = 'email' }) {
  if (!to || !subject) { console.warn(`[email] Skipping ${tag}: missing to or subject`); return false; }
  const client = getResend();
  if (!client) { console.log(`[email] Would send ${tag} to:`, to, '|', subject, '(RESEND_API_KEY not set)'); return false; }
  try {
    const payload = { from: FROM, to: Array.isArray(to) ? to : [to], subject, html };
    if (ics) {
      payload.attachments = [{
        filename: 'invite.ics',
        content: Buffer.from(ics).toString('base64'),
        contentType: 'text/calendar; method=PUBLISH; charset=utf-8',
      }];
    }
    const { data, error } = await client.emails.send(payload);
    if (error) { console.error(`[email] Resend rejected ${tag}:`, error.message || error); return false; }
    console.log(`[email] ${tag} sent to:`, to, '(id:', data?.id, ')');
    return true;
  } catch (e) {
    console.error(`[email] Resend send failed for ${tag}:`, e.message);
    return false;
  }
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
// Cache-bust suffix — bumped whenever the logo or bg image is replaced, so
// Resend and email clients don't keep serving a stale version.
const ASSET_V = 'v3';
const BG_URL = `https://ymqejaufpoiaedgjwohe.supabase.co/storage/v1/object/public/logos/email/email-bg.png?${ASSET_V}`;
const GE_LOGO_URL = `https://ymqejaufpoiaedgjwohe.supabase.co/storage/v1/object/public/logos/email/grants-engine-logo.png?${ASSET_V}`;

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
  const fromLabel = STAGE_LABELS[fromStage] || fromStage;
  const toLabel = STAGE_LABELS[toStage] || toStage;
  const isWon = toStage === "won";
  const isLost = toStage === "lost";

  const subject = isWon ? `Won: ${grantName}` : isLost ? `Lost: ${grantName}` : `${grantName} → ${toLabel}`;
  const grantUrl = grantId ? `${APP_URL}?grant=${grantId}` : APP_URL;

  // Eyebrow, headline + accent vary by outcome
  const eyebrow = isWon ? `✨ Great news, ${memberName}` : isLost ? `Update for ${memberName}` : `✦ Good news, ${memberName}`;
  const headlineLead = isWon ? "Your grant was" : isLost ? "Your grant was" : "Your grant just";
  const headlineAccent = isWon ? "won" : isLost ? "declined" : "moved forward";
  const statusPill = isWon ? "WON" : isLost ? "CLOSED" : "ACTIVE";

  let noteText = `${movedByName || "Someone"} moved this grant forward — it's now ready for qualification review.`;
  if (isWon) noteText = `Congratulations! This grant has been won. Time to celebrate and plan next steps.`;
  else if (isLost) noteText = `This grant was not successful. Review feedback and consider reapplying.`;
  else if (toStage === "drafting") noteText = `${movedByName || "Someone"} moved this grant forward — it's now ready for draft proposal writing.`;
  else if (toStage === "review") noteText = `${movedByName || "Someone"} moved this grant forward — it's now ready for review.`;
  else if (toStage === "submitted") noteText = `${movedByName || "Someone"} submitted this grant — track follow-ups with the funder.`;
  else if (toStage === "qualifying") noteText = `${movedByName || "Someone"} moved this grant forward — it's now ready for qualification review.`;

  // Light pastel template (your original design), centered, formal serif,
  // GE logo at top of header. Used for stage-change emails.
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Grants Engine — Grant Update</title>
</head>
<body style="margin:0;padding:24px;background:#EDF3F0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">

<div style="width:100%;max-width:560px;margin:0 auto;background:#F7FBF9;border-radius:18px;overflow:hidden;color:#0F2A2E;border:1px solid rgba(0,0,0,0.04);box-shadow:0 20px 60px rgba(20,80,90,0.1);">

  <!-- Header — everything centred -->
  <div style="padding:20px 44px 60px;text-align:center;background:radial-gradient(ellipse 520px 320px at 85% 15%, rgba(180,230,215,0.7), transparent 65%),radial-gradient(ellipse 420px 280px at 10% 85%, rgba(175,210,240,0.7), transparent 65%),linear-gradient(180deg, #E8F4EF 0%, #DEEDE8 100%);">
    <img src="${GE_LOGO_URL}" alt="Grants Engine" height="180" style="height:180px;display:block;margin:0 auto 8px;" />
    <p style="margin:0 0 14px;font-size:11px;color:#2E7A6E;letter-spacing:2.5px;text-transform:uppercase;font-weight:700;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${eyebrow}</p>
    <h1 style="margin:0;font-size:32px;font-weight:700;color:#0F2A2E;line-height:1.2;letter-spacing:-0.6px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${headlineLead} <span style="color:#2E7A8A;">${headlineAccent}</span>.</h1>
  </div>

  <!-- Card -->
  <div style="margin:-32px 32px 0;padding:32px;background:#FFFFFF;border-radius:16px;box-shadow:0 8px 32px rgba(20,80,90,0.08), 0 2px 8px rgba(20,80,90,0.04);border:1px solid rgba(0,0,0,0.03);">

    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:24px;">
      <tr>
        <td style="vertical-align:top;">
          <p style="margin:0 0 6px;font-size:10px;color:#7A8F92;letter-spacing:1.8px;text-transform:uppercase;font-weight:700;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Grant</p>
          <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#0F2A2E;letter-spacing:-0.2px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${grantName}</h2>
          <p style="margin:0;font-size:13px;color:#5A7479;font-weight:500;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${funder}</p>
        </td>
        <td style="vertical-align:top;text-align:right;width:90px;">
          <span style="display:inline-block;padding:6px 12px;background:#E0F2EA;border-radius:100px;border:1px solid rgba(74,155,142,0.3);font-size:10px;font-weight:700;color:#1E5A5F;letter-spacing:1px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${statusPill}</span>
        </td>
      </tr>
    </table>

    <!-- Transition row: FROM left-aligned, MOVED centred (arrow + label), TO right-aligned -->
    <div style="padding:22px 22px;background:#F2F8F5;border-radius:12px;border:1px solid rgba(90,143,184,0.15);">
      <table cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td width="40%" align="left" style="vertical-align:middle;">
            <p style="margin:0 0 8px;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;color:#4A8F82;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">From</p>
            <p style="margin:0;font-size:15px;font-weight:600;color:#1E5A5F;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#7AB8A8;vertical-align:middle;margin-right:10px;"></span>${fromLabel}
            </p>
          </td>
          <td width="20%" align="center" style="vertical-align:middle;">
            <div style="font-size:18px;color:#4A9BC9;font-weight:600;line-height:1;margin-bottom:4px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">→</div>
            <div style="font-size:9px;color:#4A9BC9;letter-spacing:1.5px;font-weight:700;text-transform:uppercase;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">moved</div>
          </td>
          <td width="40%" align="right" style="vertical-align:middle;">
            <p style="margin:0 0 8px;font-size:9px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;color:#2E7A9C;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">To</p>
            <p style="margin:0;font-size:15px;font-weight:600;color:#1E4A6F;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
              ${isWon ? "&#127881; " : ""}${toLabel}<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#5AA8D4;vertical-align:middle;margin-left:10px;"></span>
            </p>
          </td>
        </tr>
      </table>
    </div>

    <!-- Note block -->
    <div style="margin-top:24px;padding:18px 20px;background:#F7FBF9;border-radius:10px;border-left:3px solid #5BB89A;">
      <p style="margin:0 0 6px;font-size:10px;color:#4A8F82;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Note from ${movedByName || "the team"}</p>
      <p style="margin:0;font-size:14px;color:#1A3D40;line-height:1.6;font-weight:500;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${noteText}</p>
    </div>

    <!-- CTA -->
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:28px;">
      <tr><td align="center">
        <a href="${grantUrl}" style="display:inline-block;padding:14px 32px;background:#1E5A5F;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;border-radius:10px;letter-spacing:0.4px;box-shadow:0 4px 16px rgba(30,90,95,0.25);font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Review grant in Grants Engine →</a>
      </td></tr>
    </table>
  </div>

  <!-- Footer -->
  <div style="padding:36px 44px 32px;text-align:center;">
    <p style="margin:0 0 14px;font-size:13px;color:#2E5A5F;line-height:1.6;font-weight:500;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">If you're assigned to this grant, now's a great time to take the next step.</p>
    <p style="margin:0;font-size:11px;color:#5A8F92;letter-spacing:2px;text-transform:uppercase;font-weight:700;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">— Grants Engine</p>
  </div>

</div>

</body>
</html>`;

  const ics = deadline
    ? generateGrantICS({ grantName, funder, stage: toLabel, deadline, ownerName: memberName, grantUrl, grantId })
    : null;
  await sendViaResend({ to: toEmail, subject, html, ics, tag: 'stage-change' });
};

/* ── Shared email shell for simple notification emails — light pastel theme.
 * `eyebrow` is the small uppercase line above the headline (e.g. "GOOD NEWS").
 * `headline` is the big bold line (no italics, light teal accent allowed inline).
 * `body` is a free-form HTML block rendered inside the white card. Use the
 * shell's CSS variables: bodyTextColor #1A3D40, label #4A8F82, soft bg #F7FBF9.
 */
function simpleEmailHtml({ memberName, eyebrow, headline, body, ctaLabel, ctaUrl, footerMsg }) {
  const eyebrowText = eyebrow || `✦ ${memberName || ''}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Grants Engine</title>
</head>
<body style="margin:0;padding:24px;background:#EDF3F0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">

<div style="width:100%;max-width:560px;margin:0 auto;background:#F7FBF9;border-radius:18px;overflow:hidden;color:#0F2A2E;border:1px solid rgba(0,0,0,0.04);box-shadow:0 20px 60px rgba(20,80,90,0.1);">

  <!-- Header -->
  <div style="padding:20px 44px 60px;text-align:center;background:radial-gradient(ellipse 520px 320px at 85% 15%, rgba(180,230,215,0.7), transparent 65%),radial-gradient(ellipse 420px 280px at 10% 85%, rgba(175,210,240,0.7), transparent 65%),linear-gradient(180deg, #E8F4EF 0%, #DEEDE8 100%);">
    <img src="${GE_LOGO_URL}" alt="Grants Engine" height="180" style="height:180px;display:block;margin:0 auto 8px;" />
    <p style="margin:0 0 14px;font-size:11px;color:#2E7A6E;letter-spacing:2.5px;text-transform:uppercase;font-weight:700;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${eyebrowText}</p>
    <h1 style="margin:0;font-size:30px;font-weight:700;color:#0F2A2E;line-height:1.2;letter-spacing:-0.6px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${headline}</h1>
  </div>

  <!-- White card -->
  <div style="margin:-32px 32px 0;padding:32px;background:#FFFFFF;border-radius:16px;box-shadow:0 8px 32px rgba(20,80,90,0.08), 0 2px 8px rgba(20,80,90,0.04);border:1px solid rgba(0,0,0,0.03);">
    ${body}
    ${ctaLabel ? `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:28px;">
      <tr><td align="center">
        <a href="${ctaUrl}" style="display:inline-block;padding:14px 32px;background:#1E5A5F;color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:700;border-radius:10px;letter-spacing:0.4px;box-shadow:0 4px 16px rgba(30,90,95,0.25);font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${ctaLabel}</a>
      </td></tr>
    </table>` : ''}
  </div>

  <!-- Footer -->
  <div style="padding:36px 44px 32px;text-align:center;">
    ${footerMsg ? `<p style="margin:0 0 14px;font-size:13px;color:#2E5A5F;line-height:1.6;font-weight:500;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${footerMsg}</p>` : ''}
    <p style="margin:0;font-size:11px;color:#5A8F92;letter-spacing:2px;text-transform:uppercase;font-weight:700;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">— Grants Engine</p>
  </div>

</div>

</body>
</html>`;
}

/* Helper for building a consistent grant-detail block inside the white card.
 * Used by every caller of simpleEmailHtml so the funder/grant/stage stack
 * looks identical across email types. */
function grantHeaderBlock({ grantName, funder, statusLabel, statusColor = '#1E5A5F', statusBg = '#E0F2EA' }) {
  return `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom:20px;">
      <tr>
        <td style="vertical-align:top;">
          <p style="margin:0 0 6px;font-size:10px;color:#7A8F92;letter-spacing:1.8px;text-transform:uppercase;font-weight:700;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">Grant</p>
          <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#0F2A2E;letter-spacing:-0.2px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${grantName}</h2>
          <p style="margin:0;font-size:13px;color:#5A7479;font-weight:500;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">${funder || ''}</p>
        </td>
        ${statusLabel ? `<td style="vertical-align:top;text-align:right;width:140px;">
          <span style="display:inline-block;padding:6px 14px;background:${statusBg};border-radius:100px;border:1px solid rgba(74,155,142,0.3);font-size:10px;font-weight:700;color:${statusColor};letter-spacing:0.4px;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;white-space:nowrap;">${statusLabel}</span>
        </td>` : ''}
      </tr>
    </table>`;
}

async function sendEmail(toEmail, subject, html, tag, icsContent) {
  return sendViaResend({ to: toEmail, subject, html: html || '<p>Calendar update</p>', ics: icsContent, tag });
}

/* ── Grant assigned to someone ── */
export const sendAssignmentEmail = async (toEmail, memberName, grantName, funder, assignedByName, grantId, deadline, stage) => {
  const grantUrl = grantId ? `${APP_URL}?grant=${grantId}` : APP_URL;
  const stageLabel = STAGE_LABELS[stage] || stage || 'Scouted';
  const meta = `Stage: ${stageLabel}${deadline ? `  ·  Deadline: ${deadline}` : ''}`;
  const html = simpleEmailHtml({
    memberName,
    eyebrow: `✦ Heads up, ${memberName}`,
    headline: `A grant has been <span style="color:#2E7A8A;">assigned to you</span>.`,
    body: `
      ${grantHeaderBlock({ grantName, funder, statusLabel: 'ASSIGNED', statusColor: '#1E5A5F', statusBg: '#E0F2EA' })}
      <div style="padding:14px 18px;background:#F7FBF9;border-radius:10px;border-left:3px solid #5BB89A;margin-bottom:8px;">
        <p style="margin:0 0 6px;font-size:10px;color:#4A8F82;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">${meta}</p>
        <p style="margin:0;font-size:14px;color:#1A3D40;line-height:1.6;font-weight:500;">${assignedByName || 'Someone'} assigned this grant to you. Review the details and take the next step.</p>
      </div>`,
    ctaLabel: 'View Grant in Grants Engine',
    ctaUrl: grantUrl,
    footerMsg: "You're receiving this because you've been assigned to this grant.",
  });

  // Calendar tasks ONLY if deadline exists
  let ics = null;
  if (deadline) {
    ics = generateGrantICS({
      grantName, funder, stage: stageLabel, deadline,
      ownerName: memberName, grantUrl, grantId,     });
  }

  await sendEmail(toEmail, `Assigned to you: ${grantName}`, html, 'Assignment notification', ics);
};

/* ── New grant created ── */
export const sendGrantCreatedEmail = async (toEmail, memberName, grantName, funder, createdByName, grantId) => {
  const grantUrl = grantId ? `${APP_URL}?grant=${grantId}` : APP_URL;
  const html = simpleEmailHtml({
    memberName,
    eyebrow: `✦ New opportunity, ${memberName}`,
    headline: `A new grant was just <span style="color:#2E7A8A;">added to the pipeline</span>.`,
    body: `
      ${grantHeaderBlock({ grantName, funder, statusLabel: 'NEW', statusColor: '#1E5A5F', statusBg: '#E0F2EA' })}
      <div style="padding:14px 18px;background:#F7FBF9;border-radius:10px;border-left:3px solid #5BB89A;">
        <p style="margin:0;font-size:14px;color:#1A3D40;line-height:1.6;font-weight:500;">${createdByName || 'Someone'} added this grant to the pipeline. Check it out and decide next steps.</p>
      </div>`,
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
    eyebrow: `Update for ${memberName}`,
    headline: `A grant has been <span style="color:#B43A3A;">removed</span>.`,
    body: `
      ${grantHeaderBlock({ grantName, funder, statusLabel: 'DELETED', statusColor: '#B43A3A', statusBg: '#FBE9E9' })}
      <div style="padding:14px 18px;background:#FBF7F7;border-radius:10px;border-left:3px solid #DC2626;">
        <p style="margin:0;font-size:14px;color:#1A3D40;line-height:1.6;font-weight:500;">${deletedByName || 'Someone'} removed this grant from the pipeline.</p>
      </div>`,
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
    eyebrow: `Update for ${memberName}`,
    headline: `This grant has been <span style="color:#2E7A8A;">reassigned</span>.`,
    body: `
      ${grantHeaderBlock({ grantName, funder, statusLabel: 'REASSIGNED', statusColor: '#5A7479', statusBg: '#EAF0F1' })}
      <div style="padding:14px 18px;background:#F7FBF9;border-radius:10px;border-left:3px solid #5A7479;">
        <p style="margin:0;font-size:14px;color:#1A3D40;line-height:1.6;font-weight:500;">This grant has been reassigned${newOwnerName ? ` to <strong>${newOwnerName}</strong>` : ''}. You no longer need to action it.</p>
      </div>`,
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
    eyebrow: `⏰ Heads up, ${memberName}`,
    headline: `This grant closes <span style="color:#C17817;">tomorrow</span>.`,
    body: `
      ${grantHeaderBlock({ grantName, funder, statusLabel: `DUE ${deadline}`, statusColor: '#C17817', statusBg: '#FEF5E7' })}
      <div style="padding:14px 18px;background:#FEF8EE;border-radius:10px;border-left:3px solid #F59E0B;">
        <p style="margin:0 0 6px;font-size:10px;color:#C17817;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">Stage: ${stageLabel}</p>
        <p style="margin:0;font-size:14px;color:#1A3D40;line-height:1.6;font-weight:500;">This grant closes tomorrow. Make sure everything is submitted or progressed before the deadline.</p>
      </div>`,
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
    eyebrow: `⚠ Final reminder, ${memberName}`,
    headline: `This grant closes in <span style="color:#B43A3A;">2 hours</span>.`,
    body: `
      ${grantHeaderBlock({ grantName, funder, statusLabel: `CLOSES ${deadline} 09:00`, statusColor: '#B43A3A', statusBg: '#FBE9E9' })}
      <div style="padding:14px 18px;background:#FBF7F7;border-radius:10px;border-left:3px solid #DC2626;">
        <p style="margin:0 0 6px;font-size:10px;color:#B43A3A;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">Stage: ${stageLabel}</p>
        <p style="margin:0;font-size:14px;color:#1A3D40;line-height:1.6;font-weight:500;">Final reminder — this grant closes in 2 hours. Take action now if anything is outstanding.</p>
      </div>`,
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
    eyebrow: `Action needed, ${memberName}`,
    headline: `This grant has <span style="color:#C17817;">no deadline</span> yet.`,
    body: `
      ${grantHeaderBlock({ grantName, funder, statusLabel: 'NO DEADLINE', statusColor: '#C17817', statusBg: '#FEF5E7' })}
      <div style="padding:14px 18px;background:#FEF8EE;border-radius:10px;border-left:3px solid #F59E0B;">
        <p style="margin:0 0 6px;font-size:10px;color:#C17817;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">Stage: ${stageLabel}</p>
        <p style="margin:0;font-size:14px;color:#1A3D40;line-height:1.6;font-weight:500;">This grant has been assigned to you for over 48 hours but has no deadline. Please add a deadline so reminders can be scheduled.</p>
      </div>`,
    ctaLabel: 'Add Deadline Now',
    ctaUrl: grantUrl,
    footerMsg: "You're receiving this because you own a grant with no deadline.",
  });
  await sendEmail(toEmail, `Deadline missing: ${grantName}`, html, 'Deadline missing reminder');
};

/* ── Send calendar cancellation to old owner ── */
export const sendCalendarCancellation = async (toEmail, grantId) => {
  const ics = generateCancelICS({ grantId, sequence: 99 });
  const html = '<p style="font-size:14px;color:#6b7280;">This grant has been reassigned or closed. The calendar reminder has been cancelled.</p>';
  await sendEmail(toEmail, 'Calendar update: grant reassigned', html, 'Calendar cancellation', ics);
};

export const sendResetEmail = async (toEmail, resetUrl, memberName) => {
  const subject = 'Reset your Grants Engine password';
  const html = simpleEmailHtml({
    memberName,
    eyebrow: `Hi ${memberName}`,
    headline: `Reset your <span style="color:#2E7A8A;">password</span>.`,
    body: `
      <div style="padding:18px 20px;background:#F7FBF9;border-radius:10px;border-left:3px solid #5BB89A;">
        <p style="margin:0 0 6px;font-size:10px;color:#4A8F82;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">Password Reset</p>
        <p style="margin:0;font-size:14px;color:#1A3D40;line-height:1.6;font-weight:500;">Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.</p>
      </div>`,
    ctaLabel: 'Reset Password',
    ctaUrl: resetUrl,
    footerMsg: "If you didn't request this, you can safely ignore this email. Your password won't change.",
  });

  const ok = await sendViaResend({ to: toEmail, subject, html, tag: 'password-reset' });
  if (!ok) console.log('[email] Reset URL (for manual delivery):', resetUrl);
  return ok;
};
