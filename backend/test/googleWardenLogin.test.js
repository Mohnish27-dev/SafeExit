const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'google-login-test-secret';

// authController destructures verifyGoogleCredential at require time, so the stub has to
// be in place on the module's exports BEFORE authController is loaded.
const googleIdToken = require('../src/utils/googleIdToken');
const realVerify = googleIdToken.verifyGoogleCredential;
let verifiedEmail = null;
googleIdToken.verifyGoogleCredential = async (credential) => {
  if (credential !== 'good-token') {
    throw Object.assign(new Error('Google sign-in could not be verified. Please try again.'), { statusCode: 401 });
  }
  return { email: verifiedEmail, name: 'Dr. Name From Google' };
};

const User = require('../src/models/User');
const { googleLogin, authUser } = require('../src/controllers/authController');
const { resetStaffPin } = require('../src/controllers/adminController');

const responseRecorder = () => {
  const result = { statusCode: 200, body: null, cookies: [] };
  result.status = (code) => { result.statusCode = code; return result; };
  result.json = (body) => { result.body = body; return result; };
  result.cookie = (...args) => { result.cookies.push(args); return result; };
  return result;
};

const makeUser = (overrides) => ({
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Rakesh Kumar',
  loginId: 'rakeshk.me@nitp.ac.in',
  email: 'rakeshk.me@nitp.ac.in',
  role: 'Warden',
  managedHostel: 'Kautilya',
  managedGender: 'Male',
  webAuthnRegistered: false,
  save: async () => {},
  ...overrides,
});

// Every test stubs the one lookup googleLogin makes (by email) plus the signature flag.
const withUsers = (t, byEmail) => {
  const originalFindOne = User.findOne;
  const originalHasSignature = User.hasSignature;
  User.findOne = async ({ where }) => byEmail[where.email] || null;
  User.hasSignature = async () => false;
  t.after(() => {
    User.findOne = originalFindOne;
    User.hasSignature = originalHasSignature;
  });
};

const login = async (credential, role) => {
  const res = responseRecorder();
  await googleLogin({ body: { credential, role } }, res);
  return res;
};

test('a provisioned warden signs in with Google and gets their own hostel', async (t) => {
  verifiedEmail = 'rakeshk.me@nitp.ac.in';
  withUsers(t, { 'rakeshk.me@nitp.ac.in': makeUser() });

  const res = await login('good-token', 'Warden');

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.role, 'Warden');
  assert.equal(res.body.managedHostel, 'Kautilya');
  assert.equal(typeof res.body.token, 'string');
  assert.equal(res.cookies[0][0], 'jwt');
});

test('a warden provisioned without a name takes it from Google; a typed name is kept', async (t) => {
  verifiedEmail = 'girdhar.ec@nitp.ac.in';
  const placeholder = makeUser({ email: 'girdhar.ec@nitp.ac.in', name: 'girdhar.ec@nitp.ac.in' });
  const named = makeUser({ email: 'mmahto@nitp.ac.in', name: 'Dr. Manpuran Mahto' });
  withUsers(t, { 'girdhar.ec@nitp.ac.in': placeholder, 'mmahto@nitp.ac.in': named });

  assert.equal((await login('good-token', 'Warden')).body.name, 'Dr. Name From Google');

  verifiedEmail = 'mmahto@nitp.ac.in';
  assert.equal((await login('good-token', 'Warden')).body.name, 'Dr. Manpuran Mahto');
});

test('a college email with no warden account is rejected (e.g. a student)', async (t) => {
  verifiedEmail = '2201cs01@nitp.ac.in';
  withUsers(t, { '2201cs01@nitp.ac.in': makeUser({ role: 'Student', managedHostel: null }) });

  const res = await login('good-token', 'Warden');

  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /not registered as a hostel warden/);
  assert.equal(res.cookies.length, 0);
});

test('an unknown college email is rejected', async (t) => {
  verifiedEmail = 'nobody@nitp.ac.in';
  withUsers(t, {});

  const res = await login('good-token', 'Warden');
  assert.equal(res.statusCode, 403);
});

