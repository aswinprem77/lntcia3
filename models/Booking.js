const mongoose = require('mongoose');

/**
 * One priced night. Embedded because the breakdown is priced once at booking
 * time, is always read together with its booking, is never queried on its own,
 * and must not change afterwards even if the room type's basePrice or the
 * pricing rules are later edited.
 */
const nightlyBreakdownSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    baseRate: { type: Number, required: true },
    multiplier: { type: Number, required: true, default: 1.0 },
    rate: { type: Number, required: true },
    // Which rule won this night, for the invoice and for explaining a quote.
    appliedRule: { type: String, default: 'Standard Rate' }
  },
  { _id: false }
);

const addOnSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

/** Audit trail entry. Embedded, append-only, small, always read with parent. */
const statusHistorySchema = new mongoose.Schema(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    byUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date, default: Date.now }
  },
  { _id: false }
);

const cancellationSchema = new mongoose.Schema(
  {
    cancelledAt: { type: Date, required: true },
    refundPercent: { type: Number, required: true },
    refundAmount: { type: Number, required: true },
    reason: { type: String, default: '' }
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    // guestId / hotelId / roomTypeId are REFERENCED: those documents are
    // large, shared across many bookings, and updated independently of any
    // one booking.
    guestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'guestId is required']
    },
    hotelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hotel',
      required: [true, 'hotelId is required']
    },
    roomTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RoomType',
      required: [true, 'roomTypeId is required']
    },
    checkIn: { type: Date, required: [true, 'checkIn is required'] },
    checkOut: { type: Date, required: [true, 'checkOut is required'] },
    status: {
      type: String,
      enum: {
        values: ['Reserved', 'Confirmed', 'CheckedIn', 'CheckedOut', 'Cancelled'],
        message: '{VALUE} is not a valid booking status'
      },
      default: 'Reserved'
    },
    // Always computed server-side from the room type and the pricing rules.
    // A client-supplied value is stripped by the validator layer.
    totalAmount: { type: Number, required: true },

    // (ext) Human-readable reference quoted to the guest, e.g. BK-2026-000137.
    bookingRef: { type: String, required: true, unique: true },
    // (ext) Requested occupancy, validated against roomType.capacity.
    guests: { type: Number, required: true, min: 1, default: 1 },
    // (ext) Embedded price snapshot, add-ons and audit trail.
    nightlyBreakdown: { type: [nightlyBreakdownSchema], default: [] },
    addOns: { type: [addOnSchema], default: [] },
    taxAmount: { type: Number, default: 0 },
    // (ext) The physical room, assigned only at check-in.
    assignedRoomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      default: null
    },
    actualCheckInAt: { type: Date, default: null },
    actualCheckOutAt: { type: Date, default: null },
    // (ext) Present only once the booking has been cancelled.
    cancellation: { type: cancellationSchema, default: undefined },
    statusHistory: { type: [statusHistorySchema], default: [] }
  },
  { timestamps: true }
);

// Booking-history lookup for a guest.
bookingSchema.index({ guestId: 1 });
bookingSchema.index({ bookingRef: 1 }, { unique: true });
/**
 * (ext) The hot path. The availability engine runs an overlap count filtered
 * by roomTypeId + the two date bounds + status on every search result and on
 * every booking attempt; this index covers that query end to end.
 */
bookingSchema.index({ roomTypeId: 1, checkIn: 1, checkOut: 1, status: 1 });
bookingSchema.index({ hotelId: 1, status: 1 });

/** Nights slept, derived rather than stored so it cannot drift. */
bookingSchema.virtual('nights').get(function () {
  if (!this.checkIn || !this.checkOut) return 0;
  return Math.round((this.checkOut - this.checkIn) / (24 * 60 * 60 * 1000));
});

bookingSchema.set('toJSON', { virtuals: true });
bookingSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Booking', bookingSchema);
