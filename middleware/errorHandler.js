const env = require('../config/env');
const ApiError = require('../utils/ApiError');

/**
 * Centralized error handler. Mounted last, after all routes and after
 * notFound. This is the only place in the application that formats an error
 * response, which is what keeps the error envelope consistent.
 *
 * Translates the framework/driver errors that would otherwise leak as 500s:
 *   Mongoose ValidationError -> 400 VALIDATION_ERROR
 *   Mongoose CastError       -> 400 INVALID_ID
 *   MongoServerError 11000   -> 409 DUPLICATE_RESOURCE
 *   JsonWebTokenError        -> 401 INVALID_TOKEN
 *   TokenExpiredError        -> 401 INVALID_TOKEN
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let errorCode = err.errorCode || 'INTERNAL_ERROR';
  let message = err.message || 'Something went wrong';
  let errors = err.errors;

  if (err.name === 'ValidationError' && err.errors) {
    // Mongoose schema validation
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    message = 'Request failed validation. See errors[] for field-level detail.';
  } else if (err.name === 'CastError') {
    statusCode = 400;
    errorCode = 'INVALID_ID';
    message = `'${err.value}' is not a valid identifier for field '${err.path}'`;
  } else if (err.code === 11000) {
    statusCode = 409;
    errorCode = 'DUPLICATE_RESOURCE';
    const fields = Object.keys(err.keyValue || {});
    // A duplicate email during registration gets its own code (PRD 7.2).
    if (fields.length === 1 && fields[0] === 'email') {
      errorCode = 'DUPLICATE_EMAIL';
      message = 'An account with this email already exists';
    } else {
      message = `A record already exists with the same ${fields.join(' + ') || 'unique value'}`;
    }
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorCode = 'INVALID_TOKEN';
    message = 'Authentication token is invalid';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = 'INVALID_TOKEN';
    message = 'Authentication token has expired. Please log in again.';
  } else if (!(err instanceof ApiError) && statusCode === 500) {
    // Never leak an internal message to the client.
    message = 'An unexpected internal error occurred';
  }

  if (statusCode >= 500) {
    console.error('[Unhandled Error]', err.stack || err);
  }

  const body = { success: false, message, errorCode };
  if (errors) body.errors = errors;
  // Stack traces are a development aid only.
  if (!env.isProduction && statusCode >= 500) body.stack = err.stack;

  res.status(statusCode).json(body);
};

module.exports = errorHandler;
