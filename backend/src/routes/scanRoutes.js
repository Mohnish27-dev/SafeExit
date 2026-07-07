const express = require('express');
const router = express.Router();
const { createScanLog, previewScan, getScanLogs } = require('../controllers/scanController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

// Authoritative pre-confirm preview: what the entry scan will record (punctuality
// judged server-side), so the guard dialog never trusts the QR's stale window.
router.get('/preview', protect, authorizeRoles('Guard', 'Admin'), previewScan);

router.route('/')
  .post(protect, authorizeRoles('Guard', 'Admin'), createScanLog)
  .get(protect, authorizeRoles('Admin', 'Warden', 'Guard'), getScanLogs);

module.exports = router;
