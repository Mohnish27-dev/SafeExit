const express = require('express');
const router = express.Router();
const { uuidParam } = require('../middlewares/validateParams');

// Rejects a malformed :id before any handler runs, so a non-uuid cannot reach a query
// and turn into a 500. See middlewares/validateParams.js.
router.param('id', uuidParam);
const {
  createOutingRequest,
  getMyOutingRequests,
  getOutingSignatures,
  getAllOutingRequests,
  getOverdueOutings,
  getCaretakerRequestHistory,
  getWardenRequestHistory,
  cancelOutingRequest,
  streamOutingEvents
} = require('../controllers/outingController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

// Retired: the gate's exit scan creates the outing. Answers 410 with what to do instead.
router.post('/', protect, authorizeRoles('Student'), createOutingRequest);

router.get('/myrequests', protect, authorizeRoles('Student'), getMyOutingRequests);

router.get('/all', protect, authorizeRoles('ChiefWarden'), getAllOutingRequests);

router.get(
  '/overdue',
  protect,
  authorizeRoles('Admin', 'Caretaker', 'Guard', 'Warden', 'ChiefWarden'),
  getOverdueOutings
);

// Outings decided under the old request flow, kept readable as history.
router.get('/history', protect, authorizeRoles('Caretaker'), getCaretakerRequestHistory);

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

module.exports = router;
