/**
 * Business-logic verification. Runs with plain Node assertions and needs no
 * database and no test framework: node test/logic.test.js
 *
 * Covers the rules that are easy to get subtly wrong and that the viva asks
 * about -- strict-inequality overlap, non-stacked pricing multipliers, the
 * refund tier boundaries, and the illegal status transitions.
 */

const assert = require('assert');
const R = require('path').join(__dirname, '..') + require('path').sep;

const { priceStay } = require(R + 'services/pricing.service');
const { calculateRefund } = require(R + 'services/refund.service');
const { applyTransition } = require(R + 'services/bookingStatus.service');
const { computeTotals } = require(R + 'services/invoice.service');
const d = require(R + 'utils/dates');

let pass = 0;
let fail = 0;
const t = (name, fn) => {
  try {
    fn();
    console.log('  PASS  ' + name);
    pass += 1;
  } catch (e) {
    console.log('  FAIL  ' + name + '\n        ' + e.message);
    fail += 1;
  }
};

console.log('\n--- utils/dates (UTC date-only arithmetic) ---');
t('toUtcDate parses YYYY-MM-DD as a UTC calendar day', () => {
  assert.strictEqual(d.toUtcDate('2026-09-10').toISOString(), '2026-09-10T00:00:00.000Z');
});
t('nightsBetween counts whole nights, checkOut exclusive', () => {
  assert.strictEqual(d.nightsBetween('2026-09-10', '2026-09-13'), 3);
});
t('eachNight yields checkIn..checkOut-1', () => {
  const nights = d.eachNight('2026-09-10', '2026-09-13').map((x) => x.toISOString().slice(0, 10));
  assert.deepStrictEqual(nights, ['2026-09-10', '2026-09-11', '2026-09-12']);
});
t('isWeekendNight is Fri/Sat in UTC (2026-09-11 is a Friday)', () => {
  assert.strictEqual(d.isWeekendNight('2026-09-11'), true);  // Friday
  assert.strictEqual(d.isWeekendNight('2026-09-12'), true);  // Saturday
  assert.strictEqual(d.isWeekendNight('2026-09-13'), false); // Sunday
});
t('same-day turnover does NOT overlap (strict inequalities)', () => {
  // Booking A: 8th -> 10th.  Booking B: 10th -> 12th.  Must not collide.
  assert.strictEqual(d.rangesOverlap('2026-09-08', '2026-09-10', '2026-09-10', '2026-09-12'), false);
});
t('genuinely overlapping ranges do collide', () => {
  assert.strictEqual(d.rangesOverlap('2026-09-08', '2026-09-11', '2026-09-10', '2026-09-12'), true);
});
t('daysUntil counts whole days', () => {
  assert.strictEqual(d.daysUntil('2026-09-18', '2026-09-11'), 7);
});

console.log('\n--- services/pricing (rate resolution) ---');
const roomType = { _id: 'rt1', basePrice: 1000 };

t('no matching rule means multiplier is exactly 1.0 (no hidden surcharge)', () => {
  const r = priceStay(roomType, '2026-09-11', '2026-09-13', []); // Fri + Sat
  r.nightlyBreakdown.forEach((n) => assert.strictEqual(n.multiplier, 1.0));
  assert.strictEqual(r.roomCharges, 2000);
});

t('a weekend-only rule applies to Fri/Sat and not to Sun', () => {
  const rules = [{ season: 'Weekend', multiplier: 1.25, appliesToWeekend: true, priority: 1, isActive: true }];
  const r = priceStay(roomType, '2026-09-11', '2026-09-14', rules); // Fri, Sat, Sun
  assert.strictEqual(r.nightlyBreakdown[0].multiplier, 1.25); // Fri
  assert.strictEqual(r.nightlyBreakdown[1].multiplier, 1.25); // Sat
  assert.strictEqual(r.nightlyBreakdown[2].multiplier, 1.0);  // Sun
});

t('highest priority wins when several rules match', () => {
  const rules = [
    { season: 'Weekend', multiplier: 1.25, appliesToWeekend: true, priority: 1, isActive: true },
    { season: 'Peak', multiplier: 1.5, appliesToWeekend: false, priority: 2, isActive: true }
  ];
  const r = priceStay(roomType, '2026-09-11', '2026-09-12', rules); // a Friday: both match
  assert.strictEqual(r.nightlyBreakdown[0].multiplier, 1.5);
  assert.strictEqual(r.nightlyBreakdown[0].appliedRule, 'Peak');
});

t('MULTIPLIERS ARE NOT STACKED (1.25 x 1.5 would be 1.875)', () => {
  const rules = [
    { season: 'Weekend', multiplier: 1.25, appliesToWeekend: true, priority: 1, isActive: true },
    { season: 'Peak', multiplier: 1.5, appliesToWeekend: false, priority: 2, isActive: true }
  ];
  const r = priceStay(roomType, '2026-09-11', '2026-09-12', rules);
  assert.strictEqual(r.nightlyBreakdown[0].rate, 1500); // not 1875
});

t('priority ties break on the higher multiplier', () => {
  const rules = [
    { season: 'A', multiplier: 1.2, priority: 3, isActive: true },
    { season: 'B', multiplier: 1.4, priority: 3, isActive: true }
  ];
  const r = priceStay(roomType, '2026-09-14', '2026-09-15', rules);
  assert.strictEqual(r.nightlyBreakdown[0].multiplier, 1.4);
  assert.strictEqual(r.nightlyBreakdown[0].appliedRule, 'B');
});

