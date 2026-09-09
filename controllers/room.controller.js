const Room = require('../models/Room');
const RoomType = require('../models/RoomType');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, paginated, parsePagination } = require('../utils/response');
const { assertSameHotel } = require('../middleware/roles');

/**
 * POST /api/room-types/:roomTypeId/rooms - admin, or staff of that hotel.
 * hotelId is denormalized onto the room from its room type.
 */
const createRoom = asyncHandler(async (req, res) => {
  const roomType = await RoomType.findById(req.params.roomTypeId);
  if (!roomType) throw ApiError.notFound('Room type');

  // Staff may only add rooms to their own property.
  assertSameHotel(req.user, roomType.hotelId);

  const room = await Room.create({
    roomTypeId: roomType._id,
    hotelId: roomType.hotelId,
    roomNumber: req.body.roomNumber,
    housekeepingStatus: req.body.housekeepingStatus || 'Clean'
  });

  created(res, `Room ${room.roomNumber} created successfully`, room);
});

/** GET /api/rooms?hotelId=&roomTypeId=&housekeepingStatus= - staff/admin. */
const listRooms = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, 20);
  const filter = {};

  if (req.query.roomTypeId) filter.roomTypeId = req.query.roomTypeId;
  if (req.query.housekeepingStatus) filter.housekeepingStatus = req.query.housekeepingStatus;

  // Staff are pinned to their own hotel regardless of what they ask for.
  if (req.user.role === 'staff') {
    filter.hotelId = req.user.hotelId;
  } else if (req.query.hotelId) {
    filter.hotelId = req.query.hotelId;
  }

  const [rooms, total] = await Promise.all([
    Room.find(filter)
      .populate('roomTypeId', 'name capacity')
      .populate('currentBookingId', 'bookingRef status checkIn checkOut')
      .sort({ roomNumber: 1 })
      .skip(skip)
      .limit(limit),
    Room.countDocuments(filter)
  ]);

  paginated(res, 'Rooms retrieved successfully', rooms, { page, limit, total });
});

/**
 * PATCH /api/rooms/:id/housekeeping - staff of that hotel, or admin.
 *
 * A room with a guest currently in it cannot be taken out of service; the
 * occupant would have nowhere to go.
 */
const updateHousekeeping = asyncHandler(async (req, res) => {
  const room = await Room.findById(req.params.id);
  if (!room) throw ApiError.notFound('Room');

  assertSameHotel(req.user, room.hotelId);

  const next = req.body.housekeepingStatus;

  if (next === 'OutOfService' && room.currentBookingId) {
    throw ApiError.roomOccupied(
      `Room ${room.roomNumber} is currently occupied and cannot be marked OutOfService`
    );
  }

  room.housekeepingStatus = next;
  await room.save();

  ok(res, `Room ${room.roomNumber} is now ${next}`, room);
});

/**
 * GET /api/hotels/:hotelId/housekeeping-board - staff of that hotel, admin.
 * Rooms grouped by housekeeping status, for the floor supervisor's view.
 */
const housekeepingBoard = asyncHandler(async (req, res) => {
  const { hotelId } = req.params;
  assertSameHotel(req.user, hotelId);

  const rooms = await Room.find({ hotelId })
    .populate('roomTypeId', 'name')
    .populate('currentBookingId', 'bookingRef status')
    .sort({ roomNumber: 1 })
    .lean();

  const board = { Clean: [], Dirty: [], Inspected: [], OutOfService: [] };
  rooms.forEach((room) => {
    board[room.housekeepingStatus].push({
      _id: room._id,
      roomNumber: room.roomNumber,
      roomType: room.roomTypeId ? room.roomTypeId.name : null,
      occupied: Boolean(room.currentBookingId),
      currentBooking: room.currentBookingId || null
    });
  });

  ok(res, 'Housekeeping board retrieved successfully', {
    hotelId,
    totals: {
      Clean: board.Clean.length,
      Dirty: board.Dirty.length,
      Inspected: board.Inspected.length,
      OutOfService: board.OutOfService.length,
      total: rooms.length
    },
    board
  });
});

module.exports = { createRoom, listRooms, updateHousekeeping, housekeepingBoard };
