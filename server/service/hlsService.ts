import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { Router } from "mediasoup/node/lib/types";

import { PlainTransport } from 'mediasoup/node/lib/types';



// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ffmpegProcess: any = null;
let isStreaming = false;



let plainTransport: PlainTransport | null = null;
const activeConsumers = new Map<string, any>();

const hlsDir = path.join(__dirname, "../../public/hls");

export function getHLSStatus(): boolean {
  return isStreaming;
}

export function getHLSUrl(): string | null {
  if (!isStreaming) return null;
  return "/hls/stream.m3u8";
}

// Health check for HLS stream
export function checkHLSHealth(): {
  isStreaming: boolean;
  hasSegments: boolean;
  manifestExists: boolean;
} {
  const manifestPath = path.join(hlsDir, "stream.m3u8");
  const manifestExists = fs.existsSync(manifestPath);

  let hasSegments = false;
  if (manifestExists) {
    try {
      const files = fs.readdirSync(hlsDir);
      hasSegments = files.some((file) => file.endsWith(".ts"));
    } catch (error) {
      console.error("Error checking HLS segments:", error);
    }
  }

  return {
    isStreaming,
    hasSegments,
    manifestExists,
  };
}

// ✅ IMPROVED RTP PARAMETERS
const rtpParameters = {
  codecs: [
    {
      kind: "video" as const,
      mimeType: "video/VP8" as const,
      clockRate: 90000,
      payloadType: 96,
      parameters: {},
    },
  ],
  encodings: [{ ssrc: 22222222 }],
};


function createSDPFile(port: number, payloadType: number): string {
  const sdpContent = `v=0
o=- 0 0 IN IP4 127.0.0.1
s=MediaSoup Stream
c=IN IP4 127.0.0.1
t=0 0
m=video ${port} RTP/AVP ${payloadType}
a=rtpmap:${payloadType} VP8/90000
a=recvonly
`;
  
  const sdpPath = path.join(hlsDir, 'stream.sdp');
  fs.writeFileSync(sdpPath, sdpContent);
  return sdpPath;
}





export function stopHLSStream(): void {
  console.log("🛑 Stopping HLS stream...");
  isStreaming = false;

  if (ffmpegProcess) {
    ffmpegProcess.kill("SIGKILL"); // Changed from SIGTERM to SIGKILL for immediate stop
    ffmpegProcess = null;
  }

  cleanupHLS();
}



