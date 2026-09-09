const { body, query } = require('express-validator');
const { isoDate } = require('./common');

const createPricingRuleRules = () => [
  body('season').trim().notEmpty().withMessage('season label is required'),
  body('multiplier')
    .isFloat({ min: 0.1, max: 5.0 })
    .withMessage('multiplier must be between 0.1 and 5.0'),
  body('startDate').optional({ values: 'null' }).isISO8601().withMessage('startDate must be ISO-8601'),
  body('endDate').optional({ values: 'null' }).isISO8601().withMessage('endDate must be ISO-8601'),
  body('endDate').custom((endDate, { req }) => {
    if (endDate && req.body.startDate && new Date(endDate) < new Date(req.body.startDate)) {
      throw new Error('endDate cannot be earlier than startDate');
    }
    return true;
  }),
  body('appliesToWeekend').optional().isBoolean(),
  body('priority').optional().isInt().withMessage('priority must be an integer'),
  body('isActive').optional().isBoolean()
];

const updatePricingRuleRules = () => [
  body('season').optional().trim().notEmpty(),
  body('multiplier')
    .optional()
    .isFloat({ min: 0.1, max: 5.0 })
    .withMessage('multiplier must be between 0.1 and 5.0'),
  body('startDate').optional({ values: 'null' }).isISO8601(),
  body('endDate').optional({ values: 'null' }).isISO8601(),
  body('appliesToWeekend').optional().isBoolean(),
  body('priority').optional().isInt(),
  body('isActive').optional().isBoolean()
];

/** Price preview: creates nothing, so only the window matters. */
const quoteRules = () => [
  isoDate(query('checkIn'), 'checkIn'),
  isoDate(query('checkOut'), 'checkOut'),
  query('checkOut').custom((checkOut, { req }) => {
    if (checkOut <= req.query.checkIn) {
      throw new Error('INVALID_DATE_RANGE:checkOut must be strictly after checkIn');
    }
    return true;
  }),
  query('guests').optional().isInt({ min: 1 })
];

module.exports = { createPricingRuleRules, updatePricingRuleRules, quoteRules };
