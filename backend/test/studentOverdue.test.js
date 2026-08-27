const test = require('node:test');
const assert = require('node:assert/strict');

const OutingRequest = require('../src/models/OutingRequest');
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

// find() has two shapes in this handler: the list query, chained
// .select().sort().skip().limit(), and signaturePresence's id-only probe,
// find(filter, projection).lean(). These fixtures carry no signatures, so the probe
// returns nothing. Kept in one place so a change to the chain is a one-line fix.
const stubFind = (rows) => (filter, projection) => {
  if (projection) return { lean: async () => [] };
  const chain = {
    select: () => chain,
    sort: () => chain,
    skip: () => chain,
    limit: async () => rows,
  };
  return chain;
};

test('student outing history derives overdue while preserving the stored Out status', async (t) => {
  const originalFind = OutingRequest.find;
  const dueAt = new Date(Date.now() - 60_000);
  const request = {
    status: 'Out',
    inTime: dueAt,
    toObject: () => ({ _id: 'outing-1', status: 'Out', inTime: dueAt }),
  };

  OutingRequest.find = stubFind([request]);
  t.after(() => { OutingRequest.find = originalFind; });

  const req = { user: { _id: 'student-1' } };
  const res = responseRecorder();

  await getMyOutingRequests(req, res);

  assert.equal(res.statusCode, null);
  assert.equal(res.body[0].status, 'Out');
  assert.equal(res.body[0].isOverdue, true);
  assert.equal(request.status, 'Out');
  // The response is still a plain array, and the window is reported alongside it. A short
  // window proves there is nothing past it, so no count query should have been needed.
  assert.ok(Array.isArray(res.body));
  assert.equal(res.headers['X-Total-Count'], '1');
  assert.equal(res.headers['X-Truncated'], 'false');
});

test('student outing history does not mark a future return time overdue', async (t) => {
  const originalFind = OutingRequest.find;
  const dueAt = new Date(Date.now() + 60_000);
  const request = {
    status: 'Out',
    inTime: dueAt,
    toObject: () => ({ _id: 'outing-2', status: 'Out', inTime: dueAt }),
  };

  OutingRequest.find = stubFind([request]);
  t.after(() => { OutingRequest.find = originalFind; });

  const res = responseRecorder();
  await getMyOutingRequests({ user: { _id: 'student-1' } }, res);

  assert.equal(res.body[0].isOverdue, false);
});
