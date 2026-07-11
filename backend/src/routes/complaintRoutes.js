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

router.route('/')
  .post(protect, authorizeRoles('Student'), createComplaint)
  .get(protect, authorizeRoles('Warden', 'Admin'), getComplaints);

router.get('/mycomplaints', protect, authorizeRoles('Student'), getMyComplaints);

router.get('/stream', protect, authorizeRoles('Warden', 'Admin'), streamComplaintEvents);

router.patch('/:id/status', protect, authorizeRoles('Warden', 'Admin'), updateComplaintStatus);

module.exports = router;
