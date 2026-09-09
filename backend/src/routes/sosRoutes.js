const express = require('express');
const router = express.Router();
const { uuidParam } = require('../middlewares/validateParams');

// Rejects a malformed :id before any handler runs, so a non-uuid cannot reach a query
// and turn into a 500. See middlewares/validateParams.js.
router.param('id', uuidParam);
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
  .get(protect, authorizeRoles('Admin', 'Caretaker', 'Guard', 'Warden', 'ChiefWarden'), getSOSAlerts);

router.get('/mine', protect, authorizeRoles('Student'), getMySOSAlerts);

router.get('/stream', protect, authorizeRoles('Admin', 'Caretaker', 'Guard', 'Warden', 'ChiefWarden'), streamSOSEvents);

// Wardens can acknowledge/resolve within their gender scope, same as caretakers.
router.patch('/:id/status', protect, authorizeRoles('Admin', 'Caretaker', 'Warden'), updateSOSStatus);

module.exports = router;
