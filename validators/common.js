const { param, query } = require('express-validator');
const { toUtcDate } = require('../utils/dates');

/** Rejects a malformed :id before it ever reaches Mongoose as a CastError. */
const objectIdParam = (name = 'id') =>
  param(name).isMongoId().withMessage(`${name} must be a valid 24-character ObjectId`);

const optionalObjectIdQuery = (name) =>
  query(name).optional().isMongoId().withMessage(`${name} must be a valid ObjectId`);

const paginationRules = () => [
  query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100')
];

/**
 * An ISO-8601 date, normalized to 00:00 UTC before any comparison happens.
 * Everything downstream can then assume date-only UTC values.
 */
const isoDate = (chain, label) =>
  chain
    .isISO8601()
    .withMessage(`${label} must be an ISO-8601 date (YYYY-MM-DD)`)
    .bail()
    .customSanitizer((value) => toUtcDate(value));

module.exports = { objectIdParam, optionalObjectIdQuery, paginationRules, isoDate };
