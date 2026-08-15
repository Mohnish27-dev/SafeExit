const test = require('node:test');
const assert = require('node:assert/strict');

const OutingRequest = require('../src/models/OutingRequest');
const DelayNotice = require('../src/models/DelayNotice');
const pushService = require('../src/utils/pushService');

const loadSweepWithPushSpies = (notifyCaretakers, notifyStudent) => {
  const modulePath = require.resolve('../src/utils/overdueSweep');
  delete require.cache[modulePath];
  pushService.notifyCaretakers = notifyCaretakers;
  pushService.notifyStudent = notifyStudent;
  return { modulePath, sweep: require(modulePath) };
};

test('overdue sweep sends the student a one-time high-priority dashboard push', async (t) => {
  const originalFind = OutingRequest.find;
  const originalExists = DelayNotice.exists;
  const originalNotifyCaretakers = pushService.notifyCaretakers;
  const originalNotifyStudent = pushService.notifyStudent;
  const caretakerCalls = [];
  const studentCalls = [];
  let receivedFilter;
  let saved = false;

  const outing = {
    _id: 'outing-1',
    status: 'Out',
    inTime: new Date(Date.now() - 60_000),
    overdueNotifiedAt: null,
    studentOverdueNotifiedAt: null,
    targetCaretaker: null,
    student: {
      _id: 'student-1',
      name: 'Test Student',
      hostelName: 'Kautilya',
      gender: 'Male',
    },
    save: async () => { saved = true; },
  };

  OutingRequest.find = (filter) => {
    receivedFilter = filter;
    return {
      populate() { return this; },
      select: async () => [outing],
    };
  };
  DelayNotice.exists = async () => false;

  const { modulePath, sweep } = loadSweepWithPushSpies(
    async (...args) => { caretakerCalls.push(args); },
    async (...args) => { studentCalls.push(args); }
  );

  t.after(() => {
    OutingRequest.find = originalFind;
    DelayNotice.exists = originalExists;
    pushService.notifyCaretakers = originalNotifyCaretakers;
    pushService.notifyStudent = originalNotifyStudent;
    delete require.cache[modulePath];
  });

  await sweep.runOverdueSweep();

  assert.equal(receivedFilter.status, 'Out');
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
});

test('a filed delay suppresses the duplicate staff push but still alerts the student', async (t) => {
  const originalFind = OutingRequest.find;
  const originalExists = DelayNotice.exists;
  const originalNotifyCaretakers = pushService.notifyCaretakers;
  const originalNotifyStudent = pushService.notifyStudent;
  let caretakerCalls = 0;
  let studentCalls = 0;

  const outing = {
    _id: 'outing-2',
    status: 'Out',
    inTime: new Date(Date.now() - 60_000),
    overdueNotifiedAt: null,
    studentOverdueNotifiedAt: null,
    student: { _id: 'student-2', name: 'Student', hostelName: 'Kautilya', gender: 'Male' },
    save: async () => {},
  };

  OutingRequest.find = () => ({
    populate() { return this; },
    select: async () => [outing],
  });
  DelayNotice.exists = async () => true;

  const { modulePath, sweep } = loadSweepWithPushSpies(
    async () => { caretakerCalls += 1; },
    async () => { studentCalls += 1; }
  );

  t.after(() => {
    OutingRequest.find = originalFind;
    DelayNotice.exists = originalExists;
    pushService.notifyCaretakers = originalNotifyCaretakers;
    pushService.notifyStudent = originalNotifyStudent;
    delete require.cache[modulePath];
  });

  await sweep.runOverdueSweep();

  assert.equal(caretakerCalls, 0);
  assert.equal(studentCalls, 1);
  assert.ok(outing.overdueNotifiedAt instanceof Date);
  assert.ok(outing.studentOverdueNotifiedAt instanceof Date);
});
