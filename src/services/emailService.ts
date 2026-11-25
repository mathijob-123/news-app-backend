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
  process.env.MAIL_FROM ||
  process.env.SMTP_FROM ||
  (SMTP_USER ? `Spotlight 360 <${SMTP_USER}>` : 'Spotlight 360 <noreply@spotlight360.in>')
).trim();

const PLACEHOLDER_DOMAINS = new Set([
  'spotlight.local',
  'spotlightnews.local',
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'invalid',
  'localhost'
]);

export interface EmailValidationResult {
  valid: boolean;
  email: string;
  reason?: string;
}

export interface EmailSendResult {
  ok: boolean;
  recipient: string;
  messageId?: string;
  skipped?: boolean;
  errorCode?: string;
  errorMessage?: string;
  userMessage?: string;
}

export function isSmtpConfigured(): boolean {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

/**
 * Validates recipient email format and rejects empty, malformed, or non-routable local/placeholder domains.
 */
export function validateEmailAddress(raw?: string | null): EmailValidationResult {
  const email = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!email) {
    return { valid: false, email: '', reason: 'Recipient email address is empty.' };
  }
  if (email.length > 254 || /\s/.test(email)) {
    return { valid: false, email, reason: 'Email address contains whitespace or exceeds maximum length.' };
  }

  const parts = email.split('@');
  if (parts.length !== 2) {
    return { valid: false, email, reason: 'Email address must contain a single @ symbol.' };
  }

  const [localPart, domain] = parts;
  if (!localPart || localPart.length > 64 || !domain || domain.length > 253) {
    return { valid: false, email, reason: 'Email address local part or domain is invalid.' };
  }

  const emailRegex = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
  if (!emailRegex.test(email)) {
    return {
      valid: false,
      email,
      reason: 'Invalid email format (for example, missing dot in domain such as .com).'
    };
  }

  const domainLabels = domain.split('.');
  const tld = domainLabels[domainLabels.length - 1] || '';
  if (!/^[a-z]{2,24}$/i.test(tld)) {
    return { valid: false, email, reason: `Invalid top-level domain ".${tld}".` };
  }

  if (
    PLACEHOLDER_DOMAINS.has(domain) ||
    domain.endsWith('.local') ||
    domain.endsWith('.localhost') ||
    domain.endsWith('.invalid') ||
    domain.endsWith('.test') ||
    domain.endsWith('.example')
  ) {
    return {
      valid: false,
      email,
      reason: `Non-routable placeholder domain "${domain}" cannot receive external email.`
    };
  }

  return { valid: true, email };
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

function classifySmtpError(err: any): {
  errorCode: string;
  errorMessage: string;
  userMessage: string;
  isConnectionError: boolean;
} {
  const responseCode = Number(err?.responseCode || 0);
  const code = String(err?.code || '');
  const rawMessage = String(err?.response || err?.message || 'SMTP delivery failed');

  // Never include password or raw auth blobs in logs/messages
  const safeMessage = rawMessage.replace(/AUTH\s+\S+/gi, 'AUTH [REDACTED]').slice(0, 300);

  if (
    responseCode === 550 ||
    responseCode === 553 ||
    /550[- ]5\.1\.1|does not exist|user unknown|no such user|mailbox unavailable|recipient address rejected/i.test(
      safeMessage
    )
  ) {
    return {
      errorCode: 'RECIPIENT_NOT_FOUND',
      errorMessage: safeMessage,
      userMessage:
        'Delivery failed (SMTP 550 5.1.1): The recipient email account does not exist or cannot accept mail.',
      isConnectionError: false
    };
  }

  if (responseCode === 535 || code === 'EAUTH') {
    return {
      errorCode: 'SMTP_AUTH_FAILED',
      errorMessage: safeMessage,
      userMessage: 'Hostinger SMTP authentication failed. Verify SMTP_USER and SMTP_PASS.',
      isConnectionError: false
    };
  }

  const isConnectionError =
    ['ETIMEDOUT', 'ECONNECTION', 'ECONNREFUSED', 'ENOTFOUND', 'ESOCKET'].includes(code) ||
    /timeout|ECONNREFUSED|ENOTFOUND/i.test(safeMessage);

  return {
    errorCode: code || (responseCode ? `SMTP_${responseCode}` : 'SMTP_ERROR'),
    errorMessage: safeMessage,
    userMessage: isConnectionError
      ? 'Could not reach Hostinger SMTP server. Please try again shortly.'
      : `Email delivery failed: ${safeMessage}`,
    isConnectionError
  };
}

async function sendMailWithFallback(mailOptions: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<EmailSendResult> {
  const validation = validateEmailAddress(mailOptions.to);
  if (!validation.valid) {
    console.warn(
      `[Email Service] Blocked send to invalid recipient "${mailOptions.to || '(empty)'}" | reason="${validation.reason}" | subject="${mailOptions.subject}"`
    );
    return {
      ok: false,
      recipient: validation.email,
      skipped: true,
      errorCode: 'INVALID_RECIPIENT',
      errorMessage: validation.reason,
      userMessage: validation.reason
    };
  }

  const senderValidation = validateEmailAddress(
    SMTP_FROM.includes('<') ? SMTP_FROM.split('<')[1].replace('>', '').trim() : SMTP_FROM
  );
  if (!senderValidation.valid) {
    console.error(`[Email Service] Invalid SMTP_FROM address configured: ${senderValidation.reason}`);
    return {
      ok: false,
      recipient: validation.email,
      errorCode: 'INVALID_SENDER',
      errorMessage: senderValidation.reason,
      userMessage: 'Email sender configuration is invalid.'
    };
  }

  if (!isSmtpConfigured()) {
    console.warn(
      `[Email Service] SMTP credentials not configured; skipping "${mailOptions.subject}" to recipient=${validation.email}`
    );
    return {
      ok: false,
      recipient: validation.email,
      skipped: true,
      errorCode: 'SMTP_NOT_CONFIGURED',
      errorMessage: 'SMTP_HOST, SMTP_USER, or SMTP_PASS is missing.',
      userMessage: 'Email service is not configured on the server.'
    };
  }

  const payload = {
    from: SMTP_FROM,
    to: validation.email,
    subject: mailOptions.subject,
    text: mailOptions.text,
    html: mailOptions.html
  };

  try {
    const transporter = createTransporter(SMTP_PORT, SMTP_SECURE);
    const info = await transporter.sendMail(payload);
    if (Array.isArray(info.rejected) && info.rejected.length > 0) {
      console.error(
        `[Email Service] SMTP rejected recipient=${validation.email} | rejected=${JSON.stringify(info.rejected)}`
      );
      return {
        ok: false,
        recipient: validation.email,
        errorCode: 'RECIPIENT_REJECTED',
        errorMessage: `Recipient rejected by SMTP server: ${info.rejected.join(', ')}`,
        userMessage: 'The recipient email address was rejected by the mail server.'
      };
    }
    console.log(
      `[Email Service] Sent "${mailOptions.subject}" to recipient=${validation.email} (messageId: ${info.messageId})`
    );
    return { ok: true, recipient: validation.email, messageId: info.messageId };
  } catch (primaryErr: any) {
    const classified = classifySmtpError(primaryErr);

    // Retry port 587 STARTTLS (or 465 SSL) only for transport/connection errors, never on 550/535 rejections
    if (classified.isConnectionError) {
      const fallbackPort = SMTP_PORT === 465 ? 587 : 465;
      const fallbackSecure = fallbackPort === 465;
      console.warn(
        `[Email Service] Primary SMTP (${SMTP_HOST}:${SMTP_PORT}) failed for recipient=${validation.email} (${classified.errorCode}); retrying port ${fallbackPort}...`
      );
      try {
        const fallbackTransporter = createTransporter(fallbackPort, fallbackSecure);
        const info = await fallbackTransporter.sendMail(payload);
        if (Array.isArray(info.rejected) && info.rejected.length > 0) {
          console.error(
            `[Email Service] Fallback SMTP rejected recipient=${validation.email} | rejected=${JSON.stringify(info.rejected)}`
          );
          return {
            ok: false,
            recipient: validation.email,
            errorCode: 'RECIPIENT_REJECTED',
            errorMessage: `Recipient rejected by SMTP server: ${info.rejected.join(', ')}`,
            userMessage: 'The recipient email address was rejected by the mail server.'
          };
        }
        console.log(
          `[Email Service] Sent via fallback port ${fallbackPort} to recipient=${validation.email} (messageId: ${info.messageId})`
        );
        return { ok: true, recipient: validation.email, messageId: info.messageId };
      } catch (fallbackErr: any) {
        const fallbackClassified = classifySmtpError(fallbackErr);
        console.error(
          `[Email Service] Delivery failed for recipient=${validation.email} | code=${fallbackClassified.errorCode} | error=${fallbackClassified.errorMessage}`
        );
        return {
          ok: false,
          recipient: validation.email,
          errorCode: fallbackClassified.errorCode,
          errorMessage: fallbackClassified.errorMessage,
          userMessage: fallbackClassified.userMessage
        };
      }
    }

    console.error(
      `[Email Service] Delivery failed for recipient=${validation.email} | code=${classified.errorCode} | error=${classified.errorMessage}`
    );
    return {
      ok: false,
      recipient: validation.email,
      errorCode: classified.errorCode,
      errorMessage: classified.errorMessage,
      userMessage: classified.userMessage
    };
  }
}

export async function sendWelcomeEmail(params: {
  to: string;
  displayName: string;
  handle: string;
}): Promise<EmailSendResult> {
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
}): Promise<EmailSendResult> {
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
}): Promise<EmailSendResult> {
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

export async function sendAdminNewUserNotificationEmail(params: {
  to: string;
  newUserName: string;
  newUserEmail: string;
  newUserHandle: string;
  authProvider?: string;
}): Promise<EmailSendResult> {
  const safeName = escapeHtml(params.newUserName || 'New User');
  const safeEmail = escapeHtml(params.newUserEmail || 'N/A');
  const safeHandle = escapeHtml(params.newUserHandle || 'spotlight_user');
  const safeProvider = escapeHtml(params.authProvider || 'local');
  const timeStr = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  const subject = `New User Registered on Spotlight360 (@${params.newUserHandle})`;
  const text = [
    'A new user has registered on Spotlight360.',
    '',
    `Name: ${params.newUserName}`,
    `Handle: @${params.newUserHandle}`,
    `Email: ${params.newUserEmail}`,
    `Provider: ${params.authProvider || 'local'}`,
    `Time: ${timeStr} (IST)`
  ].join('\n');

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #f8fafc; padding: 24px;">
      <div style="background: #ffffff; border-radius: 16px; padding: 28px; border: 1px solid #e2e8f0;">
        <div style="display: inline-block; background: linear-gradient(135deg, #ff4500 0%, #ea580c 100%); color: #ffffff; font-weight: 800; font-size: 16px; padding: 8px 14px; border-radius: 10px; margin-bottom: 18px;">
          Spotlight360 Admin Alert
        </div>
        <h2 style="margin: 0 0 10px; color: #0f172a; font-size: 20px;">New User Registration</h2>
        <p style="margin: 0 0 14px; color: #475569; font-size: 14px;">
          A new user has joined Spotlight360:
        </p>
        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; font-size: 13px; color: #334155; line-height: 1.7;">
          <div><strong>Name:</strong> ${safeName}</div>
          <div><strong>Handle:</strong> @${safeHandle}</div>
          <div><strong>Email:</strong> ${safeEmail}</div>
          <div><strong>Auth Provider:</strong> ${safeProvider}</div>
          <div><strong>Registered At:</strong> ${escapeHtml(timeStr)} (IST)</div>
        </div>
        <p style="margin: 0; color: #94a3b8; font-size: 12px;">
          You are receiving this because this address is configured as the Admin Notification Recipient in Spotlight360 Settings.
        </p>
      </div>
    </div>
  `;

  return sendMailWithFallback({ to: params.to, subject, text, html });
}

export async function sendTestNotificationEmail(params: {
  to: string;
  triggeredBy?: string;
}): Promise<EmailSendResult> {
  const safeTriggeredBy = escapeHtml(params.triggeredBy || 'Admin Panel');
  const timeStr = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  const subject = 'Spotlight360 Test Email Notification (Hostinger SMTP Verified)';
  const text = [
    'This is a test notification email from Spotlight360.',
    '',
    `Recipient: ${params.to}`,
    `Triggered By: ${params.triggeredBy || 'Admin Panel'}`,
    `SMTP Server: ${SMTP_HOST}:${SMTP_PORT}`,
    `Sent At: ${timeStr} (IST)`,
    '',
    'Your notification recipient configuration is working properly.'
  ].join('\n');

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #f8fafc; padding: 24px;">
      <div style="background: #ffffff; border-radius: 16px; padding: 28px; border: 1px solid #e2e8f0;">
        <div style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; font-weight: 800; font-size: 15px; padding: 8px 14px; border-radius: 10px; margin-bottom: 18px;">
          Spotlight360 &bull; SMTP Test
        </div>
        <h2 style="margin: 0 0 10px; color: #0f172a; font-size: 20px;">Email Delivery Verified!</h2>
        <p style="margin: 0 0 14px; color: #475569; font-size: 14px; line-height: 1.6;">
          Your Hostinger SMTP configuration and notification recipient address are working correctly.
        </p>
        <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; font-size: 13px; color: #065f46; line-height: 1.7;">
          <div><strong>Recipient:</strong> ${escapeHtml(params.to)}</div>
          <div><strong>Triggered By:</strong> ${safeTriggeredBy}</div>
          <div><strong>SMTP Host:</strong> ${escapeHtml(SMTP_HOST)}:${SMTP_PORT}</div>
          <div><strong>Sent At:</strong> ${escapeHtml(timeStr)} (IST)</div>
        </div>
        <p style="margin: 0; color: #94a3b8; font-size: 12px;">
          Sent via Hostinger Email SMTP &bull; ${escapeHtml(SMTP_USER || 'noreply@spotlight360.in')}
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
