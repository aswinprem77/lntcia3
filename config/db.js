const mongoose = require('mongoose');
const env = require('./env');

/**
 * Opens the Mongoose connection. Exits the process on an initial connection
 * failure -- the API is useless without the database, so failing loudly beats
 * serving 500s. Later disconnects are logged and left to Mongoose to retry.
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(env.mongoUri);
    console.log(`[MongoDB] Connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.error(`[MongoDB] Connection failed: ${error.message}`);
    console.error('[MongoDB] Is mongod running, and is MONGO_URI correct?');
    process.exit(1);
  }

  mongoose.connection.on('error', (err) => {
    console.error(`[MongoDB] Runtime error: ${err.message}`);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[MongoDB] Disconnected.');
  });
};

module.exports = connectDB;
