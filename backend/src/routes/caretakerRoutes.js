const express = require('express');
const router = express.Router();
const { getSelectableCaretakers } = require('../controllers/caretakerController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

// Students list the caretakers they may route a request to (same gender scope).
router.get('/selectable', protect, authorizeRoles('Student'), getSelectableCaretakers);

module.exports = router;
