const router = require('express').Router();
const {
  updateRoomType,
  deleteRoomType,
  quote
} = require('../controllers/roomType.controller');
const { createRoom } = require('../controllers/room.controller');
const {
  createPricingRule,
  listPricingRules
} = require('../controllers/pricingRule.controller');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const validate = require('../middleware/validate');
const { objectIdParam } = require('../validators/common');
const { updateRoomTypeRules } = require('../validators/roomType.validator');
const { createRoomRules } = require('../validators/room.validator');
const {
  createPricingRuleRules,
  quoteRules
} = require('../validators/pricingRule.validator');

// M6 - public price preview
router.get('/:id/quote', objectIdParam('id'), quoteRules(), validate, quote);

// M3 - physical rooms nested under their room type
router.post(
  '/:roomTypeId/rooms',
  verifyToken,
  requireRole('admin', 'staff'),
  objectIdParam('roomTypeId'),
  createRoomRules(),
  validate,
  createRoom
);

// M6 - pricing rules nested under their room type
router.get(
  '/:roomTypeId/pricing-rules',
  verifyToken,
  requireRole('admin', 'staff'),
  objectIdParam('roomTypeId'),
  validate,
  listPricingRules
);
router.post(
  '/:roomTypeId/pricing-rules',
  verifyToken,
  requireRole('admin'),
  objectIdParam('roomTypeId'),
  createPricingRuleRules(),
  validate,
  createPricingRule
);

// M3 - room type maintenance
router.put(
  '/:id',
  verifyToken,
  requireRole('admin'),
  objectIdParam('id'),
  updateRoomTypeRules(),
  validate,
  updateRoomType
);
router.delete('/:id', verifyToken, requireRole('admin'), objectIdParam('id'), validate, deleteRoomType);

module.exports = router;
