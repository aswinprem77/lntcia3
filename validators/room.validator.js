const { body, query } = require('express-validator');

const HOUSEKEEPING_STATUSES = ['Clean', 'Dirty', 'Inspected', 'OutOfService'];

const createRoomRules = () => [
  body('roomNumber').trim().notEmpty().withMessage('roomNumber is required'),
  body('housekeepingStatus')
    .optional()
    .isIn(HOUSEKEEPING_STATUSES)
    .withMessage(`housekeepingStatus must be one of: ${HOUSEKEEPING_STATUSES.join(', ')}`)
];

const listRoomsRules = () => [
  query('hotelId').optional().isMongoId().withMessage('hotelId must be a valid ObjectId'),
  query('roomTypeId').optional().isMongoId().withMessage('roomTypeId must be a valid ObjectId'),
  query('housekeepingStatus')
    .optional()
    .isIn(HOUSEKEEPING_STATUSES)
    .withMessage(`housekeepingStatus must be one of: ${HOUSEKEEPING_STATUSES.join(', ')}`)
];

const housekeepingRules = () => [
  body('housekeepingStatus')
    .isIn(HOUSEKEEPING_STATUSES)
    .withMessage(`housekeepingStatus must be one of: ${HOUSEKEEPING_STATUSES.join(', ')}`)
];

module.exports = { HOUSEKEEPING_STATUSES, createRoomRules, listRoomsRules, housekeepingRules };
