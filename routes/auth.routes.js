const router = require('express').Router();
const { register, login, me } = require('../controllers/auth.controller');
const { verifyToken } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { registerRules, loginRules } = require('../validators/auth.validator');

// M1 - Guest Registration & Authentication
router.post('/register', registerRules(), validate, register);
router.post('/login', loginRules(), validate, login);
router.get('/me', verifyToken, me);

module.exports = router;
