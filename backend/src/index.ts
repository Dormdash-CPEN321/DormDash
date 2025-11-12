import dotenv from 'dotenv';

import { connectDB } from './config/database';
import app from './app';
import { initSocket } from './socket';
import logger from './utils/logger.util';

dotenv.config();

const PORT = process.env.PORT ?? 3000;

connectDB().catch((error: unknown) => {
  logger.error('Failed to connect to database:', error);
  throw error; // Let the unhandled rejection crash the process
});
const server = app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
});

const io = initSocket(server);

logger.info(`Socket.io ${io ? 'initialized' : 'failed to initialize'}`);

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('\nSIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exitCode = 0;
  });
});


// Global error handlers for graceful shutdown
process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled Rejection:', reason);
  // Gracefully close server and exit
  server.close(() => {
    logger.info('Server closed due to unhandled rejection');
    process.exitCode = 1;
  });
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  // Gracefully close server and exit
  server.close(() => {
    logger.info('Server closed due to uncaught exception');
    process.exitCode = 1;
  });
});
