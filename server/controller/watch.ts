import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

export function getPlaylist(req: Request, res: Response) {
  const filePath = path.join(__dirname, '../../public/hls/playlist.m3u8');
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send('Playlist not found');
  }
}
