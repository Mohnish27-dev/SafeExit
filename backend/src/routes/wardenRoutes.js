const express = require('express');
const router = express.Router();
const { getCaretakerStats } = require('../controllers/caretakerController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

// Live counters for the warden dashboard's stats card, scoped to their managed hostel.
router.get('/stats', protect, authorizeRoles('Warden'), getCaretakerStats);

module.exports = router;

