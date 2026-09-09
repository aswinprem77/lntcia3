const Hotel = require('../models/Hotel');
const RoomType = require('../models/RoomType');
const Booking = require('../models/Booking');
const PricingRule = require('../models/PricingRule');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created, paginated, parsePagination } = require('../utils/response');
const { todayUtc, nightsBetween, round2 } = require('../utils/dates');
const { countBookedUnits, BLOCKING_STATUSES } = require('../services/availability.service');
const { priceStay } = require('../services/pricing.service');

/** POST /api/hotels - admin. */
const createHotel = asyncHandler(async (req, res) => {
  const { name, city, amenities, rating, address } = req.body;
  const hotel = await Hotel.create({ name, city, amenities, rating, address });
  created(res, 'Hotel created successfully', hotel);
});

/** GET /api/hotels - public, paginated. */
const listHotels = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = { isActive: true };

  if (req.query.city) filter.city = new RegExp(`^${req.query.city}$`, 'i');
  if (req.query.minRating) filter.rating = { $gte: Number(req.query.minRating) };

  const [hotels, total] = await Promise.all([
    Hotel.find(filter).sort({ rating: -1, name: 1 }).skip(skip).limit(limit),
    Hotel.countDocuments(filter)
  ]);

  paginated(res, 'Hotels retrieved successfully', hotels, { page, limit, total });
});

/** GET /api/hotels/:id - public. */
const getHotel = asyncHandler(async (req, res) => {
  const hotel = await Hotel.findById(req.params.id);
  if (!hotel) throw ApiError.notFound('Hotel');

  const roomTypes = await RoomType.find({ hotelId: hotel._id, isActive: true });
  ok(res, 'Hotel retrieved successfully', { ...hotel.toObject(), roomTypes });
});

/** PUT /api/hotels/:id - admin. */
const updateHotel = asyncHandler(async (req, res) => {
  const hotel = await Hotel.findById(req.params.id);
  if (!hotel) throw ApiError.notFound('Hotel');

  const updatable = ['name', 'city', 'amenities', 'rating', 'address', 'isActive'];
  updatable.forEach((field) => {
    if (req.body[field] !== undefined) hotel[field] = req.body[field];
  });

  await hotel.save();
  ok(res, 'Hotel updated successfully', hotel);
});

/**
 * DELETE /api/hotels/:id - admin. Soft delete.
 *
 * Refused while the property still has live bookings: deactivating it would
 * strand guests who are booked in or currently staying.
 */
const deleteHotel = asyncHandler(async (req, res) => {
  const hotel = await Hotel.findById(req.params.id);
  if (!hotel) throw ApiError.notFound('Hotel');

  const liveBookings = await Booking.countDocuments({
    hotelId: hotel._id,
    status: { $in: BLOCKING_STATUSES }
  });

  if (liveBookings > 0) {
    throw ApiError.inUse(
      `Cannot deactivate this hotel: ${liveBookings} booking(s) are still Reserved, Confirmed or CheckedIn`
    );
  }

  hotel.isActive = false;
  await hotel.save();
  ok(res, 'Hotel deactivated successfully', { _id: hotel._id, isActive: hotel.isActive });
});

/**
 * GET /api/hotels/search - public.
 *
 * Returns, per hotel, only the room types that still have inventory for the
 * whole requested window, each with a live availability count and a quoted
 * total for the stay.
 */
const searchAvailability = asyncHandler(async (req, res) => {
  const { checkIn, checkOut } = req.query; // already UTC dates from the validator
  const guests = req.query.guests ? Number(req.query.guests) : 1;
  const { page, limit, skip } = parsePagination(req.query);

  if (checkIn < todayUtc()) {
    throw ApiError.pastDate('checkIn cannot be in the past');
  }

  const hotelFilter = { isActive: true };
  if (req.query.city) hotelFilter.city = new RegExp(`^${req.query.city}$`, 'i');
  if (req.query.minRating) hotelFilter.rating = { $gte: Number(req.query.minRating) };

  const hotels = await Hotel.find(hotelFilter).sort({ rating: -1, name: 1 }).lean();
  const hotelIds = hotels.map((h) => h._id);

  // A room type that cannot physically hold the party is filtered out here.
  const roomTypes = await RoomType.find({
    hotelId: { $in: hotelIds },
    isActive: true,
    capacity: { $gte: guests }
  }).lean();

  const roomTypeIds = roomTypes.map((rt) => rt._id);
  const nights = nightsBetween(checkIn, checkOut);

  // Two bulk queries instead of one pair per room type: the booked-unit counts
  // come back from a single aggregation and the rules from a single find.
  const [bookedCounts, allRules] = await Promise.all([
    Booking.aggregate([
      {
        $match: {
          roomTypeId: { $in: roomTypeIds },
          status: { $in: BLOCKING_STATUSES },
          checkIn: { $lt: checkOut },
          checkOut: { $gt: checkIn }
        }
      },
      { $group: { _id: '$roomTypeId', booked: { $sum: 1 } } }
    ]),
    PricingRule.find({ roomTypeId: { $in: roomTypeIds }, isActive: true }).lean()
  ]);

  const bookedByType = new Map(bookedCounts.map((r) => [String(r._id), r.booked]));
  const rulesByType = new Map();
  allRules.forEach((rule) => {
    const key = String(rule.roomTypeId);
    if (!rulesByType.has(key)) rulesByType.set(key, []);
    rulesByType.get(key).push(rule);
  });

  const byHotel = new Map();
  for (const rt of roomTypes) {
    const booked = bookedByType.get(String(rt._id)) || 0;
    const availableRooms = rt.totalRooms - booked;
    if (availableRooms <= 0) continue; // fully committed for this window

    const { nightlyBreakdown, roomCharges } = priceStay(
      rt,
      checkIn,
      checkOut,
      rulesByType.get(String(rt._id)) || []
    );

    const hotelKey = String(rt.hotelId);
    if (!byHotel.has(hotelKey)) {
      const hotel = hotels.find((h) => String(h._id) === hotelKey);
      byHotel.set(hotelKey, {
        hotel: {
          _id: hotel._id,
          name: hotel.name,
          city: hotel.city,
          rating: hotel.rating,
          amenities: hotel.amenities,
          address: hotel.address
        },
        roomTypes: []
      });
    }

    byHotel.get(hotelKey).roomTypes.push({
      _id: rt._id,
      name: rt.name,
      basePrice: rt.basePrice,
      capacity: rt.capacity,
      totalRooms: rt.totalRooms,
      availableRooms,
      nights,
      quotedTotal: round2(roomCharges),
      nightlyBreakdown
    });
  }

  const results = Array.from(byHotel.values());
  const pageSlice = results.slice(skip, skip + limit);

  paginated(
    res,
    `${results.length} hotel(s) have availability for the requested dates`,
    pageSlice,
    { page, limit, total: results.length }
  );
});

module.exports = {
  createHotel,
  listHotels,
  getHotel,
  updateHotel,
  deleteHotel,
  searchAvailability
};
