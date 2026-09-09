const User = require('../models/User');
const Hotel = require('../models/Hotel');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { created } = require('../utils/response');
const { safeUser } = require('./auth.controller');

/**
 * POST /api/admin/users - admin only.
 * The only route that can mint a staff or admin account.
 */
const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, hotelId, phone } = req.body;

  if (await User.exists({ email })) {
    throw ApiError.duplicateEmail();
  }

  // A staff member must be bound to a hotel that actually exists.
  if (role === 'staff') {
    const hotel = await Hotel.findById(hotelId);
    if (!hotel) throw ApiError.notFound('Hotel');
  }

  const user = await User.create({
    name,
    email,
    passwordHash: password,
    role,
    hotelId: role === 'staff' ? hotelId : undefined,
    phone: phone || undefined
  });

  created(res, `${role} account created successfully`, { user: safeUser(user) });
});

module.exports = { createUser };
