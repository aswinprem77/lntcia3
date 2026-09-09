const ApiError = require('../utils/ApiError');

/**
 * Booking status state machine.
 *
 * Defined once, here, and enforced through a single function. Every status
 * change in the application -- confirm, cancel, check-in, check-out -- goes
 * through applyTransition. Scattering `if (booking.status === ...)` checks
 * across four controllers is how illegal transitions slip through in the gaps
 * between them.
 *
 *   Reserved   -> Confirmed   (staff, admin)
 *   Reserved   -> Cancelled   (owner guest, staff, admin)
 *   Confirmed  -> CheckedIn   (staff, admin)
 *   Confirmed  -> Cancelled   (owner guest, staff, admin)
 *   CheckedIn  -> CheckedOut  (staff, admin)
 *   CheckedOut -> terminal
 *   Cancelled  -> terminal
 */
const TRANSITIONS = {
  Reserved: {
    Confirmed: ['staff', 'admin'],
    Cancelled: ['guest', 'staff', 'admin']
  },
  Confirmed: {
    CheckedIn: ['staff', 'admin'],
    Cancelled: ['guest', 'staff', 'admin']
  },
  CheckedIn: {
    CheckedOut: ['staff', 'admin']
  },
  CheckedOut: {},
  Cancelled: {}
};

const allowedNextStates = (current) => Object.keys(TRANSITIONS[current] || {});

/**
 * Validates a transition and, if legal, mutates the booking's status and
 * appends to its audit trail. Throws 409 INVALID_STATUS_TRANSITION naming both
 * the current and the attempted status.
 *
 * A no-op transition (X -> X) is rejected rather than silently returning 200:
 * "confirm an already-confirmed booking" is a client bug worth surfacing.
 */
const applyTransition = (booking, nextStatus, user) => {
  const current = booking.status;
  const allowed = TRANSITIONS[current] || {};

  if (!allowed[nextStatus]) {
    const options = allowedNextStates(current);
    throw ApiError.invalidStatusTransition(
      `Cannot move booking ${booking.bookingRef} from '${current}' to '${nextStatus}'. ` +
        (options.length
          ? `Allowed from '${current}': ${options.join(', ')}.`
          : `'${current}' is a terminal state.`)
    );
  }

  if (!allowed[nextStatus].includes(user.role)) {
    throw ApiError.forbidden(
      `Role '${user.role}' may not move a booking from '${current}' to '${nextStatus}'`
    );
  }

  booking.status = nextStatus;
  booking.statusHistory.push({
    from: current,
    to: nextStatus,
    byUserId: user._id,
    at: new Date()
  });

  return booking;
};

module.exports = { TRANSITIONS, allowedNextStates, applyTransition };
