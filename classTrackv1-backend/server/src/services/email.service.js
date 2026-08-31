/**
 * server/src/services/email.service.js
 *
 * Sends transactional auth emails: verification link, password reset link.
 *
 * If SMTP_HOST is not configured (the default for local development), this
 * falls back to a "console transport" that logs the email's subject and
 * body instead of sending it — so the full verify/reset flow is testable
 * end-to-end without a real mail provider. Swap in real SMTP credentials
 * in .env and no code changes are needed.
 *
 * IMPORTANT: the transporter is NOT cached as a module-level singleton.
 * Caching it caused a bug where the first call (which may race dotenv
 * initialisation order) locked in the console-transport stub permanently
 * even when SMTP_HOST was later populated, because `if (transporter)
 * return transporter` short-circuited every subsequent call. Each call to
 * _getTransporter() now re-reads config.email so the correct transport is
 * always used regardless of module-load order.
 */
const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('../utils/logger.util');

// ---------------------------------------------------------------------------
// Startup diagnostic — emitted once when this module is first imported.
// ---------------------------------------------------------------------------
if (!config.email.host) {
  logger.warn(
    '[email-service] SMTP_HOST is not set — email.service will use the console transport. ' +
    'Emails will be logged but NOT delivered. Set SMTP_HOST (and SMTP_USER, SMTP_PASSWORD) ' +
    'in .env to enable real delivery.',
    { smtpHost: null, smtpPort: config.email.port, smtpUser: config.email.user || null }
  );
} else {
  logger.info('[email-service] SMTP transport initialised', {
    smtpHost: config.email.host,
    smtpPort: config.email.port,
    smtpSecure: config.email.secure,
    smtpUser: config.email.user || null,
    // NEVER log the SMTP password
  });
}

/**
 * Returns the appropriate Nodemailer transport.
 * NOT cached as a module singleton — re-reads config.email on every call.
 */
function _getTransporter() {
  if (!config.email.host) {
    return {
      sendMail: async (mail) => {
        logger.info('[email-service] console-transport: email NOT sent (SMTP_HOST not configured)', {
          to: mail.to, subject: mail.subject,
        });
        logger.debug('[email-service] console-transport: email body', { text: mail.text });
        return { messageId: 'console-transport', accepted: [mail.to] };
      },
    };
  }

  return nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    auth: config.email.user ? { user: config.email.user, pass: config.email.password } : undefined,
  });
}

async function _send({ to, subject, text, html }) {
  logger.debug('[email-service] _send() called', {
    to,
    subject,
    smtpConfigured: Boolean(config.email.host),
    smtpHost: config.email.host || null,
    smtpPort: config.email.port,
  });

  const mailer = _getTransporter();
  try {
    const result = await mailer.sendMail({
      from: `"${config.email.fromName}" <${config.email.fromAddress}>`,
      to, subject, text, html,
    });
    logger.info('[email-service] sendMail completed', {
      to,
      subject,
      messageId: result.messageId,
      accepted: result.accepted,
      rejected: result.rejected,
    });
  } catch (err) {
    logger.error('[email-service] sendMail FAILED', {
      to,
      subject,
      smtpHost: config.email.host || null,
      smtpPort: config.email.port,
      smtpUser: config.email.user || null,
      // NEVER log err.stack in case it contains credential context
      errorCode:    err.code    || null,
      errorMessage: err.message || String(err),
      errorResponse: err.response || null,
    });
  }
}

async function sendVerificationEmail(toEmail, name, rawToken) {
  const link = `${config.server.clientUrl}/verify-email?token=${rawToken}`;
  await _send({
    to: toEmail,
    subject: 'Verify your ClassTrack AI email address',
    text: `Hi ${name},\n\nPlease verify your email by visiting:\n${link}\n\nThis link expires in ${config.auth.emailVerificationExpiresInHours} hours.`,
    html: `<p>Hi ${name},</p><p>Please verify your email by clicking the link below:</p><p><a href="${link}">${link}</a></p><p>This link expires in ${config.auth.emailVerificationExpiresInHours} hours.</p>`,
  });
}

