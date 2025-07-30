import * as mediasoup from "mediasoup";
import { Worker, Router, RtpCodecCapability  } from "mediasoup/node/lib/types";




const mediaCodecs: RtpCodecCapability[] = [
  {
    kind: "audio",
    mimeType: "audio/opus",
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: "video",
    mimeType: "video/VP8",
    clockRate: 90000,
    parameters: {
      "x-google-start-bitrate": 1000,
    },
  },
];

export const createWorker = async(): Promise<Worker> => {
  try {
    const worker = await mediasoup.createWorker({
      logLevel: 'warn',
      rtcMinPort: 10000,
      rtcMaxPort: 10100,
    });

    worker.on('died', (error) => {
      console.error('mediasoup worker died', error);
      setTimeout(() => process.exit(1), 2000);
    });

    return worker;
  } catch (error) {
    console.error('Failed to create mediasoup worker:', error);
    throw error;
  }
}

export const createRouter = async(worker: Worker): Promise<Router> => {
  try {
    const router = await worker.createRouter({ mediaCodecs });
    return router;
  } catch (error) {
    console.error('Failed to create mediasoup router:', error);
    throw error;
  }
}



export const createWebRtcTransport = async (router: Router) => {
  try {
    const transport = await router.createWebRtcTransport({
      listenIps: [{ 
        ip: process.env.MEDIASOUP_LISTEN_IP || '127.0.0.1', 
        announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP || undefined 
      }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    });

    transport.on('dtlsstatechange', (dtlsState) => {
      if (dtlsState === 'closed') {
        transport.close();
      }
    });

    return transport;
  } catch (error) {
    console.error('Failed to create WebRTC transport:', error);
    throw error;
  }
}
export const initializeMediasoup = async () => {
  try {
    const worker = await createWorker();
    console.log("✅ Mediasoup initialized", worker);
  } catch (error) {
    console.error('❌ Failed to initialize Mediasoup:', error);
    throw error;
  }
};