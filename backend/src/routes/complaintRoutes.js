const express = require('express');
const router = express.Router();
const {
  createComplaint,
  getMyComplaints,
  getComplaints,
  updateComplaintStatus,
  streamComplaintEvents
} = require('../controllers/complaintController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const { createLimiter } = require('../middlewares/rateLimit');

router.route('/')
  .post(protect, authorizeRoles('Student'), createLimiter, createComplaint)
  .get(protect, authorizeRoles('Warden', 'Admin'), getComplaints);

router.get('/mycomplaints', protect, authorizeRoles('Student'), getMyComplaints);

router.get('/stream', protect, authorizeRoles('Warden', 'Admin'), streamComplaintEvents);

router.patch('/:id/status', protect, authorizeRoles('Warden', 'Admin'), updateComplaintStatus);

module.exports = router;
