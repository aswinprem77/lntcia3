const router = require('express').Router();
const { listRooms, updateHousekeeping } = require('../controllers/room.controller');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const validate = require('../middleware/validate');
const { objectIdParam, paginationRules } = require('../validators/common');
const { listRoomsRules, housekeepingRules } = require('../validators/room.validator');

router.use(verifyToken, requireRole('staff', 'admin'));

// M3 - inventory listing
router.get('/', listRoomsRules(), paginationRules(), validate, listRooms);

// M9 - Housekeeping Status Tracking
router.patch('/:id/housekeeping', objectIdParam('id'), housekeepingRules(), validate, updateHousekeeping);

module.exports = router;
