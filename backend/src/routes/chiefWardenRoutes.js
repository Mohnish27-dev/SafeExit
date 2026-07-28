const express = require('express');
const { getOverview } = require('../controllers/chiefWardenController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

const router = express.Router();

router.get('/overview', protect, authorizeRoles('ChiefWarden'), getOverview);

module.exports = router;
