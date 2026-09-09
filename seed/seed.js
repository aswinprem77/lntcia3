/**
 * Demo data loader.
 *
 * Idempotent: it clears the collections it owns and rebuilds them from the
 * definitions below, so running it any number of times leaves the database in
 * exactly the same state. Dates are all relative to the run date, which keeps
 * the "upcoming stay", "check in today" and "past stay" demos working forever
 * without editing the file.
 *
 * Usage: npm run seed
 */
const mongoose = require('mongoose');
const env = require('../config/env');

const User = require('../models/User');
const Hotel = require('../models/Hotel');
const RoomType = require('../models/RoomType');
const Room = require('../models/Room');
const PricingRule = require('../models/PricingRule');
const Booking = require('../models/Booking');

const { priceStay } = require('../services/pricing.service');
const { computeTotals } = require('../services/invoice.service');
const { todayUtc, toUtcDate, MS_PER_DAY } = require('../utils/dates');

/** Day offset from today, as a date-only UTC value. */
const day = (offset) => new Date(todayUtc().getTime() + offset * MS_PER_DAY);

let refCounter = 0;
const makeRef = () => `BK-${new Date().getUTCFullYear()}-${String(++refCounter).padStart(6, '0')}`;

/**
 * Builds a booking with a real, server-computed price so that the seeded
 * invoices reconcile exactly the way a booking made through the API would.
 */
const buildBooking = (overrides, roomType, rules, addOns = []) => {
  const { nightlyBreakdown } = priceStay(roomType, overrides.checkIn, overrides.checkOut, rules);
  const totals = computeTotals({ nightlyBreakdown, addOns });

  return {
    ...overrides,
    bookingRef: makeRef(),
    nightlyBreakdown,
    addOns,
    taxAmount: totals.taxAmount,
    totalAmount: totals.grandTotal
  };
};

