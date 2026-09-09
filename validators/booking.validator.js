const { body, query } = require('express-validator');
const { isoDate } = require('./common');

/**
 * Booking creation.
 *
 * Note what is NOT accepted: totalAmount, taxAmount, status, bookingRef and
 * nightlyBreakdown are all rejected outright. Price and state are decided by
 * the server; a client that sends them is trying to set its own bill.
 */
const createBookingRules = () => [
  body('hotelId').isMongoId().withMessage('hotelId must be a valid ObjectId'),
  body('roomTypeId').isMongoId().withMessage('roomTypeId must be a valid ObjectId'),
  isoDate(body('checkIn'), 'checkIn'),
  isoDate(body('checkOut'), 'checkOut'),
  body('checkOut').custom((checkOut, { req }) => {
    if (checkOut <= req.body.checkIn) {
      throw new Error('INVALID_DATE_RANGE:checkOut must be strictly after checkIn');
    }
    return true;
  }),
  body('guests').isInt({ min: 1 }).withMessage('guests must be a positive integer'),
  body('addOns').optional().isArray().withMessage('addOns must be an array'),
  body('addOns.*.label').optional().trim().notEmpty().withMessage('each add-on needs a label'),
  body('addOns.*.amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('each add-on amount must be 0 or more'),
  body(['totalAmount', 'taxAmount', 'status', 'bookingRef', 'nightlyBreakdown'])
    .not()
    .exists()
    .withMessage('This field is computed server-side and cannot be supplied by the client')
];

const listBookingsRules = () => [
  query('status')
    .optional()
    .isIn(['Reserved', 'Confirmed', 'CheckedIn', 'CheckedOut', 'Cancelled'])
    .withMessage('status must be a valid booking status'),
  query('hotelId').optional().isMongoId(),
  query('from').optional().isISO8601().withMessage('from must be ISO-8601'),
  query('to').optional().isISO8601().withMessage('to must be ISO-8601')
];

const guestHistoryRules = () => [
  query('status')
    .optional()
    .isIn(['Reserved', 'Confirmed', 'CheckedIn', 'CheckedOut', 'Cancelled']),
  query('upcoming').optional().isBoolean().withMessage('upcoming must be true or false')
];

const cancelRules = () => [
  body('reason').optional().isString().trim().isLength({ max: 300 })
];

module.exports = { createBookingRules, listBookingsRules, guestHistoryRules, cancelRules };
