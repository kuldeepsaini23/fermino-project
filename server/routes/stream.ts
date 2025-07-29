import { Router } from 'express';

// Placeholder: In this case, stream routes are over socket.io
const router = Router();

router.get('/', (req, res) => {
  res.send('Stream routes active. Use WebSocket for signaling.');
});

export default router;
