import mongoose from 'mongoose';
import logger from '../utils/logger.util';

export const connectDB = async (): Promise<void> => {
  try {
    const uri = process.env.MONGODB_URI!;

    await mongoose.connect(uri);

    logger.info('✅ MongoDB connected successfully');

    mongoose.connection.on('error', () => {
      // Log a sanitized string to avoid passing raw error objects to logger sinks
      logger.error('❌ MongoDB connection error');
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('⚠️ MongoDB disconnected');
    });

    process.on('SIGINT', () => {
      mongoose.connection
        .close()
        .then(() => {
          logger.info('MongoDB connection closed through app termination');
          process.exitCode = 0;
        })
        .catch((err: unknown) => {
          logger.error(
            'Error closing MongoDB connection on SIGINT:',
            String(err)
          );
          process.exitCode = 1;
        });
    });
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
