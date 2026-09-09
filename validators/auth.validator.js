const { body } = require('express-validator');

const registerRules = () => [
  body('name').trim().isLength({ min: 2, max: 80 }).withMessage('name must be 2-80 characters'),
  body('email').trim().isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('password must be at least 6 characters'),
  body('phone')
    .optional({ values: 'falsy' })
    .matches(/^[+\d][\d\s-]{9,19}$/)
    .withMessage('phone must be 10-15 digits'),
  // Public registration always creates a guest. Any role sent by the client
  // is discarded here rather than trusted.
  body('role').not().exists().withMessage('role cannot be set during public registration')
];

const loginRules = () => [
  body('email').trim().isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('password is required')
];

/** Admin-only creation of staff and admin accounts. */
const createUserRules = () => [
  body('name').trim().isLength({ min: 2, max: 80 }).withMessage('name must be 2-80 characters'),
  body('email').trim().isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('password must be at least 6 characters'),
  body('role').isIn(['staff', 'admin']).withMessage("role must be either 'staff' or 'admin'"),
  body('hotelId')
    .if(body('role').equals('staff'))
    .isMongoId()
    .withMessage('hotelId is required and must be a valid ObjectId when role is staff'),
  body('hotelId')
    .if(body('role').equals('admin'))
    .not()
    .exists()
    .withMessage('An admin must not be bound to a hotel'),
  body('phone')
    .optional({ values: 'falsy' })
    .matches(/^[+\d][\d\s-]{9,19}$/)
    .withMessage('phone must be 10-15 digits')
];

module.exports = { registerRules, loginRules, createUserRules };
