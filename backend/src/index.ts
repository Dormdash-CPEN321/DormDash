import dotenv from 'dotenv';
import express from 'express';

import { connectDB } from './config/database';
import {
  errorHandler,
  notFoundHandler,
} from './middleware/errorHandler.middleware';
import router from './routes/routes';
import path from 'path';
import { initSocket } from './socket';
import logger from './utils/logger.util';

dotenv.config();

const app = express();
const PORT = process.env.PORT;

app.use(express.json());

app.use('/api', router);
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('*', notFoundHandler);
app.use(errorHandler);

connectDB().catch((error: unknown) => {
  logger.error('Failed to connect to database:', error);
  throw error; // Let the unhandled rejection crash the process
});

const server = app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
});

const io = initSocket(server);

logger.info(`Socket.io ${io ? 'initialized' : 'failed to initialize'}`);

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
