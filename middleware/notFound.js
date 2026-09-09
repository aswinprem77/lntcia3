const ApiError = require('../utils/ApiError');

/**
 * Catch-all for unmatched routes. Mounted after every route and before the
 * error handler, so an unknown path produces the standard error envelope
 * instead of Express's default HTML page.
 */
const notFound = (req, res, next) => {
  next(ApiError.notFound(`Endpoint ${req.method} ${req.originalUrl}`));
};

module.exports = notFound;