const seed = async () => {
  await mongoose.connect(env.mongoUri);
  console.log(`[Seed] Connected to ${env.mongoUri}`);

  await Promise.all([
    User.deleteMany({}),
    Hotel.deleteMany({}),
    RoomType.deleteMany({}),
    Room.deleteMany({}),
    PricingRule.deleteMany({}),
    Booking.deleteMany({}),
    mongoose.connection.db.collection('counters').deleteMany({})
  ]);
  console.log('[Seed] Cleared existing data.');

  // --- Hotels ------------------------------------------------------------
  const [blr, kochi, goa] = await Hotel.create([
    {
      name: 'Grand Palace',
      city: 'Bengaluru',
      amenities: ['WiFi', 'Pool', 'Gym', 'Parking', 'Restaurant'],
      rating: 4.6,
      address: '88 MG Road, Bengaluru 560001'
    },
    {
      name: 'Backwater Retreat',
      city: 'Kochi',
      amenities: ['WiFi', 'Pool', 'Spa', 'Airport Shuttle'],
      rating: 4.4,
      address: 'Marine Drive, Kochi 682031'
    },
    {
      name: 'Azure Sands',
      city: 'Goa',
      amenities: ['WiFi', 'Private Beach', 'Pool', 'Bar'],
      rating: 4.8,
      address: 'Candolim Beach Road, North Goa 403515'
    }
  ]);
  console.log('[Seed] 3 hotels created across 3 cities.');

  // --- Users -------------------------------------------------------------
  // Passwords are hashed by the User pre-save hook.
  const admin = await User.create({
    name: 'Priya Menon',
    email: 'admin@hotel.test',
    passwordHash: 'Admin@123',
    role: 'admin',
    phone: '9880011223'
  });

  const [staffBlr, staffKochi] = await User.create([
    {
      name: 'Rohan Verma',
      email: 'staff.blr@hotel.test',
      passwordHash: 'Staff@123',
      role: 'staff',
      hotelId: blr._id,
      phone: '9880044556'
    },
    {
      name: 'Anita Thomas',
      email: 'staff.kochi@hotel.test',
      passwordHash: 'Staff@123',
      role: 'staff',
      hotelId: kochi._id,
      phone: '9880077889'
    }
  ]);

  const [guest1, guest2, guest3] = await User.create([
    { name: 'Rahul Sharma', email: 'guest1@hotel.test', passwordHash: 'Guest@123', role: 'guest', phone: '9900123456' },
    { name: 'Sneha Iyer', email: 'guest2@hotel.test', passwordHash: 'Guest@123', role: 'guest', phone: '9900234567' },
    { name: 'Arjun Nair', email: 'guest3@hotel.test', passwordHash: 'Guest@123', role: 'guest', phone: '9900345678' }
  ]);
  console.log('[Seed] 1 admin, 2 staff (hotel-scoped), 3 guests created.');

  // --- Room types --------------------------------------------------------
  // 'Presidential Suite' is deliberately kept at totalRooms: 1 so the
  // double-booking demo needs only a single existing booking to trigger.
  const roomTypes = await RoomType.create([
    { hotelId: blr._id, name: 'Deluxe King', basePrice: 5500, totalRooms: 6, capacity: 2, description: 'City-view king room.' },
    { hotelId: blr._id, name: 'Executive Suite', basePrice: 9500, totalRooms: 3, capacity: 3, description: 'Separate lounge and club access.' },
    { hotelId: blr._id, name: 'Presidential Suite', basePrice: 22000, totalRooms: 1, capacity: 4, description: 'The only one in the property.' },
    { hotelId: kochi._id, name: 'Lake View Twin', basePrice: 4200, totalRooms: 5, capacity: 2, description: 'Twin beds facing the backwaters.' },
    { hotelId: kochi._id, name: 'Heritage Suite', basePrice: 7800, totalRooms: 2, capacity: 4, description: 'Colonial-era wing.' },
    { hotelId: goa._id, name: 'Ocean Cabana', basePrice: 7800, totalRooms: 4, capacity: 2, description: 'Steps from the sand.' },
    { hotelId: goa._id, name: 'Sunset Villa', basePrice: 14500, totalRooms: 2, capacity: 4, description: 'Private plunge pool.' }
  ]);

  const [deluxeKing, execSuite, presidential, lakeTwin, heritageSuite, oceanCabana, sunsetVilla] = roomTypes;
  console.log('[Seed] 7 room types created (one at totalRooms: 1).');

  // --- Physical rooms ----------------------------------------------------
  // One room document per unit of totalRooms, with a mix of housekeeping
  // states so the board and the check-in room picker both have something
  // interesting to show.
  const HOUSEKEEPING_CYCLE = ['Clean', 'Clean', 'Inspected', 'Dirty', 'Clean', 'OutOfService'];
  const roomDocs = [];
  const floorPrefix = { [String(blr._id)]: '', [String(kochi._id)]: 'K', [String(goa._id)]: 'G' };

  roomTypes.forEach((rt, typeIndex) => {
    for (let i = 0; i < rt.totalRooms; i += 1) {
      roomDocs.push({
        roomTypeId: rt._id,
        hotelId: rt.hotelId,
        roomNumber: `${floorPrefix[String(rt.hotelId)]}${typeIndex + 1}0${i + 1}`,
        // Keep the first room of every type Clean so check-in always succeeds.
        housekeepingStatus: i === 0 ? 'Clean' : HOUSEKEEPING_CYCLE[i % HOUSEKEEPING_CYCLE.length]
      });
    }
  });

  const rooms = await Room.create(roomDocs);
  console.log(`[Seed] ${rooms.length} physical rooms created with mixed housekeeping states.`);

  // --- Pricing rules -----------------------------------------------------
  // Every priced room type gets a weekend rule and a seasonal rule. Where both
  // match a Friday or Saturday night inside the season window, the seasonal
  // rule wins on priority -- and the multipliers are NOT combined.
  const ruleDocs = [];
  [deluxeKing, execSuite, presidential, lakeTwin, heritageSuite, oceanCabana, sunsetVilla].forEach((rt) => {
    ruleDocs.push({
      roomTypeId: rt._id,
      season: 'Weekend',
      multiplier: 1.25,
      appliesToWeekend: true,
      priority: 1,
      isActive: true
    });
    ruleDocs.push({
      roomTypeId: rt._id,
      season: 'Peak-Winter',
      multiplier: 1.5,
      startDate: day(20),
      endDate: day(60),
      appliesToWeekend: false,
      priority: 2,
      isActive: true
    });
  });

  const rules = await PricingRule.create(ruleDocs);
  console.log(`[Seed] ${rules.length} pricing rules created (weekend + seasonal per room type).`);

  const rulesFor = (roomTypeId) => rules.filter((r) => String(r.roomTypeId) === String(roomTypeId));

  // --- Bookings ----------------------------------------------------------
  // Spread across every status, including a completed past stay so the
  // occupancy report returns non-zero numbers on a first run.
  const cleanBlrDeluxe = rooms.find(
    (r) => String(r.roomTypeId) === String(deluxeKing._id) && r.housekeepingStatus === 'Clean'
  );

  const bookingDefs = [
    // 1. Reserved, far out -> demonstrates the 100% refund tier and /confirm.
    buildBooking(
      {
        guestId: guest1._id, hotelId: blr._id, roomTypeId: deluxeKing._id,
        checkIn: day(10), checkOut: day(13), guests: 2, status: 'Reserved',
        statusHistory: [{ from: 'NEW', to: 'Reserved', byUserId: guest1._id, at: new Date() }]
      },
      deluxeKing, rulesFor(deluxeKing._id),
      [{ label: 'Airport pickup', amount: 1200 }]
    ),
    // 2. Reserved, 4 days out -> the 50% refund tier.
    buildBooking(
      {
        guestId: guest2._id, hotelId: kochi._id, roomTypeId: lakeTwin._id,
        checkIn: day(4), checkOut: day(6), guests: 2, status: 'Reserved',
        statusHistory: [{ from: 'NEW', to: 'Reserved', byUserId: guest2._id, at: new Date() }]
      },
      lakeTwin, rulesFor(lakeTwin._id)
    ),
    // 3. Reserved, tomorrow -> the 0% refund tier.
    buildBooking(
      {
        guestId: guest3._id, hotelId: goa._id, roomTypeId: oceanCabana._id,
        checkIn: day(1), checkOut: day(3), guests: 2, status: 'Reserved',
        statusHistory: [{ from: 'NEW', to: 'Reserved', byUserId: guest3._id, at: new Date() }]
      },
      oceanCabana, rulesFor(oceanCabana._id)
    ),
    // 4. Confirmed and starting today -> ready for the check-in demo.
    buildBooking(
      {
        guestId: guest1._id, hotelId: blr._id, roomTypeId: execSuite._id,
        checkIn: day(0), checkOut: day(3), guests: 2, status: 'Confirmed',
        statusHistory: [
          { from: 'NEW', to: 'Reserved', byUserId: guest1._id, at: new Date() },
          { from: 'Reserved', to: 'Confirmed', byUserId: staffBlr._id, at: new Date() }
        ]
      },
      execSuite, rulesFor(execSuite._id)
    ),
    // 5. Confirmed, holds the ONLY Presidential Suite -> booking it again for
    //    an overlapping range is the 409 NO_AVAILABILITY demo.
    buildBooking(
      {
        guestId: guest2._id, hotelId: blr._id, roomTypeId: presidential._id,
        checkIn: day(5), checkOut: day(8), guests: 3, status: 'Confirmed',
        statusHistory: [
          { from: 'NEW', to: 'Reserved', byUserId: guest2._id, at: new Date() },
          { from: 'Reserved', to: 'Confirmed', byUserId: staffBlr._id, at: new Date() }
        ]
      },
      presidential, rulesFor(presidential._id)
    ),
    // 6. Currently in-house -> ready for the check-out demo.
    buildBooking(
      {
        guestId: guest3._id, hotelId: blr._id, roomTypeId: deluxeKing._id,
        checkIn: day(-1), checkOut: day(2), guests: 1, status: 'CheckedIn',
        assignedRoomId: cleanBlrDeluxe ? cleanBlrDeluxe._id : null,
        actualCheckInAt: new Date(Date.now() - MS_PER_DAY),
        statusHistory: [
          { from: 'NEW', to: 'Reserved', byUserId: guest3._id, at: new Date() },
          { from: 'Reserved', to: 'Confirmed', byUserId: staffBlr._id, at: new Date() },
          { from: 'Confirmed', to: 'CheckedIn', byUserId: staffBlr._id, at: new Date() }
        ]
      },
      deluxeKing, rulesFor(deluxeKing._id)
    ),
    // 7. Completed past stay -> gives the occupancy report real numbers.
    buildBooking(
      {
        guestId: guest1._id, hotelId: kochi._id, roomTypeId: heritageSuite._id,
        checkIn: day(-12), checkOut: day(-8), guests: 3, status: 'CheckedOut',
        actualCheckInAt: new Date(Date.now() - 12 * MS_PER_DAY),
        actualCheckOutAt: new Date(Date.now() - 8 * MS_PER_DAY),
        statusHistory: [
          { from: 'NEW', to: 'Reserved', byUserId: guest1._id, at: new Date() },
          { from: 'Reserved', to: 'Confirmed', byUserId: staffKochi._id, at: new Date() },
          { from: 'Confirmed', to: 'CheckedIn', byUserId: staffKochi._id, at: new Date() },
          { from: 'CheckedIn', to: 'CheckedOut', byUserId: staffKochi._id, at: new Date() }
        ]
      },
      heritageSuite, rulesFor(heritageSuite._id)
    ),
    // 8. Cancelled -> its inventory is already back in search results.
    buildBooking(
      {
        guestId: guest2._id, hotelId: goa._id, roomTypeId: sunsetVilla._id,
        checkIn: day(15), checkOut: day(18), guests: 4, status: 'Cancelled',
        cancellation: {
          cancelledAt: new Date(),
          refundPercent: 100,
          refundAmount: 0, // overwritten below once totalAmount is known
          reason: 'Change of travel plans'
        },
        statusHistory: [
          { from: 'NEW', to: 'Reserved', byUserId: guest2._id, at: new Date() },
          { from: 'Reserved', to: 'Cancelled', byUserId: guest2._id, at: new Date() }
        ]
      },
      sunsetVilla, rulesFor(sunsetVilla._id)
    )
  ];

  // The cancelled booking was 15 days out, so it earns a full refund.
  const cancelled = bookingDefs[7];
  cancelled.cancellation.refundAmount = cancelled.totalAmount;

  const bookings = await Booking.create(bookingDefs);

  // Link the in-house guest to their physical room.
  const inHouse = bookings.find((b) => b.status === 'CheckedIn');
  if (inHouse && inHouse.assignedRoomId) {
    await Room.updateOne(
      { _id: inHouse.assignedRoomId },
      { $set: { currentBookingId: inHouse._id } }
    );
  }

  console.log(`[Seed] ${bookings.length} bookings created across every status.`);

  // Keep API-generated refs from colliding with the seeded ones.
  await mongoose.connection.db.collection('counters').updateOne(
    { _id: `bookingRef-${new Date().getUTCFullYear()}` },
    { $set: { seq: refCounter } },
    { upsert: true }
  );

  const presidentialBooking = bookings[4];

  console.log(`
============================================================
  SEED COMPLETE
------------------------------------------------------------
  Demo credentials (demo-only passwords, documented in README)

  Admin        admin@hotel.test        Admin@123
  Staff (BLR)  staff.blr@hotel.test    Staff@123
  Staff (KOC)  staff.kochi@hotel.test  Staff@123
  Guest 1      guest1@hotel.test       Guest@123
  Guest 2      guest2@hotel.test       Guest@123
  Guest 3      guest3@hotel.test       Guest@123
------------------------------------------------------------
  Handy ids for the demo:
  Bengaluru hotel   ${blr._id}
  Deluxe King       ${deluxeKing._id}
  Presidential (1)  ${presidential._id}
  Booked ${toUtcDate(presidentialBooking.checkIn).toISOString().split('T')[0]} -> ${toUtcDate(presidentialBooking.checkOut).toISOString().split('T')[0]}  (book it again for a 409)
============================================================
`);

  await mongoose.disconnect();
  process.exit(0);
};

seed().catch(async (error) => {
  console.error('[Seed] Failed:', error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
