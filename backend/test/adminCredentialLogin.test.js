const test = require('node:test');
const assert = require('node:assert/strict');

process.env.ADMIN_1_NAME = 'Test Administrator';
process.env.ADMIN_1_ID = 'ADM-TEST';
process.env.ADMIN_1_PIN = '1234';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'admin-login-test-secret';

const User = require('../src/models/User');
const { authUser } = require('../src/controllers/authController');

const responseRecorder = () => {
  const result = { statusCode: 200, body: null, cookies: [] };
  result.status = (code) => {
    result.statusCode = code;
    return result;
  };
  result.json = (body) => {
    result.body = body;
    return result;
  };
  result.cookie = (...args) => {
    result.cookies.push(args);
    return result;
  };
  return result;
};

const makeAdmin = () => ({
  _id: '507f1f77bcf86cd799439011',
  name: 'Test Administrator',
  loginId: 'adm-test',
  studentId: 'ADM-TEST',
  role: 'Admin',
  webAuthnRegistered: true,
  matchPassword: async (pin) => pin === '1234',
  save: async () => {},
});

test('admin can use name, ID, and PIN even when a passkey was previously enrolled', async (t) => {
  const originalFindOne = User.findOne;
  const admin = makeAdmin();
  User.findOne = async () => admin;
  t.after(() => { User.findOne = originalFindOne; });

  const req = {
    body: {
      name: '  TEST   ADMINISTRATOR ',
      loginId: 'adm-test',
      password: '1234',
    },
  };
  const res = responseRecorder();

  await authUser(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.role, 'Admin');
  assert.equal(typeof res.body.token, 'string');
  assert.equal(res.cookies[0][0], 'jwt');
});

test('admin login rejects a name that does not match the ID and PIN', async (t) => {
  const originalFindOne = User.findOne;
  User.findOne = async () => makeAdmin();
  t.after(() => { User.findOne = originalFindOne; });

  const req = {
    body: {
      name: 'Someone Else',
      loginId: 'adm-test',
      password: '1234',
    },
  };
  const res = responseRecorder();

  await authUser(req, res);

  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { message: 'Invalid credentials' });
  assert.equal(res.cookies.length, 0);
});
