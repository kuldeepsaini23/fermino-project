import { Router } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

router.get('/playlist.m3u8', (req, res) => {
  const filePath = path.join(__dirname, '../../public/hls/playlist.m3u8');
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('Stream not available');
  }
});

export default router;
