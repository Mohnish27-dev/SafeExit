const express = require('express');
const router = express.Router();
const {
  getOverview,
  getUsers,
  getUserPhoto,
  getStudentCounts,
  createStaff,
  resetStaffPin,
  updateStaffScope,
  removeStaff,
} = require('../controllers/adminController');
const { getAnalytics } = require('../controllers/adminAnalyticsController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

router.get('/overview', protect, authorizeRoles('Admin'), getOverview);
router.get('/analytics', protect, authorizeRoles('Admin'), getAnalytics);
// getUsers pins a Guard's query to role=Student regardless of what's asked.
router.get('/users', protect, authorizeRoles('Admin', 'Guard'), getUsers);
// The roster no longer carries photo bytes; this serves one on demand. Same roles, and
// getUserPhoto re-checks that a Guard is only ever reading a Student.
router.get('/users/:id/photo', protect, authorizeRoles('Admin', 'Guard'), getUserPhoto);
// Index-served tallies for the security dashboard, so its 15s refresh does not have to
// page through the roster to add up three numbers.
router.get('/students/counts', protect, authorizeRoles('Admin', 'Guard'), getStudentCounts);

router.post('/staff', protect, authorizeRoles('Admin'), createStaff);
router.patch('/staff/:id/pin', protect, authorizeRoles('Admin'), resetStaffPin);
router.patch('/staff/:id/scope', protect, authorizeRoles('Admin'), updateStaffScope);
router.delete('/staff/:id', protect, authorizeRoles('Admin'), removeStaff);

module.exports = router;
