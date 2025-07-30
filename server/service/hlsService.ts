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

// Simplified SDP creation for VP8
const createSimpleSDPFile = (rtpPort: number, rtcpPort: number) => {
  const sdpContent = `v=0
o=- 0 0 IN IP4 127.0.0.1
s=MediaSoup Stream
c=IN IP4 127.0.0.1
t=0 0
m=video ${rtpPort} RTP/AVP 96
a=rtpmap:96 VP8/90000
a=rtcp:${rtcpPort}
a=recvonly
`;

  const sdpPath = path.join(hlsDir, "stream.sdp");
  fs.writeFileSync(sdpPath, sdpContent);
  console.log("📝 SDP file created:", sdpPath);
  return sdpPath;
};

function cleanupHLS() {
  console.log("🧹 Cleaning up HLS resources");
  
  // Close all consumers
  activeConsumers.forEach((consumer, id) => {
    console.log(`🗑️ Closing consumer: ${id}`);
    consumer.close();
  });
  activeConsumers.clear();
  
  // Close plain transport
  if (plainTransport) {
    plainTransport.close();
    plainTransport = null;
  }
  
  // Kill FFmpeg process
  if (ffmpegProcess) {
    ffmpegProcess.kill("SIGKILL");
    ffmpegProcess = null;
  }
  
  // Clean up files
  try {
    if (fs.existsSync(hlsDir)) {
      fs.readdirSync(hlsDir).forEach((file) => {
        if (file.endsWith(".ts") || file.endsWith(".m3u8") || file.endsWith(".sdp")) {
          fs.unlinkSync(path.join(hlsDir, file));
        }
      });
    }
  } catch (err) {
    console.error("❌ Error cleaning files:", err);
  }
}

export function stopHLSStream() {
  console.log("🛑 Stopping HLS stream...");
  isStreaming = false;
  cleanupHLS();
}

export async function startHLSStream(router: Router): Promise<boolean> {
  if (isStreaming) {
    console.log("⚠️ HLS already streaming");
    return false;
  }

  try {
    console.log("🚀 Starting HLS stream...");
    
    // Ensure HLS directory exists
    if (!fs.existsSync(hlsDir)) {
      fs.mkdirSync(hlsDir, { recursive: true });
    }
    
    // Clean previous files
    cleanupHLS();

    // Create plain transport
    plainTransport = await router.createPlainTransport({
      listenIp: { ip: "127.0.0.1" },
      rtcpMux: false,
      comedia: true, // Allow remote peer to initiate connection
    });

    const rtpPort = plainTransport.tuple.localPort;
    const rtcpPort = plainTransport.rtcpTuple?.localPort || rtpPort + 1;
    
    console.log(`✅ Plain transport created - RTP: ${rtpPort}, RTCP: ${rtcpPort}`);

    // Create SDP file
    const sdpPath = createSimpleSDPFile(rtpPort, rtcpPort);

    // Start FFmpeg with simplified pipeline
    await startFFmpegProcess(sdpPath);
    
    isStreaming = true;
    return true;
    
  } catch (err) {
    console.error("❌ Failed to start HLS:", err);
    isStreaming = false;
    cleanupHLS();
    return false;
  }
}

async function startFFmpegProcess(sdpPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log("🎥 Starting FFmpeg process...");
    
    ffmpegProcess = ffmpeg()
      .input(sdpPath)
      .inputOptions([
        "-protocol_whitelist", "file,udp,rtp",
        "-fflags", "+genpts+discardcorrupt",
        "-thread_queue_size", "1024",
        "-analyzeduration", "1000000",
        "-probesize", "1000000"
      ])
      .videoCodec("libx264")
      .outputOptions([
        "-preset", "ultrafast",
        "-tune", "zerolatency",
        "-profile:v", "baseline",
        "-level", "3.1",
        "-pix_fmt", "yuv420p",
        "-g", "30", // GOP size
        "-keyint_min", "30",
        "-sc_threshold", "0",
        "-b:v", "1000k",
        "-maxrate", "1200k",
        "-bufsize", "2000k",
        "-f", "hls",
        "-hls_time", "2",
        "-hls_list_size", "10",
        "-hls_flags", "delete_segments+append_list",
        "-hls_segment_filename", path.join(hlsDir, "segment_%05d.ts").replace(/\\/g, "/"),
        "-hls_base_url", "/hls/"
      ])
      .output(path.join(hlsDir, "stream.m3u8").replace(/\\/g, "/"))
      .on("start", (cmd) => {
        console.log("🎬 FFmpeg started with command:");
        console.log(cmd);
        resolve();
      })
      .on("stderr", (line) => {
        // Only log important messages
        if (line.includes("frame=") || line.includes("time=") || line.includes("fps=")) {
          console.log("📹 FFmpeg:", line.trim());
        } else if (line.includes("error") || line.includes("Error")) {
          console.error("❌ FFmpeg Error:", line.trim());
        }
      })
      .on("error", (err) => {
        console.error("❌ FFmpeg process error:", err.message);
        isStreaming = false;
        cleanupHLS();
        reject(err);
      })
      .on("end", () => {
        console.log("🛑 FFmpeg process ended");
        isStreaming = false;
        cleanupHLS();
      })
      .run();
  });
}

