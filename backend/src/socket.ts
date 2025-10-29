// backend/src/socket.ts
import { Server } from 'socket.io';
import http from 'http';
import logger from './utils/logger.util';
import { verifyTokenString } from './middleware/auth.middleware'; // optional helper

let io: Server | null = null;

export function initSocket(server: http.Server) {
  io = new Server(server, {
    cors: { origin: '*' } // tighten in production
  });

  // middleware to check JWT sent in client auth: { token: 'Bearer <jwt>' } or query param
io.use((socket, next) => {
  const token = socket.handshake.auth?.token ?? socket.handshake.query?.token ?? socket.handshake.headers?.authorization;
  verifyTokenString(token)
    .then(user => { (socket as any).user = user; next(); })
    .catch(err => {
      logger.warn('Socket auth error:', err.message);
      next(new Error('Authentication error')); // client receives connect_error
    });
});


  io.on('connection', (socket) => {
    const user = (socket as any).user;
    logger.info(`Socket connected: ${socket.id} user=${user?.id} role=${user?.userRole}`);
    // auto-join user room
    if (user?.id) socket.join(`user:${user.id}`);
    
    // auto-join role room for movers to receive unassigned job broadcasts
    if (user?.userRole === 'MOVER') {
      socket.join('role:mover');
      logger.info(`User ${user.id} joined role:mover room`);
    }

    socket.on('disconnect', (reason) => {
      logger.info(`Socket disconnected: ${socket.id} reason=${reason}`);
    });
  });

  return io;
}

export function getIo(): Server {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

// Centralized emit helper. rooms can be a string or array of strings.
export function emitToRooms(rooms: string | string[], event: string, payload: any, meta?: any) {
  try {
    if (!io) {
      logger.warn('emitToRooms called before socket initialized', { event, rooms });
      return;
    }

    const roomList = Array.isArray(rooms) ? rooms : [rooms];
    // Log a concise emission record for debugging/observability
    logger.info(`Socket emit: event=${event} rooms=${roomList.join(',')} meta=${JSON.stringify(meta ?? {})}`);

    for (const room of roomList) {
      try {
        io.to(room).emit(event, payload);
      } catch (err) {
        logger.warn(`Failed to emit ${event} to ${room}:`, err);
      }
    }
  } catch (err) {
    logger.error('emitToRooms error:', err);
  }
}