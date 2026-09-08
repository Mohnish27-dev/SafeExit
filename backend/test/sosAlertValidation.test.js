const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const pushService = require('../src/utils/pushService');
const sseHub = require('../src/utils/sseHub');
const { SOSAlert } = require('../src/models');

// An SOS must never fail on bad input: a wrong-case type, an unknown type, a missing type
// and malformed GPS all have to end in a stored alert rather than a 4xx. These pin that.
//
// Ported to Sequelize with the stubs moved, not weakened: the model-level assertions build
// an instance without touching the database (Sequelize applies defaults and attribute
// setters at build time, which is where `type` is normalised), and the controller
// assertions stub the two model calls the handler makes.

const loadControllerWithSpies = () => {
  const controllerPath = require.resolve('../src/controllers/sosController');
  delete require.cache[controllerPath];
  return require(controllerPath);
};

const responseRecorder = () => {
  const result = { statusCode: 200, body: null };
  result.status = (code) => {
    result.statusCode = code;
    return result;
  };
  result.json = (body) => {
    result.body = body;
    return result;
  };
  return result;
};

const fakeStudent = {
  _id: crypto.randomUUID(),
  name: 'Alex Student',
  gender: 'Female',
  role: 'Student',
  studentId: 'STU1234',
  hostelName: 'Kadambini',
  roomNumber: '101',
  department: 'CS',
  year: '3',
  phoneNumber: '9999999999',
  guardianPhoneNumber: '8888888888',
  closeContacts: [],
};

// Replaces SOSAlert.create + SOSAlert.findByPk for one test, capturing what the controller
// asked to store. The controller re-reads the row it just wrote so the response carries the
// joined student, so both have to be stubbed.
const stubSOSWrites = (t, onCreate = () => {}) => {
  const originalCreate = SOSAlert.create;
  const originalFindByPk = SOSAlert.findByPk;
  const captured = {};

  SOSAlert.create = async (args) => {
    Object.assign(captured, args);
    captured.id = 'sos-alert-1';
    return { id: captured.id, ...args };
  };
  SOSAlert.findByPk = async (id) => ({
    id,
    type: captured.type,
    note: captured.note,
    status: 'Active',
    student: fakeStudent,
    toJSON: () => ({ _id: id, type: captured.type, status: 'Active' }),
  });

  onCreate(captured);
  t.after(() => {
    SOSAlert.create = originalCreate;
    SOSAlert.findByPk = originalFindByPk;
    delete require.cache[require.resolve('../src/controllers/sosController')];
  });
  return captured;
};

const stubSideEffects = (t) => {
  const originalBroadcast = sseHub.broadcast;
  const originalNotify = pushService.notifyCaretakersAndAdmins;
  const seen = { broadcast: null, push: null };

  sseHub.broadcast = (event, data) => { seen.broadcast = { event, data }; };
  pushService.notifyCaretakersAndAdmins = (gender, payload) => { seen.push = { gender, payload }; };

  t.after(() => {
    sseHub.broadcast = originalBroadcast;
    pushService.notifyCaretakersAndAdmins = originalNotify;
  });
  return seen;
};

test('the SOS model defaults type to "other" when omitted', () => {
  // build() applies defaultValue without a database round trip.
  const alert = SOSAlert.build({ studentId: fakeStudent._id });
  assert.equal(alert.type, 'other');
});

test('the SOS model trims and lowercases type', () => {
  // The attribute setter is what Mongoose's `lowercase: true, trim: true` used to do. It
  // matters more than it did: the CHECK constraint on sos_alerts.type is case-sensitive,
  // so an untrimmed value would now be rejected by the database rather than stored oddly.
  const alert = SOSAlert.build({ studentId: fakeStudent._id, type: '  MEDICAL  ' });
  assert.equal(alert.type, 'medical');
});

test('the SOS model splits coords into columns and rebuilds them', () => {
  const alert = SOSAlert.build({
    studentId: fakeStudent._id,
    coords: { lat: 25.5, lng: 84.8, accuracy: 12 },
  });
  assert.equal(alert.getDataValue('coordLat'), 25.5);
  assert.equal(alert.getDataValue('coordLng'), 84.8);
  assert.deepEqual(alert.coords, { lat: 25.5, lng: 84.8, accuracy: 12 });
});

test('the SOS model drops impossible coordinates rather than storing them', () => {
  // Bad GPS must never fail an SOS, so it is discarded at the model boundary too — not
  // only in the controller.
  const alert = SOSAlert.build({
    studentId: fakeStudent._id,
    coords: { lat: 999, lng: 84.8 },
  });
  assert.equal(alert.getDataValue('coordLat'), null);
  assert.equal(alert.getDataValue('coordLng'), null);
  assert.equal(alert.coords, undefined);
});

test('createSOSAlert handles missing type by defaulting to "other" and returns 201', async (t) => {
  const seen = stubSideEffects(t);
  const captured = stubSOSWrites(t);
  const { createSOSAlert } = loadControllerWithSpies();

  const res = responseRecorder();
  await createSOSAlert({ user: fakeStudent, body: {} }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(captured.type, 'other');
  assert.equal(seen.broadcast.event, 'sos:created');
  assert.equal(seen.broadcast.data.type, 'other');
  assert.ok(seen.push.payload.body.includes('(other)'));
});

test('createSOSAlert normalizes wrong-case type (e.g. "Medical")', async (t) => {
  stubSideEffects(t);
  const captured = stubSOSWrites(t);
  const { createSOSAlert } = loadControllerWithSpies();

  const res = responseRecorder();
  await createSOSAlert({ user: fakeStudent, body: { type: '  MeDiCaL  ' } }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(captured.type, 'medical');
});

test('createSOSAlert handles unrecognized type gracefully and preserves intent in note', async (t) => {
  stubSideEffects(t);
  const captured = stubSOSWrites(t);
  const { createSOSAlert } = loadControllerWithSpies();

  const res = responseRecorder();
  await createSOSAlert(
    { user: fakeStudent, body: { type: 'fire', note: 'Building A 2nd floor' } },
    res
  );

  assert.equal(res.statusCode, 201);
  assert.equal(captured.type, 'other');
  assert.ok(captured.note.includes('Building A 2nd floor'));
  assert.ok(captured.note.includes('[Reported type: fire]'));
});

test('createSOSAlert writes the student as a foreign key, not a free field', async (t) => {
  stubSideEffects(t);
  const captured = stubSOSWrites(t);
  const { createSOSAlert } = loadControllerWithSpies();

  const res = responseRecorder();
  await createSOSAlert({ user: fakeStudent, body: { type: 'medical' } }, res);

  assert.equal(res.statusCode, 201);
  // sos_alerts.student_id REFERENCES users(id), so this has to be the caller's id and
  // nothing else — an alert can no longer point at a student who does not exist.
  assert.equal(captured.studentId, fakeStudent._id);
});
