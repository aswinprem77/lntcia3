const Booking = require('../models/Booking');
const { toUtcDate } = require('../utils/dates');

/**
 * Availability engine and double-booking guard.
 *
 * Statuses that hold inventory. Cancelled and CheckedOut are absent on
 * purpose: a cancelled booking releases its room immediately, which is why
 * cancelled inventory reappears in search with no extra bookkeeping.
 */
const BLOCKING_STATUSES = ['Reserved', 'Confirmed', 'CheckedIn'];

/**
 * The overlap query.
 *
 * Note the STRICT inequalities. Two ranges collide only when
 *     existing.checkIn < requested.checkOut  AND
 *     existing.checkOut > requested.checkIn
 * so a booking ending on the 10th and one starting on the 10th do NOT
 * overlap. That is same-day turnover: the departing guest leaves in the
 * morning, the arriving guest checks in that afternoon, and the room is
 * legitimately sold on both nights' bookings.
 */
const overlapQuery = (roomTypeId, checkIn, checkOut) => ({
  roomTypeId,
  status: { $in: BLOCKING_STATUSES },
  checkIn: { $lt: toUtcDate(checkOut) },
  checkOut: { $gt: toUtcDate(checkIn) }
});

/** How many units of this room type are already committed for the window. */
const countBookedUnits = (roomTypeId, checkIn, checkOut, excludeBookingId = null) => {
  const query = overlapQuery(roomTypeId, checkIn, checkOut);
  if (excludeBookingId) query._id = { $ne: excludeBookingId };
  return Booking.countDocuments(query);
};

/**
 * availableRooms = roomType.totalRooms - bookedUnits
 * Clamped at zero so an over-committed type never reports a negative count.
 */
const getAvailability = async (roomType, checkIn, checkOut) => {
  const bookedUnits = await countBookedUnits(roomType._id, checkIn, checkOut);
  return {
    totalRooms: roomType.totalRooms,
    bookedUnits,
    availableRooms: Math.max(0, roomType.totalRooms - bookedUnits)
  };
};

/**
 * Post-insert verification for the check-insert-verify-rollback guard.
 *
 * Returns true when the just-inserted booking pushed the overlap count past
 * the inventory ceiling, meaning a concurrent request slipped in between our
 * availability check and our insert. The caller deletes its own booking and
 * returns 409.
 */
const isOverbooked = async (roomType, checkIn, checkOut) => {
  const bookedUnits = await countBookedUnits(roomType._id, checkIn, checkOut);
  return bookedUnits > roomType.totalRooms;
};

module.exports = {
  BLOCKING_STATUSES,
  overlapQuery,
  countBookedUnits,
  getAvailability,
  isOverbooked
};
