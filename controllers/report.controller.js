const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const RoomType = require('../models/RoomType');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const { toUtcDate, nightsBetween, round2, MS_PER_DAY } = require('../utils/dates');

/** Statuses that represent real, earned business. */
const REVENUE_STATUSES = ['Confirmed', 'CheckedIn', 'CheckedOut'];

/**
 * Parses and validates the reporting window. from and to are mandatory: a
 * report with an implicit window silently changes meaning between runs.
 */
const parseWindow = (query) => {
  if (!query.from || !query.to) {
    throw ApiError.validation('Both from and to are required (YYYY-MM-DD)');
  }
  const from = toUtcDate(query.from);
  const to = toUtcDate(query.to);
  if (!from || !to) throw ApiError.validation('from and to must be ISO-8601 dates');
  if (to <= from) throw ApiError.invalidDateRange('to must be strictly after from');
  return { from, to, windowNights: nightsBetween(from, to) };
};

/**
 * Nights of a booking that actually fall inside the reporting window.
 * A stay straddling the window boundary contributes only its overlapping part.
 */
const clippedNightsExpr = (from, to) => ({
  $max: [
    0,
    {
      $divide: [
        {
          $subtract: [
            { $min: ['$checkOut', to] },
            { $max: ['$checkIn', from] }
          ]
        },
        MS_PER_DAY
      ]
    }
  ]
});

/**
 * GET /api/admin/reports/occupancy - admin.
 *
 *   roomNightsSold  = sum of clipped nights across qualifying bookings
 *   roomNightsAvail = sum of (roomType.totalRooms x nights in the window)
 *   occupancyRate   = sold / available x 100
 *   ADR             = revenue / roomNightsSold
 *
 * Built as an aggregation pipeline rather than by loading bookings into the
 * application and looping, so the arithmetic happens next to the data.
 */
const occupancyReport = asyncHandler(async (req, res) => {
  const { from, to, windowNights } = parseWindow(req.query);
  const hotelId = req.query.hotelId ? new mongoose.Types.ObjectId(req.query.hotelId) : null;

  const bookingMatch = {
    status: { $in: REVENUE_STATUSES },
    checkIn: { $lt: to },
    checkOut: { $gt: from }
  };
  if (hotelId) bookingMatch.hotelId = hotelId;

  const soldPipeline = [
    { $match: bookingMatch },
    { $project: { hotelId: 1, totalAmount: 1, nights: clippedNightsExpr(from, to) } },
    {
      $group: {
        _id: '$hotelId',
        roomNightsSold: { $sum: '$nights' },
        revenue: { $sum: '$totalAmount' },
        bookings: { $sum: 1 }
      }
    },
    { $lookup: { from: 'hotels', localField: '_id', foreignField: '_id', as: 'hotel' } },
    { $unwind: '$hotel' },
    {
      $project: {
        _id: 0,
        hotelId: '$_id',
        hotelName: '$hotel.name',
        city: '$hotel.city',
        roomNightsSold: 1,
        revenue: 1,
        bookings: 1
      }
    }
  ];

  // Capacity side: inventory x nights in the window, per hotel.
  const capacityMatch = { isActive: true };
  if (hotelId) capacityMatch.hotelId = hotelId;

  const capacityPipeline = [
    { $match: capacityMatch },
    { $group: { _id: '$hotelId', totalRooms: { $sum: '$totalRooms' } } }
  ];

  const [sold, capacity] = await Promise.all([
    Booking.aggregate(soldPipeline),
    RoomType.aggregate(capacityPipeline)
  ]);

  const capacityByHotel = new Map(capacity.map((c) => [String(c._id), c.totalRooms]));
  const soldByHotel = new Map(sold.map((s) => [String(s.hotelId), s]));

  // Report every hotel with inventory, including those that sold nothing.
  const hotelIds = new Set([...capacityByHotel.keys(), ...soldByHotel.keys()]);

  const rows = Array.from(hotelIds).map((id) => {
    const s = soldByHotel.get(id);
    const totalRooms = capacityByHotel.get(id) || 0;
    const roomNightsAvail = totalRooms * windowNights;
    const roomNightsSold = s ? s.roomNightsSold : 0;
    const revenue = s ? s.revenue : 0;

    return {
      hotelId: id,
      hotelName: s ? s.hotelName : null,
      city: s ? s.city : null,
      bookings: s ? s.bookings : 0,
      totalRooms,
      windowNights,
      roomNightsAvailable: roomNightsAvail,
      roomNightsSold: round2(roomNightsSold),
      // Guarded: an empty period reports 0, never NaN or a division by zero.
      occupancyRate: roomNightsAvail > 0 ? round2((roomNightsSold / roomNightsAvail) * 100) : 0,
      revenue: round2(revenue),
      adr: roomNightsSold > 0 ? round2(revenue / roomNightsSold) : 0
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      roomNightsAvailable: acc.roomNightsAvailable + r.roomNightsAvailable,
      roomNightsSold: acc.roomNightsSold + r.roomNightsSold,
      revenue: acc.revenue + r.revenue,
      bookings: acc.bookings + r.bookings
    }),
    { roomNightsAvailable: 0, roomNightsSold: 0, revenue: 0, bookings: 0 }
  );

  ok(res, 'Occupancy report generated successfully', {
    window: { from, to, nights: windowNights },
    summary: {
      ...totals,
      roomNightsSold: round2(totals.roomNightsSold),
      revenue: round2(totals.revenue),
      occupancyRate:
        totals.roomNightsAvailable > 0
          ? round2((totals.roomNightsSold / totals.roomNightsAvailable) * 100)
          : 0,
      adr: totals.roomNightsSold > 0 ? round2(totals.revenue / totals.roomNightsSold) : 0
    },
    hotels: rows.sort((a, b) => b.occupancyRate - a.occupancyRate)
  });
});

