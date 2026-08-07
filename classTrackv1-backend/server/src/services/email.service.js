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
 */
const nodemailer = require('nodemailer');
const config = require('../config');
const logger = require('../utils/logger.util');

let transporter = null;

function _getTransporter() {
  if (transporter) return transporter;

  if (!config.email.host) {
    // Dev fallback — logs instead of sending.
    transporter = {
      sendMail: async (mail) => {
        logger.info('📧 [console-transport] Email not sent (no SMTP configured) — logging instead', {
          to: mail.to, subject: mail.subject,
        });
        logger.debug('📧 Email body', { text: mail.text });
        return { messageId: 'console-transport', accepted: [mail.to] };
      },
    };
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    auth: config.email.user ? { user: config.email.user, pass: config.email.password } : undefined,
  });
  return transporter;
}

async function _send({ to, subject, text, html }) {
  const mailer = _getTransporter();
  try {
    await mailer.sendMail({
      from: `"${config.email.fromName}" <${config.email.fromAddress}>`,
      to, subject, text, html,
    });
  } catch (err) {
    // Email delivery failures should never crash the request that triggered
    // them (e.g. registration should still succeed even if the verification
    // email fails to send) — log loudly and move on.
    logger.error('Email send failed', { to, subject, error: err.message });
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
  const link = `${config.server.clientUrl}/reset-password?token=${rawToken}`;
  await _send({
    to: toEmail,
    subject: 'Reset your ClassTrack AI password',
    text: `Hi ${name},\n\nA password reset was requested for your account. Visit this link to set a new password:\n${link}\n\nThis link expires in ${config.auth.passwordResetExpiresInMinutes} minutes. If you did not request this, you can safely ignore this email.`,
    html: `<p>Hi ${name},</p><p>A password reset was requested for your account. Click below to set a new password:</p><p><a href="${link}">${link}</a></p><p>This link expires in ${config.auth.passwordResetExpiresInMinutes} minutes. If you did not request this, you can safely ignore this email.</p>`,
  });
}

module.exports = { sendVerificationEmail, sendPasswordResetEmail };
