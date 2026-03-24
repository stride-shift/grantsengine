import nodemailer from 'nodemailer';

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

export const sendStageChangeEmail = async (toEmail, memberName, grantName, funder, fromStage, toStage, movedByName) => {
  const transport = getTransport();
  const fromLabel = STAGE_LABELS[fromStage] || fromStage;
  const toLabel = STAGE_LABELS[toStage] || toStage;
  const toColor = STAGE_COLORS[toStage] || "#3B4A3F";

  const subject = `Grant moved to ${toLabel}: ${grantName}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
      <div style="background: #3B4A3F; padding: 16px 24px; border-radius: 12px 12px 0 0;">
        <span style="color: white; font-weight: 700; font-size: 15px;">Grant Engine</span>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; padding: 28px 24px;">
        <h2 style="margin: 0 0 16px; font-size: 18px; color: #1f2937;">Pipeline Update</h2>
        <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
          Hi ${memberName}, <strong>${grantName}</strong> (${funder}) has moved in the pipeline:
        </p>
        <div style="display: flex; align-items: center; gap: 8px; margin: 0 0 24px; font-size: 14px;">
          <span style="padding: 4px 12px; border-radius: 6px; background: #f3f4f6; color: #6b7280; font-weight: 600;">${fromLabel}</span>
          <span style="color: #9ca3af;">&rarr;</span>
          <span style="padding: 4px 12px; border-radius: 6px; background: ${toColor}18; color: ${toColor}; font-weight: 600;">${toLabel}</span>
        </div>
        ${movedByName ? `<p style="color: #6b7280; font-size: 13px; margin: 0 0 16px;">Moved by: ${movedByName}</p>` : ""}
        <p style="color: #9ca3af; font-size: 12px; line-height: 1.5; margin: 0;">
          You're receiving this because you are the owner of this grant or involved in this pipeline stage.
        </p>
      </div>
    </div>
  `;

  if (!transport) {
    console.log('[email] Would send stage change notification to:', toEmail, '|', subject);
    return;
  }

  await transport.sendMail({
    from: `Grant Engine <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject,
    html,
  });
  console.log('[email] Stage change notification sent to:', toEmail);
};

export const sendResetEmail = async (toEmail, resetUrl, memberName) => {
  const transport = getTransport();

  const subject = 'Reset your Grant Engine password';
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
      <div style="background: #3B4A3F; padding: 16px 24px; border-radius: 12px 12px 0 0;">
        <span style="color: white; font-weight: 700; font-size: 15px;">Grant Engine</span>
      </div>
      <div style="border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; padding: 28px 24px;">
        <h2 style="margin: 0 0 16px; font-size: 18px; color: #1f2937;">Reset your password</h2>
        <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
          Hi ${memberName}, we received a request to reset your password. Click the button below to choose a new one. This link expires in 1 hour.
        </p>
        <a href="${resetUrl}" style="display: inline-block; background: #3B4A3F; color: white; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 14px;">
          Reset Password
        </a>
        <p style="color: #9ca3af; font-size: 12px; line-height: 1.5; margin: 24px 0 0;">
          If you didn't request this, you can safely ignore this email. Your password won't change.
        </p>
      </div>
    </div>
  `;

  if (!transport) {
    console.log('[email] Would send reset email to:', toEmail);
    console.log('[email] Reset URL:', resetUrl);
    return;
  }

  await transport.sendMail({
    from: `Grant Engine <${process.env.SMTP_USER}>`,
    to: toEmail,
    subject,
    html,
  });
  console.log('[email] Reset email sent to:', toEmail);
};
