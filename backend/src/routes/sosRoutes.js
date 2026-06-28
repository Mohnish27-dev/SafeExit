const express = require('express');
const router = express.Router();
const {
  createSOSAlert,
  getMySOSAlerts,
  getSOSAlerts,
  updateSOSStatus
} = require('../controllers/sosController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

router.route('/')
  .post(protect, authorizeRoles('Student'), createSOSAlert)
  .get(protect, authorizeRoles('Admin', 'Warden', 'Guard'), getSOSAlerts);

router.get('/mine', protect, authorizeRoles('Student'), getMySOSAlerts);

router.patch('/:id/status', protect, authorizeRoles('Admin', 'Warden'), updateSOSStatus);

module.exports = router;
