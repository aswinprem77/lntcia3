const { daysUntil, round2 } = require('../utils/dates');

/**
 * Cancellation refund policy.
 *
 * Tiers are measured in whole days between the moment of cancellation and the
 * booking's check-in date:
 *
 *   >= 7 days   -> 100%
 *   3 to 6 days ->  50%
 *   < 3 days    ->   0%
 *
 * A booking already CheckedIn or CheckedOut is not cancellable at all; that
 * rule lives in the status service, not here, because it is a state-machine
 * question rather than a pricing one.
 */
const TIERS = [
  { minDays: 7, refundPercent: 100, label: 'Free cancellation (7 or more days before check-in)' },
  { minDays: 3, refundPercent: 50, label: 'Partial refund (3 to 6 days before check-in)' },
  { minDays: -Infinity, refundPercent: 0, label: 'Non-refundable (less than 3 days before check-in)' }
];

const resolveTier = (daysBefore) => TIERS.find((tier) => daysBefore >= tier.minDays);

/**
 * Computes the refund for a booking cancelled now.
 * refundAmount = round(totalAmount * refundPercent / 100, 2)
 */
const calculateRefund = (checkIn, totalAmount, cancelledAt = new Date()) => {
  const daysBefore = daysUntil(checkIn, cancelledAt);
  const tier = resolveTier(daysBefore);

  return {
    daysBeforeCheckIn: daysBefore,
    refundPercent: tier.refundPercent,
    refundAmount: round2((totalAmount * tier.refundPercent) / 100),
    tier: tier.label
  };
};

module.exports = { TIERS, calculateRefund };
