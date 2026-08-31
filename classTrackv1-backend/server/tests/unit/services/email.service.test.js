/**
 * server/tests/unit/services/email.service.test.js
 *
 * Unit tests for email.service.js.
 *
 * Key invariants verified:
 *  1. When SMTP_HOST is not configured, the console transport is used (no
 *     real sendMail call) and no error is thrown.
 *  2. When SMTP_HOST IS configured, nodemailer.createTransport is called with
 *     the correct SMTP options and sendMail is invoked.
 *  3. _getTransporter() is NOT a cached singleton — each call re-reads
 *     config.email.host. This is the fix for the bug where the console-
 *     transport stub was permanently locked in after an early require()
 *     before SMTP_HOST was populated.
 *  4. sendPasswordResetEmail constructs the correct reset URL using
 *     config.server.clientUrl.
 *  5. A sendMail error is caught-and-logged, never thrown to the caller.
 *
 * HOW ISOLATION WORKS HERE:
 *  Each test that needs a different SMTP config uses jest.isolateModules() to
 *  get a fresh copy of both email.service and config, then mutates the fresh
 *  config object before calling the service. This avoids the stale-singleton
 *  problem that would occur if we relied on the module-level config reference
 *  being shared across a jest.resetModules() boundary.
 */

// ── Top-level nodemailer mock (hoisted by Jest) ───────────────────────────────
const mockSendMail = jest.fn();

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
}));

// ── Logger mock — hoisted globally ────────────────────────────────────────────
jest.mock('../../../src/utils/logger.util', () => ({
  info:  jest.fn(),
  warn:  jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
}));

const nodemailer = require('nodemailer');
const logger = require('../../../src/utils/logger.util');

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns { emailService, config } loaded in an isolated module scope.
 * The caller receives the same `config` object that `emailService` uses
 * internally, so mutations to `config.email.*` are seen by the service.
 *
 * nodemailer and logger mocks are global (hoisted) so they are shared across
 * all isolated scopes — jest.fn() instances remain the same.
 */
function isolatedLoad() {
  let emailService;
  let cfg;
  jest.isolateModules(() => {
    cfg = require('../../../src/config');
    emailService = require('../../../src/services/email.service');
  });
  return { emailService, config: cfg };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  nodemailer.createTransport.mockReturnValue({ sendMail: mockSendMail });
});

describe('email.service — transporter selection (singleton-bug regression)', () => {
  it('uses the console transport (no nodemailer call) when SMTP_HOST is not set', async () => {
    const { emailService, config } = isolatedLoad();
    // Ensure SMTP is not set
    config.email.host = null;

    await emailService.sendPasswordResetEmail('user@example.com', 'Alice', 'raw-token-abc');

    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
    // Logger should record the fact that the console transport was used
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('console-transport'),
      expect.any(Object)
    );
  });

  it('uses nodemailer when SMTP_HOST is set', async () => {
    const { emailService, config } = isolatedLoad();
    config.email.host = 'smtp.gmail.com';
    config.email.port = 587;
    config.email.secure = false;
    config.email.user = 'sender@example.com';
    mockSendMail.mockResolvedValue({ messageId: 'test-id', accepted: ['user@example.com'], rejected: [] });

    await emailService.sendPasswordResetEmail('user@example.com', 'Alice', 'raw-token-xyz');

    expect(nodemailer.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
      })
    );
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  it('re-reads config.email.host on every _send() call — no stale singleton', async () => {
    // Simulate the bug scenario: module is loaded while SMTP_HOST is empty,
    // then config is updated (as would happen if dotenv ran late).
    const { emailService, config } = isolatedLoad();
    config.email.host = null;

    // First call — no SMTP — console transport used
    await emailService.sendPasswordResetEmail('u@e.com', 'A', 'token1');
    expect(nodemailer.createTransport).not.toHaveBeenCalled();

    // Now "populate" SMTP config (simulates correct .env being loaded)
    config.email.host = 'smtp.gmail.com';
    mockSendMail.mockResolvedValue({ messageId: 'id2', accepted: ['u@e.com'], rejected: [] });

    // Second call — SMTP now present — must use real transport
    await emailService.sendPasswordResetEmail('u@e.com', 'A', 'token2');
    expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });
});

describe('email.service — sendPasswordResetEmail', () => {
  it('builds the reset link using config.server.clientUrl and the raw token', async () => {
    const { emailService, config } = isolatedLoad();
    config.email.host = 'smtp.gmail.com';
    config.server.clientUrl = 'https://app.classtrack.ai';
    mockSendMail.mockResolvedValue({ messageId: 'msg-1', accepted: ['t@e.com'], rejected: [] });

    await emailService.sendPasswordResetEmail('teacher@school.com', 'Ms. Rao', 'raw-abc-123');

    const callArgs = mockSendMail.mock.calls[0][0];
    expect(callArgs.to).toBe('teacher@school.com');
    expect(callArgs.subject).toMatch(/reset.*password/i);
    expect(callArgs.text).toContain('https://app.classtrack.ai/reset-password?token=raw-abc-123');
    expect(callArgs.html).toContain('https://app.classtrack.ai/reset-password?token=raw-abc-123');
    // NEVER the raw token in subject (security: subject visible in headers/push previews)
    expect(callArgs.subject).not.toContain('raw-abc-123');
  });

  it('does NOT throw when sendMail rejects — error is caught-and-logged', async () => {
    const { emailService, config } = isolatedLoad();
    config.email.host = 'smtp.gmail.com';
    mockSendMail.mockRejectedValue(new Error('Connection refused'));

    // Must resolve (not reject) even when the transport errors
    await expect(
      emailService.sendPasswordResetEmail('t@e.com', 'Alice', 'tok')
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('sendMail FAILED'),
      expect.objectContaining({ errorMessage: 'Connection refused' })
    );
    // Must NEVER log the raw SMTP password credential
    const loggedMeta = logger.error.mock.calls[0][1];
    // The log object may contain "password" in the email subject — check that
    // the SMTP password field itself is absent, not the word anywhere.
    expect(loggedMeta).not.toHaveProperty('smtpPassword');
    expect(loggedMeta).not.toHaveProperty('pass');
    expect(loggedMeta).not.toHaveProperty('auth');
  });
});

