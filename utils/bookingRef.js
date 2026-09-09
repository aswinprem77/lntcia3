const mongoose = require('mongoose');

/**
 * Generates the next human-readable booking reference, e.g. BK-2026-000137.
 *
 * Uses an atomic $inc on a single counter document rather than
 * countDocuments() + 1, which would hand the same number to two concurrent
 * requests and then fail one of them on the unique index.
 */
const nextBookingRef = async () => {
  const year = new Date().getUTCFullYear();
  const result = await mongoose.connection.db
    .collection('counters')
    .findOneAndUpdate(
      { _id: `bookingRef-${year}` },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' }
    );

  // The driver returns either the document or { value: document } depending on
  // version, so accept both shapes.
  const doc = result && result.value ? result.value : result;
  const seq = (doc && doc.seq) || 1;

  return `BK-${year}-${String(seq).padStart(6, '0')}`;
};

module.exports = { nextBookingRef };
