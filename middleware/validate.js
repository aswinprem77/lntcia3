const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

/**
 * Terminates an express-validator chain: collects the accumulated errors and
 * converts them into a 400 with field-level detail.
 *
 * Validation lives in the middleware layer rather than inside controllers so
 * that a controller can assume its input is well-formed and deal only with
 * business rules.
 *
 * A rule may opt into a more specific error code than VALIDATION_ERROR by
 * prefixing its message with `CODE:` -- the date-range checks use this to
 * surface INVALID_DATE_RANGE and PAST_DATE as PRD section 7.2 requires.
 */
const SPECIFIC_CODES = new Set(['INVALID_DATE_RANGE', 'PAST_DATE', 'CAPACITY_EXCEEDED']);

const validate = (req, res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const raw = result.array();

  // If any rule asked for a specific code, that wins over the generic one.
  for (const entry of raw) {
    const match = /^([A-Z_]+):(.*)$/.exec(entry.msg || '');
    if (match && SPECIFIC_CODES.has(match[1])) {
      return next(new ApiError(400, match[1], match[2].trim()));
    }
  }

  const errors = raw.map((e) => ({
    field: e.path || e.param,
    message: e.msg,
    location: e.location
  }));

  return next(
    ApiError.validation('Request failed validation. See errors[] for field-level detail.', errors)
  );
};

module.exports = validate;
