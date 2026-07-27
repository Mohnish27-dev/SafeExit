const express = require('express');
const router = express.Router();
const { getSelectableCaretakers, getCaretakerStats } = require('../controllers/caretakerController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

// Students list the caretakers they may route a request to (same gender scope).
router.get('/selectable', protect, authorizeRoles('Student'), getSelectableCaretakers);

// Live counters for the caretaker dashboard's stats card, scoped to their hostel.
router.get('/stats', protect, authorizeRoles('Caretaker'), getCaretakerStats);

module.exports = router;
