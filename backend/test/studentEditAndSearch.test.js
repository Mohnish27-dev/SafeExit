const test = require('node:test');
const assert = require('node:assert/strict');

const { Op } = require('sequelize');
const { sequelize, User, UserPhoto, OutingRequest, LeaveApplication, AppSetting } = require('../src/models');
const {
  getUsers,
  updateStudent,
  getProfileWindow,
  reopenProfileWindow,
} = require('../src/controllers/adminController');
const { updateUserProfile } = require('../src/controllers/authController');
const { annualWindowStart, canEditProfile } = require('../src/utils/profileWindow');

const responseRecorder = () => {
  const result = { statusCode: 200, body: null, headers: {} };
  result.status = (code) => {
    result.statusCode = code;
    return result;
  };
  result.json = (body) => {
    result.body = body;
    return result;
  };
  result.set = (k, v) => {
    if (typeof k === 'string') result.headers[k] = v;
    else Object.assign(result.headers, k);
    return result;
  };
  return result;
};

// Confirmed timestamps relative to the window that is open right now, whatever today is.
const beforeWindow = () => new Date(annualWindowStart().getTime() - 24 * 3600 * 1000);
const insideWindow = () => new Date(annualWindowStart().getTime() + 60 * 1000);

// No admin reopen stored unless a test says otherwise: the window is the last 1 July.
const stubSettings = (t, reopenedAt = null) => {
  const orig = AppSetting.findByPk;
  AppSetting.findByPk = async () => (reopenedAt ? { value: reopenedAt.toISOString() } : null);
  t.after(() => { AppSetting.findByPk = orig; });
};

