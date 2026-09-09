const mongoose = require('mongoose');

const roomTypeSchema = new mongoose.Schema(
  {
    hotelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hotel',
      required: [true, 'hotelId is required']
    },
    name: {
      type: String,
      required: [true, 'Room type name is required'],
      trim: true
    },
    basePrice: {
      type: Number,
      required: [true, 'basePrice is required'],
      min: [0.01, 'basePrice must be greater than 0']
    },
    // The inventory ceiling used by the availability engine. Guests book a
    // room type, not a numbered room, so this -- not the count of physical
    // rooms documents -- is what limits how many bookings can overlap.
    totalRooms: {
      type: Number,
      required: [true, 'totalRooms is required'],
      min: [1, 'totalRooms must be at least 1'],
      validate: { validator: Number.isInteger, message: 'totalRooms must be a whole number' }
    },
    capacity: {
      type: Number,
      required: [true, 'capacity is required'],
      min: [1, 'capacity must be at least 1'],
      validate: { validator: Number.isInteger, message: 'capacity must be a whole number' }
    },
    // (ext) Marketing copy shown in search results.
    description: { type: String, default: '' },
    // (ext) Soft delete.
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

// Very common fetch-by-relation query (all room types for a hotel).
roomTypeSchema.index({ hotelId: 1 });
roomTypeSchema.index({ hotelId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('RoomType', roomTypeSchema);
