import dotenv from 'dotenv';
import express from 'express';

import { errorHandler, notFoundHandler } from './middleware/errorHandler.middleware';
import router from './routes/routes';
import path from 'path';

dotenv.config();

const app = express();

app.use(express.json());

app.use('/api', router);
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('*', notFoundHandler);
app.use(errorHandler);

export default app;