const { Op } = require('sequelize');
const { User } = require('../models');

const DEFAULT_CARETAKERS = [
  { hostel: 'Kadambini', id: 'KDMCTK', name: 'Kadambini Caretaker', gender: 'Female' },
  { hostel: 'Kautilya', id: 'KTCTK', name: 'Kautilya Caretaker', gender: 'Male' },
  { hostel: 'Aryabhatta', id: 'ABCTK', name: 'Aryabhatta Caretaker', gender: 'Male' },
  { hostel: 'Nagarjuna', id: 'NGCTK', name: 'Nagarjuna Caretaker', gender: 'Male' },
  { hostel: 'Sarojini', id: 'SJCTK', name: 'Sarojini Caretaker', gender: 'Female' },
];

const DEFAULT_PIN = '1234';

const ensureStaff = async ({ resetPasswords = false } = {}) => {
  let created = 0;
  let updated = 0;

  for (const ctk of DEFAULT_CARETAKERS) {
    const loginId = ctk.id.trim().toLowerCase();
    const existing = await User.findOne({
      where: {
        [Op.or]: [
          { loginId },
          { studentId: ctk.id }
        ]
      }
    });

    if (!existing) {
      await User.create({
        name: ctk.name,
        loginId,
        studentId: ctk.id,
        role: 'Caretaker',
        password: DEFAULT_PIN,
        managedHostel: ctk.hostel,
        managedGender: ctk.gender,
      });
      created++;
    } else {
      let needsSave = false;
      if (!existing.managedHostel) {
        existing.managedHostel = ctk.hostel;
        existing.managedGender = ctk.gender;
        needsSave = true;
      }
      if (resetPasswords) {
        existing.password = DEFAULT_PIN;
        needsSave = true;
      }
      if (needsSave) {
        await existing.save();
        updated++;
      }
    }
  }

  // Ensure default guard G001
  const guardLoginId = 'g001';
  const existingGuard = await User.findOne({
    where: {
      [Op.or]: [
        { loginId: guardLoginId },
        { studentId: 'G001' }
      ]
    }
  });

  if (!existingGuard) {
    await User.create({
      name: 'Main Gate Guard',
      loginId: guardLoginId,
      studentId: 'G001',
      role: 'Guard',
      password: DEFAULT_PIN,
      onDuty: true,
    });
    created++;
  } else if (resetPasswords) {
    existingGuard.password = DEFAULT_PIN;
    await existingGuard.save();
    updated++;
  }

  return { created, updated };
};

module.exports = { ensureStaff, DEFAULT_CARETAKERS, DEFAULT_PIN };
