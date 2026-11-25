import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

const SMTP_HOST = (process.env.SMTP_HOST || 'smtp.hostinger.com').trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_SECURE =
  process.env.SMTP_SECURE !== undefined
    ? process.env.SMTP_SECURE.toLowerCase() === 'true'
    : SMTP_PORT === 465;
const SMTP_USER = (process.env.SMTP_USER || '').trim();
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = (
  process.env.SMTP_FROM ||
  (SMTP_USER ? `Spotlight360 <${SMTP_USER}>` : 'Spotlight360 <noreply@spotlight360.in>')
).trim();

export function isSmtpConfigured(): boolean {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createTransporter(port: number, secure: boolean): Transporter {
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
}

async function sendMailWithFallback(mailOptions: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<boolean> {
  if (!isSmtpConfigured()) {
    console.warn('[Email Service] SMTP credentials not configured; skipping email to', mailOptions.to);
    return false;
  }

  const payload = {
    from: SMTP_FROM,
    to: mailOptions.to,
    subject: mailOptions.subject,
    text: mailOptions.text,
    html: mailOptions.html
  };

  try {
    const transporter = createTransporter(SMTP_PORT, SMTP_SECURE);
    const info = await transporter.sendMail(payload);
    console.log(`[Email Service] Sent "${mailOptions.subject}" to ${mailOptions.to} (messageId: ${info.messageId})`);
    return true;
  } catch (primaryErr: any) {
    // Hostinger supports both port 465 (SSL) and port 587 (STARTTLS); fallback if primary port fails
    const fallbackPort = SMTP_PORT === 465 ? 587 : 465;
    const fallbackSecure = fallbackPort === 465;
    console.warn(
      `[Email Service] Primary SMTP (${SMTP_HOST}:${SMTP_PORT}) failed (${primaryErr?.message}); retrying port ${fallbackPort}...`
    );
    const fallbackTransporter = createTransporter(fallbackPort, fallbackSecure);
    const info = await fallbackTransporter.sendMail(payload);
    console.log(`[Email Service] Sent via fallback port ${fallbackPort} to ${mailOptions.to} (messageId: ${info.messageId})`);
    return true;
  }
}

export async function sendWelcomeEmail(params: {
  to: string;
  displayName: string;
  handle: string;
}): Promise<boolean> {
  const safeName = escapeHtml(params.displayName || 'Creator');
  const safeHandle = escapeHtml(params.handle || 'spotlight_user');

  const subject = 'Welcome to Spotlight360 — Your Account is Ready!';
  const text = [
    `Hi ${params.displayName},`,
    '',
    'Welcome to Spotlight360! Your account has been successfully registered.',
    `Handle: @${params.handle}`,
    '',
    'You can now watch real-time hyperlocal news spots, report local events, and earn verified rewards.',
    '',
    'If you did not create this account, please ignore this email.',
    '— Spotlight360 Team'
  ].join('\n');

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #f8fafc; padding: 24px;">
      <div style="background: #ffffff; border-radius: 16px; padding: 28px; border: 1px solid #e2e8f0;">
        <div style="display: inline-block; background: linear-gradient(135deg, #ff4500 0%, #ea580c 100%); color: #ffffff; font-weight: 800; font-size: 16px; padding: 8px 14px; border-radius: 10px; margin-bottom: 18px;">
          Spotlight360
        </div>
        <h2 style="margin: 0 0 10px; color: #0f172a; font-size: 20px;">Welcome, ${safeName}!</h2>
        <p style="margin: 0 0 14px; color: #475569; font-size: 14px; line-height: 1.6;">
          Your Spotlight360 account is now active. You are registered with handle <strong>@${safeHandle}</strong>.
        </p>
        <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 12px; padding: 14px 16px; margin-bottom: 18px;">
          <p style="margin: 0; color: #9a3412; font-size: 13px; line-height: 1.5;">
            Start exploring hyperlocal news spots, posting verified community stories, and tracking creator rewards right from your profile.
          </p>
        </div>
        <p style="margin: 0; color: #94a3b8; font-size: 12px;">
          Sent automatically by Spotlight360 &bull; noreply@spotlight360.in
        </p>
      </div>
    </div>
  `;

  return sendMailWithFallback({ to: params.to, subject, text, html });
}

export async function sendPasswordResetEmail(params: {
  to: string;
  displayName: string;
  otp: string;
  resetUrl?: string;
}): Promise<boolean> {
  const safeName = escapeHtml(params.displayName || 'User');
  const safeOtp = escapeHtml(params.otp);
  const safeResetUrl = params.resetUrl ? escapeHtml(params.resetUrl) : '';

  const subject = 'Spotlight360 Password Reset Code';
  const text = [
    `Hi ${params.displayName},`,
    '',
    'We received a request to reset your Spotlight360 password.',
    `Your 6-digit password reset code is: ${params.otp}`,
    'This code expires in 15 minutes.',
    params.resetUrl ? `\nOr reset directly using this link:\n${params.resetUrl}` : '',
    '',
    'If you did not request a password reset, you can safely ignore this email.',
    '— Spotlight360 Team'
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #f8fafc; padding: 24px;">
      <div style="background: #ffffff; border-radius: 16px; padding: 28px; border: 1px solid #e2e8f0;">
        <div style="display: inline-block; background: linear-gradient(135deg, #ff4500 0%, #ea580c 100%); color: #ffffff; font-weight: 800; font-size: 16px; padding: 8px 14px; border-radius: 10px; margin-bottom: 18px;">
          Spotlight360
        </div>
        <h2 style="margin: 0 0 10px; color: #0f172a; font-size: 20px;">Password Reset Request</h2>
        <p style="margin: 0 0 16px; color: #475569; font-size: 14px; line-height: 1.6;">
          Hi ${safeName}, use the verification code below in the Spotlight360 app to reset your password. This code expires in <strong>15 minutes</strong>.
        </p>
        <div style="background: #f1f5f9; border: 1px dashed #94a3b8; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 18px;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 6px;">
            Reset Verification Code
          </div>
          <div style="font-size: 30px; font-weight: 800; letter-spacing: 6px; color: #0f172a;">
            ${safeOtp}
          </div>
        </div>
        ${
          safeResetUrl
            ? `<div style="text-align: center; margin-bottom: 18px;">
                <a href="${safeResetUrl}" style="display: inline-block; background: #ea580c; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 14px; padding: 12px 22px; border-radius: 10px;">
                  Reset Password
                </a>
              </div>`
            : ''
        }
        <p style="margin: 0; color: #94a3b8; font-size: 12px;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    </div>
  `;

  return sendMailWithFallback({ to: params.to, subject, text, html });
}

export async function sendLoginAlertEmail(params: {
  to: string;
  displayName: string;
  handle?: string;
  loginMethod?: string;
  loginTime?: string;
}): Promise<boolean> {
  const safeName = escapeHtml(params.displayName || 'User');
  const safeHandle = escapeHtml(params.handle || 'spotlight_user');
  const method = params.loginMethod || 'Email / Password';
  const safeMethod = escapeHtml(method);
  const timeStr =
    params.loginTime ||
    new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short'
    });
  const safeTime = escapeHtml(timeStr);

  const subject = 'New Login Notification — Spotlight360';
  const text = [
    `Hi ${params.displayName},`,
    '',
    'You have newly logged in to your Spotlight360 account.',
    `Account: @${params.handle || 'spotlight_user'}`,
    `Sign-in Method: ${method}`,
    `Time: ${timeStr} (IST)`,
    '',
    'If this was you, no action is needed.',
    'If you did not log in, please reset your password immediately from the Spotlight360 Sign In screen.',
    '— Spotlight360 Team'
  ].join('\n');

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #f8fafc; padding: 24px;">
      <div style="background: #ffffff; border-radius: 16px; padding: 28px; border: 1px solid #e2e8f0;">
        <div style="display: inline-block; background: linear-gradient(135deg, #ff4500 0%, #ea580c 100%); color: #ffffff; font-weight: 800; font-size: 16px; padding: 8px 14px; border-radius: 10px; margin-bottom: 18px;">
          Spotlight360
        </div>
        <h2 style="margin: 0 0 10px; color: #0f172a; font-size: 20px;">New Login Detected</h2>
        <p style="margin: 0 0 14px; color: #475569; font-size: 14px; line-height: 1.6;">
          Hi <strong>${safeName}</strong>, you have newly logged in to your Spotlight360 account.
        </p>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; margin-bottom: 18px; font-size: 13px; color: #334155; line-height: 1.7;">
          <div><strong>Account:</strong> @${safeHandle}</div>
          <div><strong>Method:</strong> ${safeMethod}</div>
          <div><strong>Time:</strong> ${safeTime} (IST)</div>
        </div>
        <p style="margin: 0 0 10px; color: #64748b; font-size: 12px; line-height: 1.5;">
          If this was you, you can ignore this email. If you did not log in, please use <strong>Forgot password?</strong> on the Spotlight360 Sign In screen right away.
        </p>
        <p style="margin: 0; color: #94a3b8; font-size: 12px;">
          Sent automatically by Spotlight360 &bull; noreply@spotlight360.in
        </p>
      </div>
    </div>
  `;

  return sendMailWithFallback({ to: params.to, subject, text, html });
}

export async function verifySmtpConnection(): Promise<boolean> {
  if (!isSmtpConfigured()) return false;
  try {
    const transporter = createTransporter(SMTP_PORT, SMTP_SECURE);
    await transporter.verify();
    return true;
  } catch (err: any) {
    console.warn(`[Email Service] SMTP verify failed on port ${SMTP_PORT}:`, err?.message);
    try {
      const fallbackPort = SMTP_PORT === 465 ? 587 : 465;
      const fallback = createTransporter(fallbackPort, fallbackPort === 465);
      await fallback.verify();
      return true;
    } catch (fallbackErr: any) {
      console.error('[Email Service] SMTP verify failed on fallback port too:', fallbackErr?.message);
      return false;
    }
  }
}
