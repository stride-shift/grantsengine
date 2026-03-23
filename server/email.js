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
