const express = require('express');
const router = express.Router();
const {
  createOutingRequest,
  getMyOutingRequests,
  getPendingRequests,
  getOverdueOutings,
  updateRequestStatus,
  cancelOutingRequest,
  streamOutingEvents
} = require('../controllers/outingController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const { createLimiter } = require('../middlewares/rateLimit');

router.route('/')
  .post(protect, authorizeRoles('Student'), createLimiter, createOutingRequest);

router.get('/myrequests', protect, authorizeRoles('Student'), getMyOutingRequests);

router.get('/pending', protect, authorizeRoles('Warden', 'Guard'), getPendingRequests);

router.get('/overdue', protect, authorizeRoles('Warden', 'Guard'), getOverdueOutings);

router.get('/stream', protect, authorizeRoles('Warden', 'Guard'), streamOutingEvents);

router.patch('/:id/cancel', protect, authorizeRoles('Student'), cancelOutingRequest);

router.patch('/:id/status', protect, authorizeRoles('Warden', 'Guard'), updateRequestStatus);

module.exports = router;
