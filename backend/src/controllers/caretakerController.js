const { Op } = require('sequelize');
const { User } = require('../models');
const { genderForHostel } = require('../config/hostels');
const { ciEquals } = require('../utils/ciCompare');

// GET /api/caretaker/selectable — private (Student)
// Lists the caretakers a student may route a request to: every assigned caretaker whose
// managed gender matches the student's own gender (the boys<->girls fence). The
// student's own-hostel caretaker is flagged isDefault so the client can pre-select it.
// The gender boundary is enforced here on the server — the client list is convenience only.
const getSelectableCaretakers = async (req, res) => {
  try {
    const gender = req.user.gender || genderForHostel(req.user.hostelName);
    if (!gender) {
      return res.json([]);
    }

    const caretakers = await User.findAll({
      where: { role: 'Caretaker', managedGender: gender },
      attributes: ['id', 'name', 'managedHostel'],
      order: [['managedHostel', 'ASC']],
      raw: true,
    });

    const ownHostel = String(req.user.hostelName || '').trim().toLowerCase();
    const list = caretakers.map((w) => ({
      // The response key stays `_id`: the student's caretaker picker sends this value
      // straight back as targetCaretaker.
      _id: w.id,
      name: w.name,
      hostel: w.managedHostel,
      isDefault: String(w.managedHostel || '').trim().toLowerCase() === ownHostel,
    }));

    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/caretaker/stats — private (Caretaker)
// Live occupancy for the dashboard's "Live Stats" card. The caretaker receives only the
// number of students currently out from their assigned hostel — never student identities.
// Residence (hostelName), rather than request routing, is the scope boundary.
const getCaretakerStats = async (req, res) => {
  try {
    const managedHostel = String(req.user.managedHostel || '').trim();
    if (!managedHostel) return res.json({ outNow: 0 });

    // Gate scans maintain campusStatus atomically, making it the live occupancy source.
    // Include Overdue for older records even though overdue is normally derived at read time.
    // ciEquals replaces .collation({locale:'en',strength:2}) and matches the shape of the
    // users_role_hostel_ci functional index.
    const outNow = await User.count({
      where: {
        role: 'Student',
        campusStatus: { [Op.in]: ['Outside', 'Overdue'] },
        [Op.and]: [ciEquals('hostel_name', managedHostel)],
      },
    });

    res.json({ outNow });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { getSelectableCaretakers, getCaretakerStats };

