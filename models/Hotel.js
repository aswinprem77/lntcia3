const mongoose = require('mongoose');

const hotelSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Hotel name is required'],
      trim: true,
      maxlength: 120
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true
    },
    // Embedded: a short, bounded list always read with the hotel and never
    // queried on its own.
    amenities: { type: [String], default: [] },
    rating: {
      type: Number,
      min: [0, 'Rating cannot be below 0'],
      max: [5, 'Rating cannot exceed 5'],
      default: 0
    },
    // (ext) Street address for the invoice header.
    address: { type: String, trim: true, default: '' },
    // (ext) Soft delete. Inactive hotels are excluded from search.
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

// Speeds up name lookups and the admin dashboard listing.
hotelSchema.index({ name: 1 });
// (ext) The availability search filters on city first, then on isActive.
hotelSchema.index({ city: 1, isActive: 1 });
// The same brand may exist in two cities, but not twice in one city.
hotelSchema.index({ name: 1, city: 1 }, { unique: true });

module.exports = mongoose.model('Hotel', hotelSchema);
