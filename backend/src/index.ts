import dotenv from 'dotenv';
import express from 'express';

import { connectDB } from './config/database';
import app from './app';
import { initSocket } from './socket';

dotenv.config();

const PORT = process.env.PORT ?? 3000;

connectDB();
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

const io = initSocket(server);

console.log('Socket.io initialized');
