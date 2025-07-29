import { Router } from 'express';
import { createWorker, } from 'mediasoup';

let worker: Worker;
let router: Router;

export async function initMediasoup() {
  worker = await createWorker({
    rtcMinPort: 40000,
    rtcMaxPort: 49999,
    logLevel: 'warn',
  });s

  router = await worker.createRouter({
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {},
      },
    ],
  });

  console.log('✅ Mediasoup initialized');

  return { worker, router };
}

export function getRouter() {
  return router;
}