/**
 * GET /api/admin/reports/revenue?groupBy=hotel|roomType|month - admin.
 * Same qualifying set as the occupancy report, grouped three different ways.
 */
const revenueReport = asyncHandler(async (req, res) => {
  const { from, to, windowNights } = parseWindow(req.query);
  const groupBy = req.query.groupBy || 'hotel';

  if (!['hotel', 'roomType', 'month'].includes(groupBy)) {
    throw ApiError.validation("groupBy must be one of: hotel, roomType, month");
  }

  const match = {
    status: { $in: REVENUE_STATUSES },
    checkIn: { $lt: to },
    checkOut: { $gt: from }
  };
  if (req.query.hotelId) match.hotelId = new mongoose.Types.ObjectId(req.query.hotelId);

  const pipeline = [
    { $match: match },
    {
      $project: {
        hotelId: 1,
        roomTypeId: 1,
        checkIn: 1,
        totalAmount: 1,
        nights: clippedNightsExpr(from, to)
      }
    }
  ];

  if (groupBy === 'month') {
    pipeline.push(
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$checkIn' } },
          revenue: { $sum: '$totalAmount' },
          roomNights: { $sum: '$nights' },
          bookings: { $sum: 1 }
        }
      },
      { $project: { _id: 0, group: '$_id', label: '$_id', revenue: 1, roomNights: 1, bookings: 1 } },
      { $sort: { group: 1 } }
    );
  } else {
    const isHotel = groupBy === 'hotel';
    pipeline.push(
      {
        $group: {
          _id: isHotel ? '$hotelId' : '$roomTypeId',
          revenue: { $sum: '$totalAmount' },
          roomNights: { $sum: '$nights' },
          bookings: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: isHotel ? 'hotels' : 'roomtypes',
          localField: '_id',
          foreignField: '_id',
          as: 'ref'
        }
      },
      { $unwind: { path: '$ref', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          group: '$_id',
          label: { $ifNull: ['$ref.name', 'Unknown'] },
          city: '$ref.city',
          revenue: 1,
          roomNights: 1,
          bookings: 1
        }
      },
      { $sort: { revenue: -1 } }
    );
  }

  const rows = await Booking.aggregate(pipeline);

  const shaped = rows.map((r) => ({
    ...r,
    revenue: round2(r.revenue),
    roomNights: round2(r.roomNights),
    adr: r.roomNights > 0 ? round2(r.revenue / r.roomNights) : 0
  }));

  const totalRevenue = round2(shaped.reduce((sum, r) => sum + r.revenue, 0));
  const totalNights = round2(shaped.reduce((sum, r) => sum + r.roomNights, 0));

  ok(res, `Revenue report generated successfully (grouped by ${groupBy})`, {
    window: { from, to, nights: windowNights },
    groupBy,
    summary: {
      totalRevenue,
      totalRoomNights: totalNights,
      adr: totalNights > 0 ? round2(totalRevenue / totalNights) : 0,
      groups: shaped.length
    },
    data: shaped
  });
});

module.exports = { occupancyReport, revenueReport };
