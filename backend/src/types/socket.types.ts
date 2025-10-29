import { IUser } from './user.types';

// Minimal payload we store on the socket after authentication
export interface SocketUserPayload {
  id: string;
  userRole?: IUser['userRole'];
}

export interface SocketData {
  user?: SocketUserPayload;
}

export default SocketData;
