const express = require('express');
const router = express.Router();
const {
  getOverview,
  getUsers,
  createStaff,
  resetStaffPin,
  updateStaffScope,
  removeStaff,
} = require('../controllers/adminController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

router.get('/overview', protect, authorizeRoles('Admin'), getOverview);
// getUsers pins a Guard's query to role=Student regardless of what's asked.
router.get('/users', protect, authorizeRoles('Admin', 'Guard'), getUsers);

router.post('/staff', protect, authorizeRoles('Admin'), createStaff);
router.patch('/staff/:id/pin', protect, authorizeRoles('Admin'), resetStaffPin);
router.patch('/staff/:id/scope', protect, authorizeRoles('Admin'), updateStaffScope);
router.delete('/staff/:id', protect, authorizeRoles('Admin'), removeStaff);

module.exports = router;
