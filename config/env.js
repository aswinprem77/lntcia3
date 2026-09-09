/**
 * Environment loader and validator.
 *
 * Loads .env, fails fast with a clear message when a required variable is
 * missing, and exports a single typed config object. Nothing else in the
 * codebase reads process.env directly, so there is exactly one place where a
 * secret or a connection string can enter the application.
 */
const dotenv = require('dotenv');

dotenv.config();

const REQUIRED = ['MONGO_URI', 'JWT_SECRET'];

const missing = REQUIRED.filter((key) => !process.env[key] || !process.env[key].trim());

if (missing.length > 0) {
  console.error('\n[FATAL] Missing required environment variable(s): ' + missing.join(', '));
  console.error('[FATAL] Copy .env.example to .env and fill in the values before starting.');
  console.error('[FATAL] There is deliberately no hardcoded fallback for these.\n');
  process.exit(1);
}

const toInt = (value, fallback) => {
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

module.exports = {
  port: toInt(process.env.PORT, 5000),
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  bcryptSaltRounds: toInt(process.env.BCRYPT_SALT_ROUNDS, 10),
  taxPercent: toInt(process.env.TAX_PERCENT, 12),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production'
};
