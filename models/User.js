const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const env = require('../config/env');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [80, 'Name cannot exceed 80 characters']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address']
    },
    passwordHash: {
      type: String,
      required: [true, 'Password is required'],
      // Excluded from every query by default; login opts back in explicitly.
      select: false
    },
    role: {
      type: String,
      enum: {
        values: ['guest', 'staff', 'admin'],
        message: '{VALUE} is not a valid role. Allowed: guest, staff, admin'
      },
      default: 'guest'
    },
    // (ext) Contact number for the front desk.
    phone: {
      type: String,
      trim: true,
      match: [/^[+\d][\d\s-]{9,19}$/, 'Phone must be 10-15 digits'],
      default: undefined
    },
    // (ext) Staff are scoped to exactly one property; admins are not scoped.
    hotelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hotel',
      default: undefined,
      required: [
        function () {
          return this.role === 'staff';
        },
        'hotelId is required for staff users'
      ],
      validate: {
        validator: function (value) {
          if (this.role !== 'staff' && value) return false;
          return true;
        },
        message: 'hotelId may only be set on staff users'
      }
    },
    // (ext) Soft-disable an account without deleting its booking history.
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

// Enforces uniqueness and speeds up the login lookup by email.
userSchema.index({ email: 1 }, { unique: true });

/**
 * Hashes passwordHash in place when it holds a new plaintext value. The field
 * is assigned the plaintext by the controller and is never persisted as such.
 */
userSchema.pre('save', async function (next) {
  if (!this.isModified('passwordHash')) return next();
  const salt = await bcrypt.genSalt(env.bcryptSaltRounds);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
  next();
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

/**
 * Belt and braces alongside select:false -- if any query ever opts the hash
 * back in, serializing the document still drops it.
 */
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('User', userSchema);
