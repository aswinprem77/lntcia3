const router = require('express').Router();
const {
  createHotel,
  listHotels,
  getHotel,
  updateHotel,
  deleteHotel,
  searchAvailability
} = require('../controllers/hotel.controller');
const { createRoomType, listRoomTypesForHotel } = require('../controllers/roomType.controller');
const { housekeepingBoard } = require('../controllers/room.controller');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const validate = require('../middleware/validate');
const { objectIdParam, paginationRules } = require('../validators/common');
const {
  createHotelRules,
  updateHotelRules,
  listHotelsRules,
  searchRules
} = require('../validators/hotel.validator');
const { createRoomTypeRules } = require('../validators/roomType.validator');

// M4 - Availability search. Declared before '/:id' so that the literal path
// 'search' is not swallowed as an ObjectId parameter.
router.get('/search', searchRules(), paginationRules(), validate, searchAvailability);

// M2 - Hotel & Property Management
router.get('/', listHotelsRules(), paginationRules(), validate, listHotels);
router.post('/', verifyToken, requireRole('admin'), createHotelRules(), validate, createHotel);

// M3 - Room types nested under their hotel
router.get('/:hotelId/room-types', objectIdParam('hotelId'), validate, listRoomTypesForHotel);
router.post(
  '/:hotelId/room-types',
  verifyToken,
  requireRole('admin'),
  objectIdParam('hotelId'),
  createRoomTypeRules(),
  validate,
  createRoomType
);

// M9 - Housekeeping board for one property
router.get(
  '/:hotelId/housekeeping-board',
  verifyToken,
  requireRole('staff', 'admin'),
  objectIdParam('hotelId'),
  validate,
  housekeepingBoard
);

router.get('/:id', objectIdParam('id'), validate, getHotel);
router.put(
  '/:id',
  verifyToken,
  requireRole('admin'),
  objectIdParam('id'),
  updateHotelRules(),
  validate,
  updateHotel
);
router.delete('/:id', verifyToken, requireRole('admin'), objectIdParam('id'), validate, deleteHotel);

module.exports = router;
