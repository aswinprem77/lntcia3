const env = require('../config/env');
const { round2, nightsBetween } = require('../utils/dates');

/**
 * Invoice totals.
 *
 *   roomCharges = sum of nightlyBreakdown[].rate
 *   addOnTotal  = sum of addOns[].amount
 *   subtotal    = roomCharges + addOnTotal
 *   taxAmount   = round(subtotal * TAX_PERCENT / 100, 2)
 *   grandTotal  = subtotal + taxAmount
 *
 * Computed from the booking's embedded price snapshot rather than from the
 * room type's live basePrice, so re-issuing an old invoice after a price
 * change still reproduces the original bill exactly.
 */
const computeTotals = (booking) => {
  const roomCharges = round2((booking.nightlyBreakdown || []).reduce((sum, n) => sum + n.rate, 0));
  const addOnTotal = round2((booking.addOns || []).reduce((sum, a) => sum + a.amount, 0));
  const subtotal = round2(roomCharges + addOnTotal);
  const taxAmount = round2((subtotal * env.taxPercent) / 100);
  const grandTotal = round2(subtotal + taxAmount);

  return { roomCharges, addOnTotal, subtotal, taxPercent: env.taxPercent, taxAmount, grandTotal };
};

/**
 * Builds the full invoice document returned by GET /api/bookings/:id/invoice.
 * The booking is expected to have guestId, hotelId and roomTypeId populated.
 */
const buildInvoice = (booking) => {
  const totals = computeTotals(booking);
  const guest = booking.guestId;
  const hotel = booking.hotelId;
  const roomType = booking.roomTypeId;

  const invoice = {
    bookingRef: booking.bookingRef,
    status: booking.status,
    // A proforma is issued for a booking that has not been checked out yet.
    invoiceType: booking.status === 'CheckedOut' ? 'FINAL' : 'PROFORMA',
    issuedAt: new Date(),
    guest: guest && guest.name ? { name: guest.name, email: guest.email } : booking.guestId,
    hotel: hotel && hotel.name ? { name: hotel.name, city: hotel.city } : booking.hotelId,
    roomType: roomType && roomType.name ? { name: roomType.name } : booking.roomTypeId,
    stay: {
      checkIn: booking.checkIn,
      checkOut: booking.checkOut,
      nights: nightsBetween(booking.checkIn, booking.checkOut),
      guests: booking.guests
    },
    nightlyBreakdown: booking.nightlyBreakdown,
    addOns: booking.addOns,
    ...totals
  };

  // A cancelled booking shows what was actually refunded.
  if (booking.status === 'Cancelled' && booking.cancellation) {
    invoice.refund = {
      cancelledAt: booking.cancellation.cancelledAt,
      refundPercent: booking.cancellation.refundPercent,
      refundAmount: booking.cancellation.refundAmount,
      reason: booking.cancellation.reason,
      netPayable: round2(totals.grandTotal - booking.cancellation.refundAmount)
    };
  }

  return invoice;
};

module.exports = { computeTotals, buildInvoice };
