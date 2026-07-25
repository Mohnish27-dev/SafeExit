const express = require('express');
const router = express.Router();
const {
  createComplaint,
  getMyComplaints,
  getComplaints,
  updateComplaintStatus,
  resolveMyComplaint,
  streamComplaintEvents
} = require('../controllers/complaintController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const { createLimiter } = require('../middlewares/rateLimit');

router.route('/')
  .post(protect, authorizeRoles('Student'), createLimiter, createComplaint)
  .get(protect, authorizeRoles('Warden', 'Admin', 'Department'), getComplaints);

router.get('/mycomplaints', protect, authorizeRoles('Student'), getMyComplaints);

router.get('/stream', protect, authorizeRoles('Warden', 'Admin', 'Department'), streamComplaintEvents);

// Departments/admins progress a complaint; students close their own via /resolve.
router.patch('/:id/status', protect, authorizeRoles('Department', 'Admin'), updateComplaintStatus);
router.patch('/:id/resolve', protect, authorizeRoles('Student'), resolveMyComplaint);

module.exports = router;
