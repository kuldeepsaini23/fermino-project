import express from 'express';
import path from 'path';

const router = express.Router();
router.use('/hls', express.static(path.join(__dirname, '../../public/hls')));

export default router;
