const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const pushService = require('../src/utils/pushService');
const sseHub = require('../src/utils/sseHub');
const SOSAlert = require('../src/models/SOSAlert');

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
  _id: new mongoose.Types.ObjectId(),
  name: 'Alex Student',
  gender: 'Female',
  role: 'Student',
  studentId: 'STU1234',
  hostelName: 'Gargi',
  roomNumber: '101',
  department: 'CS',
  year: '3',
  phoneNumber: '9999999999',
  guardianPhoneNumber: '8888888888',
  closeContacts: [],
};

test('SOSAlert schema defaults type to "other" when omitted', async () => {
  const alert = new SOSAlert({
    student: fakeStudent._id,
  });
  await alert.validate();
  assert.equal(alert.type, 'other');
});

test('SOSAlert schema trims and lowercases type', async () => {
  const alert = new SOSAlert({
    student: fakeStudent._id,
    type: '  MEDICAL  ',
  });
  await alert.validate();
  assert.equal(alert.type, 'medical');
});

test('createSOSAlert handles missing type by defaulting to "other" and returns 201', async (t) => {
  let createdArgs = null;
  const originalCreate = SOSAlert.create;
  const originalBroadcast = sseHub.broadcast;
  const originalNotify = pushService.notifyCaretakersAndAdmins;

  let broadcastPayload = null;
  let pushNotification = null;

  pushService.notifyCaretakersAndAdmins = (gender, payload) => {
    pushNotification = { gender, payload };
  };

  const { createSOSAlert } = loadControllerWithSpies();

  SOSAlert.create = async (args) => {
    createdArgs = args;
    return {
      _id: 'sos-alert-1',
      type: args.type,
      status: 'Active',
      populate: async () => ({
        _id: 'sos-alert-1',
        type: args.type,
        status: 'Active',
        student: fakeStudent,
      }),
    };
  };

  sseHub.broadcast = (event, data) => {
    broadcastPayload = { event, data };
  };

  t.after(() => {
    SOSAlert.create = originalCreate;
    sseHub.broadcast = originalBroadcast;
    pushService.notifyCaretakersAndAdmins = originalNotify;
    delete require.cache[require.resolve('../src/controllers/sosController')];
  });

  const req = {
    user: fakeStudent,
    body: {}, // missing type
  };
  const res = responseRecorder();

  await createSOSAlert(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(createdArgs.type, 'other');
  assert.equal(broadcastPayload.event, 'sos:created');
  assert.equal(broadcastPayload.data.type, 'other');
  assert.ok(pushNotification.payload.body.includes('(other)'));
});

test('createSOSAlert normalizes wrong-case type (e.g. "Medical")', async (t) => {
  let createdArgs = null;
  const originalCreate = SOSAlert.create;
  const originalBroadcast = sseHub.broadcast;
  const originalNotify = pushService.notifyCaretakersAndAdmins;

  pushService.notifyCaretakersAndAdmins = () => {};
  const { createSOSAlert } = loadControllerWithSpies();

  SOSAlert.create = async (args) => {
    createdArgs = args;
    return {
      _id: 'sos-alert-2',
      type: args.type,
      status: 'Active',
      populate: async () => ({
        _id: 'sos-alert-2',
        type: args.type,
        status: 'Active',
        student: fakeStudent,
      }),
    };
  };
  sseHub.broadcast = () => {};

  t.after(() => {
    SOSAlert.create = originalCreate;
    sseHub.broadcast = originalBroadcast;
    pushService.notifyCaretakersAndAdmins = originalNotify;
    delete require.cache[require.resolve('../src/controllers/sosController')];
  });

  const req = {
    user: fakeStudent,
    body: { type: '  MeDiCaL  ' },
  };
  const res = responseRecorder();

  await createSOSAlert(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(createdArgs.type, 'medical');
});

test('createSOSAlert handles unrecognized type gracefully and preserves intent in note', async (t) => {
  let createdArgs = null;
  const originalCreate = SOSAlert.create;
  const originalBroadcast = sseHub.broadcast;
  const originalNotify = pushService.notifyCaretakersAndAdmins;

  pushService.notifyCaretakersAndAdmins = () => {};
  const { createSOSAlert } = loadControllerWithSpies();

  SOSAlert.create = async (args) => {
    createdArgs = args;
    return {
      _id: 'sos-alert-3',
      type: args.type,
      note: args.note,
      status: 'Active',
      populate: async () => ({
        _id: 'sos-alert-3',
        type: args.type,
        note: args.note,
        status: 'Active',
        student: fakeStudent,
      }),
    };
  };
  sseHub.broadcast = () => {};

  t.after(() => {
    SOSAlert.create = originalCreate;
    sseHub.broadcast = originalBroadcast;
    pushService.notifyCaretakersAndAdmins = originalNotify;
    delete require.cache[require.resolve('../src/controllers/sosController')];
  });

  const req = {
    user: fakeStudent,
    body: { type: 'fire', note: 'Building A 2nd floor' },
  };
  const res = responseRecorder();

  await createSOSAlert(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(createdArgs.type, 'other');
  assert.ok(createdArgs.note.includes('Building A 2nd floor'));
  assert.ok(createdArgs.note.includes('[Reported type: fire]'));
});
