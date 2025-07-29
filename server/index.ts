import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';

import streamRoutes from './routes/stream';
import watchRoutes from './routes/watch';
import { handleStreamSocket } from './controller/stream';


dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use('/hls', express.static('public/hls'));

// Attach socket-based streaming
io.of('/stream').on('connection', socket => {
  console.log('🎥 Streamer connected');
  handleStreamSocket(socket); // Delegated to controller
});

// HTTP API routes
app.use('/api/stream', streamRoutes);
app.use('/api/watch', watchRoutes);

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () =>
  console.log(`✅ Server running at http://localhost:${PORT}`)
);