test('getUsers applies search query and filters to where clause', async (t) => {
  const origFindAll = User.findAll;
  const origPhotoFindAll = UserPhoto.findAll;
  const origCount = User.count;
  const origOutingFindAll = OutingRequest.findAll;
  const origLeaveFindAll = LeaveApplication.findAll;

  let capturedWhere = null;
  let rows = null;
  User.findAll = async (options) => {
    capturedWhere = options.where;
    rows = [{ id: 'stu-1', name: 'Rahul Kumar', role: 'Student', profileConfirmedAt: null }];
    return rows;
  };
  UserPhoto.findAll = async () => [];
  User.count = async () => 1;
  OutingRequest.findAll = async () => [];
  LeaveApplication.findAll = async () => [];
  stubSettings(t);

  t.after(() => {
    User.findAll = origFindAll;
    UserPhoto.findAll = origPhotoFindAll;
    User.count = origCount;
    OutingRequest.findAll = origOutingFindAll;
    LeaveApplication.findAll = origLeaveFindAll;
  });

  const req = {
    user: { role: 'Admin' },
    query: {
      role: 'Student',
      search: 'Rahul',
      hostelName: 'Kautilya',
      year: '3rd Year',
      department: 'CSE',
      campusStatus: 'Inside',
      profileUnlocked: 'true',
    },
  };
  const res = responseRecorder();

  await getUsers(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(capturedWhere.role, 'Student');
  assert.ok(capturedWhere.hostelName);
  assert.ok(capturedWhere.year);
  assert.ok(capturedWhere.department);
  assert.equal(capturedWhere.campusStatus, 'Inside');
  // Derived filter: never confirmed, or confirmed before the window opened.
  const unlockedClause = capturedWhere[Op.and].find((c) => c.role === 'Student' && c[Op.or]);
  assert.ok(unlockedClause, 'profileUnlocked=true should filter on profileConfirmedAt');
  assert.equal(rows[0].profileUnlocked, true);
});

test('getUsers never computes profile state for a guard', async (t) => {
  const origFindAll = User.findAll;
  const origPhotoFindAll = UserPhoto.findAll;
  const origCount = User.count;
  const origOutingFindAll = OutingRequest.findAll;
  const origLeaveFindAll = LeaveApplication.findAll;
  const origSettings = AppSetting.findByPk;
  let settingsRead = false;
  let rows = null;
  User.findAll = async () => { rows = [{ id: 'stu-1', name: 'A' }]; return rows; };
  UserPhoto.findAll = async () => [];
  User.count = async () => 1;
  OutingRequest.findAll = async () => [];
  LeaveApplication.findAll = async () => [];
  AppSetting.findByPk = async () => { settingsRead = true; return null; };
  t.after(() => {
    User.findAll = origFindAll;
    UserPhoto.findAll = origPhotoFindAll;
    User.count = origCount;
    OutingRequest.findAll = origOutingFindAll;
    LeaveApplication.findAll = origLeaveFindAll;
    AppSetting.findByPk = origSettings;
  });

  const res = responseRecorder();
  await getUsers({ user: { role: 'Guard' }, query: { profileUnlocked: 'true' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(settingsRead, false);
  assert.equal('profileUnlocked' in rows[0], false);
});

test('updateStudent allows admin to update student details', async (t) => {
  const origFindByPk = User.findByPk;
  const origFindOne = User.findOne;

  const mockStudent = {
    id: 'stu-123',
    role: 'Student',
    name: 'Old Name',
    studentId: '220101',
    loginId: '220101',
    department: 'ME',
    year: '2nd Year',
    roomNumber: '101',
    hostelName: 'Kautilya',
    gender: 'Male',
    phoneNumber: '9876543210',
    guardianPhoneNumber: '9876543211',
    email: 'old@nitp.ac.in',
    profileConfirmedAt: insideWindow(),
    save: async () => {},
  };

  User.findByPk = async () => mockStudent;
  User.findOne = async () => null; // No collision
  stubSettings(t);

  t.after(() => {
    User.findByPk = origFindByPk;
    User.findOne = origFindOne;
  });

  const req = {
    params: { id: 'stu-123' },
    body: {
      name: 'New Name',
      studentId: '220199',
      department: 'ECE',
      year: '3rd Year',
      roomNumber: '202',
      hostelName: 'Aryabhatta',
      phoneNumber: '9123456780',
      guardianPhoneNumber: '9123456789',
      // No longer an admin control: ignored, and the student stays locked.
      profileUnlocked: true,
    },
  };
  const res = responseRecorder();

  await updateStudent(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(mockStudent.name, 'New Name');
  assert.equal(mockStudent.studentId, '220199');
  assert.equal(mockStudent.year, '3rd Year');
  assert.equal(mockStudent.hostelName, 'Aryabhatta');
  assert.equal(res.body.student.profileUnlocked, false);
});

test('updateUserProfile blocks editing protected fields when profile is locked', async (t) => {
  const origFindByPk = User.findByPk;

  const mockStudent = {
    id: 'stu-123',
    role: 'Student',
    name: 'Asha',
    hostelName: 'Kadambini',
    profileConfirmedAt: insideWindow(),
    save: async () => {},
  };

  User.findByPk = async () => mockStudent;
  stubSettings(t);

  t.after(() => {
    User.findByPk = origFindByPk;
  });

  const req = {
    user: { _id: 'stu-123' },
    body: {
      year: '4th Year',
    },
  };
  const res = responseRecorder();

  await updateUserProfile(req, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /Profile editing is locked/i);
});

test('updateUserProfile allows editing in the window and locks on submit', async (t) => {
  const origFindByPk = User.findByPk;
  const origTx = sequelize.transaction;

  const mockStudent = {
    id: 'stu-123',
    role: 'Student',
    name: 'Asha',
    hostelName: 'Kadambini',
    year: '3rd Year',
    roomNumber: '101',
    profileConfirmedAt: beforeWindow(),
    save: async () => {},
    closeContacts: [],
  };

  User.findByPk = async () => mockStudent;
  sequelize.transaction = async (cb) => cb({});
  stubSettings(t);

  t.after(() => {
    User.findByPk = origFindByPk;
    sequelize.transaction = origTx;
  });

  const req = {
    user: { _id: 'stu-123' },
    body: {
      year: '4th Year',
      roomNumber: '205',
    },
  };
  const res = responseRecorder();

  await updateUserProfile(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(mockStudent.year, '4th Year');
  assert.equal(mockStudent.roomNumber, '205');
  assert.ok(mockStudent.profileConfirmedAt > annualWindowStart()); // Locked until next 1 July
  assert.equal(res.body.profileUnlocked, false);
});

test('updateUserProfile rejects an unlocked student picking an opposite-gender hostel', async (t) => {
  const origFindByPk = User.findByPk;

  const mockStudent = {
    id: 'stu-123',
    role: 'Student',
    name: 'Asha',
    gender: 'Female',
    hostelName: 'Kadambini',
    profileConfirmedAt: null,
    save: async () => {},
  };

  User.findByPk = async () => mockStudent;
  stubSettings(t);

  t.after(() => {
    User.findByPk = origFindByPk;
  });

  const req = { user: { _id: 'stu-123' }, body: { hostelName: 'Kautilya', year: '2nd' } };
  const res = responseRecorder();

  await updateUserProfile(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(mockStudent.gender, 'Female');
  assert.equal(mockStudent.hostelName, 'Kadambini');
});

test('annualWindowStart is 1 July 00:00 IST, and the day before belongs to last year', () => {
  // 30 June 23:59 IST
  assert.equal(
    annualWindowStart(new Date('2027-06-30T23:59:00+05:30')).toISOString(),
    new Date('2026-07-01T00:00:00+05:30').toISOString()
  );
  // 1 July 00:00 IST exactly — still 30 June in UTC
  assert.equal(
    annualWindowStart(new Date('2027-07-01T00:00:00+05:30')).toISOString(),
    new Date('2027-07-01T00:00:00+05:30').toISOString()
  );
  assert.equal(
    annualWindowStart(new Date('2027-01-15T12:00:00+05:30')).toISOString(),
    new Date('2026-07-01T00:00:00+05:30').toISOString()
  );
});

test('canEditProfile: never-confirmed and last-year students are open, staff never are', () => {
  const start = new Date('2026-07-01T00:00:00+05:30');
  assert.equal(canEditProfile({ role: 'Student', profileConfirmedAt: null }, start), true);
  assert.equal(canEditProfile({ role: 'Student', profileConfirmedAt: new Date('2026-06-20') }, start), true);
  assert.equal(canEditProfile({ role: 'Student', profileConfirmedAt: new Date('2026-08-01') }, start), false);
  assert.equal(canEditProfile({ role: 'Admin', profileConfirmedAt: null }, start), false);
  assert.equal(canEditProfile({ role: 'Caretaker', profileConfirmedAt: null }, start), false);
});

test('an admin reopen after 1 July unlocks students who already confirmed this year', async (t) => {
  const origFindByPk = User.findByPk;
  const origTx = sequelize.transaction;
  const confirmed = insideWindow();
  const mockStudent = {
    id: 'stu-9', role: 'Student', gender: 'Male', hostelName: 'Kautilya', year: '2nd',
    profileConfirmedAt: confirmed, save: async () => {}, closeContacts: [],
  };
  User.findByPk = async () => mockStudent;
  sequelize.transaction = async (cb) => cb({});
  stubSettings(t, new Date(confirmed.getTime() + 60 * 1000));
  t.after(() => { User.findByPk = origFindByPk; sequelize.transaction = origTx; });

  const res = responseRecorder();
  await updateUserProfile({ user: { _id: 'stu-9' }, body: { year: '3rd', roomNumber: 'B-12' } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(mockStudent.year, '3rd');
});

test('a window edit without a year is refused and does not lock the student', async (t) => {
  const origFindByPk = User.findByPk;
  const mockStudent = {
    id: 'stu-5', role: 'Student', hostelName: 'Kautilya', year: '2nd',
    profileConfirmedAt: beforeWindow(), save: async () => {},
  };
  User.findByPk = async () => mockStudent;
  stubSettings(t);
  t.after(() => { User.findByPk = origFindByPk; });

  const res = responseRecorder();
  await updateUserProfile({ user: { _id: 'stu-5' }, body: { roomNumber: '101' } }, res);

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /academic year/i);
  assert.ok(mockStudent.profileConfirmedAt < annualWindowStart());
});

test('a hostel change is refused while the student has a live pass', async (t) => {
  const origFindByPk = User.findByPk;
  const origOutingCount = OutingRequest.count;
  const origLeaveCount = LeaveApplication.count;
  const mockStudent = {
    id: 'stu-7', role: 'Student', gender: 'Male', hostelName: 'Kautilya', year: '2nd',
    profileConfirmedAt: beforeWindow(), save: async () => {},
  };
  let countedWhere = null;
  User.findByPk = async () => mockStudent;
  OutingRequest.count = async ({ where }) => { countedWhere = where; return 1; };
  LeaveApplication.count = async () => 0;
  stubSettings(t);
  t.after(() => {
    User.findByPk = origFindByPk;
    OutingRequest.count = origOutingCount;
    LeaveApplication.count = origLeaveCount;
  });

  const res = responseRecorder();
  await updateUserProfile(
    { user: { _id: 'stu-7' }, body: { hostelName: 'Aryabhatta', year: '3rd' } },
    res
  );

  assert.equal(res.statusCode, 409);
  assert.equal(countedWhere.studentId, 'stu-7');
  assert.equal(mockStudent.hostelName, 'Kautilya');
  assert.ok(mockStudent.profileConfirmedAt < annualWindowStart(), 'a refused edit must not lock');
});

test('keeping the same hostel with a live pass is not a hostel change', async (t) => {
  const origFindByPk = User.findByPk;
  const origTx = sequelize.transaction;
  const origOutingCount = OutingRequest.count;
  let counted = false;
  const mockStudent = {
    id: 'stu-8', role: 'Student', gender: 'Male', hostelName: 'Kautilya', year: '2nd',
    profileConfirmedAt: beforeWindow(), save: async () => {}, closeContacts: [],
  };
  User.findByPk = async () => mockStudent;
  sequelize.transaction = async (cb) => cb({});
  OutingRequest.count = async () => { counted = true; return 1; };
  stubSettings(t);
  t.after(() => {
    User.findByPk = origFindByPk;
    sequelize.transaction = origTx;
    OutingRequest.count = origOutingCount;
  });

  const res = responseRecorder();
  await updateUserProfile(
    { user: { _id: 'stu-8' }, body: { hostelName: 'Kautilya', year: '3rd', roomNumber: '12' } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(counted, false);
});

test('getProfileWindow reports the annual window and who has not confirmed', async (t) => {
  const origCount = User.count;
  User.count = async ({ where }) => (where[Op.or] ? 12 : 160);
  stubSettings(t);
  t.after(() => { User.count = origCount; });

  const res = responseRecorder();
  await getProfileWindow({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.openedBy, 'annual');
  assert.equal(res.body.windowStart.toISOString(), annualWindowStart().toISOString());
  assert.equal(res.body.totalStudents, 160);
  assert.equal(res.body.pendingStudents, 12);
});

test('reopenProfileWindow stores one timestamp instead of touching students', async (t) => {
  const origUpsert = AppSetting.upsert;
  const origCount = User.count;
  const origUpdate = User.update;
  let stored = null;
  let bulkUpdated = false;
  AppSetting.upsert = async (row) => { stored = row; };
  User.count = async () => 160;
  User.update = async () => { bulkUpdated = true; return [0]; };
  t.after(() => { AppSetting.upsert = origUpsert; User.count = origCount; User.update = origUpdate; });

  const res = responseRecorder();
  await reopenProfileWindow({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(stored.key, 'profile_window_reopened_at');
  assert.ok(!Number.isNaN(new Date(stored.value).getTime()));
  assert.equal(bulkUpdated, false);
});
