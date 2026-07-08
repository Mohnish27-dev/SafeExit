const express = require('express');
const router = express.Router();
const { getOverview, getUsers } = require('../controllers/adminController');
const { protect } = require('../middlewares/authMiddleware');
const { authorizeRoles } = require('../middlewares/roleMiddleware');

router.get('/overview', protect, authorizeRoles('Admin'), getOverview);
// Guards also hit this to browse the student roster from their dashboard;
// getUsers itself pins a Guard's query to role=Student regardless of what's asked.
router.get('/users', protect, authorizeRoles('Admin', 'Guard'), getUsers);

module.exports = router;
