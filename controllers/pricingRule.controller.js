const PricingRule = require('../models/PricingRule');
const RoomType = require('../models/RoomType');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const { toUtcDate } = require('../utils/dates');

/** POST /api/room-types/:roomTypeId/pricing-rules - admin. */
const createPricingRule = asyncHandler(async (req, res) => {
  const roomType = await RoomType.findById(req.params.roomTypeId);
  if (!roomType) throw ApiError.notFound('Room type');

  const { season, multiplier, startDate, endDate, appliesToWeekend, priority, isActive } = req.body;

  const rule = await PricingRule.create({
    roomTypeId: roomType._id,
    season,
    multiplier,
    startDate: startDate ? toUtcDate(startDate) : null,
    endDate: endDate ? toUtcDate(endDate) : null,
    appliesToWeekend,
    priority,
    isActive
  });

  created(res, 'Pricing rule created successfully', rule);
});

/** GET /api/room-types/:roomTypeId/pricing-rules - staff/admin. */
const listPricingRules = asyncHandler(async (req, res) => {
  const rules = await PricingRule.find({ roomTypeId: req.params.roomTypeId }).sort({
    priority: -1,
    multiplier: -1
  });
  ok(res, 'Pricing rules retrieved successfully', rules);
});

/** PUT /api/pricing-rules/:id - admin. */
const updatePricingRule = asyncHandler(async (req, res) => {
  const rule = await PricingRule.findById(req.params.id);
  if (!rule) throw ApiError.notFound('Pricing rule');

  ['season', 'multiplier', 'appliesToWeekend', 'priority', 'isActive'].forEach((field) => {
    if (req.body[field] !== undefined) rule[field] = req.body[field];
  });
  if (req.body.startDate !== undefined) {
    rule.startDate = req.body.startDate ? toUtcDate(req.body.startDate) : null;
  }
  if (req.body.endDate !== undefined) {
    rule.endDate = req.body.endDate ? toUtcDate(req.body.endDate) : null;
  }

  await rule.save();
  ok(res, 'Pricing rule updated successfully', rule);
});

/** DELETE /api/pricing-rules/:id - admin. */
const deletePricingRule = asyncHandler(async (req, res) => {
  const rule = await PricingRule.findByIdAndDelete(req.params.id);
  if (!rule) throw ApiError.notFound('Pricing rule');
  ok(res, 'Pricing rule deleted successfully', { _id: rule._id });
});

module.exports = { createPricingRule, listPricingRules, updatePricingRule, deletePricingRule };
