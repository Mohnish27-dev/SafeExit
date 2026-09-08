const app = require('./app');
const { connectPostgres, closePostgres } = require('./config/sequelize');
const { ensureAdmins } = require('./utils/ensureAdmins');
const { startOverdueSweep } = require('./utils/overdueSweep');
const sseHub = require('./utils/sseHub');
const { closeMailer } = require('./utils/mailer');

const PORT = process.env.PORT || 5000;

// Set once the shutdown sequence begins, so a second signal (an impatient operator
// pressing Ctrl-C again, or docker following SIGTERM with SIGKILL) does not restart it.
let shuttingDown = false;
let httpServer = null;
let sweepTimer = null;

// Graceful shutdown, in dependency order.
//
// `server.close()` stops accepting new connections and resolves once the open ones finish —
// but an SSE stream never finishes on its own, so without closeAll() below this hangs until
// the SIGKILL and every in-flight request dies mid-write. The forced-exit timer is the
// backstop for anything else that refuses to let go.
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} received — closing down.`);

  const forced = setTimeout(() => {
    console.error('[shutdown] still busy after 10s — forcing exit.');
    process.exit(1);
  }, 10000);
  forced.unref();

  try {
    if (sweepTimer) clearInterval(sweepTimer);

    // Ends every live SSE response. Must happen before server.close() resolves, or it
    // never will.
    const streams = sseHub.closeAll();
    if (streams) console.log(`[shutdown] ended ${streams} SSE stream(s).`);

    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
      console.log('[shutdown] HTTP server closed.');
    }

    // Flushes the pooled SMTP connections; a queued verification email still goes out.
    await closeMailer();
    // Drains the connection pool. Without it the process holds open sockets that the
    // college's Postgres counts against max_connections until they time out server-side.
    await closePostgres();
    console.log('[shutdown] database connection closed.');

    clearTimeout(forced);
    process.exit(0);
  } catch (err) {
    console.error(`[shutdown] failed: ${err.message}`);
    process.exit(1);
  }
};

// docker stop / compose down sends SIGTERM; Ctrl-C sends SIGINT. (Node cannot deliver
// SIGTERM on Windows, so on a dev machine only the SIGINT path runs — the deployment
// target is a Linux container, where SIGTERM is the one that matters.)
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// An unhandled rejection terminates the process on Node 15+. Without this handler the only
// record is a stack trace on stderr and an instant exit — no shutdown, so every live SSE
// stream is severed and any queued mail is dropped. Log it and go down cleanly instead.
process.on('unhandledRejection', (reason) => {
  console.error('[fatal] unhandled promise rejection:', reason instanceof Error ? reason.stack : reason);
  shutdown('unhandledRejection');
});

// After an uncaught exception the process state is not trustworthy, so this deliberately
// does NOT keep serving: it records what happened and exits through the same path. Restart
// policy brings it back with a clean heap.
process.on('uncaughtException', (err) => {
  console.error('[fatal] uncaught exception:', err.stack || err.message);
  shutdown('uncaughtException');
});

connectPostgres().then(async () => {
  // Idempotent; unchanged .env = no writes.
  try {
    const { created, updated } = await ensureAdmins();
    if (created || updated) {
      console.log(`Admins ensured (created: ${created}, updated: ${updated}).`);
    }
  } catch (err) {
    console.error('Admin seeding failed:', err.message);
  }

  // The one-active-pass guard used to need proving at boot: on MongoDB a partial unique
  // index with $in in its filter fails to build SILENTLY on servers below 6.0 and on
  // pre-existing duplicate data, so utils/verifyIndexes.js asserted it by name on every
  // start. In Postgres the index is DDL — db/postgres/001_schema.sql either applied it or
  // that migration failed loudly, and `npm run pg:check` re-proves it on demand. There is
  // nothing left for the server to verify, so those 116 lines are gone rather than ported.

  httpServer = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  // Held so shutdown can stop it — an un-cleared interval keeps the event loop alive and
  // the process never exits on its own.
  sweepTimer = startOverdueSweep();
}).catch(err => {
  console.error("Failed to connect to DB", err);
});
