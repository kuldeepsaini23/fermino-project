import { Router } from 'express';
import { Server } from 'socket.io';
import { handleStreamSocket } from '../services/mediasoup';

export default function (io: Server) {
  const router = Router();

  io.of('/stream').on('connection', socket => {
    console.log('🔌 New streamer connected');
    handleStreamSocket(socket); // Set up mediasoup handlers
  });

  return router;
}
