const nodemailer = require('nodemailer');

// Built once; with SMTP_* unset, sendMail logs to console so the OTP flow is testable without real email.
let transporter = null;
let resolved = false;

// ---- Why this transport is pooled ----
//
// Unpooled, nodemailer opens a fresh TCP + TLS + AUTH handshake per message. 200 students
// tapping "send code" in the same minute during onboarding therefore opened 200 brand new
// authenticated connections; providers throttle that hard, and the sends then hang.
//
// Pooling reuses a small number of connections and queues the rest, which turns a
// provider-side throttle into an orderly local queue. The rate limiter below is deliberate
// too: it is cheaper to pace ourselves than to be paced by a provider that responds to a
// burst by refusing to talk to us for a while.
//
// Every value is env-tunable because the correct numbers depend on the provider (an
// institutional relay and a consumer mailbox tolerate very different rates), and nobody
// should have to edit code to raise a limit during an onboarding window.
const num = (value, fallback) => Number(value) || fallback;

function getTransporter() {
  if (resolved) return transporter;
  resolved = true;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    const port = num(SMTP_PORT, 587);
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },

      pool: true,
      maxConnections: num(process.env.SMTP_MAX_CONNECTIONS, 5),
      // Recycle a connection after this many messages; long-lived SMTP sockets get dropped
      // by relays and a recycled one fails fast instead of hanging.
      maxMessages: num(process.env.SMTP_MAX_MESSAGES, 100),
      // At most SMTP_RATE_LIMIT messages per SMTP_RATE_DELTA ms, across the whole pool.
      rateDelta: num(process.env.SMTP_RATE_DELTA, 1000),
      rateLimit: num(process.env.SMTP_RATE_LIMIT, 5),

      // Without these, a black-holed SMTP port means the socket waits on the OS default —
      // minutes. Each is well inside the Next rewrite's 30s proxyTimeout so a stuck send
      // fails as a real error rather than as an unparseable proxy 500.
      connectionTimeout: num(process.env.SMTP_CONNECTION_TIMEOUT_MS, 10000),
      greetingTimeout: num(process.env.SMTP_GREETING_TIMEOUT_MS, 10000),
      socketTimeout: num(process.env.SMTP_SOCKET_TIMEOUT_MS, 20000),
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

// ---- Bounded send: wait briefly, then stop waiting ----
//
// Awaiting sendMail inline made the request as slow as the provider. Not awaiting it at all
// would mean telling a student "code sent" and never learning that it wasn't.
//
// So: wait up to MAIL_SEND_DEADLINE_MS. The common failures — auth rejected, host
// unreachable, mailbox refused — surface well inside that, so the student still gets a real
// error. A merely slow provider stops holding the request; the send continues in the
// background and its outcome is logged.
//
// Resolves { delivered, pending, error }:
//   delivered:true             sent, confirmed
//   delivered:false pending:true  still in flight; caller should report optimistic success
//   delivered:false error:Error   failed inside the deadline; caller should report failure
const SEND_DEADLINE_MS = () => num(process.env.MAIL_SEND_DEADLINE_MS, 5000);

async function sendMailWithin({ to, subject, text, html }, deadlineMs = SEND_DEADLINE_MS()) {
  let timedOut = false;

  const sending = sendMail({ to, subject, text, html });

  // Attach the rejection handler NOW, not after the race. A rejection arriving after the
  // deadline has no awaiter, and an unhandled rejection is fatal under the handler in
  // server.js — the background send would take the whole process down with it.
  const observed = sending.catch((err) => {
    if (!timedOut) throw err; // still inside the deadline: the caller wants this
    // Past the deadline the caller has already answered the student, so this log is the
    // only record that the mail never arrived. Loud on purpose.
    console.error(`[mailer] background send to ${to} FAILED after the deadline: ${err.message}`);
    return { delivered: false };
  });

  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => {
      timedOut = true;
      resolve({ delivered: false, pending: true });
    }, deadlineMs);
    // Don't let a pending mail timer hold the event loop open at shutdown.
    if (timer.unref) timer.unref();
  });

  try {
    const result = await Promise.race([observed, deadline]);
    if (result && result.pending) {
      console.warn(
        `[mailer] send to ${to} exceeded ${deadlineMs}ms — responding now, delivery continues in background.`
      );
    }
    return { pending: false, ...result };
  } catch (err) {
    // Failed inside the deadline: a real, reportable error.
    return { delivered: false, pending: false, error: err };
  } finally {
    clearTimeout(timer);
  }
}

// Pooled transports hold sockets open, which would keep the process alive past SIGTERM.
// Called from the graceful shutdown in server.js.
const closeMailer = () => {
  if (transporter && typeof transporter.close === 'function') transporter.close();
};

module.exports = { sendMail, sendMailWithin, isMailConfigured, closeMailer };