// ... rest of the functions remain the same
export async function startTestHLSStream(): Promise<boolean> {
  if (isStreaming) return false;

  try {
    console.log('🎬 Setting up test HLS stream...');
    
    // Ensure HLS directory exists
    if (!fs.existsSync(hlsDir)) {
      fs.mkdirSync(hlsDir, { recursive: true });
    }

    // Clean up old files
    const files = fs.readdirSync(hlsDir);
    files.forEach(file => {
      if (file.endsWith('.ts') || file.endsWith('.m3u8')) {
        fs.unlinkSync(path.join(hlsDir, file));
      }
    });

    // ✅ DEBUG THE PATH RESOLUTION
    console.log('📁 Current working directory:', process.cwd());
    console.log('📁 __dirname:', __dirname);
    console.log('📁 hlsDir:', hlsDir);
    
    // Try multiple possible paths for the video file
    const possiblePaths = [
      path.join(__dirname, '../../public/hls/un.mp4'),
      path.join(process.cwd(), 'public/hls/un.mp4'),
      path.join(process.cwd(), 'server/public/hls/un.mp4'),
      path.resolve('public/hls/un.mp4'),
      'E:\\KuldeepSaini\\Fermino\\fermino-project\\public\\hls\\un.mp4' // Absolute path
    ];
    
    let videoPath = null;
    for (const testPath of possiblePaths) {
      console.log('🔍 Checking path:', testPath);
      if (fs.existsSync(testPath)) {
        videoPath = testPath;
        console.log('✅ Found video file at:', videoPath);
        break;
      } else {
        console.log('❌ File not found at:', testPath);
      }
    }
    
    if (!videoPath) {
      console.error('❌ Video file not found in any expected location');
      console.log('📂 Please check if un.mp4 exists in:');
      possiblePaths.forEach(p => console.log('   -', p));
      return false;
    }

    // ✅ USE THE FOUND VIDEO FILE
    ffmpegProcess = ffmpeg()
      .input(videoPath)
      .inputOptions([
        '-stream_loop', '-1', // Loop the video infinitely
        '-re' // Read input at native frame rate
      ])
      .videoCodec('libx264')
      .outputOptions([
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-g', '30',
        '-sc_threshold', '0',
        '-b:v', '500k',
        '-pix_fmt', 'yuv420p',
        '-f', 'hls',
        '-hls_time', '2',
        '-hls_list_size', '10',
        '-hls_flags', 'delete_segments+append_list',
        '-hls_allow_cache', '0',
        '-hls_segment_filename', path.join(hlsDir, 'segment_%03d.ts'),
      ])
      .output(path.join(hlsDir, 'stream.m3u8'))
      .on('start', (commandLine) => {
        console.log('✅ Test HLS streaming started with command:', commandLine);
        isStreaming = true;
      })
      .on('stderr', (stderrLine) => {
        // Log more FFmpeg output to see what's happening
        if (stderrLine.includes('frame=') || 
            stderrLine.includes('time=') || 
            stderrLine.includes('Input') ||
            stderrLine.includes('Output') ||
            stderrLine.includes('Stream') ||
            stderrLine.includes('Error') ||
            stderrLine.includes('Warning')) {
          console.log('📺 FFmpeg:', stderrLine.trim());
        }
      })
      .on('error', (err) => {
        console.error('❌ Test HLS error:', err);
        isStreaming = false;
      })
      .on('end', () => {
        console.log('🛑 Test HLS stream ended');
        isStreaming = false;
      })
      .run();

    return true;
  } catch (error) {
    console.error('❌ Error starting test HLS stream:', error);
    isStreaming = false;
    return false;
  }
}




export async function startHLSStream(router: Router): Promise<boolean> {
  if (isStreaming) return false;

  try {
    console.log('🎬 Setting up MediaSoup HLS stream...');
    
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

    console.log('🔗 Creating plain transport for MediaSoup...');
    
    // ✅ CREATE PLAIN TRANSPORT WITH PROPER CONFIGURATION
    plainTransport = await router.createPlainTransport({
      listenIp: { 
        ip: '127.0.0.1', 
        announcedIp: undefined 
      },
      rtcpMux: false,
      comedia: false, // ✅ Changed to false for better control
      enableSctp: false,
      enableSrtp: false,
    });

    const rtpPort = plainTransport.tuple.localPort;
    const rtcpPort = plainTransport.rtcpTuple?.localPort;
    
    console.log(`🎯 Plain transport created:`);
    console.log(`   - RTP Port: ${rtpPort}`);
    console.log(`   - RTCP Port: ${rtcpPort}`);

    // ✅ START FFMPEG WITH PROPER RTP CONFIGURATION
    console.log('🚀 Starting FFmpeg with MediaSoup RTP...');
    
    ffmpegProcess = ffmpeg()
      .input(`rtp://127.0.0.1:${rtpPort}`)
      .inputOptions([
        '-protocol_whitelist', 'file,udp,rtp',
        '-fflags', '+genpts',
        '-re',
        '-buffer_size', '65536',
        '-rtsp_transport', 'udp',
        '-timeout', '30000000',
      ])
      .videoCodec('libx264')
      .outputOptions([
        '-preset', 'ultrafast',
        '-tune', 'zerolatency',
        '-g', '30',
        '-keyint_min', '30',
        '-sc_threshold', '0',
        '-b:v', '1000k',
        '-maxrate', '1000k',
        '-bufsize', '2000k',
        '-pix_fmt', 'yuv420p',
        '-f', 'hls',
        '-hls_time', '2',
        '-hls_list_size', '10',
        '-hls_flags', 'delete_segments+append_list',
        '-hls_allow_cache', '0',
        '-hls_segment_filename', path.join(hlsDir, 'segment_%03d.ts'),
      ])
      .output(path.join(hlsDir, 'stream.m3u8'))
      .on('start', (commandLine) => {
        console.log('✅ MediaSoup HLS streaming started with command:');
        console.log(commandLine);
        isStreaming = true;
      })
      .on('stderr', (stderrLine) => {
        if (stderrLine.includes('frame=') || 
            stderrLine.includes('time=') || 
            stderrLine.includes('Input') ||
            stderrLine.includes('Output') ||
            stderrLine.includes('Error') || 
            stderrLine.includes('Warning')) {
          console.log('📺 MediaSoup FFmpeg:', stderrLine.trim());
        }
      })
      .on('error', (err) => {
        console.error('❌ MediaSoup FFmpeg error:', err);
        isStreaming = false;
        cleanupHLS();
      })
      .on('end', () => {
        console.log('🛑 MediaSoup HLS streaming ended');
        isStreaming = false;
        cleanupHLS();
      })
      .run();

    // ✅ GIVE FFMPEG TIME TO START LISTENING
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return true;
  } catch (error) {
    console.error('❌ Error starting MediaSoup HLS stream:', error);
    isStreaming = false;
    return false;
  }
}

