/**
 * Application entry point.
 *
 * Responsibilities only: load config, connect the database, mount middleware,
 * mount routes, mount notFound then errorHandler, listen. No business logic
 * lives in this file.
 */
const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const connectDB = require('./config/db');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// --- Security and parsing ------------------------------------------------
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

if (env.nodeEnv !== 'test') {
  // 'dev' logs method, path, status and time -- never the request body, so a
  // password can never reach the log.
  app.use(morgan('dev'));
}

// Brute-force protection on the credential endpoints.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again in 15 minutes.',
    errorCode: 'RATE_LIMITED'
  }
});

// The demonstration UI. Static only -- it consumes the same public API as the
// Postman collection and holds no logic of its own.
app.use(express.static(path.join(__dirname, 'public')));

// --- Routes --------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Hotel Booking API is healthy',
    data: { uptimeSeconds: Math.round(process.uptime()), environment: env.nodeEnv }
  });
});

app.use('/api/auth', authLimiter, require('./routes/auth.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/hotels', require('./routes/hotel.routes'));
app.use('/api/room-types', require('./routes/roomType.routes'));
app.use('/api/rooms', require('./routes/room.routes'));
app.use('/api/pricing-rules', require('./routes/pricingRule.routes'));
app.use('/api/bookings', require('./routes/booking.routes'));
app.use('/api/guests', require('./routes/guest.routes'));

// --- Tail middleware (order matters) -------------------------------------
app.use(notFound);
app.use(errorHandler);

// --- Process-level safety nets -------------------------------------------
// A rejection that escapes asyncHandler, or a synchronous throw outside the
// request cycle, is logged and the process exits cleanly rather than being
// left in an undefined state.
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled promise rejection:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('[FATAL] Uncaught exception:', error);
  process.exit(1);
});

const start = async () => {
  await connectDB();
  app.listen(env.port, () => {
    console.log('\n======================================================');
    console.log(`  Hotel Booking API  ::  http://localhost:${env.port}`);
    console.log(`  Health check       ::  /api/health`);
    console.log(`  Environment        ::  ${env.nodeEnv}`);
    console.log('======================================================\n');
  });
};

if (require.main === module) {
  start();
}

module.exports = app;
