const { body } = require('express-validator');

const createRoomTypeRules = () => [
  body('name').trim().notEmpty().withMessage('name is required'),
  body('basePrice').isFloat({ gt: 0 }).withMessage('basePrice must be greater than 0'),
  body('totalRooms').isInt({ min: 1 }).withMessage('totalRooms must be an integer of at least 1'),
  body('capacity').isInt({ min: 1 }).withMessage('capacity must be an integer of at least 1'),
  body('description').optional().isString().trim()
];

const updateRoomTypeRules = () => [
  body('name').optional().trim().notEmpty(),
  body('basePrice').optional().isFloat({ gt: 0 }).withMessage('basePrice must be greater than 0'),
  body('totalRooms').optional().isInt({ min: 1 }).withMessage('totalRooms must be an integer of at least 1'),
  body('capacity').optional().isInt({ min: 1 }),
  body('description').optional().isString().trim(),
  body('isActive').optional().isBoolean()
];

module.exports = { createRoomTypeRules, updateRoomTypeRules };
