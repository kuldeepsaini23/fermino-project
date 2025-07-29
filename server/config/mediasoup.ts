import { createWorker } from 'mediasoup';

export async function initMediasoupWorker() {
  const worker = await createWorker({
    logLevel: 'warn',
    rtcMinPort: 40000,
    rtcMaxPort: 49999,
  });

  worker.on('died', () => {
    console.error('Mediasoup worker died 💥');
    process.exit(1);
  });

  return worker;
}
