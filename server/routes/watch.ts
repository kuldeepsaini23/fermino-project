import { Router } from 'express';
import { getPlaylist } from '../controllers/watch';

const router = Router();

router.get('/playlist.m3u8', getPlaylist);

export default router;
