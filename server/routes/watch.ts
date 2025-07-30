import { Router } from 'express';
import { getPlaylist } from '../controller/watch';
import { checkHLSHealth, getHLSStatus } from '../service/hlsService';

const router = Router();

router.get('/playlist.m3u8', getPlaylist);

router.get('/debug', (req, res) => {
  const health = checkHLSHealth();
  res.json({
    ...health,
    hlsStatus: getHLSStatus(),
    timestamp: new Date().toISOString()
  });
});

export default router;
