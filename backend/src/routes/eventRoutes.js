const express = require('express');
const { streamStaffEvents } = require('../controllers/eventController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

const router = express.Router();

router.get(
  '/',
  protect,
  authorizeRoles('Admin', 'Caretaker', 'Guard', 'Warden', 'ChiefWarden', 'Department'),
  streamStaffEvents
);

module.exports = router;
