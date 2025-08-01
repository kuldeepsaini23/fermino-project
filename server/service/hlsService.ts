import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { Router, PlainTransport, Consumer } from "mediasoup/node/lib/types";

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

// Create a more complete SDP file for VP8/Opus
const createCompleteSDP = (videoPort: number, audioPort: number, videoRtcpPort: number, audioRtcpPort: number) => {
  const sdpContent = `v=0
o=mediasoup 0 0 IN IP4 127.0.0.1
s=mediasoup-stream
c=IN IP4 127.0.0.1
t=0 0
m=video ${videoPort} RTP/AVP 96
a=rtpmap:96 VP8/90000
a=rtcp:${videoRtcpPort}
a=recvonly
a=rtcp-mux
m=audio ${audioPort} RTP/AVP 111
a=rtpmap:111 opus/48000/2
a=fmtp:111 minptime=10;useinbandfec=1
a=rtcp:${audioRtcpPort}
a=recvonly
a=rtcp-mux
`;

  const sdpPath = path.join(hlsDir, "stream.sdp");
  fs.writeFileSync(sdpPath, sdpContent);
  console.log("📝 Complete SDP file created:", sdpPath);
  return sdpPath;
};

function cleanupHLS() {
  console.log("🧹 Cleaning up HLS resources");
  
  activeConsumers.forEach((consumer, id) => {
    console.log(`🗑️ Closing consumer: ${id}`);
    consumer.close();
  });
  activeConsumers.clear();
  
  if (plainTransport) {
    plainTransport.close();
    plainTransport = null;
  }
  
  if (ffmpegProcess) {
    ffmpegProcess.kill("SIGTERM");
    setTimeout(() => {
      if (ffmpegProcess) {
        ffmpegProcess.kill("SIGKILL");
        ffmpegProcess = null;
      }
    }, 5000);
  }
  
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
    
    if (!fs.existsSync(hlsDir)) {
      fs.mkdirSync(hlsDir, { recursive: true });
    }
    
    cleanupHLS();

    // Create plain transport for video
    const videoTransport = await router.createPlainTransport({
      listenIp: { ip: "127.0.0.1" },
      rtcpMux: false,
      comedia: false, // Changed to false for more reliable connection
    });

    // Create plain transport for audio
    const audioTransport = await router.createPlainTransport({
      listenIp: { ip: "127.0.0.1" },
      rtcpMux: false,
      comedia: false,
    });

    plainTransport = videoTransport; // Store one for cleanup

    const videoRtpPort = videoTransport.tuple.localPort;
    const videoRtcpPort = videoTransport.rtcpTuple?.localPort || videoRtpPort + 1;
    const audioRtpPort = audioTransport.tuple.localPort;
    const audioRtcpPort = audioTransport.rtcpTuple?.localPort || audioRtpPort + 1;
    
    console.log(`✅ Transports created - Video RTP: ${videoRtpPort}, Audio RTP: ${audioRtpPort}`);

    // Create complete SDP file
    const sdpPath = createCompleteSDP(videoRtpPort, audioRtpPort, videoRtcpPort, audioRtcpPort);

    // Start FFmpeg with improved configuration
    await startFFmpegWithSDP(sdpPath);
    
    // Store both transports for cleanup
    activeConsumers.set('video-transport', videoTransport as any);
    activeConsumers.set('audio-transport', audioTransport as any);
    
    isStreaming = true;
    return true;
    
  } catch (err) {
    console.error("❌ Failed to start HLS:", err);
    isStreaming = false;
    cleanupHLS();
    return false;
  }
}

