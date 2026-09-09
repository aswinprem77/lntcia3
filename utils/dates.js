/**
 * Date helpers. Every date in this system is a date-only value normalized to
 * 00:00:00 UTC. Hotel nights are calendar days, not instants, so doing the
 * arithmetic in the server's local zone would shift which night a stay falls
 * on for anyone east or west of UTC (notably IST, +05:30).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Coerces a Date or an ISO string to 00:00:00 UTC on that calendar day.
 * A plain 'YYYY-MM-DD' string is read as a UTC calendar date, never as local.
 */
const toUtcDate = (value) => {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const str = String(value);
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (dateOnly) {
    return new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])));
  }
  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
};

/** Today at 00:00 UTC. */
const todayUtc = () => toUtcDate(new Date());

/** Whole nights between two date-only values. checkOut is exclusive. */
const nightsBetween = (checkIn, checkOut) =>
  Math.round((toUtcDate(checkOut).getTime() - toUtcDate(checkIn).getTime()) / MS_PER_DAY);

/**
 * Every night actually slept: checkIn through checkOut-1. A 10th-to-12th stay
 * yields the 10th and the 11th -- the guest does not occupy the room on the
 * night of the 12th, which is why checkOut is exclusive.
 */
const eachNight = (checkIn, checkOut) => {
  const nights = [];
  const cursor = toUtcDate(checkIn);
  const end = toUtcDate(checkOut);
  while (cursor.getTime() < end.getTime()) {
    nights.push(new Date(cursor.getTime()));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return nights;
};

/** Friday or Saturday night, evaluated in UTC. */
const isWeekendNight = (date) => {
  const day = toUtcDate(date).getUTCDay();
  return day === 5 || day === 6;
};

/** Whole days from now until a check-in date, used by the refund tiers. */
const daysUntil = (target, from = new Date()) =>
  Math.floor((toUtcDate(target).getTime() - toUtcDate(from).getTime()) / MS_PER_DAY);

/**
 * Two date ranges overlap only on strict inequalities. A booking ending on
 * the 10th and one starting on the 10th do NOT overlap -- same-day turnover
 * is legal and the room is sellable on both bookings.
 */
const rangesOverlap = (aStart, aEnd, bStart, bEnd) =>
  toUtcDate(aStart).getTime() < toUtcDate(bEnd).getTime() &&
  toUtcDate(aEnd).getTime() > toUtcDate(bStart).getTime();

/** Rounds money to 2 decimals without float drift. */
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

module.exports = {
  MS_PER_DAY,
  toUtcDate,
  todayUtc,
  nightsBetween,
  eachNight,
  isWeekendNight,
  daysUntil,
  rangesOverlap,
  round2
};
