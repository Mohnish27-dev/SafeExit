// Fail fast on missing env vars instead of opaque runtime 500s.

// DATABASE_URL replaces MONGO_URI. config/sequelize.js checks it again at connect time
// with a message pointing at the runbook, but failing here is earlier and cheaper: the
// app has no read path at all without it.
const REQUIRED = ['JWT_SECRET', 'DATABASE_URL'];

const validateEnv = () => {
  const missing = REQUIRED.filter(
    (key) => !process.env[key] || !process.env[key].trim()
  );

  if (missing.length > 0) {
    console.error(
      `\nFATAL: missing required environment variable(s): ${missing.join(', ')}.\n` +
        `Set them in backend/.env before starting the server.\n`
    );
    process.exit(1);
  }
};

module.exports = validateEnv;
