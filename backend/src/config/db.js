const mongoose = require('mongoose');

const num = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

// Every one of these defaults to "wait forever" or "wait 30s" in the driver, which is the
// wrong trade for a gate station: a student standing at the barrier would rather see an
// error in a few seconds than watch a spinner while requests pile up behind a mongo that
// is not answering. Each is env-tunable because the right number depends on whether this
// deployment talks to a LAN mongo or to Atlas across the internet.
const connectionOptions = () => ({
  // How long to hunt for a reachable server before giving up. Driver default is 30s, which
  // is 30s of held-open sockets per request during an outage.
  serverSelectionTimeoutMS: num(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS, 10000),

  // A socket that stops answering mid-query otherwise holds its connection forever. Must
  // stay comfortably above the slowest legitimate query — the campus-wide history reads.
  socketTimeoutMS: num(process.env.MONGO_SOCKET_TIMEOUT_MS, 45000),

  // Driver default is 0: unlimited. Under a burst, a request that cannot get a pooled
  // connection waits indefinitely and the queue grows without any error being raised —
  // the shape of an outage that looks like a hang. Fail it instead.
  waitQueueTimeoutMS: num(process.env.MONGO_WAIT_QUEUE_TIMEOUT_MS, 10000),

  maxPoolSize: num(process.env.MONGO_MAX_POOL_SIZE, 50),
  // Keeps a few sockets warm so the 5 PM rush is not also paying TLS handshakes.
  minPoolSize: num(process.env.MONGO_MIN_POOL_SIZE, 2),
});

// A dropped connection used to be entirely silent — the app kept serving 500s with no
// indication that mongo was the cause. These are the breadcrumbs for that.
const attachConnectionLogging = () => {
  const c = mongoose.connection;
  c.on('disconnected', () => console.warn('[db] disconnected from MongoDB'));
  c.on('reconnected', () => console.log('[db] reconnected to MongoDB'));
  // Post-connect errors arrive here, not at the connect() call site.
  c.on('error', (err) => console.error(`[db] connection error: ${err.message}`));
};

const connectDB = async () => {
  try {
    attachConnectionLogging();
    const conn = await mongoose.connect(process.env.MONGO_URI, connectionOptions());
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    // Nothing in this app works without the database, so failing to start is correct —
    // the container restart policy retries, which is a better loop than serving errors.
    console.error(`[db] could not connect: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
module.exports.connectionOptions = connectionOptions;
