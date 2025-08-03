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

// Configuration
const FFMPEG_IP = "127.0.0.1";
const FFMPEG_AUDIO_PORT = 5004;
const FFMPEG_VIDEO_PORT = 5006;

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

// Create proper SDP for FFmpeg with both audio and video
const createSDPFile = () => {
  const sdpContent = `v=0
o=- 0 0 IN IP4 ${FFMPEG_IP}
s=MediaSoup Stream
c=IN IP4 ${FFMPEG_IP}
t=0 0
m=audio ${FFMPEG_AUDIO_PORT} RTP/AVP 111
a=rtpmap:111 opus/48000/2
a=recvonly
m=video ${FFMPEG_VIDEO_PORT} RTP/AVP 96
a=rtpmap:96 VP8/90000
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

    // Create plain transport for sending RTP to FFmpeg
    plainTransport = await router.createPlainTransport({
      listenIp: { ip: "0.0.0.0", announcedIp: FFMPEG_IP },
      rtcpMux: false, // We need separate RTCP ports
      comedia: false, // We will connect TO ffmpeg, not receive from it
    });

    // Connect the transport to FFmpeg's IP and ports
    await plainTransport.connect({
      ip: FFMPEG_IP,
      port: FFMPEG_VIDEO_PORT,
      rtcpPort: FFMPEG_VIDEO_PORT + 1
    });
    
    console.log(`✅ Plain transport created and connected to FFmpeg`);

    // Create SDP file
    const sdpPath = createSDPFile();

    // Start FFmpeg BEFORE connecting producers
    await startFFmpegProcess(sdpPath);
    
    // Give FFmpeg time to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
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
        "-protocol_whitelist", "file,rtp,udp",
        "-fflags", "+genpts+discardcorrupt",
        "-thread_queue_size", "512",
        "-analyzeduration", "10000000",
        "-probesize", "10000000",
        "-use_wallclock_as_timestamps", "1"
      ])
      // Video settings
      .videoCodec("libx264")
      .outputOptions([
        "-preset", "ultrafast",
        "-tune", "zerolatency",
        "-profile:v", "baseline",
        "-level", "3.0",
        "-pix_fmt", "yuv420p",
        "-g", "30",
        "-keyint_min", "30",
        "-sc_threshold", "0",
        "-b:v", "800k",
        "-maxrate", "1000k",
        "-bufsize", "1500k",
        // Audio settings
        "-c:a", "aac",
        "-b:a", "128k",
        "-ar", "48000",
        "-ac", "2",
        // HLS settings
        "-f", "hls",
        "-hls_time", "2",
        "-hls_list_size", "6",
        "-hls_flags", "delete_segments",
        "-hls_segment_filename", path.join(hlsDir, "segment_%05d.ts"),
        "-hls_playlist_type", "event",
        "-master_pl_name", "master.m3u8"
      ])
      .output(path.join(hlsDir, "stream.m3u8"))
      .on("start", (cmd) => {
        console.log("🎬 FFmpeg started with command:");
        console.log(cmd);
        resolve();
      })
      .on("stderr", (line) => {
        // Log everything for debugging
        console.log("📹 FFmpeg:", line);
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
      });
      
    ffmpegProcess.run();
  });
}

export async function connectProducerToHLS(router: Router, producerId: string, kind: 'audio' | 'video'): Promise<boolean> {
  if (!plainTransport || !isStreaming) {
    console.log("❌ Cannot connect: No plain transport or not streaming");
    return false;
  }

  try {
    console.log(`🔌 Connecting producer ${producerId} to HLS...`);
    console.log(`📺 Producer kind: ${kind}`);

    // Create appropriate consumer based on producer kind
    let consumer: Consumer;
    
    if (kind === "video") {
      // Create video consumer
      consumer = await plainTransport.consume({
        producerId,
        rtpCapabilities: router.rtpCapabilities, // Use router's full capabilities
        paused: false,
      });

      // Important: Tell plain transport to send video to the correct port
      await plainTransport.connect({
        ip: FFMPEG_IP,
        port: FFMPEG_VIDEO_PORT,
        rtcpPort: FFMPEG_VIDEO_PORT + 1
      });
      
    } else if (kind === "audio") {
      // Create audio consumer
      consumer = await plainTransport.consume({
        producerId,
        rtpCapabilities: router.rtpCapabilities,
        paused: false,
      });

      // Connect audio to different port
      // Note: This is a limitation - plain transport can only connect to one destination
      // For multiple streams, you'd need multiple plain transports
      console.log("⚠️ Audio consumer created but may need separate transport");
    } else {
      console.error("❌ Unknown producer kind:", kind);
      return false;
    }

    // Store consumer for cleanup
    activeConsumers.set(consumer.id, consumer);

    // Set up event handlers
    consumer.on("transportclose", () => {
      console.log(`🔌 Transport closed for consumer ${consumer.id}`);
      activeConsumers.delete(consumer.id);
    });

    consumer.on("producerclose", () => {
      console.log(`🎭 Producer closed for consumer ${consumer.id}`);
      consumer.close();
      activeConsumers.delete(consumer.id);
    });

    // Make sure consumer is not paused
    if (consumer.paused) {
      await consumer.resume();
    }

    console.log(`✅ ${kind} consumer created and active: ${consumer.id}`);
    console.log(`📊 Consumer RTP parameters:`, consumer.rtpParameters);

    return true;
    
  } catch (err) {
    console.error("❌ Failed to connect producer to HLS:", err);
    return false;
  }
}

// Updated test stream with color bars
export async function startTestHLSStream(): Promise<boolean> {
  if (isStreaming) {
    console.log("⚠️ Stream already running");
    return false;
  }
  
  console.log("🧪 Starting test HLS stream...");
  
  if (!fs.existsSync(hlsDir)) {
    fs.mkdirSync(hlsDir, { recursive: true });
  }

  // Clean previous files
  cleanupHLS();

  try {
    ffmpegProcess = ffmpeg()
      // Generate test video with color bars
      .input("smptebars=duration=300:size=640x480:rate=30")
      .inputOptions(["-f", "lavfi"])
      // Generate test audio
      .input("sine=frequency=1000:duration=300")
      .inputOptions(["-f", "lavfi"])
      // Video encoding
      .videoCodec("libx264")
      .outputOptions([
        "-preset", "ultrafast",
        "-tune", "zerolatency",
        "-profile:v", "baseline",
        "-pix_fmt", "yuv420p",
        "-g", "30",
        "-b:v", "500k",
        // Audio encoding
        "-c:a", "aac",
        "-b:a", "128k",
        "-ar", "48000",
        // HLS output
        "-f", "hls",
        "-hls_time", "2",
        "-hls_list_size", "6",
        "-hls_flags", "delete_segments",
        "-hls_segment_filename", path.join(hlsDir, "test_%05d.ts"),
      ])
      .output(path.join(hlsDir, "stream.m3u8"))
      .on("start", (cmd) => {
        console.log("🧪 Test FFmpeg started:", cmd);
        isStreaming = true;
      })
      .on("stderr", (line) => {
        // Only log errors and important info
        if (line.includes("error") || line.includes("Error")) {
          console.error("❌ Test Stream Error:", line);
        } else if (line.includes("frame=") && parseInt(line.match(/frame=\s*(\d+)/)?.[1] || "0") % 100 === 0) {
          console.log("🧪 Test Stream Progress:", line.trim());
        }
      })
      .on("error", (err) => {
        console.error("❌ Test HLS error:", err);
        isStreaming = false;
        cleanupHLS();
      })
      .on("end", () => {
        console.log("🧪 Test HLS stream ended");
        isStreaming = false;
      });

    ffmpegProcess.run();
    
    // Give FFmpeg time to create initial segments
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    return true;
  } catch (err) {
    console.error("❌ Failed to start test stream:", err);
    return false;
  }
}