// ── Part 10: Email design & content requirements ──────────────────────────────

describe('email.service — sendPasswordResetEmail: HTML email design (Part 10)', () => {
  /**
   * These tests verify the professional HTML email design requirements:
   *  16. Email contains reset button/link
   *  17. Email contains user's name (personalised greeting)
   *  18. Email uses configured CLIENT_URL
   *  + subject never exposes the raw token
   *  + plain-text fallback contains the reset URL
   *  + expiry information included
   *  + security notice included
   *  + no sensitive fields (role, id) in the email body
   */

  function getEmailArgs() {
    return mockSendMail.mock.calls[0][0];
  }

  beforeEach(async () => {
    const { emailService, config } = isolatedLoad();
    config.email.host = 'smtp.gmail.com';
    config.email.fromName = 'ClassTrack AI';
    config.server.clientUrl = 'https://app.classtrack.ai';
    config.auth.passwordResetExpiresInMinutes = 60;
    mockSendMail.mockResolvedValue({ messageId: 'html-test', accepted: ['user@e.com'], rejected: [] });

    await emailService.sendPasswordResetEmail('user@school.com', 'Ganesh Sonawne', 'raw-token-xyz');
  });

  it('Test 16 — HTML body contains a "Reset Password" button/link pointing to the reset URL', () => {
    const { html } = getEmailArgs();
    // The reset URL must appear in the HTML (as the href of the CTA button)
    expect(html).toContain('https://app.classtrack.ai/reset-password?token=raw-token-xyz');
    // The button text must be accessible
    expect(html).toMatch(/Reset Password/i);
  });

  it('Test 17 — Email contains the user\'s name in a personalised greeting', () => {
    const { html, text } = getEmailArgs();
    expect(html).toContain('Ganesh Sonawne');
    expect(text).toContain('Ganesh Sonawne');
  });

  it('Test 18 — Email uses configured CLIENT_URL, not a hardcoded localhost', () => {
    const { html, text } = getEmailArgs();
    expect(html).toContain('https://app.classtrack.ai/reset-password?token=raw-token-xyz');
    expect(text).toContain('https://app.classtrack.ai/reset-password?token=raw-token-xyz');
    expect(html).not.toContain('localhost');
    expect(text).not.toContain('localhost');
  });

  it('Email subject never exposes the raw token (token is only in reset URL)', () => {
    const { subject } = getEmailArgs();
    expect(subject).not.toContain('raw-token-xyz');
    expect(subject).toMatch(/reset.*password|password.*reset/i);
  });

  it('Plain-text fallback body contains the full reset URL', () => {
    const { text } = getEmailArgs();
    expect(text).toContain('https://app.classtrack.ai/reset-password?token=raw-token-xyz');
  });

  it('Email contains expiry information', () => {
    const { html, text } = getEmailArgs();
    // 60 minutes expiry (from config.auth.passwordResetExpiresInMinutes)
    expect(html).toContain('60');
    expect(text).toContain('60');
  });

  it('Email contains security notice about ignoring if not requested', () => {
    const { html, text } = getEmailArgs();
    expect(html).toMatch(/didn.t request/i);
    expect(text).toMatch(/didn.t request/i);
  });

  it('HTML uses inline CSS — no external stylesheet links', () => {
    const { html } = getEmailArgs();
    // Must not reference any external CSS file
    expect(html).not.toMatch(/<link[^>]+stylesheet/i);
    // All styles must be inline
    expect(html).toMatch(/style=/);
  });

  it('Email body does NOT expose role, internal ID, or raw token as visible text', () => {
    const { html, text } = getEmailArgs();
    // Raw token must appear only inside the reset URL, not as standalone visible text
    const tokenStandalonePattern = /(?<![?=\/])raw-token-xyz(?![&])/;
    // The token appears in the URL which is fine — we check it never appears
    // as plain text OUTSIDE of the reset URL (e.g. as a standalone "Your token: …")
    const htmlWithoutUrl = html.replace(
      /https:\/\/app\.classtrack\.ai\/reset-password\?token=raw-token-xyz/g, ''
    );
    const textWithoutUrl = text.replace(
      /https:\/\/app\.classtrack\.ai\/reset-password\?token=raw-token-xyz/g, ''
    );
    expect(htmlWithoutUrl).not.toContain('raw-token-xyz');
    expect(textWithoutUrl).not.toContain('raw-token-xyz');

    // Role must never appear in the email
    expect(html).not.toMatch(/\b(admin|teacher|student)\b/i);
    expect(text).not.toMatch(/\b(admin|teacher|student)\b/i);
  });

  it('HTML email contains the fromName branding (ClassTrack AI)', () => {
    const { html } = getEmailArgs();
    expect(html).toContain('ClassTrack AI');
  });
});
