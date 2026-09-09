const router = require('express').Router();
const { createUser } = require('../controllers/admin.controller');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const validate = require('../middleware/validate');
const { createUserRules } = require('../validators/auth.validator');
const reportRoutes = require('./report.routes');

// Everything under /api/admin requires an authenticated admin.
router.use(verifyToken, requireRole('admin'));

// M1 - the only route that can create staff or admin accounts
router.post('/users', createUserRules(), validate, createUser);

// M13 - occupancy and revenue reports
router.use('/reports', reportRoutes);

module.exports = router;
