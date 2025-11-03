import mongoose from 'mongoose';
import logger from '../utils/logger.util';

let listenersReady = false;

/** Always attach listeners at module load to guarantee an error handler exists */
(function attachGlobalMongoListeners() {
  if (listenersReady) return;

  mongoose.connection.on('error', (err: unknown) => {
    const msg = err instanceof Error ? err.stack ?? err.message : String(err);
    logger.error('❌ MongoDB connection error:', msg);
    // example "handling": you could set a flag or emit metrics here
    // reconnect logic should live elsewhere to avoid tight loops
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('⚠️ MongoDB disconnected');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection:', String(reason));
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception:', err.stack ?? err.message);
    // optionally: process.exit(1) or schedule graceful shutdown
  });

  process.on('SIGINT', () => {
    void mongoose.connection.close()
      .then(() => {
        logger.info('MongoDB connection closed through app termination');
        process.exit(0);
      })
      .catch((e: unknown) => {
        logger.error('Error closing MongoDB connection on SIGINT:', String(e));
        process.exit(1);
      });
  });

  listenersReady = true;
})();
export const connectDB = async (): Promise<void> => {
  try {
    const uri = process.env.MONGODB_URI;
    
    if (!uri) {
      throw new Error('MONGODB_URI is not configured in environment variables');
    }

    await mongoose.connect(uri);
    logger.info('✅ MongoDB connected successfully');
  } catch (error) {
    logger.error('❌ Failed to connect to MongoDB:', String(error));
    process.exitCode = 1;
  }
};

export const disconnectDB = async (): Promise<void> => {
  try {
    await mongoose.connection.close();
    logger.info('✅ MongoDB disconnected successfully');
  } catch (error) {
    logger.error('❌ Error disconnecting from MongoDB:', String(error));
  }
};
