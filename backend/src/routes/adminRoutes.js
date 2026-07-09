const express = require('express');
const router = express.Router();
const {
  getOverview,
  getUsers,
  createStaff,
  resetStaffPin,
  removeStaff,
} = require('../controllers/adminController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

router.get('/overview', protect, authorizeRoles('Admin'), getOverview);
// Guards also hit this to browse the student roster from their dashboard;
// getUsers itself pins a Guard's query to role=Student regardless of what's asked.
router.get('/users', protect, authorizeRoles('Admin', 'Guard'), getUsers);

// Admin-only staff provisioning: create Warden/Guard accounts, reset their PINs,
// and remove them. This replaces self-registration for privileged roles.
router.post('/staff', protect, authorizeRoles('Admin'), createStaff);
router.patch('/staff/:id/pin', protect, authorizeRoles('Admin'), resetStaffPin);
router.delete('/staff/:id', protect, authorizeRoles('Admin'), removeStaff);

module.exports = router;
