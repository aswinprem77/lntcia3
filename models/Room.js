const mongoose = require('mongoose');

/**
 * A physical, numbered room.
 *
 * Rooms are REFERENCED from roomTypes rather than embedded in them: a property
 * may have hundreds of rooms whose housekeeping status changes many times a
 * day, and embedding would force a rewrite of the whole parent room-type
 * document on every single housekeeping update.
 */
const roomSchema = new mongoose.Schema(
  {
    roomTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RoomType',
      required: [true, 'roomTypeId is required']
    },
    // (ext) Denormalized from roomType for staff hotel-scoping and so the
    // housekeeping board can filter by property without a join.
    hotelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hotel',
      required: [true, 'hotelId is required']
    },
    roomNumber: {
      type: String,
      required: [true, 'roomNumber is required'],
      trim: true
    },
    housekeepingStatus: {
      type: String,
      enum: {
        values: ['Clean', 'Dirty', 'Inspected', 'OutOfService'],
        message: '{VALUE} is not a valid housekeeping status. Allowed: Clean, Dirty, Inspected, OutOfService'
      },
      default: 'Clean'
    },
    // (ext) Null when vacant. Set at check-in, cleared at check-out. This is
    // the single source of truth for occupancy -- there is deliberately no
    // separate isOccupied boolean to fall out of sync with it.
    currentBookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null
    }
  },
  { timestamps: true }
);

// Very common fetch-by-relation query (all rooms of a type, at check-in).
roomSchema.index({ roomTypeId: 1 });
// (ext) Prevents two rooms sharing a number within one property.
roomSchema.index({ hotelId: 1, roomNumber: 1 }, { unique: true });
roomSchema.index({ hotelId: 1, housekeepingStatus: 1 });

module.exports = mongoose.model('Room', roomSchema);
