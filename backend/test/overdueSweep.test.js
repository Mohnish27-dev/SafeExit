const test = require('node:test');
const assert = require('node:assert/strict');

const { OutingRequest, DelayNotice, EmailOtp } = require('../src/models');
const pushService = require('../src/utils/pushService');

const loadSweepWithPushSpies = (notifyCaretakers, notifyStudent) => {
  const modulePath = require.resolve('../src/utils/overdueSweep');
  delete require.cache[modulePath];
  pushService.notifyCaretakers = notifyCaretakers;
  pushService.notifyStudent = notifyStudent;
  return { modulePath, sweep: require(modulePath) };
};

test('overdue sweep sends the student a one-time high-priority dashboard push', async (t) => {
  const originalFindAll = OutingRequest.findAll;
  const originalCount = DelayNotice.count;
  const originalPurge = EmailOtp.purgeExpired;
  const originalNotifyCaretakers = pushService.notifyCaretakers;
  const originalNotifyStudent = pushService.notifyStudent;
  const caretakerCalls = [];
  const studentCalls = [];
  let receivedWhere;
  let saved = false;
  let purged = false;

  const outing = {
    id: 'outing-1',
    status: 'Out',
    inTime: new Date(Date.now() - 60_000),
    overdueNotifiedAt: null,
    studentOverdueNotifiedAt: null,
    targetCaretaker: null,
    student: {
      id: 'student-1',
      name: 'Test Student',
      hostelName: 'Kautilya',
      gender: 'Male',
    },
    save: async () => { saved = true; },
  };

  OutingRequest.findAll = async ({ where }) => {
    receivedWhere = where;
    return [outing];
  };
  DelayNotice.count = async () => 0;
  EmailOtp.purgeExpired = async () => { purged = true; };

  const { modulePath, sweep } = loadSweepWithPushSpies(
    async (...args) => { caretakerCalls.push(args); },
    async (...args) => { studentCalls.push(args); }
  );

  t.after(() => {
    OutingRequest.findAll = originalFindAll;
    DelayNotice.count = originalCount;
    EmailOtp.purgeExpired = originalPurge;
    pushService.notifyCaretakers = originalNotifyCaretakers;
    pushService.notifyStudent = originalNotifyStudent;
    delete require.cache[modulePath];
  });

  await sweep.runOverdueSweep();

  assert.equal(receivedWhere.status, 'Out');
  assert.equal(caretakerCalls.length, 1);
  assert.equal(studentCalls.length, 1);
  assert.equal(studentCalls[0][0], 'student-1');
  assert.deepEqual(studentCalls[0][1], {
    title: 'Your outing is overdue',
    body: 'Your expected return time has passed. Open your dashboard to report a delay.',
    url: '/dashboard/student',
    urgency: 'high',
  });
  assert.ok(outing.overdueNotifiedAt instanceof Date);
  assert.ok(outing.studentOverdueNotifiedAt instanceof Date);
  assert.equal(saved, true);

  // The same tick now carries the expired-OTP delete that replaces MongoDB's TTL index.
  // Nothing else runs it — there is deliberately no pg_cron — so if this stops being
  // called the rows accumulate with nothing to notice.
  assert.equal(purged, true);
});

test('the OTP purge still runs when the overdue sweep itself fails', async (t) => {
  const originalFindAll = OutingRequest.findAll;
  const originalPurge = EmailOtp.purgeExpired;
  let purged = false;

  // The two jobs share a tick but not a fate: they are in separate try blocks precisely
  // so a database hiccup on one cannot silently stop the other forever.
  OutingRequest.findAll = async () => { throw new Error('simulated sweep failure'); };
  EmailOtp.purgeExpired = async () => { purged = true; };

  const { modulePath, sweep } = loadSweepWithPushSpies(async () => {}, async () => {});
  t.after(() => {
    OutingRequest.findAll = originalFindAll;
    EmailOtp.purgeExpired = originalPurge;
    delete require.cache[modulePath];
  });

  await sweep.runOverdueSweep();
  assert.equal(purged, true);
});

test('a filed delay suppresses the duplicate staff push but still alerts the student', async (t) => {
  const originalFindAll = OutingRequest.findAll;
  const originalCount = DelayNotice.count;
  const originalPurge = EmailOtp.purgeExpired;
  const originalNotifyCaretakers = pushService.notifyCaretakers;
  const originalNotifyStudent = pushService.notifyStudent;
  let caretakerCalls = 0;
  let studentCalls = 0;
  let countedWhere = null;

  const outing = {
    id: 'outing-2',
    status: 'Out',
    inTime: new Date(Date.now() - 60_000),
    overdueNotifiedAt: null,
    studentOverdueNotifiedAt: null,
    student: { id: 'student-2', name: 'Student', hostelName: 'Kautilya', gender: 'Male' },
    save: async () => {},
  };

  OutingRequest.findAll = async () => [outing];
  // DelayNotice.exists({ trip }) became a keyed count on the real outing_id foreign key,
  // so it can no longer be satisfied by a notice filed against a different kind of pass —
  // the untyped `trip` ObjectId had no way to tell them apart.
  DelayNotice.count = async ({ where }) => { countedWhere = where; return 1; };
  EmailOtp.purgeExpired = async () => {};

  const { modulePath, sweep } = loadSweepWithPushSpies(
    async () => { caretakerCalls += 1; },
    async () => { studentCalls += 1; }
  );

  t.after(() => {
    OutingRequest.findAll = originalFindAll;
    DelayNotice.count = originalCount;
    EmailOtp.purgeExpired = originalPurge;
    pushService.notifyCaretakers = originalNotifyCaretakers;
    pushService.notifyStudent = originalNotifyStudent;
    delete require.cache[modulePath];
  });

  await sweep.runOverdueSweep();

  assert.deepEqual(countedWhere, { outingId: 'outing-2' });
  assert.equal(caretakerCalls, 0);
  assert.equal(studentCalls, 1);
  assert.ok(outing.overdueNotifiedAt instanceof Date);
  assert.ok(outing.studentOverdueNotifiedAt instanceof Date);
});
