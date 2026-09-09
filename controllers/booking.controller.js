const Booking = require('../models/Booking');
const RoomType = require('../models/RoomType');
const Room = require('../models/Room');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, paginated, parsePagination } = require('../utils/response');
const { todayUtc, toUtcDate, round2 } = require('../utils/dates');
const { nextBookingRef } = require('../utils/bookingRef');
const { getAvailability, isOverbooked } = require('../services/availability.service');
const { priceStayForRoomType } = require('../services/pricing.service');
const { computeTotals, buildInvoice } = require('../services/invoice.service');
const { calculateRefund } = require('../services/refund.service');
const { applyTransition } = require('../services/bookingStatus.service');

/**
 * Access rule for a single booking: the owning guest, any staff member of the
 * hotel the booking belongs to, or an admin. This is an ownership check, not
 * just a role check -- two guests share the same role and must still not see
 * each other's reservations.
 */
const assertCanAccessBooking = (user, booking) => {
  if (user.role === 'admin') return;
  if (user.role === 'staff') {
    if (String(user.hotelId) !== String(booking.hotelId._id || booking.hotelId)) {
      throw ApiError.forbidden('Staff may only access bookings for their own hotel');
    }
    return;
  }
  const ownerId = booking.guestId._id || booking.guestId;
  if (String(ownerId) !== String(user._id)) {
    throw ApiError.forbidden('You may only access your own bookings');
  }
};

/**
 * POST /api/bookings - guest.
 *
 * Double-booking guard: check -> insert -> re-verify -> roll back.
 *
 * Checking availability before inserting is not sufficient on its own. Two
 * requests can both read "1 room left" before either has written, and both
 * then insert. So after inserting we re-run the same overlap count; if it now
 * exceeds totalRooms, this request lost the race, deletes the booking it just
 * created, and returns 409. The verification step is what makes the guard
 * real, and it is kept even when a transaction is available.
 */
const createBooking = asyncHandler(async (req, res) => {
  const { hotelId, roomTypeId, checkIn, checkOut, guests, addOns } = req.body;

  if (checkIn < todayUtc()) {
    throw ApiError.pastDate('checkIn cannot be in the past');
  }

  const roomType = await RoomType.findById(roomTypeId);
  if (!roomType || !roomType.isActive) throw ApiError.notFound('Room type');

  if (String(roomType.hotelId) !== String(hotelId)) {
    throw ApiError.validation('The requested room type does not belong to the specified hotel');
  }

  if (guests > roomType.capacity) {
    throw ApiError.capacityExceeded(
      `Requested ${guests} guest(s) but '${roomType.name}' has a capacity of ${roomType.capacity}`
    );
  }

  // 1. Compute availability.
  const { availableRooms } = await getAvailability(roomType, checkIn, checkOut);
  if (availableRooms <= 0) {
    // 2. Zero -> reject.
    throw ApiError.noAvailability(
      `'${roomType.name}' is fully booked for the requested dates. All ${roomType.totalRooms} room(s) are committed.`
    );
  }

  // Price the stay server-side. Nothing the client sent influences this.
  const { nightlyBreakdown } = await priceStayForRoomType(roomType, checkIn, checkOut);
  const totals = computeTotals({ nightlyBreakdown, addOns: addOns || [] });

  // 3. Insert.
  const booking = await Booking.create({
    guestId: req.user._id,
    hotelId,
    roomTypeId,
    checkIn,
    checkOut,
    guests,
    status: 'Reserved',
    bookingRef: await nextBookingRef(),
    nightlyBreakdown,
    addOns: addOns || [],
    taxAmount: totals.taxAmount,
    totalAmount: totals.grandTotal,
    statusHistory: [{ from: 'NEW', to: 'Reserved', byUserId: req.user._id, at: new Date() }]
  });

  // 4. Re-verify, and roll back if a concurrent insert overshot the ceiling.
  if (await isOverbooked(roomType, checkIn, checkOut)) {
    await Booking.deleteOne({ _id: booking._id });
    throw ApiError.noAvailability(
      `'${roomType.name}' was taken by a concurrent booking while this request was being processed.`
    );
  }

  created(res, 'Booking created successfully', { ...booking.toObject(), ...totals });
});

