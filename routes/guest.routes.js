const router = require('express').Router();
const { getGuestBookings } = require('../controllers/booking.controller');
const { verifyToken } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { objectIdParam, paginationRules } = require('../validators/common');
const { guestHistoryRules } = require('../validators/booking.validator');

// M11 - Guest Booking History (owner guest or admin; ownership enforced in
// the controller, since two guests share the same role)
router.get(
  '/:id/bookings',
  verifyToken,
  objectIdParam('id'),
  guestHistoryRules(),
  paginationRules(),
  validate,
  getGuestBookings
);

module.exports = router;
