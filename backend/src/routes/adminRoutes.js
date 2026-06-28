const express = require('express');
const router = express.Router();
const { getOverview, getUsers } = require('../controllers/adminController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

router.get('/overview', protect, authorizeRoles('Admin'), getOverview);
router.get('/users', protect, authorizeRoles('Admin'), getUsers);

module.exports = router;
