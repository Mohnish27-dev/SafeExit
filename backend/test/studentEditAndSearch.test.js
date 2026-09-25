const test = require('node:test');
const assert = require('node:assert/strict');

const { sequelize, User, UserPhoto, OutingRequest, LeaveApplication } = require('../src/models');
const {
  getUsers,
  updateStudent,
  toggleStudentProfileUnlock,
  batchPromoteStudents,
} = require('../src/controllers/adminController');
const { updateUserProfile } = require('../src/controllers/authController');

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

test('getUsers applies search query and filters to where clause', async (t) => {
  const origFindAll = User.findAll;
  const origPhotoFindAll = UserPhoto.findAll;
  const origCount = User.count;
  const origOutingFindAll = OutingRequest.findAll;
  const origLeaveFindAll = LeaveApplication.findAll;

  let capturedWhere = null;
  User.findAll = async (options) => {
    capturedWhere = options.where;
    return [{ id: 'stu-1', name: 'Rahul Kumar', role: 'Student' }];
  };
  UserPhoto.findAll = async () => [];
  User.count = async () => 1;
  OutingRequest.findAll = async () => [];
  LeaveApplication.findAll = async () => [];

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
  assert.equal(capturedWhere.profileUnlocked, true);
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
    profileUnlocked: false,
    save: async () => {},
  };

  User.findByPk = async () => mockStudent;
  User.findOne = async () => null; // No collision

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
  assert.equal(mockStudent.profileUnlocked, true);
});

test('toggleStudentProfileUnlock toggles profileUnlocked state', async (t) => {
  const origFindByPk = User.findByPk;

  const mockStudent = {
    id: 'stu-123',
    name: 'Asha',
    role: 'Student',
    profileUnlocked: false,
    save: async () => {},
  };

  User.findByPk = async () => mockStudent;

  t.after(() => {
    User.findByPk = origFindByPk;
  });

  const req = {
    params: { id: 'stu-123' },
    body: { unlocked: true },
  };
  const res = responseRecorder();

  await toggleStudentProfileUnlock(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(mockStudent.profileUnlocked, true);
});

test('batchPromoteStudents promotes all matching student rows', async (t) => {
  const origUpdate = User.update;

  let updateArgs = null;
  User.update = async (values, options) => {
    updateArgs = { values, options };
    return [42]; // 42 rows updated
  };

  t.after(() => {
    User.update = origUpdate;
  });

  const req = {
    body: {
      fromYear: '3rd Year',
      toYear: '4th Year',
      hostelName: 'Kautilya',
    },
  };
  const res = responseRecorder();

  await batchPromoteStudents(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.count, 42);
  assert.equal(updateArgs.values.year, '4th Year');
  assert.ok(updateArgs.options.where.year);
});

test('updateUserProfile blocks editing protected fields when profile is locked', async (t) => {
  const origFindByPk = User.findByPk;

  const mockStudent = {
    id: 'stu-123',
    role: 'Student',
    name: 'Asha',
    hostelName: 'Kadambini',
    profileUnlocked: false,
    save: async () => {},
  };

  User.findByPk = async () => mockStudent;

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

test('updateUserProfile allows editing and auto-locks when profile was unlocked', async (t) => {
  const origFindByPk = User.findByPk;
  const origTx = sequelize.transaction;

  const mockStudent = {
    id: 'stu-123',
    role: 'Student',
    name: 'Asha',
    hostelName: 'Kadambini',
    year: '3rd Year',
    roomNumber: '101',
    profileUnlocked: true,
    save: async () => {},
    closeContacts: [],
  };

  User.findByPk = async () => mockStudent;
  sequelize.transaction = async (cb) => cb({});

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
  assert.equal(mockStudent.profileUnlocked, false); // Auto-locked on submit
});

test('updateUserProfile rejects an unlocked student picking an opposite-gender hostel', async (t) => {
  const origFindByPk = User.findByPk;

  const mockStudent = {
    id: 'stu-123',
    role: 'Student',
    name: 'Asha',
    gender: 'Female',
    hostelName: 'Kadambini',
    profileUnlocked: true,
    save: async () => {},
  };

  User.findByPk = async () => mockStudent;

  t.after(() => {
    User.findByPk = origFindByPk;
  });

  const req = { user: { _id: 'stu-123' }, body: { hostelName: 'Kautilya' } };
  const res = responseRecorder();

  await updateUserProfile(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(mockStudent.gender, 'Female');
  assert.equal(mockStudent.hostelName, 'Kadambini');
});

test('batchPromoteStudents rejects an unknown hostel instead of matching hostel-less rows', async (t) => {
  const origUpdate = User.update;
  let called = false;
  User.update = async () => { called = true; return [0]; };
  t.after(() => { User.update = origUpdate; });

  const res = responseRecorder();
  await batchPromoteStudents({ body: { fromYear: '3rd', toYear: '4th', hostelName: 'Nowhere' } }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(called, false);
});
