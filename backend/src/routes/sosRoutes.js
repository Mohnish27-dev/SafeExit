const express = require('express');
const router = express.Router();
const {
  createSOSAlert,
  getMySOSAlerts,
  getSOSAlerts,
  updateSOSStatus,
  streamSOSEvents
} = require('../controllers/sosController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const { sosLimiter } = require('../middlewares/rateLimit');

router.route('/')
  .post(protect, authorizeRoles('Student'), sosLimiter, createSOSAlert)
  .get(protect, authorizeRoles('Admin', 'Caretaker', 'Guard'), getSOSAlerts);

router.get('/mine', protect, authorizeRoles('Student'), getMySOSAlerts);

router.get('/stream', protect, authorizeRoles('Admin', 'Caretaker', 'Guard'), streamSOSEvents);

router.patch('/:id/status', protect, authorizeRoles('Admin', 'Caretaker'), updateSOSStatus);

module.exports = router;
