const ApiError = require('../utils/ApiError');

/**
 * Role gate. Rejects with 403 FORBIDDEN when the authenticated user's role is
 * not in the allowed list.
 */
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) {
    return next(ApiError.unauthenticated());
  }
  if (!roles.includes(req.user.role)) {
    return next(
      ApiError.forbidden(
        `Role '${req.user.role}' cannot access this resource. Allowed roles: ${roles.join(', ')}`
      )
    );
  }
  next();
};

/**
 * Hotel-scoping gate for staff.
 *
 * An admin is not hotel-scoped and passes through. A staff user may only act
 * on resources belonging to their own hotelId. This is the difference between
 * a role check and an ownership check: two users can share the 'staff' role
 * and still be forbidden from each other's property.
 *
 * `resolveHotelId(req)` returns the hotel the request targets, or null when it
 * cannot be determined yet (the controller then re-checks with the loaded doc).
 */
const requireSameHotel = (resolveHotelId) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthenticated());
  if (req.user.role === 'admin') return next();

  if (req.user.role !== 'staff') {
    return next(ApiError.forbidden('Only staff and admin may access this resource'));
  }

  const targetHotelId = resolveHotelId(req);
  if (!targetHotelId) return next();

  if (String(targetHotelId) !== String(req.user.hotelId)) {
    return next(
      ApiError.forbidden('Staff may only act on resources belonging to their own hotel')
    );
  }
  next();
};

/**
 * Assertion form of the same rule, for use inside a controller once the target
 * document has actually been loaded from the database.
 */
const assertSameHotel = (user, hotelId) => {
  if (user.role === 'admin') return;
  if (String(user.hotelId) !== String(hotelId)) {
    throw ApiError.forbidden('Staff may only act on resources belonging to their own hotel');
  }
};

module.exports = { requireRole, requireSameHotel, assertSameHotel };