async function startFFmpegWithSDP(sdpPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log("🎥 Starting FFmpeg with SDP...");
    
    ffmpegProcess = ffmpeg()
      .input(sdpPath)
      .inputOptions([
        "-protocol_whitelist", "file,udp,rtp,rtcp",
        "-fflags", "+genpts+discardcorrupt+flush_packets",
        "-thread_queue_size", "2048",
        "-analyzeduration", "2000000",
        "-probesize", "2000000",
        "-max_delay", "0",
        "-flags", "low_delay",
        "-strict", "experimental"
      ])
      // Video encoding
      .videoCodec("libx264")
      .outputOptions([
        // Video settings
        "-preset", "veryfast", // Changed from ultrafast for better quality
        "-tune", "zerolatency",
        "-profile:v", "baseline",
        "-level", "3.1",
        "-pix_fmt", "yuv420p",
        "-g", "30",
        "-keyint_min", "30",
        "-sc_threshold", "0",
        "-b:v", "1500k", // Increased bitrate
        "-maxrate", "2000k",
        "-bufsize", "3000k",
        "-r", "30", // Force frame rate
        
        // Audio settings
        "-c:a", "aac",
        "-b:a", "128k",
        "-ar", "48000",
        "-ac", "2",
        
        // HLS settings
        "-f", "hls",
        "-hls_time", "4", // Increased segment time for stability
        "-hls_list_size", "6",
        "-hls_flags", "delete_segments+append_list+independent_segments",
        "-hls_segment_filename", path.join(hlsDir, "segment_%05d.ts"),
        "-hls_base_url", "/hls/",
        "-hls_allow_cache", "0",
        "-hls_segment_type", "mpegts"
      ])
      .output(path.join(hlsDir, "stream.m3u8"))
      .on("start", (cmd) => {
        console.log("🎬 FFmpeg started with command:");
        console.log(cmd);
        resolve();
      })
      .on("stderr", (line) => {
        // More selective logging
        if (line.includes("frame=") && line.includes("fps=")) {
          const match = line.match(/frame=\s*(\d+).*fps=\s*([\d.]+)/);
          if (match) {
            console.log(`📹 Progress: ${match[1]} frames, ${match[2]} fps`);
          }
        } else if (line.includes("error") || line.includes("Error") || line.includes("failed")) {
          console.error("❌ FFmpeg Error:", line.trim());
        } else if (line.includes("Opening") || line.includes("Input") || line.includes("Output")) {
          console.log("ℹ️ FFmpeg Info:", line.trim());
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

// Alternative: Direct RTP approach without SDP
export async function startHLSWithDirectRTP(router: Router): Promise<boolean> {
  if (isStreaming) return false;

  try {
    console.log("🚀 Starting HLS with direct RTP...");
    
    if (!fs.existsSync(hlsDir)) {
      fs.mkdirSync(hlsDir, { recursive: true });
    }
    
    cleanupHLS();

    plainTransport = await router.createPlainTransport({
      listenIp: { ip: "127.0.0.1" },
      rtcpMux: true, // Simplified with muxed RTCP
      comedia: true,
    });

    const rtpPort = plainTransport.tuple.localPort;
    console.log(`✅ Direct RTP transport created on port: ${rtpPort}`);

    // Start FFmpeg with direct RTP input
    await startFFmpegWithDirectRTP(rtpPort);
    
    isStreaming = true;
    return true;
    
  } catch (err) {
    console.error("❌ Failed to start direct RTP HLS:", err);
    isStreaming = false;
    cleanupHLS();
    return false;
  }
}

async function startFFmpegWithDirectRTP(rtpPort: number): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`🎥 Starting FFmpeg with direct RTP on port ${rtpPort}...`);
    
    ffmpegProcess = ffmpeg()
      .input(`rtp://127.0.0.1:${rtpPort}`)
      .inputOptions([
        "-protocol_whitelist", "file,udp,rtp",
        "-fflags", "+genpts",
        "-thread_queue_size", "1024"
      ])
      .videoCodec("copy") // Try copying first, fallback to encoding if needed
      .outputOptions([
        "-f", "hls",
        "-hls_time", "4",
        "-hls_list_size", "6",
        "-hls_flags", "delete_segments+append_list",
        "-hls_segment_filename", path.join(hlsDir, "segment_%05d.ts"),
        "-hls_base_url", "/hls/"
      ])
      .output(path.join(hlsDir, "stream.m3u8"))
      .on("start", (cmd) => {
        console.log("🎬 Direct RTP FFmpeg started:", cmd);
        resolve();
      })
      .on("stderr", (line) => {
        if (line.includes("frame=")) {
          console.log("📹 Direct RTP:", line.trim());
        } else if (line.includes("error")) {
          console.error("❌ Direct RTP Error:", line.trim());
        }
      })
      .on("error", (err) => {
        console.error("❌ Direct RTP FFmpeg error:", err.message);
        isStreaming = false;
        cleanupHLS();
        reject(err);
      })
      .on("end", () => {
        console.log("🛑 Direct RTP FFmpeg ended");
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

    // Get producer info first
    const producer = router._producers?.get?.(producerId);
    if (!producer) {
      console.error("❌ Producer not found");
      return false;
    }

    // Get appropriate codec from router capabilities
    const codec = router.rtpCapabilities.codecs?.find(
      codec => codec.kind === producer.kind && 
      (codec.mimeType.toLowerCase().includes('vp8') || codec.mimeType.toLowerCase().includes('opus'))
    );

    if (!codec) {
      console.error(`❌ No suitable codec found for ${producer.kind}`);
      return false;
    }

    // Create consumer
    const consumer = await plainTransport.consume({
      producerId,
      rtpCapabilities: {
        codecs: [codec],
        headerExtensions: [],
      },
      paused: false,
    });

    activeConsumers.set(consumer.id, consumer);

    consumer.on("transportclose", () => {
      console.log(`🔌 Transport closed for consumer ${consumer.id}`);
      activeConsumers.delete(consumer.id);
    });

    consumer.on("producerclose", () => {
      console.log(`🎭 Producer closed for consumer ${consumer.id}`);
      activeConsumers.delete(consumer.id);
    });

    await consumer.resume();
    console.log(`✅ Consumer created: ${consumer.id} for ${producer.kind}`);

    return true;
    
  } catch (err) {
    console.error("❌ Failed to connect producer to HLS:", err);
    return false;
  }
}

// Reliable test stream with better parameters
export async function startTestHLSStream(): Promise<boolean> {
  if (isStreaming) return false;
  
  console.log("🧪 Starting reliable test HLS stream...");
  
  if (!fs.existsSync(hlsDir)) {
    fs.mkdirSync(hlsDir, { recursive: true });
  }

  cleanupHLS();

  try {
    ffmpegProcess = ffmpeg()
      .input("testsrc=duration=3600:size=1280x720:rate=30")
      .input("sine=frequency=1000:duration=3600")
      .inputOptions(["-f", "lavfi"])
      .complexFilter([
        "[0:v]drawtext=text='Test Stream %{localtime}':fontsize=48:fontcolor=white:x=10:y=10[v]",
        "[1:a]volume=0.5[a]"
      ])
      .outputOptions([
        "-map", "[v]",
        "-map", "[a]",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-profile:v", "baseline",
        "-pix_fmt", "yuv420p",
        "-g", "30",
        "-b:v", "2000k",
        "-c:a", "aac",
        "-b:a", "128k",
        "-f", "hls",
        "-hls_time", "4",
        "-hls_list_size", "6",
        "-hls_flags", "delete_segments+append_list+independent_segments",
        "-hls_segment_filename", path.join(hlsDir, "test_segment_%05d.ts"),
        "-hls_base_url", "/hls/"
      ])
      .output(path.join(hlsDir, "stream.m3u8"))
      .on("start", (cmd) => {
        console.log("🧪 Reliable test stream started");
        isStreaming = true;
      })
      .on("stderr", (line) => {
        if (line.includes("frame=") && line.includes("fps=")) {
          const match = line.match(/frame=\s*(\d+).*fps=\s*([\d.]+)/);
          if (match && parseInt(match[1]) % 150 === 0) { // Log every 5 seconds
            console.log(`🧪 Test: ${match[1]} frames, ${match[2]} fps`);
          }
        }
      })
      .on("error", (err) => {
        console.error("❌ Test stream error:", err);
        isStreaming = false;
      })
      .on("end", () => {
        console.log("🧪 Test stream ended");
        isStreaming = false;
      })
      .run();

    return true;
  } catch (err) {
    console.error("❌ Failed to start reliable test stream:", err);
    return false;
  }
}