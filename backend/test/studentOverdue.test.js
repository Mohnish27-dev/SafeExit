const test = require('node:test');
const assert = require('node:assert/strict');

const OutingRequest = require('../src/models/OutingRequest');
const { getMyOutingRequests } = require('../src/controllers/outingController');

const responseRecorder = () => {
  const result = { statusCode: null, body: null };
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

test('student outing history derives overdue while preserving the stored Out status', async (t) => {
  const originalFind = OutingRequest.find;
  const dueAt = new Date(Date.now() - 60_000);
  const request = {
    status: 'Out',
    inTime: dueAt,
    toObject: () => ({ _id: 'outing-1', status: 'Out', inTime: dueAt }),
  };

  OutingRequest.find = () => ({
    sort: async () => [request],
  });
  t.after(() => { OutingRequest.find = originalFind; });

  const req = { user: { _id: 'student-1' } };
  const res = responseRecorder();

  await getMyOutingRequests(req, res);

  assert.equal(res.statusCode, null);
  assert.equal(res.body[0].status, 'Out');
  assert.equal(res.body[0].isOverdue, true);
  assert.equal(request.status, 'Out');
});

test('student outing history does not mark a future return time overdue', async (t) => {
  const originalFind = OutingRequest.find;
  const dueAt = new Date(Date.now() + 60_000);
  const request = {
    status: 'Out',
    inTime: dueAt,
    toObject: () => ({ _id: 'outing-2', status: 'Out', inTime: dueAt }),
  };

  OutingRequest.find = () => ({
    sort: async () => [request],
  });
  t.after(() => { OutingRequest.find = originalFind; });

  const res = responseRecorder();
  await getMyOutingRequests({ user: { _id: 'student-1' } }, res);

  assert.equal(res.body[0].isOverdue, false);
});
