const express = require('express');
const router = express.Router();
const {
  createLeaveApplication,
  getMyLeaveApplications,
  getLeaveSignatures,
  getAllLeaveApplications,
  getPendingLeaveApplications,
  getLeaveHistory,
  updateLeaveStatus,
  forwardLeaveApplication,
  getForwardedLeaveApplications,
  getWardenLeaveHistory,
  updateWardenLeaveStatus,
  cancelLeaveApplication,
  streamLeaveEvents
} = require('../controllers/leaveController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const { createLimiter } = require('../middlewares/rateLimit');

router.route('/')
  .post(protect, authorizeRoles('Student'), createLimiter, createLeaveApplication);

router.get('/myrequests', protect, authorizeRoles('Student'), getMyLeaveApplications);

router.get('/all', protect, authorizeRoles('ChiefWarden'), getAllLeaveApplications);

router.get('/pending', protect, authorizeRoles('Caretaker'), getPendingLeaveApplications);

router.get('/history', protect, authorizeRoles('Caretaker'), getLeaveHistory);

// Warden action queue + their own decision history.
router.get('/forwarded', protect, authorizeRoles('Warden'), getForwardedLeaveApplications);

router.get('/warden-history', protect, authorizeRoles('Warden'), getWardenLeaveHistory);

// Stream is shared by both staff dashboards (caretaker + warden).
router.get('/stream', protect, authorizeRoles('Caretaker', 'Warden'), streamLeaveEvents);

router.patch('/:id/cancel', protect, authorizeRoles('Student'), cancelLeaveApplication);

// Signature bytes for one application; the controller re-checks scope per row.
router.get(
  '/:id/signatures',
  protect,
  authorizeRoles('Student', 'Caretaker', 'Warden', 'ChiefWarden', 'Admin'),
  getLeaveSignatures
);

router.patch('/:id/status', protect, authorizeRoles('Caretaker'), updateLeaveStatus);

// Caretaker escalates up; warden decides.
router.patch('/:id/forward', protect, authorizeRoles('Caretaker'), forwardLeaveApplication);

router.patch('/:id/warden-status', protect, authorizeRoles('Warden'), updateWardenLeaveStatus);

module.exports = router;
