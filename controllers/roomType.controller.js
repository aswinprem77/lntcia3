const RoomType = require('../models/RoomType');
const Hotel = require('../models/Hotel');
const Room = require('../models/Room');
const Booking = require('../models/Booking');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const { todayUtc, nightsBetween, round2 } = require('../utils/dates');
const { BLOCKING_STATUSES } = require('../services/availability.service');
const { priceStayForRoomType } = require('../services/pricing.service');
const { computeTotals } = require('../services/invoice.service');

/** POST /api/hotels/:hotelId/room-types - admin. */
const createRoomType = asyncHandler(async (req, res) => {
  const hotel = await Hotel.findById(req.params.hotelId);
  if (!hotel) throw ApiError.notFound('Hotel');

  const { name, basePrice, totalRooms, capacity, description } = req.body;
  const roomType = await RoomType.create({
    hotelId: hotel._id,
    name,
    basePrice,
    totalRooms,
    capacity,
    description
  });

  created(res, 'Room type created successfully', roomType);
});

/** GET /api/hotels/:hotelId/room-types - public. */
const listRoomTypesForHotel = asyncHandler(async (req, res) => {
  const roomTypes = await RoomType.find({ hotelId: req.params.hotelId, isActive: true }).sort({
    basePrice: 1
  });
  ok(res, 'Room types retrieved successfully', roomTypes);
});

/**
 * PUT /api/room-types/:id - admin.
 *
 * totalRooms may not drop below the number of physical rooms already created
 * for the type: those rooms exist and can still be assigned at check-in, so a
 * lower ceiling would let the availability engine oversell them.
 */
const updateRoomType = asyncHandler(async (req, res) => {
  const roomType = await RoomType.findById(req.params.id);
  if (!roomType) throw ApiError.notFound('Room type');

  if (req.body.totalRooms !== undefined && req.body.totalRooms < roomType.totalRooms) {
    const physicalRooms = await Room.countDocuments({ roomTypeId: roomType._id });
    if (req.body.totalRooms < physicalRooms) {
      throw ApiError.inventoryConflict(
        `Cannot set totalRooms to ${req.body.totalRooms}: ${physicalRooms} physical room(s) already exist for this room type`
      );
    }
  }

  ['name', 'basePrice', 'totalRooms', 'capacity', 'description', 'isActive'].forEach((field) => {
    if (req.body[field] !== undefined) roomType[field] = req.body[field];
  });

  await roomType.save();
  ok(res, 'Room type updated successfully', roomType);
});

/** DELETE /api/room-types/:id - admin. Soft delete, blocked while in use. */
const deleteRoomType = asyncHandler(async (req, res) => {
  const roomType = await RoomType.findById(req.params.id);
  if (!roomType) throw ApiError.notFound('Room type');

  const liveBookings = await Booking.countDocuments({
    roomTypeId: roomType._id,
    status: { $in: BLOCKING_STATUSES }
  });
  if (liveBookings > 0) {
    throw ApiError.inUse(
      `Cannot deactivate this room type: ${liveBookings} live booking(s) still reference it`
    );
  }

  roomType.isActive = false;
  await roomType.save();
  ok(res, 'Room type deactivated successfully', { _id: roomType._id, isActive: false });
});

/**
 * GET /api/room-types/:id/quote - public.
 * Price preview. Creates nothing and reserves nothing.
 */
const quote = asyncHandler(async (req, res) => {
  const { checkIn, checkOut } = req.query;
  const guests = req.query.guests ? Number(req.query.guests) : 1;

  const roomType = await RoomType.findById(req.params.id);
  if (!roomType || !roomType.isActive) throw ApiError.notFound('Room type');

  if (checkIn < todayUtc()) throw ApiError.pastDate('checkIn cannot be in the past');

  if (guests > roomType.capacity) {
    throw ApiError.capacityExceeded(
      `Requested ${guests} guest(s) but '${roomType.name}' has a capacity of ${roomType.capacity}`
    );
  }

  const { nightlyBreakdown, roomCharges } = await priceStayForRoomType(roomType, checkIn, checkOut);
  const totals = computeTotals({ nightlyBreakdown, addOns: [] });

  ok(res, 'Quote generated successfully', {
    roomType: { _id: roomType._id, name: roomType.name, basePrice: roomType.basePrice },
    checkIn,
    checkOut,
    nights: nightsBetween(checkIn, checkOut),
    guests,
    nightlyBreakdown,
    roomCharges: round2(roomCharges),
    ...totals
  });
});

module.exports = {
  createRoomType,
  listRoomTypesForHotel,
  updateRoomType,
  deleteRoomType,
  quote
};
