const express = require('express');
const router = express.Router();
const {
  getSelectableCaretakers,
  getCaretakerStats,
  getOnLeaveStudents,
  getActiveOutings,
  getHostelStudents,
} = require('../controllers/caretakerController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

// Students list the caretakers they may route a request to (same gender scope).
router.get('/selectable', protect, authorizeRoles('Student'), getSelectableCaretakers);

// Live counters for the caretaker dashboard's stats card, scoped to their hostel.
router.get('/stats', protect, authorizeRoles('Caretaker'), getCaretakerStats);

// List of students from the caretaker's hostel currently out on leave.
router.get('/on-leave', protect, authorizeRoles('Caretaker'), getOnLeaveStudents);

// List of students from the caretaker's hostel currently out on an outing.
router.get('/active-outings', protect, authorizeRoles('Caretaker'), getActiveOutings);

// List of all students residing in the caretaker's hostel with live campus status.
router.get('/students', protect, authorizeRoles('Caretaker'), getHostelStudents);

module.exports = router;
