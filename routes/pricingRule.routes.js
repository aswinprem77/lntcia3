const router = require('express').Router();
const { updatePricingRule, deletePricingRule } = require('../controllers/pricingRule.controller');
const { verifyToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');
const validate = require('../middleware/validate');
const { objectIdParam } = require('../validators/common');
const { updatePricingRuleRules } = require('../validators/pricingRule.validator');

// M6 - Dynamic Pricing Rules (maintenance by id)
router.use(verifyToken, requireRole('admin'));

router.put('/:id', objectIdParam('id'), updatePricingRuleRules(), validate, updatePricingRule);
router.delete('/:id', objectIdParam('id'), validate, deletePricingRule);

module.exports = router;
