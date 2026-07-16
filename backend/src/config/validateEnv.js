// Fail fast on missing env vars instead of opaque runtime 500s.

const REQUIRED = ['JWT_SECRET', 'MONGO_URI'];

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
