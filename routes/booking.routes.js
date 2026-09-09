const router = require('express').Router();
const {
  createBooking,
  listBookings,
  getBooking,
  confirmBooking,
  checkInBooking,
  checkOutBooking,
  cancelBooking,
  getInvoice
} = require('../controllers/booking.controller');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const validate = require('../middleware/validate');
const { objectIdParam, paginationRules } = require('../validators/common');
const {
  createBookingRules,
  listBookingsRules,
  cancelRules
} = require('../validators/booking.validator');

router.use(verifyToken);

// M5 - Reservation Booking Workflow
router.post('/', requireRole('guest'), createBookingRules(), validate, createBooking);
router.get('/', requireRole('staff', 'admin'), listBookingsRules(), paginationRules(), validate, listBookings);
router.get('/:id', objectIdParam('id'), validate, getBooking);

// M7 - Booking Status Management
router.put('/:id/confirm', requireRole('staff', 'admin'), objectIdParam('id'), validate, confirmBooking);

// M8 - Check-in / Check-out
router.put('/:id/checkin', requireRole('staff', 'admin'), objectIdParam('id'), validate, checkInBooking);
router.put('/:id/checkout', requireRole('staff', 'admin'), objectIdParam('id'), validate, checkOutBooking);

// M10 - Cancellation & Refund Policy Engine
router.put('/:id/cancel', objectIdParam('id'), cancelRules(), validate, cancelBooking);

// M12 - Invoice Generation Summary
router.get('/:id/invoice', objectIdParam('id'), validate, getInvoice);

module.exports = router;