/** GET /api/bookings - staff (own hotel) / admin. Paginated. */
const listBookings = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = {};

  if (req.query.status) filter.status = req.query.status;

  if (req.user.role === 'staff') {
    filter.hotelId = req.user.hotelId;
  } else if (req.query.hotelId) {
    filter.hotelId = req.query.hotelId;
  }

  // from/to select bookings whose stay overlaps the window.
  if (req.query.from || req.query.to) {
    if (req.query.to) filter.checkIn = { $lt: toUtcDate(req.query.to) };
    if (req.query.from) filter.checkOut = { $gt: toUtcDate(req.query.from) };
  }

  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .populate('guestId', 'name email')
      .populate('hotelId', 'name city')
      .populate('roomTypeId', 'name')
      .populate('assignedRoomId', 'roomNumber housekeepingStatus')
      .sort({ checkIn: -1 })
      .skip(skip)
      .limit(limit),
    Booking.countDocuments(filter)
  ]);

  paginated(res, 'Bookings retrieved successfully', bookings, { page, limit, total });
});

/** GET /api/bookings/:id - owner guest, staff of that hotel, admin. */
const getBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('guestId', 'name email phone')
    .populate('hotelId', 'name city address')
    .populate('roomTypeId', 'name capacity basePrice')
    .populate('assignedRoomId', 'roomNumber housekeepingStatus');

  if (!booking) throw ApiError.notFound('Booking');
  assertCanAccessBooking(req.user, booking);

  ok(res, 'Booking retrieved successfully', {
    ...booking.toObject(),
    ...computeTotals(booking)
  });
});

/** PUT /api/bookings/:id/confirm - staff of that hotel, admin. */
const confirmBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw ApiError.notFound('Booking');
  assertCanAccessBooking(req.user, booking);

  applyTransition(booking, 'Confirmed', req.user);
  await booking.save();

  ok(res, `Booking ${booking.bookingRef} confirmed`, {
    _id: booking._id,
    bookingRef: booking.bookingRef,
    status: booking.status,
    statusHistory: booking.statusHistory
  });
});

/**
 * PUT /api/bookings/:id/checkin - staff of that hotel, admin.
 *
 * Assigns a physical room. A room qualifies only if it is of the booked type,
 * is Clean or Inspected, and has nobody in it. Early arrival is refused: the
 * room is very likely still sold to the previous night's guest.
 */
const checkInBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw ApiError.notFound('Booking');
  assertCanAccessBooking(req.user, booking);

  if (booking.status !== 'Confirmed') {
    // Surfaces as INVALID_STATUS_TRANSITION naming both states.
    applyTransition(booking, 'CheckedIn', req.user);
  }

  if (todayUtc() < toUtcDate(booking.checkIn)) {
    throw ApiError.tooEarlyToCheckIn(
      `Booking ${booking.bookingRef} cannot be checked in before its check-in date (${
        toUtcDate(booking.checkIn).toISOString().split('T')[0]
      })`
    );
  }

  const room = await Room.findOne({
    hotelId: booking.hotelId,
    roomTypeId: booking.roomTypeId,
    housekeepingStatus: { $in: ['Clean', 'Inspected'] },
    currentBookingId: null
  }).sort({ roomNumber: 1 });

  if (!room) {
    throw ApiError.noCleanRoom(
      'No Clean or Inspected room of the booked type is free for assignment right now'
    );
  }

  applyTransition(booking, 'CheckedIn', req.user);
  booking.assignedRoomId = room._id;
  booking.actualCheckInAt = new Date();

  room.currentBookingId = booking._id;

  await Promise.all([booking.save(), room.save()]);

  ok(res, `Checked in. Room ${room.roomNumber} assigned.`, {
    _id: booking._id,
    bookingRef: booking.bookingRef,
    status: booking.status,
    actualCheckInAt: booking.actualCheckInAt,
    assignedRoom: { _id: room._id, roomNumber: room.roomNumber }
  });
});

/**
 * PUT /api/bookings/:id/checkout - staff of that hotel, admin.
 * Releases the room to housekeeping and returns the final invoice.
 */
const checkOutBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('guestId', 'name email')
    .populate('hotelId', 'name city')
    .populate('roomTypeId', 'name');

  if (!booking) throw ApiError.notFound('Booking');
  assertCanAccessBooking(req.user, booking);

  applyTransition(booking, 'CheckedOut', req.user);
  booking.actualCheckOutAt = new Date();

  let releasedRoom = null;
  if (booking.assignedRoomId) {
    const room = await Room.findById(booking.assignedRoomId);
    if (room) {
      // The room is dirty the moment the guest leaves; housekeeping picks it
      // up from the board and marks it Clean again.
      room.housekeepingStatus = 'Dirty';
      room.currentBookingId = null;
      await room.save();
      releasedRoom = { _id: room._id, roomNumber: room.roomNumber, housekeepingStatus: 'Dirty' };
    }
  }

  await booking.save();

  ok(res, `Checked out. Room released to housekeeping.`, {
    booking: {
      _id: booking._id,
      bookingRef: booking.bookingRef,
      status: booking.status,
      actualCheckOutAt: booking.actualCheckOutAt
    },
    releasedRoom,
    invoice: buildInvoice(booking)
  });
});