test('a hostel warden cannot enter through the Chief Warden login, nor the reverse', async (t) => {
  verifiedEmail = 'rakeshk.me@nitp.ac.in';
  withUsers(t, {
    'rakeshk.me@nitp.ac.in': makeUser(),
    'chief@nitp.ac.in': makeUser({ email: 'chief@nitp.ac.in', role: 'ChiefWarden', managedHostel: null }),
  });

  const asChief = await login('good-token', 'ChiefWarden');
  assert.equal(asChief.statusCode, 403);
  assert.match(asChief.body.message, /not registered as the Chief Warden/);

  verifiedEmail = 'chief@nitp.ac.in';
  const asWarden = await login('good-token', 'Warden');
  assert.equal(asWarden.statusCode, 403);

  const ok = await login('good-token', 'ChiefWarden');
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.role, 'ChiefWarden');
});

test('a warden with no hostel assigned is told why instead of seeing an empty dashboard', async (t) => {
  verifiedEmail = 'rakeshk.me@nitp.ac.in';
  withUsers(t, { 'rakeshk.me@nitp.ac.in': makeUser({ managedHostel: null }) });

  const res = await login('good-token', 'Warden');
  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /no hostel assigned/);
});

test('an unverifiable Google token is a 401 and roles outside the warden pair are refused', async (t) => {
  withUsers(t, {});
  assert.equal((await login('forged', 'Warden')).statusCode, 401);
  assert.equal((await login('good-token', 'Admin')).statusCode, 400);
  assert.equal((await login('good-token', 'Student')).statusCode, 400);
});

test('an old warden ID + correct PIN no longer opens the dashboard', async (t) => {
  const originalFindOne = User.findOne;
  User.findOne = async () => makeUser({ loginId: 'wdn001', email: null, matchPassword: async (pin) => pin === '1234' });
  t.after(() => { User.findOne = originalFindOne; });

  const res = responseRecorder();
  await authUser({ body: { loginId: 'wdn001', password: '1234' } }, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /Google/);
  assert.equal(res.cookies.length, 0);
});

test('the admin cannot set a PIN on a warden account', async (t) => {
  const originalFindByPk = User.findByPk;
  User.findByPk = async () => makeUser();
  t.after(() => { User.findByPk = originalFindByPk; });

  const res = responseRecorder();
  await resetStaffPin({ params: { id: 'x' }, body: { pin: '9999' } }, res);
  assert.equal(res.statusCode, 400);
});

test('the real verifier refuses to run without a configured client ID', async (t) => {
  const saved = process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID;
  t.after(() => { if (saved !== undefined) process.env.GOOGLE_CLIENT_ID = saved; });

  await assert.rejects(realVerify('anything'), (err) => err.statusCode === 503);
});

test('the real verifier rejects a missing credential before contacting Google', async (t) => {
  const saved = process.env.GOOGLE_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
  t.after(() => {
    if (saved === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = saved;
  });

  await assert.rejects(realVerify(undefined), (err) => err.statusCode === 400);
});

// ---------------------------------------------------------------------------
// Sessions: a warden token must come from a Google sign-in
// ---------------------------------------------------------------------------

const jwt = require('jsonwebtoken');
const { protect } = require('../src/middlewares/authMiddleware');

const UUID = '22222222-2222-4222-8222-222222222222';
const runProtect = async (t, user, claims) => {
  const originalFindByPk = User.findByPk;
  User.findByPk = async () => user;
  t.after(() => { User.findByPk = originalFindByPk; });

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

test('a warden session from the old PIN login is refused after the switch to Google', async (t) => {
  const { passed, res } = await runProtect(t, makeUser({ id: UUID }), {});
  assert.equal(passed, false);
  assert.equal(res.statusCode, 401);
});

test('a warden session from Google sign-in is accepted', async (t) => {
  const { passed } = await runProtect(t, makeUser({ id: UUID }), { auth: 'google' });
  assert.equal(passed, true);
});

test('other roles are unaffected by the Google session rule', async (t) => {
  const { passed } = await runProtect(t, makeUser({ id: UUID, role: 'Caretaker' }), {});
  assert.equal(passed, true);
});
