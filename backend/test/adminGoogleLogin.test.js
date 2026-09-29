const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'admin-login-test-secret';

// authController destructures verifyGoogleCredential at require time, so the stub has to
// be in place on the module's exports BEFORE authController is loaded.
const googleIdToken = require('../src/utils/googleIdToken');
let verifiedEmail = null;
googleIdToken.verifyGoogleCredential = async (credential) => {
  if (credential !== 'good-token') {
    throw Object.assign(new Error('Google sign-in could not be verified. Please try again.'), { statusCode: 401 });
  }
  return { email: verifiedEmail, name: 'SafeExit NITP' };
};

const jwt = require('jsonwebtoken');
const User = require('../src/models/User');
const { googleLogin, authUser, getAuthenticationOptions } = require('../src/controllers/authController');
const { protect } = require('../src/middlewares/authMiddleware');
const { ensureAdmins } = require('../src/utils/ensureAdmins');

const ADMIN_EMAIL = 'safeexit@nitp.ac.in';
const UUID = '33333333-3333-4333-8333-333333333333';

const responseRecorder = () => {
  const result = { statusCode: 200, body: null, cookies: [] };
  result.status = (code) => { result.statusCode = code; return result; };
  result.json = (body) => { result.body = body; return result; };
  result.cookie = (...args) => { result.cookies.push(args); return result; };
  return result;
};

const makeAdmin = (overrides) => ({
  id: UUID,
  name: ADMIN_EMAIL,
  loginId: ADMIN_EMAIL,
  email: ADMIN_EMAIL,
  role: 'Admin',
  webAuthnRegistered: false,
  password: null,
  save: async () => {},
  ...overrides,
});

const stub = (t, obj, key, value) => {
  const original = obj[key];
  obj[key] = value;
  t.after(() => { obj[key] = original; });
};

const withUsers = (t, byEmail) => {
  stub(t, User, 'findOne', async ({ where }) => byEmail[where.email] || null);
  stub(t, User, 'hasSignature', async () => false);
};

const login = async (credential, role = 'Admin') => {
  const res = responseRecorder();
  await googleLogin({ body: { credential, role } }, res);
  return res;
};

test('safeexit@nitp.ac.in signs in to the admin console with Google', async (t) => {
  verifiedEmail = ADMIN_EMAIL;
  withUsers(t, { [ADMIN_EMAIL]: makeAdmin() });

  const res = await login('good-token');

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.role, 'Admin');
  assert.equal(res.body.name, 'SafeExit NITP'); // placeholder name replaced from Google
  assert.equal(jwt.decode(res.body.token).auth, 'google');
  assert.equal(res.cookies[0][0], 'jwt');
});

test('any other college account is refused, even one holding an Admin row', async (t) => {
  verifiedEmail = 'mohnish.cs@nitp.ac.in';
  withUsers(t, { 'mohnish.cs@nitp.ac.in': makeAdmin({ email: 'mohnish.cs@nitp.ac.in' }) });

  const res = await login('good-token');

  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /not authorized for admin access/);
  assert.equal(res.cookies.length, 0);
});

test('the admin mailbox cannot enter through a warden page, nor a warden through the admin page', async (t) => {
  verifiedEmail = ADMIN_EMAIL;
  withUsers(t, { [ADMIN_EMAIL]: makeAdmin() });
  assert.equal((await login('good-token', 'Warden')).statusCode, 403);
  assert.equal((await login('good-token', 'ChiefWarden')).statusCode, 403);
});

test('the admin mailbox is refused if its row is not an Admin account', async (t) => {
  verifiedEmail = ADMIN_EMAIL;
  withUsers(t, { [ADMIN_EMAIL]: makeAdmin({ role: 'Student' }) });
  assert.equal((await login('good-token')).statusCode, 403);
});

test('an unverifiable Google token is a 401', async (t) => {
  withUsers(t, {});
  assert.equal((await login('forged')).statusCode, 401);
});

test('an old admin ID + correct PIN no longer opens the console', async (t) => {
  stub(t, User, 'findOne', async () => makeAdmin({
    loginId: 'adm-gungun', email: null, name: 'Gungun Wadhwani',
    matchPassword: async (pin) => pin === '8595',
  }));

  const res = responseRecorder();
  await authUser({ body: { name: 'Gungun Wadhwani', loginId: 'adm-gungun', password: '8595' } }, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /Google/);
  assert.equal(res.cookies.length, 0);
});

test('an admin passkey no longer opens the console', async (t) => {
  stub(t, User, 'findOne', async () => makeAdmin({
    webAuthnRegistered: true, webAuthnCredentials: [{ credentialID: 'abc', transports: [] }],
  }));

  const res = responseRecorder();
  await getAuthenticationOptions({ body: { loginId: ADMIN_EMAIL } }, res);
  assert.equal(res.statusCode, 403);
});

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const runProtect = async (t, user, claims) => {
  stub(t, User, 'findByPk', async () => user);
  const token = jwt.sign({ ...claims, id: UUID }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const res = responseRecorder();
  let passed = false;
  const origError = console.error;
  console.error = () => {};
  try {
    await protect({ headers: { authorization: `Bearer ${token}` }, cookies: {} }, res, () => { passed = true; });
  } finally {
    console.error = origError;
  }
  return { passed, res };
};

test('an admin session from the old PIN login is refused', async (t) => {
  const { passed, res } = await runProtect(t, makeAdmin({ loginId: 'adm-gungun', email: null }), {});
  assert.equal(passed, false);
  assert.equal(res.statusCode, 401);
});

test('a Google admin session is accepted', async (t) => {
  const { passed } = await runProtect(t, makeAdmin(), { auth: 'google' });
  assert.equal(passed, true);
});

test('a Google-claimed session for an Admin row with another email is refused', async (t) => {
  const { passed, res } = await runProtect(t, makeAdmin({ email: 'someone@nitp.ac.in' }), { auth: 'google' });
  assert.equal(passed, false);
  assert.equal(res.statusCode, 401);
});

// ---------------------------------------------------------------------------
// Provisioning
// ---------------------------------------------------------------------------

test('ensureAdmins creates the Google admin account with no password', async (t) => {
  const created = [];
  stub(t, User, 'findOne', async () => null);
  stub(t, User, 'findAll', async () => []);
  stub(t, User, 'create', async (row) => { created.push(row); return row; });

  assert.deepEqual(await ensureAdmins(), { created: 1, updated: 0 });
  assert.deepEqual(created, [{ name: ADMIN_EMAIL, email: ADMIN_EMAIL, loginId: ADMIN_EMAIL, role: 'Admin' }]);
});

test('ensureAdmins never promotes a non-admin account that holds the admin email', async (t) => {
  const student = makeAdmin({ role: 'Student', save: async () => { throw new Error('must not save'); } });
  stub(t, User, 'findOne', async () => student);
  stub(t, User, 'findAll', async () => []);
  stub(t, User, 'create', async () => { throw new Error('must not create'); });
  stub(t, console, 'error', () => {});

  assert.deepEqual(await ensureAdmins(), { created: 0, updated: 0 });
  assert.equal(student.role, 'Student');
});

test('ensureAdmins is write-free when the admin account is already correct', async (t) => {
  stub(t, User, 'findOne', async () => makeAdmin({ save: async () => { throw new Error('must not save'); } }));
  stub(t, User, 'findAll', async () => []);

  assert.deepEqual(await ensureAdmins(), { created: 0, updated: 0 });
});
