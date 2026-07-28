const express = require('express');
const router = express.Router();
const {
  createOutingRequest,
  getMyOutingRequests,
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

router.get('/pending', protect, authorizeRoles('Caretaker', 'Guard'), getPendingRequests);

router.get('/overdue', protect, authorizeRoles('Caretaker', 'Guard'), getOverdueOutings);

// Caretaker's own decision log — decided requests in their scope, whoever signed them.
router.get('/history', protect, authorizeRoles('Caretaker'), getCaretakerRequestHistory);

// Warden action queue + their own decision history.
router.get('/forwarded', protect, authorizeRoles('Warden'), getForwardedRequests);

router.get('/warden-history', protect, authorizeRoles('Warden'), getWardenRequestHistory);

// Stream is shared by caretaker, guard and warden dashboards.
router.get('/stream', protect, authorizeRoles('Caretaker', 'Guard', 'Warden'), streamOutingEvents);

router.patch('/:id/cancel', protect, authorizeRoles('Student'), cancelOutingRequest);

router.patch('/:id/status', protect, authorizeRoles('Caretaker', 'Guard'), updateRequestStatus);

// Caretaker escalates up; warden decides.
router.patch('/:id/forward', protect, authorizeRoles('Caretaker'), forwardOutingRequest);

router.patch('/:id/warden-status', protect, authorizeRoles('Warden'), updateWardenRequestStatus);

module.exports = router;
