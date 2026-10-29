require('dotenv').config();
const { connectPostgres, closePostgres } = require('../src/config/sequelize');
const { User, LeaveApplication, OutingRequest } = require('../src/models');
const { Op } = require('sequelize');

const KADAMBINI_STUDENTS = [
  { name: 'Gungun Wadhwani', roll: '2406084', email: 'gungunw.ug24.cs@nitp.ac.in', room: '513', dept: 'Computer Science', year: '3rd', phone: '8770958514', guardian: '8839526488' },
  { name: 'Gyani Kumari', roll: '2406085', email: 'gyanik.ug24.cs@nitp.ac.in', room: '513', dept: 'Computer Science', year: '3rd', phone: '7352537552', guardian: '9431201948' },
  { name: 'Ananya Sharma', roll: '2406012', email: 'ananyas.ug24.ec@nitp.ac.in', room: '204', dept: 'Electronics & Comm.', year: '2nd', phone: '9876543211', guardian: '9876543210' },
  { name: 'Priya Patel', roll: '2406023', email: 'priyap.ug24.ee@nitp.ac.in', room: '208', dept: 'Electrical Engg', year: '2nd', phone: '9823456781', guardian: '9823456780' },
  { name: 'Riya Singh', roll: '2406034', email: 'riyas.ug24.cs@nitp.ac.in', room: '312', dept: 'Computer Science', year: '3rd', phone: '9712345671', guardian: '9712345670' },
  { name: 'Sneha Verma', roll: '2406045', email: 'snehav.ug24.ce@nitp.ac.in', room: '315', dept: 'Civil Engg', year: '3rd', phone: '9612345671', guardian: '9612345670' },
  { name: 'Kavya Mishra', roll: '2406056', email: 'kavyam.ug24.me@nitp.ac.in', room: '401', dept: 'Mechanical Engg', year: '4th', phone: '9512345671', guardian: '9512345670' },
  { name: 'Isha Gupta', roll: '2406067', email: 'ishag.ug24.cs@nitp.ac.in', room: '405', dept: 'Computer Science', year: '4th', phone: '9412345671', guardian: '9412345670' },
  { name: 'Aarohi Sen', roll: '2406078', email: 'aarohis.ug24.ec@nitp.ac.in', room: '410', dept: 'Electronics & Comm.', year: '1st', phone: '9312345671', guardian: '9312345670' },
  { name: 'Tanvi Jha', roll: '2406089', email: 'tanvij.ug24.ee@nitp.ac.in', room: '102', dept: 'Electrical Engg', year: '1st', phone: '9212345671', guardian: '9212345670' },
  { name: 'Divya Nair', roll: '2406090', email: 'divyan.ug24.cs@nitp.ac.in', room: '108', dept: 'Computer Science', year: '2nd', phone: '9112345671', guardian: '9112345670' },
  { name: 'Megha Roy', roll: '2406101', email: 'meghar.ug24.ar@nitp.ac.in', room: '215', dept: 'Architecture', year: '3rd', phone: '9012345671', guardian: '9012345670' },
  { name: 'Shreya Tiwari', roll: '2406112', email: 'shreyat.ug24.cs@nitp.ac.in', room: '320', dept: 'Computer Science', year: '2nd', phone: '8912345671', guardian: '8912345670' },
  { name: 'Aditi Sinha', roll: '2406123', email: 'aditis.ug24.ec@nitp.ac.in', room: '325', dept: 'Electronics & Comm.', year: '3rd', phone: '8812345671', guardian: '8812345670' },
  { name: 'Sakshi Kumari', roll: '2406134', email: 'sakshik.ug24.me@nitp.ac.in', room: '502', dept: 'Mechanical Engg', year: '4th', phone: '8712345671', guardian: '8712345670' },
  { name: 'Nisha Choudhary', roll: '2406145', email: 'nishac.ug24.ee@nitp.ac.in', room: '508', dept: 'Electrical Engg', year: '2nd', phone: '8612345671', guardian: '8612345670' },
  { name: 'Ankita Das', roll: '2406156', email: 'ankitad.ug24.cs@nitp.ac.in', room: '511', dept: 'Computer Science', year: '3rd', phone: '8512345671', guardian: '8512345670' },
  { name: 'Pooja Rani', roll: '2406167', email: 'poojar.ug24.ce@nitp.ac.in', room: '202', dept: 'Civil Engg', year: '1st', phone: '8412345671', guardian: '8412345670' },
  { name: 'Bhavna Pandey', roll: '2406178', email: 'bhavnap.ug24.ec@nitp.ac.in', room: '210', dept: 'Electronics & Comm.', year: '2nd', phone: '8312345671', guardian: '8312345670' },
  { name: 'Kriti Aggarwal', roll: '2406189', email: 'kritia.ug24.cs@nitp.ac.in', room: '304', dept: 'Computer Science', year: '3rd', phone: '8212345671', guardian: '8212345670' },
];

