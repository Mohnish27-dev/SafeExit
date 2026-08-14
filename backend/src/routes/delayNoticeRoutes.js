const express = require('express');
const router = express.Router();
const {
  createDelayNotice,
  getMyDelayNotices,
  getDelayNotices,
  acknowledgeDelayNotice,
  streamDelayEvents,
} = require('../controllers/delayNoticeController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');
const { createLimiter } = require('../middlewares/rateLimit');

router.route('/')
  .post(protect, authorizeRoles('Student'), createLimiter, createDelayNotice)
  .get(
    protect,
    authorizeRoles('Admin', 'Caretaker', 'Guard', 'Warden', 'ChiefWarden'),
    getDelayNotices
  );

router.get('/mine', protect, authorizeRoles('Student'), getMyDelayNotices);

router.get(
  '/stream',
  protect,
  authorizeRoles('Admin', 'Caretaker', 'Guard', 'Warden', 'ChiefWarden'),
  streamDelayEvents
);

// Guards see delay notices but don't close them out — that's a hostel-staff call.
router.patch(
  '/:id/acknowledge',
  protect,
  authorizeRoles('Admin', 'Caretaker', 'Warden', 'ChiefWarden'),
  acknowledgeDelayNotice
);

module.exports = router;
