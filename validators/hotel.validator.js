const { body, query } = require('express-validator');
const { isoDate } = require('./common');

const createHotelRules = () => [
  body('name').trim().notEmpty().withMessage('name is required').isLength({ max: 120 }),
  body('city').trim().notEmpty().withMessage('city is required'),
  body('amenities').optional().isArray().withMessage('amenities must be an array of strings'),
  body('amenities.*').optional().isString().trim(),
  body('rating').optional().isFloat({ min: 0, max: 5 }).withMessage('rating must be between 0 and 5'),
  body('address').optional().isString().trim()
];

const updateHotelRules = () => [
  body('name').optional().trim().notEmpty().isLength({ max: 120 }),
  body('city').optional().trim().notEmpty(),
  body('amenities').optional().isArray(),
  body('rating').optional().isFloat({ min: 0, max: 5 }).withMessage('rating must be between 0 and 5'),
  body('address').optional().isString().trim(),
  body('isActive').optional().isBoolean()
];

const listHotelsRules = () => [
  query('city').optional().trim().notEmpty(),
  query('minRating').optional().isFloat({ min: 0, max: 5 }).withMessage('minRating must be 0-5')
];

/**
 * Availability search. The date-range and past-date rules are enforced here so
 * the controller only ever sees a usable window.
 */
const searchRules = () => [
  query('city').optional().trim().notEmpty(),
  isoDate(query('checkIn'), 'checkIn'),
  isoDate(query('checkOut'), 'checkOut'),
  query('checkOut').custom((checkOut, { req }) => {
    if (checkOut <= req.query.checkIn) {
      throw new Error('INVALID_DATE_RANGE:checkOut must be strictly after checkIn');
    }
    return true;
  }),
  query('guests').optional().isInt({ min: 1 }).withMessage('guests must be a positive integer'),
  query('minRating').optional().isFloat({ min: 0, max: 5 })
];

module.exports = { createHotelRules, updateHotelRules, listHotelsRules, searchRules };
