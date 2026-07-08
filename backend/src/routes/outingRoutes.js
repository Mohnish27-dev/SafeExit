const express = require('express');
const router = express.Router();
const {
  createOutingRequest,
  getMyOutingRequests,
  getPendingRequests,
  updateRequestStatus,
  streamOutingEvents
} = require('../controllers/outingController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

router.route('/')
  .post(protect, authorizeRoles('Student'), createOutingRequest);

router.get('/myrequests', protect, authorizeRoles('Student'), getMyOutingRequests);

router.get('/pending', protect, authorizeRoles('Warden', 'Guard'), getPendingRequests);

router.get('/stream', protect, authorizeRoles('Warden', 'Guard'), streamOutingEvents);

router.patch('/:id/status', protect, authorizeRoles('Warden', 'Guard'), updateRequestStatus);

module.exports = router;
