const express = require('express');
const router = express.Router();
const {
  createOutingRequest,
  getMyOutingRequests,
  getOutingSignatures,
  getAllOutingRequests,
  getPendingRequests,
  getOverdueOutings,
  updateRequestStatus,
  forwardOutingRequest,
  getForwardedRequests,
  getCaretakerRequestHistory,
  getWardenRequestHistory,
  updateWardenRequestStatus,
  cancelOutingRequest,
  streamOutingEvents
} = require('../controllers/outingController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const { createLimiter } = require('../middlewares/rateLimit');

router.route('/')
  .post(protect, authorizeRoles('Student'), createLimiter, createOutingRequest);

router.get('/myrequests', protect, authorizeRoles('Student'), getMyOutingRequests);

router.get('/all', protect, authorizeRoles('ChiefWarden'), getAllOutingRequests);

router.get('/pending', protect, authorizeRoles('Caretaker'), getPendingRequests);

router.get(
  '/overdue',
  protect,
  authorizeRoles('Admin', 'Caretaker', 'Guard', 'Warden', 'ChiefWarden'),
  getOverdueOutings
);

// Caretaker's own decision log — decided requests in their scope, whoever signed them.
router.get('/history', protect, authorizeRoles('Caretaker'), getCaretakerRequestHistory);

// Warden action queue + their own decision history.
router.get('/forwarded', protect, authorizeRoles('Warden'), getForwardedRequests);

router.get('/warden-history', protect, authorizeRoles('Warden'), getWardenRequestHistory);

// Stream also keeps the campus-wide Admin/ChiefWarden overdue views current.
router.get(
  '/stream',
  protect,
  authorizeRoles('Admin', 'Caretaker', 'Guard', 'Warden', 'ChiefWarden'),
  streamOutingEvents
);

router.patch('/:id/cancel', protect, authorizeRoles('Student'), cancelOutingRequest);

// Signature bytes for one request, kept out of every list response. The controller
// re-checks scope per row, so the role list here is only the outer fence.
router.get(
  '/:id/signatures',
  protect,
  authorizeRoles('Student', 'Caretaker', 'Warden', 'ChiefWarden', 'Admin'),
  getOutingSignatures
);

router.patch('/:id/status', protect, authorizeRoles('Caretaker'), updateRequestStatus);

// Caretaker escalates up; warden decides.
router.patch('/:id/forward', protect, authorizeRoles('Caretaker'), forwardOutingRequest);

router.patch('/:id/warden-status', protect, authorizeRoles('Warden'), updateWardenRequestStatus);

module.exports = router;
