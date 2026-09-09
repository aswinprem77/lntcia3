const router = require('express').Router();
const { occupancyReport, revenueReport } = require('../controllers/report.controller');

// M13 - Admin Occupancy Reports.
// Auth and the admin role gate are applied by the parent admin router.
router.get('/occupancy', occupancyReport);
router.get('/revenue', revenueReport);

module.exports = router;
