const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Verifies the Bearer token and attaches req.user.
 *
 * The token payload carries only { id, role, hotelId? } -- never the email,
 * name or password hash, because a JWT is signed but not encrypted and any
 * holder can read its contents.
 *
 * The user is still re-read from the database on every request so that a
 * deactivated account or a role change takes effect immediately rather than
 * waiting for the token to expire.
 */
const verifyToken = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';

  if (!header.startsWith('Bearer ')) {
    throw ApiError.unauthenticated('Authentication token is required');
  }

  const token = header.slice(7).trim();
  if (!token) {
    throw ApiError.unauthenticated('Authentication token is required');
  }

  // jwt.verify throws JsonWebTokenError / TokenExpiredError, both of which the
  // centralized error handler maps to 401 INVALID_TOKEN.
  const decoded = jwt.verify(token, env.jwtSecret);

  const user = await User.findById(decoded.id);
  if (!user) {
    throw ApiError.invalidToken('The user this token belongs to no longer exists');
  }
  if (!user.isActive) {
    throw ApiError.forbidden('This account has been deactivated');
  }

  req.user = user;
  next();
});

module.exports = { verifyToken };
