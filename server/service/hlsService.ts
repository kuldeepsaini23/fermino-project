import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { Router, PlainTransport, Consumer } from "mediasoup/node/lib/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ffmpegProcess: any = null;
let isStreaming = false;
let plainTransport: PlainTransport | null = null;
const activeConsumers: Map<string, Consumer> = new Map();

const hlsDir = path.join(__dirname, "../../public/hls");

export function getHLSStatus() {
  return isStreaming;
}

export function getHLSUrl() {
  return isStreaming ? "/hls/stream.m3u8" : null;
}

export function checkHLSHealth() {
  const manifestPath = path.join(hlsDir, "stream.m3u8");
  const manifestExists = fs.existsSync(manifestPath);
  let hasSegments = false;
  
  if (manifestExists) {
    try {
      const files = fs.readdirSync(hlsDir);
      hasSegments = files.some((file) => file.endsWith(".ts"));
    } catch (err) {
      console.error("Segment check error:", err);
    }
  }
  
  return { isStreaming, hasSegments, manifestExists };
}

// Simple SDP for basic FFmpeg
const createBasicSDP = (rtpPort: number, rtcpPort: number): string => {
  const sdpContent = `v=0
o=- 0 0 IN IP4 127.0.0.1
s=Stream
c=IN IP4 127.0.0.1
t=0 0
m=video ${rtpPort} RTP/AVP 96
a=rtpmap:96 VP8/90000
a=rtcp:${rtcpPort}
a=recvonly
`;

  const sdpPath = path.join(hlsDir, "stream.sdp");
  fs.writeFileSync(sdpPath, sdpContent);
  console.log("📝 Basic SDP created");
  return sdpPath;
};

function ensureDirectoryExists() {
  if (!fs.existsSync(hlsDir)) {
    fs.mkdirSync(hlsDir, { recursive: true });
  }
  console.log("✅ Directory ready");
}

function cleanupHLS() {
  console.log("🧹 Cleaning up resources");
  
  activeConsumers.forEach((consumer, id) => {
    try {
      consumer.close();
    } catch (err) {
      console.error(`Error closing consumer ${id}:`, err);
    }
  });
  activeConsumers.clear();
  
  if (plainTransport) {
    try {
      plainTransport.close();
      plainTransport = null;
    } catch (err) {
      console.error("Error closing transport:", err);
    }
  }
  
  if (ffmpegProcess) {
    try {
      ffmpegProcess.kill("SIGTERM");
      ffmpegProcess = null;
    } catch (err) {
      console.error("Error killing FFmpeg:", err);
    }
  }
  
  // Clean files
  setTimeout(() => {
    try {
      if (fs.existsSync(hlsDir)) {
        const files = fs.readdirSync(hlsDir);
        files.forEach((file) => {
          if (file.endsWith(".ts") || file.endsWith(".m3u8") || file.endsWith(".sdp")) {
            try {
              fs.unlinkSync(path.join(hlsDir, file));
              console.log(`🗑️ Cleaned: ${file}`);
            } catch (err) {
              // Ignore locked files
            }
          }
        });
      }
    } catch (err) {
      // Ignore cleanup errors
    }
  }, 1000);
}

export function stopHLSStream() {
  console.log("🛑 Stopping HLS");
  isStreaming = false;
  cleanupHLS();
}

export async function startHLSStream(router: Router): Promise<boolean> {
  if (isStreaming) {
    console.log("⚠️ Already streaming");
    return false;
  }

  try {
    console.log("🚀 Starting basic HLS stream...");
    
    ensureDirectoryExists();
    cleanupHLS();

    plainTransport = await router.createPlainTransport({
      listenIp: { ip: "127.0.0.1" },
      rtcpMux: false,
      comedia: false,
    });

    const rtpPort = plainTransport.tuple.localPort;
    const rtcpPort = plainTransport.rtcpTuple?.localPort || rtpPort + 1;
    
    console.log(`✅ Transport ready - RTP: ${rtpPort}, RTCP: ${rtcpPort}`);

    const sdpPath = createBasicSDP(rtpPort, rtcpPort);
    await startBasicFFmpeg(sdpPath);
    
    isStreaming = true;
    console.log("✅ HLS started");
    return true;
    
  } catch (err) {
    console.error("❌ Start failed:", err);
    isStreaming = false;
    cleanupHLS();
    return false;
  }
}

