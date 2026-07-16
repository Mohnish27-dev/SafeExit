const nodemailer = require('nodemailer');

// Built once; with SMTP_* unset, sendMail logs to console so the OTP flow is testable without real email.
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

// Callers use this to decide if surfacing the OTP in a response is safe (local testing).
const isMailConfigured = () => Boolean(getTransporter());

// Returns { delivered: boolean }; logs instead of throwing when SMTP is unconfigured.
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