const run = async () => {
  await connectPostgres();
  let created = 0;
  let updated = 0;

  for (const s of KADAMBINI_STUDENTS) {
    const existing = await User.findOne({
      where: {
        [Op.or]: [{ email: s.email }, { studentId: s.roll }, { loginId: s.email }]
      }
    });

    if (!existing) {
      await User.create({
        name: s.name,
        email: s.email,
        loginId: s.email,
        studentId: s.roll,
        role: 'Student',
        gender: 'Female',
        hostelName: 'Kadambini',
        roomNumber: s.room,
        department: s.dept,
        year: s.year,
        phoneNumber: s.phone,
        guardianPhoneNumber: s.guardian,
        residency: 'Hostel',
        campusStatus: 'Inside',
        password: 'password123',
      });
      created++;
    } else {
      existing.hostelName = 'Kadambini';
      existing.gender = 'Female';
      existing.residency = 'Hostel';
      await existing.save();
      updated++;
    }
  }

  // Also create a sample active leave for demonstration so caretaker can see a live leave in the roster
  const sampleStudentOnLeave = await User.findOne({ where: { studentId: '2406023' } }); // Priya Patel
  if (sampleStudentOnLeave) {
    const existingLeave = await LeaveApplication.findOne({
      where: { studentId: sampleStudentOnLeave.id, status: 'Out' }
    });
    if (!existingLeave) {
      await LeaveApplication.create({
        studentId: sampleStudentOnLeave.id,
        destination: 'Varanasi, UP',
        reason: 'Sister Wedding Ceremony',
        leaveDate: new Date(Date.now() - 24 * 3600 * 1000), // departed yesterday
        returnDate: new Date(Date.now() + 4 * 24 * 3600 * 1000), // returning in 4 days
        parentPhone: sampleStudentOnLeave.guardianPhoneNumber,
        expectedDepartureTime: '10:00',
        status: 'Out',
        decision: 'Approved',
        decidedAt: new Date(Date.now() - 36 * 3600 * 1000),
        decidedByRole: 'Caretaker',
      });
      sampleStudentOnLeave.campusStatus = 'Outside';
      await sampleStudentOnLeave.save();
      console.log('Placed Priya Patel (2406023) on sample active leave to demonstrate the live roster');
    }
  }

  // Also place 1 student on outing
  const sampleStudentOnOuting = await User.findOne({ where: { studentId: '2406034' } }); // Riya Singh
  if (sampleStudentOnOuting) {
    const existingOuting = await OutingRequest.findOne({
      where: { studentId: sampleStudentOnOuting.id, status: 'Out' }
    });
    if (!existingOuting) {
      const outTime = new Date();
      const inTime = new Date(outTime);
      inTime.setHours(20, 30, 0, 0); // 8:30 PM IST curfew
      if (inTime.getTime() <= outTime.getTime()) {
        inTime.setTime(outTime.getTime() + 6 * 3600 * 1000);
      }
      await OutingRequest.create({
        studentId: sampleStudentOnOuting.id,
        destination: 'Boring Road Market',
        purpose: 'Books and stationery purchase',
        outingType: 'Market',
        outTime,
        actualOutTime: outTime,
        inTime,
        status: 'Out',
        autoApproved: true,
      });
      sampleStudentOnOuting.campusStatus = 'Outside';
      await sampleStudentOnOuting.save();
      console.log('Placed Riya Singh (2406034) on sample outing');
    }
  }

  await closePostgres();
  console.log(`Kadambini students seed complete: ${created} created, ${updated} updated.`);
  process.exit(0);
};

run().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
