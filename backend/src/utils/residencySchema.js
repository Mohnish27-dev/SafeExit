// Boot-time guard for db/postgres/008_day_scholar.sql.
//
// The User model selects users.residency on every query, so a database without it fails
// every login and every gate scan. Adding it here, idempotently, means a deploy that forgot
// 008 still works.
//
// users_student_has_hostel is the other half: the 002 version refuses any student with no
// hostel, which is every day scholar's registration. It is replaced only when it does not
// already know about day scholars, so an up-to-date database is not re-validated under a
// table lock every boot.
const STUDENT_HAS_HOSTEL = 'users_student_has_hostel';

const ensureResidencySchema = async (sequelize) => {
  await sequelize.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS residency text NOT NULL DEFAULT 'Hostel';");

  const [rows] = await sequelize.query(
    'SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = :name',
    { replacements: { name: STUDENT_HAS_HOSTEL } }
  );
  const def = rows[0]?.def || '';
  // The gender test is part of the marker: a first draft of 008 lacked it.
  if (!def.includes('DayScholar') || !def.includes('gender IS NOT NULL')) {
    await sequelize.transaction(async (transaction) => {
      await sequelize.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_residency_check;', { transaction });
      await sequelize.query(
        "ALTER TABLE users ADD CONSTRAINT users_residency_check CHECK (residency IN ('Hostel','DayScholar'));",
        { transaction }
      );
      await sequelize.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS ${STUDENT_HAS_HOSTEL};`, { transaction });
      await sequelize.query(
        `ALTER TABLE users ADD CONSTRAINT ${STUDENT_HAS_HOSTEL} CHECK (
           role <> 'Student'
           OR (residency = 'Hostel' AND hostel_name IS NOT NULL)
           OR (residency = 'DayScholar' AND hostel_name IS NULL AND room_number IS NULL
               AND gender IS NOT NULL AND gender IN ('Male','Female'))
         );`,
        { transaction }
      );
    });
  }
};

module.exports = { ensureResidencySchema };
