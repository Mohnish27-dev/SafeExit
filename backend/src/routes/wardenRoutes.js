const express = require('express');
const router = express.Router();
const { getSelectableWardens } = require('../controllers/wardenController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

// Students list the wardens they may route a request to (same gender scope).
router.get('/selectable', protect, authorizeRoles('Student'), getSelectableWardens);

module.exports = router;