/**
 * PUT /api/bookings/:id/cancel - owner guest, staff of that hotel, admin.
 *
 * The released inventory reappears in availability immediately and with no
 * extra bookkeeping, because Cancelled is simply not one of the statuses the
 * overlap query counts.
 */
const cancelBooking = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw ApiError.notFound('Booking');
  assertCanAccessBooking(req.user, booking);

  if (['CheckedIn', 'CheckedOut'].includes(booking.status)) {
    throw ApiError.notCancellable(
      `Booking ${booking.bookingRef} is '${booking.status}' and can no longer be cancelled`
    );
  }
  if (booking.status === 'Cancelled') {
    throw ApiError.notCancellable(`Booking ${booking.bookingRef} is already cancelled`);
  }

  const refund = calculateRefund(booking.checkIn, booking.totalAmount);

  applyTransition(booking, 'Cancelled', req.user);
  booking.cancellation = {
    cancelledAt: new Date(),
    refundPercent: refund.refundPercent,
    refundAmount: refund.refundAmount,
    reason: req.body.reason || 'Cancelled by user'
  };

  // A room is only held once a guest has checked in, but release defensively.
  if (booking.assignedRoomId) {
    await Room.updateOne({ _id: booking.assignedRoomId }, { $set: { currentBookingId: null } });
    booking.assignedRoomId = null;
  }

  await booking.save();

  ok(res, `Booking ${booking.bookingRef} cancelled. ${refund.tier}.`, {
    _id: booking._id,
    bookingRef: booking.bookingRef,
    status: booking.status,
    totalAmount: booking.totalAmount,
    daysBeforeCheckIn: refund.daysBeforeCheckIn,
    cancellation: booking.cancellation
  });
});

/** GET /api/bookings/:id/invoice - owner guest, staff of that hotel, admin. */
const getInvoice = asyncHandler(async (req, res) => {
  const booking = await Booking.findById(req.params.id)
    .populate('guestId', 'name email')
    .populate('hotelId', 'name city address')
    .populate('roomTypeId', 'name');

  if (!booking) throw ApiError.notFound('Booking');
  assertCanAccessBooking(req.user, booking);

  ok(res, 'Invoice generated successfully', buildInvoice(booking));
});

/**
 * GET /api/guests/:id/bookings - the guest themselves, or an admin.
 *
 * A guest requesting another guest's history is a 403 driven by ownership
 * rather than by role: both users are guests.
 */
const getGuestBookings = asyncHandler(async (req, res) => {
  const guestId = req.params.id;

  if (req.user.role === 'guest' && String(req.user._id) !== String(guestId)) {
    throw ApiError.forbidden('You may only view your own booking history');
  }
  if (req.user.role === 'staff') {
    throw ApiError.forbidden('Staff should use GET /api/bookings for their hotel');
  }

  const { page, limit, skip } = parsePagination(req.query);
  const filter = { guestId };

  if (req.query.status) filter.status = req.query.status;

  if (req.query.upcoming === 'true') {
    filter.checkIn = { $gte: todayUtc() };
    filter.status = { $nin: ['Cancelled', 'CheckedOut'] };
  } else if (req.query.upcoming === 'false') {
    filter.$or = [{ checkIn: { $lt: todayUtc() } }, { status: { $in: ['Cancelled', 'CheckedOut'] } }];
  }

  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .populate('hotelId', 'name city')
      .populate('roomTypeId', 'name')
      .populate('assignedRoomId', 'roomNumber')
      .sort({ checkIn: -1 })
      .skip(skip)
      .limit(limit),
    Booking.countDocuments(filter)
  ]);

  paginated(res, 'Booking history retrieved successfully', bookings, { page, limit, total });
});

module.exports = {
  createBooking,
  listBookings,
  getBooking,
  confirmBooking,
  checkInBooking,
  checkOutBooking,
  cancelBooking,
  getInvoice,
  getGuestBookings
};
