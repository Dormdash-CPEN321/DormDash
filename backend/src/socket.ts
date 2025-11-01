// backend/src/socket.ts
import { Server, Socket, DefaultEventsMap } from 'socket.io';
import http from 'http';
import logger from './utils/logger.util';
import { verifyTokenString } from './middleware/auth.middleware'; // optional helper
import SocketData from './types/socket.types';

let io: Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

export function initSocket(server: http.Server): Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData> {
  io = new Server<
    DefaultEventsMap,
    DefaultEventsMap,
    DefaultEventsMap,
    SocketData
  >(server, {
    cors: { origin: '*' }, // tighten in production
  });

  // middleware to check JWT sent in client auth: { token: 'Bearer <jwt>' } or query param
  io.use(
    (
      socket: Socket<
        DefaultEventsMap,
        DefaultEventsMap,
        DefaultEventsMap,
        SocketData
      >,
      next
    ) => {
      const tokenValue =
        socket.handshake.auth?.token ??
        socket.handshake.query?.token ??
        socket.handshake.headers?.authorization;
      
      // Ensure token is a string or undefined
      const token = typeof tokenValue === 'string' ? tokenValue : undefined;
      
      verifyTokenString(token)
        .then(user => {
          // store a minimal typed payload on socket.data to avoid using `any`
          socket.data.user = {
            id: String(user._id),
            userRole: user.userRole,
          };
          next();
        })
        .catch((err: unknown) => {
          logger.warn('Socket auth error:', String(err));
          next(new Error('Authentication error')); // client receives connect_error
        });
    }
  );

  io.on(
    'connection',
    (
      socket: Socket<
        DefaultEventsMap,
        DefaultEventsMap,
        DefaultEventsMap,
        SocketData
      >
    ) => {
      const user = socket.data.user;
      logger.info(
        `Socket connected: ${socket.id} user=${user?.id} role=${user?.userRole}`
      );
      // auto-join user room
      if (user?.id) socket.join(`user:${user.id}`);

      // auto-join role room for movers to receive unassigned job broadcasts
      if (user?.userRole === 'MOVER') {
        socket.join('role:mover');
        logger.info(`User ${user.id} joined role:mover room`);
      }

      socket.on('disconnect', reason => {
        logger.info(
          `Socket disconnected: ${socket.id} reason=${String(reason)}`
        );
      });
    }
  );

  return io;
}

export function getIo(): Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData> {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
}

// Centralized emit helper. rooms can be a string or array of strings.
export function emitToRooms(
  rooms: string | string[],
  event: string,
  payload: unknown,
  meta?: unknown
) {
  try {
    if (!io) {
      logger.warn('emitToRooms called before socket initialized', {
        event,
        rooms,
      });
      return;
    }

    const roomList = Array.isArray(rooms) ? rooms : [rooms];
    // Log a concise emission record for debugging/observability
    logger.info(
      `Socket emit: event=${event} rooms=${roomList.join(',')} meta=${JSON.stringify(meta ?? {})}`
    );

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
