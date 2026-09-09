/**
 * Wraps an async route handler so any rejected promise is forwarded to
 * next(err) and reaches the centralized error handler. Without this an
 * awaited throw inside a controller becomes an unhandled rejection and can
 * take the process down instead of returning clean JSON.
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
