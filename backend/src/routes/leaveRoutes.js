const express = require('express');
const router = express.Router();
const {
  createLeaveApplication,
  getMyLeaveApplications,
  getPendingLeaveApplications,
  getLeaveHistory,
  updateLeaveStatus,
  cancelLeaveApplication,
  streamLeaveEvents
} = require('../controllers/leaveController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

router.route('/')
  .post(protect, authorizeRoles('Student'), createLeaveApplication);

router.get('/myrequests', protect, authorizeRoles('Student'), getMyLeaveApplications);

router.get('/pending', protect, authorizeRoles('Warden'), getPendingLeaveApplications);

router.get('/history', protect, authorizeRoles('Warden'), getLeaveHistory);

router.get('/stream', protect, authorizeRoles('Warden'), streamLeaveEvents);

router.patch('/:id/cancel', protect, authorizeRoles('Student'), cancelLeaveApplication);

router.patch('/:id/status', protect, authorizeRoles('Warden'), updateLeaveStatus);

module.exports = router;