export async function connectProducerToHLS(router: Router, producerId: string): Promise<boolean> {
  if (!plainTransport || !isStreaming) {
    console.log("❌ Cannot connect: No plain transport or not streaming");
    return false;
  }

  try {
    console.log(`🔌 Connecting producer ${producerId} to HLS...`);

    // Get VP8 codec from router capabilities
    const videoCodec = router.rtpCapabilities.codecs?.find(
      codec => codec.mimeType.toLowerCase() === "video/vp8"
    );

    if (!videoCodec) {
      console.error("❌ VP8 codec not found in router capabilities");
      return false;
    }

    // Create consumer for this producer
    const consumer = await plainTransport.consume({
      producerId,
      rtpCapabilities: {
        codecs: [videoCodec],
        headerExtensions: [],
      },
      paused: false,
    });

    // Store consumer for cleanup
    activeConsumers.set(consumer.id, consumer);

    // Set up event handlers
    consumer.on("transportclose", () => {
      console.log(`🔌 Transport closed for consumer ${consumer.id}`);
      activeConsumers.delete(consumer.id);
    });

    consumer.on("producerclose", () => {
      console.log(`🎭 Producer closed for consumer ${consumer.id}`);
      activeConsumers.delete(consumer.id);
    });

    // Resume consumer
    await consumer.resume();
    console.log(`✅ Consumer created and resumed: ${consumer.id}`);

    return true;
    
  } catch (err) {
    console.error("❌ Failed to connect producer to HLS:", err);
    return false;
  }
}

// Test HLS with a static video file
export async function startTestHLSStream(): Promise<boolean> {
  if (isStreaming) return false;
  
  console.log("🧪 Starting test HLS stream...");
  
  if (!fs.existsSync(hlsDir)) {
    fs.mkdirSync(hlsDir, { recursive: true });
  }

  // Clean previous files
  cleanupHLS();

  try {
    ffmpegProcess = ffmpeg()
      .input("testsrc=duration=3600:size=640x480:rate=30") // Generate test pattern
      .inputOptions(["-f", "lavfi"])
      .videoCodec("libx264")
      .outputOptions([
        "-preset", "ultrafast",
        "-tune", "zerolatency",
        "-profile:v", "baseline",
        "-pix_fmt", "yuv420p",
        "-g", "30",
        "-b:v", "500k",
        "-f", "hls",
        "-hls_time", "2",
        "-hls_list_size", "10",
        "-hls_flags", "delete_segments+append_list",
        "-hls_segment_filename", path.join(hlsDir, "test_segment_%05d.ts"),
      ])
      .output(path.join(hlsDir, "stream.m3u8"))
      .on("start", (cmd) => {
        console.log("🧪 Test FFmpeg started:", cmd);
        isStreaming = true;
      })
      .on("stderr", (line) => {
        if (line.includes("frame=")) {
          console.log("🧪 Test Stream:", line.trim());
        }
      })
      .on("error", (err) => {
        console.error("❌ Test HLS error:", err);
        isStreaming = false;
      })
      .on("end", () => {
        console.log("🧪 Test HLS stream ended");
        isStreaming = false;
      })
      .run();

    return true;
  } catch (err) {
    console.error("❌ Failed to start test stream:", err);
    return false;
  }
}