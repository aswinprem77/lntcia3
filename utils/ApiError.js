/**
 * Application error carrying the HTTP status and the machine-readable
 * errorCode from PRD section 7.2. Controllers and services throw this; the
 * centralized error handler is the only thing that turns it into a response.
 */
class ApiError extends Error {
  constructor(statusCode, errorCode, message, errors = undefined) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    if (errors) this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }

  // 400
  static validation(message, errors) {
    return new ApiError(400, 'VALIDATION_ERROR', message || 'Validation failed', errors);
  }
  static invalidDateRange(message) {
    return new ApiError(400, 'INVALID_DATE_RANGE', message || 'checkOut must be strictly after checkIn');
  }
  static pastDate(message) {
    return new ApiError(400, 'PAST_DATE', message || 'checkIn cannot be earlier than today');
  }
  static capacityExceeded(message) {
    return new ApiError(400, 'CAPACITY_EXCEEDED', message);
  }
  static invalidId(message) {
    return new ApiError(400, 'INVALID_ID', message || 'Malformed resource identifier');
  }

  // 401
  static invalidCredentials() {
    return new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }
  static unauthenticated(message) {
    return new ApiError(401, 'UNAUTHENTICATED', message || 'Authentication token is required');
  }
  static invalidToken(message) {
    return new ApiError(401, 'INVALID_TOKEN', message || 'Authentication token is invalid or expired');
  }

  // 403
  static forbidden(message) {
    return new ApiError(403, 'FORBIDDEN', message || 'You are not permitted to perform this action');
  }

  // 404
  static notFound(resource) {
    return new ApiError(404, 'NOT_FOUND', `${resource || 'Resource'} not found`);
  }

  // 409
  static duplicateEmail() {
    return new ApiError(409, 'DUPLICATE_EMAIL', 'An account with this email already exists');
  }
  static duplicateResource(message) {
    return new ApiError(409, 'DUPLICATE_RESOURCE', message || 'A record with these values already exists');
  }
  static noAvailability(message) {
    return new ApiError(409, 'NO_AVAILABILITY', message || 'No rooms available for the requested dates');
  }
  static invalidStatusTransition(message) {
    return new ApiError(409, 'INVALID_STATUS_TRANSITION', message);
  }
  static inventoryConflict(message) {
    return new ApiError(409, 'INVENTORY_CONFLICT', message);
  }
  static noCleanRoom(message) {
    return new ApiError(409, 'NO_CLEAN_ROOM_AVAILABLE', message || 'No assignable clean room is available');
  }
  static roomOccupied(message) {
    return new ApiError(409, 'ROOM_OCCUPIED', message);
  }
  static tooEarlyToCheckIn(message) {
    return new ApiError(409, 'TOO_EARLY_TO_CHECKIN', message);
  }
  static notCancellable(message) {
    return new ApiError(409, 'NOT_CANCELLABLE', message);
  }
  static inUse(message) {
    return new ApiError(409, 'IN_USE', message);
  }
}

module.exports = ApiError;