// Very basic FFmpeg with minimal options
async function startBasicFFmpeg(sdpPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log("🎥 Starting basic FFmpeg...");
    
    const outputPath = path.resolve(hlsDir, "stream.m3u8");
    const segmentPath = path.resolve(hlsDir, "seg_%03d.ts");
    
    let resolved = false;
    
    ffmpegProcess = ffmpeg()
      .input(sdpPath)
      .inputOptions([
        "-protocol_whitelist", "file,udp,rtp",
        "-fflags", "+genpts"
      ])
      .videoCodec("libx264")
      .outputOptions([
        "-preset", "ultrafast",
        "-profile:v", "baseline",
        "-pix_fmt", "yuv420p",
        "-g", "30",
        "-b:v", "500k",
        "-f", "hls",
        "-hls_time", "6",
        "-hls_list_size", "5",
        "-hls_segment_filename", segmentPath
      ])
      .output(outputPath)
      .on("start", (cmd) => {
        console.log("🎬 FFmpeg command:");
        console.log(cmd);
        if (!resolved) {
          resolved = true;
          resolve();
        }
      })
      .on("stderr", (line) => {
        if (line.includes("frame=")) {
          console.log("📹", line.trim());
        } else if (line.includes("error") || line.includes("Error")) {
          console.error("❌ FFmpeg:", line.trim());
        } else if (line.includes("hls") || line.includes("segment")) {
          console.log("🔍", line.trim());
        }
      })
      .on("error", (err) => {
        console.error("❌ FFmpeg error:", err.message);
        isStreaming = false;
        cleanupHLS();
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      })
      .on("end", () => {
        console.log("🛑 FFmpeg ended");
        isStreaming = false;
        cleanupHLS();
      })
      .run();
  });
}

export async function connectProducerToHLS(router: Router, producerId: string): Promise<boolean> {
  if (!plainTransport || !isStreaming) {
    console.log("❌ Cannot connect: No transport");
    return false;
  }

  try {
    console.log(`🔌 Connecting producer ${producerId}...`);

    const videoCodec = router.rtpCapabilities.codecs?.find(
      codec => codec.mimeType.toLowerCase() === "video/vp8"
    );

    if (!videoCodec) {
      console.error("❌ VP8 not found");
      return false;
    }

    const consumer = await plainTransport.consume({
      producerId,
      rtpCapabilities: {
        codecs: [videoCodec],
        headerExtensions: [],
      },
      paused: true,
    });

    activeConsumers.set(consumer.id, consumer);
    console.log(`📊 Consumer: ${consumer.id}`);

    consumer.on("transportclose", () => {
      activeConsumers.delete(consumer.id);
    });

    consumer.on("producerclose", () => {
      activeConsumers.delete(consumer.id);
    });

    await plainTransport.connect({
      ip: "127.0.0.1",
      port: plainTransport.tuple.localPort,
      rtcpPort: plainTransport.rtcpTuple?.localPort
    });

    setTimeout(async () => {
      try {
        await consumer.resume();
        console.log(`✅ Consumer resumed: ${consumer.id}`);
        console.log("🎬 Pipeline active!");
      } catch (err) {
        console.error("❌ Resume error:", err);
      }
    }, 3000); // Longer delay

    return true;
    
  } catch (err) {
    console.error("❌ Connect failed:", err);
    return false;
  }
}

// Simple test without advanced options
export async function startTestHLSStream(): Promise<boolean> {
  if (isStreaming) {
    return false;
  }
  
  console.log("🧪 Creating manual test...");
  
  try {
    ensureDirectoryExists();
    cleanupHLS();

    // Just create manual HLS since FFmpeg options are limited
    const manifestContent = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:6.0,
seg_000.ts
#EXTINF:6.0,
seg_001.ts
#EXTINF:6.0,
seg_002.ts
#EXT-X-ENDLIST
`;
    
    const manifestPath = path.join(hlsDir, "stream.m3u8");
    fs.writeFileSync(manifestPath, manifestContent);
    
    // Create segments
    for (let i = 0; i < 3; i++) {
      const segmentPath = path.join(hlsDir, `seg_00${i}.ts`);
      const segmentData = Buffer.alloc(150000); // 150KB
      
      // Fill with TS packets
      for (let p = 0; p < Math.floor(segmentData.length / 188); p++) {
        const offset = p * 188;
        segmentData[offset] = 0x47; // TS sync
        segmentData[offset + 1] = 0x40;
        segmentData[offset + 2] = i;
        segmentData[offset + 3] = p % 16;
      }
      
      fs.writeFileSync(segmentPath, segmentData);
    }
    
    console.log("✅ Manual test created");
    isStreaming = true;
    
    // Auto-stop after 20 seconds
    setTimeout(() => {
      isStreaming = false;
      cleanupHLS();
    }, 20000);

    return true;
  } catch (err) {
    console.error("❌ Test failed:", err);
    return false;
  }
}

export async function startTestWithSDPFile(): Promise<boolean> {
  return startTestHLSStream(); // Same as manual test for simplicity
}