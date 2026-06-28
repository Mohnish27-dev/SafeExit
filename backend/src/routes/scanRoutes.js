const express = require('express');
const router = express.Router();
const { createScanLog, getScanLogs } = require('../controllers/scanController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

router.route('/')
  .post(protect, authorizeRoles('Guard', 'Admin'), createScanLog)
  .get(protect, authorizeRoles('Admin', 'Warden', 'Guard'), getScanLogs);

module.exports = router;
