/**
 * Response envelope helpers (PRD section 7.1). Every successful response in
 * the API goes through one of these, so the shape is guaranteed consistent.
 */

const ok = (res, message, data) =>
  res.status(200).json({ success: true, message, data });

const created = (res, message, data) =>
  res.status(201).json({ success: true, message, data });

/**
 * Paginated envelope. `total` is the full match count, not the page length.
 */
const paginated = (res, message, data, { page, limit, total }) =>
  res.status(200).json({
    success: true,
    message,
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0
    }
  });

/**
 * Normalizes ?page= and ?limit= into safe integers with sane bounds.
 */
const parsePagination = (query, defaultLimit = 10, maxLimit = 100) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const rawLimit = parseInt(query.limit, 10) || defaultLimit;
  const limit = Math.min(maxLimit, Math.max(1, rawLimit));
  return { page, limit, skip: (page - 1) * limit };
};

module.exports = { ok, created, paginated, parsePagination };
