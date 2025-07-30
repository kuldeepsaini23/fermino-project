import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { Router, RtpCodecCapability } from 'mediasoup/node/lib/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ffmpegProcess: any = null;
let isStreaming = false;
let plainTransport: any = null;

const hlsDir = path.join(__dirname, '../../public/hls');

// RTP parameters for the plain transport
const rtpParameters = {
  codecs: [
    {
      mimeType: 'video/VP8',
      clockRate: 90000,
      payloadType: 96,
    } as unknown as RtpCodecCapability,
  ],
  encodings: [{ ssrc: 22222222 }],
};

export async function startHLSStream(router: Router): Promise<boolean> {
  if (isStreaming) return false;

  try {
    // Ensure HLS directory exists
    if (!fs.existsSync(hlsDir)) {
      fs.mkdirSync(hlsDir, { recursive: true });
    }

    // Clean up old HLS files
    const files = fs.readdirSync(hlsDir);
    files.forEach(file => {
      if (file.endsWith('.ts') || file.endsWith('.m3u8')) {
        fs.unlinkSync(path.join(hlsDir, file));
      }
    });

    // Create a plain transport for receiving RTP from MediaSoup
    plainTransport = await router.createPlainTransport({
      listenIp: { ip: '127.0.0.1', announcedIp: undefined },
      rtcpMux: false,
      comedia: true,
    });

    // Start FFmpeg process to convert RTP to HLS
    ffmpegProcess = ffmpeg()
      .input(`rtp://127.0.0.1:${plainTransport.tuple.localPort}`)
      .inputOptions([
        '-protocol_whitelist', 'file,udp,rtp',
        '-fflags', '+genpts',
        '-re'
      ])
      .videoCodec('libx264')
      .outputOptions([
        '-preset', 'veryfast',
        '-tune', 'zerolatency',
        '-g', '30', // GOP size
        '-sc_threshold', '0',
        '-f', 'hls',
        '-hls_time', '2',
        '-hls_list_size', '10',
        '-hls_flags', 'delete_segments+append_list+omit_endlist',
        '-hls_allow_cache', '0',
        '-hls_segment_filename', path.join(hlsDir, 'segment_%03d.ts')
      ])
      .output(path.join(hlsDir, 'stream.m3u8'))
      .on('start', (commandLine) => {
        console.log('HLS streaming started with command:', commandLine);
        isStreaming = true;
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err);
        isStreaming = false;
        cleanupHLS();
      })
      .on('end', () => {
        console.log('HLS streaming ended');
        isStreaming = false;
        cleanupHLS();
      })
      .run();

    return true;
  } catch (error) {
    console.error('Error starting HLS stream:', error);
    isStreaming = false;
    return false;
  }
}

export async function connectProducerToHLS(router: Router, producerId: string): Promise<boolean> {
  if (!plainTransport || !isStreaming) {
    console.log('Plain transport not available or HLS not streaming');
    return false;
  }

  try {
    // Create a consumer on the plain transport to receive the video
    const consumer = await plainTransport.consume({
      producerId,
      rtpCapabilities: {
        codecs: rtpParameters.codecs,
        headerExtensions: [],
      },
    });

    console.log('Connected producer to HLS stream:', producerId);
    
    // Handle consumer events
    consumer.on('transportclose', () => {
      console.log('Plain transport consumer closed');
    });

    consumer.on('producerclose', () => {
      console.log('Producer closed, HLS consumer will be cleaned up');
    });

    return true;
  } catch (error) {
    console.error('Error connecting producer to HLS:', error);
    return false;
  }
}

export function stopHLSStream(): void {
  isStreaming = false;
  
  if (ffmpegProcess) {
    ffmpegProcess.kill('SIGTERM');
    ffmpegProcess = null;
  }
  
  cleanupHLS();
}

function cleanupHLS(): void {
  if (plainTransport) {
    plainTransport.close();
    plainTransport = null;
  }
}

export function getHLSStatus(): boolean {
  return isStreaming;
}

export function getHLSUrl(): string | null {
  if (!isStreaming) return null;
  return '/hls/stream.m3u8';
}

// Health check for HLS stream
export function checkHLSHealth(): { isStreaming: boolean; hasSegments: boolean; manifestExists: boolean } {
  const manifestPath = path.join(hlsDir, 'stream.m3u8');
  const manifestExists = fs.existsSync(manifestPath);
  
  let hasSegments = false;
  if (manifestExists) {
    try {
      const files = fs.readdirSync(hlsDir);
      hasSegments = files.some(file => file.endsWith('.ts'));
    } catch (error) {
      console.error('Error checking HLS segments:', error);
    }
  }

  return {
    isStreaming,
    hasSegments,
    manifestExists
  };
}