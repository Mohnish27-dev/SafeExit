const test = require('node:test');
const assert = require('node:assert/strict');

const { sequelize, User, AppSetting } = require('../src/models');
const { updateUserProfile } = require('../src/controllers/authController');
const { resetUserPhoto, resetUserSignature } = require('../src/controllers/adminController');

// Photos (students) and signatures (everyone) are set once by their owner and then locked;
// only an admin reset clears them. These pin that the self-service path can add a missing
// one but never replace or clear an existing one.

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
const SIGNATURE = 'data:image/png;base64,iVBORw0KGgo=';

const recorder = () => {
  const r = { statusCode: 200, body: null };
  r.status = (code) => { r.statusCode = code; return r; };
  r.json = (body) => { r.body = body; return r; };
  return r;
};

// Stubs every model call the PATCH can make; records which blob writer ran.
const stubProfile = (t, { role = 'Student', hasPhoto = false, hasSignature = false } = {}) => {
  const orig = {
    findByPk: User.findByPk,
    hasPhoto: User.hasPhoto,
    hasSignature: User.hasSignature,
    addPhotoOnce: User.addPhotoOnce,
    addSignatureOnce: User.addSignatureOnce,
    setPhoto: User.setPhoto,
    setSignature: User.setSignature,
    transaction: sequelize.transaction,
    setting: AppSetting.findByPk,
  };
  const writes = [];
  const user = {
    id: 'u-1', role, name: 'Asha', gender: 'Female', hostelName: 'Kadambini',
    profileConfirmedAt: null, closeContacts: [], save: async () => {},
  };
  User.findByPk = async () => user;
  User.hasPhoto = async () => hasPhoto;
  User.hasSignature = async () => hasSignature;
  User.addPhotoOnce = async (id, data) => { writes.push(['addPhotoOnce', data]); };
  User.addSignatureOnce = async (id, data) => { writes.push(['addSignatureOnce', data]); };
  User.setPhoto = async (id, data) => { writes.push(['setPhoto', data]); };
  User.setSignature = async (id, data) => { writes.push(['setSignature', data]); };
  sequelize.transaction = async (cb) => cb({});
  AppSetting.findByPk = async () => null;
  t.after(() => {
    Object.assign(User, {
      findByPk: orig.findByPk,
      hasPhoto: orig.hasPhoto,
      hasSignature: orig.hasSignature,
      addPhotoOnce: orig.addPhotoOnce,
      addSignatureOnce: orig.addSignatureOnce,
      setPhoto: orig.setPhoto,
      setSignature: orig.setSignature,
    });
    sequelize.transaction = orig.transaction;
    AppSetting.findByPk = orig.setting;
  });
  return writes;
};

const patch = async (body) => {
  const res = recorder();
  await updateUserProfile({ user: { _id: 'u-1' }, body }, res);
  return res;
};

test('a student cannot replace a photo they already have', async (t) => {
  const writes = stubProfile(t, { hasPhoto: true });
  const res = await patch({ photo: PHOTO });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'PHOTO_LOCKED');
  assert.deepEqual(writes, []);
});

test('a student cannot clear their photo', async (t) => {
  const writes = stubProfile(t, { hasPhoto: true });
  const res = await patch({ photo: null });
  assert.equal(res.statusCode, 403);
  assert.deepEqual(writes, []);
});

test('a student without a photo can add one, as a set-once insert', async (t) => {
  const writes = stubProfile(t, { hasPhoto: false });
  const res = await patch({ photo: PHOTO });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(writes, [['addPhotoOnce', PHOTO]]);
});

test('a backfilled photo must be an image data URL', async (t) => {
  const writes = stubProfile(t, { hasPhoto: false });
  const res = await patch({ photo: 'data:text/html;base64,PGI+' });
  assert.equal(res.statusCode, 400);
  assert.deepEqual(writes, []);
});

test('a locked signature also blocks a photo sent with it', async (t) => {
  const writes = stubProfile(t, { hasPhoto: false, hasSignature: true });
  const res = await patch({ photo: PHOTO, signature: SIGNATURE });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'SIGNATURE_LOCKED');
  assert.deepEqual(writes, []);
});

for (const role of ['Student', 'Caretaker', 'Warden']) {
  test(`a ${role} cannot replace or clear their signature`, async (t) => {
    const writes = stubProfile(t, { role, hasSignature: true });
    assert.equal((await patch({ signature: SIGNATURE })).statusCode, 403);
    assert.equal((await patch({ signature: null })).statusCode, 403);
    assert.deepEqual(writes, []);
  });

  test(`a ${role} without a signature can add one`, async (t) => {
    const writes = stubProfile(t, { role, hasSignature: false });
    const res = await patch({ signature: SIGNATURE });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(writes, [['addSignatureOnce', SIGNATURE]]);
  });
}

test('staff photos are not locked', async (t) => {
  const writes = stubProfile(t, { role: 'Caretaker', hasPhoto: true });
  const res = await patch({ photo: PHOTO });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(writes, [['setPhoto', PHOTO]]);
});

test('losing a race for the first upload reports the photo as locked', async (t) => {
  stubProfile(t, { hasPhoto: false });
  User.addPhotoOnce = async () => {
    const err = new Error('duplicate key');
    err.name = 'SequelizeUniqueConstraintError';
    err.parent = { table: 'user_photos' };
    throw err;
  };
  const res = await patch({ photo: PHOTO });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'PHOTO_LOCKED');
});

const stubReset = (t, target) => {
  const orig = { findByPk: User.findByPk, setPhoto: User.setPhoto, setSignature: User.setSignature };
  const cleared = [];
  User.findByPk = async () => target;
  User.setPhoto = async (id, data) => { cleared.push(['photo', id, data]); };
  User.setSignature = async (id, data) => { cleared.push(['signature', id, data]); };
  t.after(() => Object.assign(User, orig));
  return cleared;
};

test('admin photo reset clears a student photo', async (t) => {
  const cleared = stubReset(t, { id: 's-1', name: 'Asha', role: 'Student' });
  const res = recorder();
  await resetUserPhoto({ params: { id: 's-1' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(cleared, [['photo', 's-1', null]]);
});

test('admin photo reset only applies to students', async (t) => {
  const cleared = stubReset(t, { id: 'c-1', name: 'Ravi', role: 'Caretaker' });
  const res = recorder();
  await resetUserPhoto({ params: { id: 'c-1' } }, res);
  assert.equal(res.statusCode, 404);
  assert.deepEqual(cleared, []);
});

test('admin signature reset clears staff and student signatures, not admins', async (t) => {
  const cleared = stubReset(t, { id: 'w-1', name: 'Dr. Rao', role: 'Warden' });
  const res = recorder();
  await resetUserSignature({ params: { id: 'w-1' } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(cleared, [['signature', 'w-1', null]]);

  User.findByPk = async () => ({ id: 'a-1', name: 'Admin', role: 'Admin' });
  const adminRes = recorder();
  await resetUserSignature({ params: { id: 'a-1' } }, adminRes);
  assert.equal(adminRes.statusCode, 404);
});
