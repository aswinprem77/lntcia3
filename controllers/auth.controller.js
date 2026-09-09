const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');

/**
 * The token carries only what authorization needs: the id, the role, and the
 * hotel a staff member is bound to. No email, no name, no hash -- a JWT is
 * signed but not encrypted, so anything in the payload is readable by anyone
 * holding the token.
 */
const signToken = (user) => {
  const payload = { id: user._id, role: user.role };
  if (user.hotelId) payload.hotelId = user.hotelId;
  return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
};

const safeUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  phone: user.phone,
  hotelId: user.hotelId,
  isActive: user.isActive
});

/**
 * POST /api/auth/register - public. Creates a guest, and only ever a guest.
 * Staff and admin accounts come from POST /api/admin/users or the seeder.
 */
const register = asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;

  if (await User.exists({ email })) {
    throw ApiError.duplicateEmail();
  }

  const user = await User.create({
    name,
    email,
    passwordHash: password, // hashed by the pre-save hook
    phone: phone || undefined,
    role: 'guest'
  });

  created(res, 'Registration successful', { user: safeUser(user), token: signToken(user) });
});

/**
 * POST /api/auth/login - public.
 *
 * An unknown email and a wrong password return the identical response. Saying
 * "no such user" would let an attacker enumerate which addresses are
 * registered.
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user) throw ApiError.invalidCredentials();

  const matches = await user.comparePassword(password);
  if (!matches) throw ApiError.invalidCredentials();

  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

  ok(res, 'Login successful', { user: safeUser(user), token: signToken(user) });
});

/** GET /api/auth/me - any authenticated role. */
const me = asyncHandler(async (req, res) => {
  ok(res, 'Current user retrieved', { user: safeUser(req.user) });
});

module.exports = { register, login, me, signToken, safeUser };