export async function connectProducerToHLS(
  router: Router,
  producerId: string
): Promise<boolean> {
  if (!plainTransport || !isStreaming) {
    console.log("❌ Plain transport not available or HLS not streaming");
    return false;
  }

  try {
    console.log(`🔗 Connecting producer ${producerId} to HLS...`);

    // ✅ CHECK IF PRODUCER EXISTS
    const producers = Array.from(router._producers.values());
    const producer = producers.find(p => p.id === producerId);
    
    if (!producer) {
      console.error(`❌ Producer ${producerId} not found in router`);
      return false;
    }

    console.log(`📊 Producer details:`, {
      id: producer.id,
      kind: producer.kind,
      type: producer.type,
      paused: producer.paused,
    });

    // ✅ CREATE CONSUMER WITH PROPER RTP CAPABILITIES
    const consumer = await plainTransport.consume({
      producerId,
      rtpCapabilities: {
        codecs: [
          {
            kind: 'video',
            mimeType: 'video/VP8',
            clockRate: 90000,
            payloadType: 96,
            parameters: {},
            rtcpFeedback: []
          }
        ],
        headerExtensions: []
      },
    });

    console.log(`✅ Consumer created: ${consumer.id}`);
    console.log(`🎯 Consumer RTP parameters:`, {
      payloadType: consumer.rtpParameters.codecs[0]?.payloadType,
      clockRate: consumer.rtpParameters.codecs[0]?.clockRate,
      mimeType: consumer.rtpParameters.codecs[0]?.mimeType,
      ssrc: consumer.rtpParameters.encodings[0]?.ssrc,
    });

    // ✅ STORE CONSUMER FOR CLEANUP
    activeConsumers.set(producerId, consumer);

    // Handle consumer events
    consumer.on("transportclose", () => {
      console.log(`🔌 Plain transport consumer closed: ${consumer.id}`);
      activeConsumers.delete(producerId);
    });

    consumer.on("producerclose", () => {
      console.log(`🛑 Producer closed, cleaning up consumer: ${consumer.id}`);
      activeConsumers.delete(producerId);
    });

    // ✅ RESUME CONSUMER AND WAIT
    await consumer.resume();
    console.log(`▶️ Consumer resumed for producer ${producerId}`);

    // ✅ VERIFY CONSUMER IS ACTIVE
    setTimeout(() => {
      if (!consumer.closed) {
        console.log(`✅ Consumer ${consumer.id} is active and streaming`);
      } else {
        console.log(`❌ Consumer ${consumer.id} was closed unexpectedly`);
      }
    }, 1000);

    return true;
  } catch (error) {
    console.error("❌ Error connecting producer to HLS:", error);
    return false;
  }
}

function cleanupHLS(): void {
  console.log("🧹 Cleaning up HLS resources...");
  
  // Close all active consumers
  activeConsumers.forEach((consumer, producerId) => {
    console.log(`🔌 Closing consumer for producer ${producerId}`);
    if (!consumer.closed) {
      consumer.close();
    }
  });
  activeConsumers.clear();
  
  if (plainTransport) {
    plainTransport.close();
    plainTransport = null;
  }
}