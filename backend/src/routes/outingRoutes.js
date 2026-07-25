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

router.get('/pending', protect, authorizeRoles('Caretaker', 'Guard'), getPendingRequests);

router.get('/overdue', protect, authorizeRoles('Caretaker', 'Guard'), getOverdueOutings);

router.get('/stream', protect, authorizeRoles('Caretaker', 'Guard'), streamOutingEvents);

router.patch('/:id/cancel', protect, authorizeRoles('Student'), cancelOutingRequest);

router.patch('/:id/status', protect, authorizeRoles('Caretaker', 'Guard'), updateRequestStatus);

module.exports = router;
