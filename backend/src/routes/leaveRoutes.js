const express = require('express');
const router = express.Router();
const { uuidParam } = require('../middlewares/validateParams');

// Rejects a malformed :id before any handler runs, so a non-uuid cannot reach a query
// and turn into a 500. See middlewares/validateParams.js.
router.param('id', uuidParam);
const {
  createLeaveApplication,
  getMyLeaveApplications,
  getLeaveSignatures,
  getLeaveTicket,
  getAllLeaveApplications,
  getPendingLeaveApplications,
  getAutoApprovedLeaves,
  getLeaveHistory,
  decideLeaveApplication,
  revokeLeaveApplication,
  cancelLeaveApplication,
  streamLeaveEvents,
  DECIDER_ROLES,
} = require('../controllers/leaveController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const { createLimiter } = require('../middlewares/rateLimit');

router.route('/')
  .post(protect, authorizeRoles('Student'), createLimiter, createLeaveApplication);

router.get('/myrequests', protect, authorizeRoles('Student'), getMyLeaveApplications);

router.get('/all', protect, authorizeRoles('ChiefWarden', 'Admin'), getAllLeaveApplications);

// Girls' open applications: the same row sits in the caretaker's, the hostel wardens' and
// the chief warden's queue at once, and whoever acts first decides it.
router.get('/pending', protect, authorizeRoles(...DECIDER_ROLES), getPendingLeaveApplications);

router.get('/history', protect, authorizeRoles(...DECIDER_ROLES), getLeaveHistory);

// Boys' leave, approved on submit; admins see it too.
router.get('/auto-approved', protect, authorizeRoles(...DECIDER_ROLES, 'Admin'), getAutoApprovedLeaves);

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

// The optional ticket; same per-row scope as the signatures.
router.get(
  '/:id/ticket',
  protect,
  authorizeRoles('Student', 'Caretaker', 'Warden', 'ChiefWarden', 'Admin'),
  getLeaveTicket
);

router.patch('/:id/status', protect, authorizeRoles(...DECIDER_ROLES), decideLeaveApplication);

router.patch('/:id/revoke', protect, authorizeRoles(...DECIDER_ROLES), revokeLeaveApplication);

module.exports = router;
