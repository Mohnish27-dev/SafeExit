// Fail-fast validation of required environment variables.
//
// Without this, a missing JWT_SECRET surfaces only later as a confusing runtime
// 500 (jwt.sign throws "secretOrPrivateKey must have a value" on the first auth
// request), and a missing MONGO_URI throws deep inside mongoose.connect with no
// hint that the real problem is an unset .env. We'd rather refuse to boot with a
// single clear message than let the server come up half-broken.

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