t('a rule outside its date window does not apply', () => {
  const rules = [
    { season: 'Peak', multiplier: 2.0, startDate: '2026-12-01', endDate: '2026-12-31', priority: 5, isActive: true }
  ];
  const r = priceStay(roomType, '2026-09-14', '2026-09-15', rules);
  assert.strictEqual(r.nightlyBreakdown[0].multiplier, 1.0);
});

t('an inactive rule is ignored', () => {
  const rules = [{ season: 'Peak', multiplier: 2.0, priority: 5, isActive: false }];
  const r = priceStay(roomType, '2026-09-14', '2026-09-15', rules);
  assert.strictEqual(r.nightlyBreakdown[0].multiplier, 1.0);
});

t('a stay crossing a season boundary carries different rates per night', () => {
  const rules = [
    { season: 'Peak', multiplier: 1.5, startDate: '2026-09-16', endDate: '2026-09-20', priority: 2, isActive: true }
  ];
  const r = priceStay(roomType, '2026-09-14', '2026-09-18', rules);
  const mult = r.nightlyBreakdown.map((n) => n.multiplier);
  assert.deepStrictEqual(mult, [1.0, 1.0, 1.5, 1.5]);
  assert.ok(new Set(mult).size > 1, 'expected more than one distinct rate');
});

console.log('\n--- services/refund (cancellation tiers) ---');
t('7 or more days before check-in -> 100%', () => {
  const r = calculateRefund('2026-09-20', 10000, '2026-09-13');
  assert.strictEqual(r.refundPercent, 100);
  assert.strictEqual(r.refundAmount, 10000);
});
t('exactly 6 days -> 50%', () => {
  assert.strictEqual(calculateRefund('2026-09-19', 10000, '2026-09-13').refundPercent, 50);
});
t('exactly 3 days -> 50%', () => {
  assert.strictEqual(calculateRefund('2026-09-16', 10000, '2026-09-13').refundPercent, 50);
});
t('2 days -> 0%', () => {
  const r = calculateRefund('2026-09-15', 10000, '2026-09-13');
  assert.strictEqual(r.refundPercent, 0);
  assert.strictEqual(r.refundAmount, 0);
});
t('refund rounds to 2 decimals', () => {
  assert.strictEqual(calculateRefund('2026-09-19', 3333.33, '2026-09-13').refundAmount, 1666.67);
});

console.log('\n--- services/bookingStatus (state machine) ---');
const mkBooking = (status) => ({ status, bookingRef: 'BK-2026-000001', statusHistory: [] });
const staff = { _id: 's1', role: 'staff' };
const guest = { _id: 'g1', role: 'guest' };

t('Reserved -> Confirmed by staff is allowed and audited', () => {
  const b = mkBooking('Reserved');
  applyTransition(b, 'Confirmed', staff);
  assert.strictEqual(b.status, 'Confirmed');
  assert.strictEqual(b.statusHistory.length, 1);
  assert.strictEqual(b.statusHistory[0].from, 'Reserved');
  assert.strictEqual(b.statusHistory[0].to, 'Confirmed');
});
t('CheckedOut -> CheckedIn is refused with 409', () => {
  const b = mkBooking('CheckedOut');
  assert.throws(() => applyTransition(b, 'CheckedIn', staff), (e) => {
    assert.strictEqual(e.statusCode, 409);
    assert.strictEqual(e.errorCode, 'INVALID_STATUS_TRANSITION');
    assert.ok(e.message.includes('CheckedOut') && e.message.includes('CheckedIn'));
    return true;
  });
});
t('a no-op self transition is refused, not silently accepted', () => {
  const b = mkBooking('Confirmed');
  assert.throws(() => applyTransition(b, 'Confirmed', staff), /INVALID_STATUS_TRANSITION|Cannot move/);
});
t('Cancelled is terminal', () => {
  const b = mkBooking('Cancelled');
  assert.throws(() => applyTransition(b, 'Confirmed', staff), /terminal/);
});
t('a guest cannot confirm their own booking (403, not 409)', () => {
  const b = mkBooking('Reserved');
  assert.throws(() => applyTransition(b, 'Confirmed', guest), (e) => {
    assert.strictEqual(e.statusCode, 403);
    return true;
  });
});
t('a guest CAN cancel their own Reserved booking', () => {
  const b = mkBooking('Reserved');
  applyTransition(b, 'Cancelled', guest);
  assert.strictEqual(b.status, 'Cancelled');
});

console.log('\n--- services/invoice (totals) ---');
t('totals reconcile: subtotal, 12% tax, grand total', () => {
  const booking = {
    nightlyBreakdown: [{ rate: 1000 }, { rate: 1250 }, { rate: 1250 }],
    addOns: [{ amount: 500 }]
  };
  const totals = computeTotals(booking);
  assert.strictEqual(totals.roomCharges, 3500);
  assert.strictEqual(totals.addOnTotal, 500);
  assert.strictEqual(totals.subtotal, 4000);
  assert.strictEqual(totals.taxAmount, 480); // 12% of 4000
  assert.strictEqual(totals.grandTotal, 4480);
});
t('no add-ons still reconciles', () => {
  const totals = computeTotals({ nightlyBreakdown: [{ rate: 999.99 }], addOns: [] });
  assert.strictEqual(totals.grandTotal, Number((totals.subtotal + totals.taxAmount).toFixed(2)));
});

console.log('\n============================================');
console.log(`  ${pass} passed, ${fail} failed`);
console.log('============================================\n');
process.exit(fail === 0 ? 0 : 1);