async function sendPasswordResetEmail(toEmail, name, rawToken) {
  const resetUrl = `${config.server.clientUrl}/reset-password?token=${rawToken}`;
  const expiryMinutes = config.auth.passwordResetExpiresInMinutes;
  const fromName = config.email.fromName || 'ClassTrack AI';

  // ── Plain-text fallback (for email clients that don't render HTML) ──────────
  const text = [
    `Hi ${name},`,
    '',
    `We received a request to reset your ${fromName} password.`,
    '',
    `Click the link below to choose a new password:`,
    resetUrl,
    '',
    `This link expires in ${expiryMinutes} minutes.`,
    '',
    `If you didn't request a password reset, you can safely ignore this email.`,
    `For security reasons, never share this link with anyone.`,
    '',
    `— ${fromName}`,
  ].join('\n');

  // ── Professional HTML email ─────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Reset your ${fromName} password</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
         style="background-color:#f4f5f7;padding:32px 16px;">
    <tr>
      <td align="center">

        <!-- Email card -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
               style="max-width:560px;background-color:#ffffff;border-radius:8px;
                      border:1px solid #e2e8f0;overflow:hidden;">

          <!-- Header bar -->
          <tr>
            <td style="background-color:#1e40af;padding:24px 40px;text-align:center;">
              <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;
                        letter-spacing:0.5px;">
                ${fromName}
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">

              <!-- Heading -->
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;
                          color:#1e293b;line-height:1.3;">
                Reset your password
              </h1>
              <p style="margin:0 0 24px;font-size:15px;color:#64748b;line-height:1.6;">
                Hi ${name},
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
                We received a request to reset your <strong>${fromName}</strong> password.
                Click the button below to choose a new password.
              </p>

              <!-- CTA button -->
              <table role="presentation" cellspacing="0" cellpadding="0" border="0"
                     style="margin:0 0 28px;">
                <tr>
                  <td style="border-radius:6px;background-color:#1e40af;">
                    <a href="${resetUrl}"
                       target="_blank"
                       rel="noopener noreferrer"
                       style="display:inline-block;padding:14px 32px;
                              font-size:15px;font-weight:600;color:#ffffff;
                              text-decoration:none;border-radius:6px;
                              background-color:#1e40af;
                              mso-padding-alt:14px 32px;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Expiry notice -->
              <p style="margin:0 0 16px;font-size:13px;color:#64748b;line-height:1.6;">
                This link expires in <strong>${expiryMinutes} minutes</strong>.
              </p>

              <!-- Fallback URL -->
              <p style="margin:0 0 4px;font-size:13px;color:#64748b;line-height:1.6;">
                If the button doesn't work, copy and paste this link into your browser:
              </p>
              <p style="margin:0 0 28px;font-size:12px;color:#1e40af;
                        word-break:break-all;line-height:1.6;">
                <a href="${resetUrl}" target="_blank" rel="noopener noreferrer"
                   style="color:#1e40af;text-decoration:underline;">
                  ${resetUrl}
                </a>
              </p>

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 24px;" />

              <!-- Security notice -->
              <p style="margin:0;font-size:13px;color:#64748b;line-height:1.6;">
                If you didn't request a password reset, you can safely ignore this
                email — your account password has not been changed.
              </p>
              <p style="margin:8px 0 0;font-size:13px;color:#64748b;line-height:1.6;">
                For security reasons, never share this link with anyone.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;padding:20px 40px;
                        border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;font-size:12px;color:#94a3b8;">
                &copy; ${new Date().getFullYear()} ${fromName}. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
        <!-- /Email card -->

      </td>
    </tr>
  </table>
</body>
</html>`;

  await _send({
    to: toEmail,
    subject: `Reset your ${fromName} password`,
    text,
    html,
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
