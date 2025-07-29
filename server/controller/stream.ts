import { Socket } from 'socket.io';
import { setupMediasoupForSocket } from '../service/mediasoup';

export function handleStreamSocket(socket: Socket) {
  setupMediasoupForSocket(socket);
}
