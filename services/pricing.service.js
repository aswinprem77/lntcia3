const PricingRule = require('../models/PricingRule');
const { eachNight, isWeekendNight, toUtcDate, round2 } = require('../utils/dates');

/**
 * Dynamic pricing engine.
 *
 * Rate resolution, per night:
 *   1. Collect active rules for the room type where the night falls inside
 *      [startDate, endDate] (a rule with no date range always qualifies on
 *      date) AND where appliesToWeekend is false, or the night is a Fri/Sat.
 *   2. If none match, the multiplier is exactly 1.0 -- there is no implicit
 *      surcharge anywhere in this function.
 *   3. If several match, the highest priority wins; ties break on the highest
 *      multiplier.
 *   4. nightRate = round(basePrice * multiplier, 2)
 *
 * Multipliers are NEVER stacked. Exactly one rule wins each night. This is a
 * deliberate design decision: stacking makes the final rate depend on how many
 * overlapping campaigns happen to exist, which is neither predictable for the
 * guest nor explainable at the front desk.
 */

/** Does this rule apply to this specific night? */
const ruleAppliesToNight = (rule, night) => {
  if (!rule.isActive) return false;

  if (rule.startDate && toUtcDate(night) < toUtcDate(rule.startDate)) return false;
  if (rule.endDate && toUtcDate(night) > toUtcDate(rule.endDate)) return false;

  // A weekend-only rule is inert on Sun-Thu nights.
  if (rule.appliesToWeekend && !isWeekendNight(night)) return false;

  return true;
};

/** Highest priority wins; tie broken by the highest multiplier. */
const selectWinningRule = (candidates) => {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, rule) => {
    if (!best) return rule;
    if (rule.priority !== best.priority) return rule.priority > best.priority ? rule : best;
    return rule.multiplier > best.multiplier ? rule : best;
  }, null);
};

/**
 * Prices a stay. Returns the per-night breakdown plus the room charge total.
 * Pure: it takes the rules as an argument and touches no database.
 */
const priceStay = (roomType, checkIn, checkOut, rules = []) => {
  const nights = eachNight(checkIn, checkOut);

  const nightlyBreakdown = nights.map((night) => {
    const candidates = rules.filter((rule) => ruleAppliesToNight(rule, night));
    const winner = selectWinningRule(candidates);
    const multiplier = winner ? winner.multiplier : 1.0;

    return {
      date: night,
      baseRate: roomType.basePrice,
      multiplier,
      rate: round2(roomType.basePrice * multiplier),
      appliedRule: winner ? winner.season : 'Standard Rate'
    };
  });

  const roomCharges = round2(nightlyBreakdown.reduce((sum, n) => sum + n.rate, 0));

  return { nights: nights.length, nightlyBreakdown, roomCharges };
};

/** Convenience wrapper that loads the active rules for the room type first. */
const priceStayForRoomType = async (roomType, checkIn, checkOut) => {
  const rules = await PricingRule.find({ roomTypeId: roomType._id, isActive: true }).lean();
  return priceStay(roomType, checkIn, checkOut, rules);
};

module.exports = { priceStay, priceStayForRoomType, ruleAppliesToNight, selectWinningRule };
