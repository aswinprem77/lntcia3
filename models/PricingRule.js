const mongoose = require('mongoose');

/**
 * A seasonal or weekend rate multiplier for one room type.
 *
 * startDate/endDate/appliesToWeekend/priority are extensions to the base
 * brief. Without them `season` would only be a label with nothing to evaluate
 * against; with them the rate engine can actually decide which rule applies to
 * a given night and which one wins when several do.
 */
const pricingRuleSchema = new mongoose.Schema(
  {
    roomTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RoomType',
      required: [true, 'roomTypeId is required']
    },
    season: {
      type: String,
      required: [true, 'season label is required'],
      trim: true
    },
    multiplier: {
      type: Number,
      required: [true, 'multiplier is required'],
      min: [0.1, 'multiplier must be at least 0.1'],
      max: [5.0, 'multiplier cannot exceed 5.0']
    },
    // (ext) Optional window. A rule with no dates always qualifies on date.
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    // (ext) When true the rule applies only to Friday and Saturday nights.
    appliesToWeekend: { type: Boolean, default: false },
    // (ext) Highest priority wins when several rules match the same night.
    priority: { type: Number, default: 0 },
    // (ext) Retire a rule without deleting it, preserving historic intent.
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

// (ext) Rate resolution loads exactly this set on every quote and booking.
pricingRuleSchema.index({ roomTypeId: 1, isActive: 1 });

module.exports = mongoose.model('PricingRule', pricingRuleSchema);
