const nodemailer = require('nodemailer');

// Lazily-built SMTP transport. We only construct it once (nodemailer pools the
// connection) and only if SMTP is actually configured. In development you can
// leave the SMTP_* vars unset — sendMail then falls back to logging the message
// to the server console, so the full OTP flow is testable without real email.
let transporter = null;
let resolved = false;

function getTransporter() {
  if (resolved) return transporter;
  resolved = true;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    const port = Number(SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

// Whether real email delivery is wired up. Used by callers to decide if it is
// safe to surface the OTP in an API response for local testing.
const isMailConfigured = () => Boolean(getTransporter());

/**
 * Send an email. Returns { delivered: boolean }.
 * When SMTP is not configured, logs to the console and returns delivered:false
 * instead of throwing, so a missing dev config never blocks the flow.
 */
async function sendMail({ to, subject, text, html }) {
  const t = getTransporter();
  if (!t) {
    console.log(
      `\n[mailer] SMTP not configured — email NOT sent.\n  to: ${to}\n  subject: ${subject}\n  body: ${text}\n`
    );
    return { delivered: false };
  }

  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  await t.sendMail({ from, to, subject, text, html });
  return { delivered: true };
}

module.exports = { sendMail, isMailConfigured };
