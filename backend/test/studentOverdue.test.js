const test = require('node:test');
const assert = require('node:assert/strict');

const { OutingRequest } = require('../src/models');
const { getMyOutingRequests } = require('../src/controllers/outingController');

const responseRecorder = () => {
  const result = { statusCode: null, body: null, headers: {} };
  result.status = (code) => {
    result.statusCode = code;
    return result;
  };
  result.json = (body) => {
    result.body = body;
    return result;
  };
  // sendPage reports the window through headers, so the recorder has to accept them.
  result.set = (headers) => {
    Object.assign(result.headers, headers);
    return result;
  };
  return result;
};

// findAll() is called twice by this handler: the list query, and signaturePresence's
// probe, which asks for `id` plus computed IS NOT NULL expressions. The probe is told
// apart by its `attributes`. These fixtures carry no signatures, so it returns nothing.
//
// Simpler to stub than the Mongoose chain it replaces — one call shape instead of a
// four-link builder — which is the same reason the controller reads more plainly now.
const stubFindAll = (rows) => async (options = {}) => {
  const isPresenceProbe = Array.isArray(options.attributes);
  return isPresenceProbe ? [] : rows;
};

const stubbed = (t, rows) => {
  const originalFindAll = OutingRequest.findAll;
  const originalCount = OutingRequest.count;
  OutingRequest.findAll = stubFindAll(rows);
  OutingRequest.count = async () => rows.length;
  t.after(() => {
    OutingRequest.findAll = originalFindAll;
    OutingRequest.count = originalCount;
  });
};

test('student outing history derives overdue while preserving the stored Out status', async (t) => {
  const dueAt = new Date(Date.now() - 60_000);
  const request = {
    id: 'outing-1',
    status: 'Out',
    inTime: dueAt,
    toJSON: () => ({ _id: 'outing-1', id: 'outing-1', status: 'Out', inTime: dueAt }),
  };

  stubbed(t, [request]);

  const req = { user: { _id: 'student-1' } };
  const res = responseRecorder();

  await getMyOutingRequests(req, res);

  assert.equal(res.statusCode, null);
  assert.equal(res.body[0].status, 'Out');
  assert.equal(res.body[0].isOverdue, true);
  // Display state only: the STORED status must still be 'Out' so the gate keeps the
  // movement lifecycle and the audit trail stays honest about what happened.
  assert.equal(request.status, 'Out');
  // The response is still a plain array, and the window is reported alongside it. A short
  // window proves there is nothing past it, so no count query should have been needed.
  assert.ok(Array.isArray(res.body));
  assert.equal(res.headers['X-Total-Count'], '1');
  assert.equal(res.headers['X-Truncated'], 'false');
});

test('student outing history does not mark a future return time overdue', async (t) => {
  const dueAt = new Date(Date.now() + 60_000);
  const request = {
    id: 'outing-2',
    status: 'Out',
    inTime: dueAt,
    toJSON: () => ({ _id: 'outing-2', id: 'outing-2', status: 'Out', inTime: dueAt }),
  };

  stubbed(t, [request]);

  const res = responseRecorder();
  await getMyOutingRequests({ user: { _id: 'student-1' } }, res);

  assert.equal(res.body[0].isOverdue, false);
});
