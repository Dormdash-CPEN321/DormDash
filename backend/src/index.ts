import dotenv from 'dotenv';
import express from 'express';

import { connectDB } from './config/database';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.middleware';
import router from './routes/routes';
import path from 'path';
import { initSocket } from './socket';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());

app.use('/api', router);
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('*', notFoundHandler);
app.use(errorHandler);

connectDB();
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

const io = initSocket(server);

console.log(`Socket.io ${io ? 'initialized' : 'failed to initialize'}`);
