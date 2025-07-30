import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import path from "path";
import { Router } from "mediasoup/node/lib/types";

let ffmpegProcess: any = null;
let isStreaming = false;
let plainTransport: any = null;

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

export const createSDPFile = (port: number, payloadType: number) => {
  const sdpContent = `v=0
o=- 0 0 IN IP4 127.0.0.1
s=MediaSoup HLS Stream
c=IN IP4 127.0.0.1
t=0 0
m=video ${port} RTP/AVP ${payloadType}
a=rtpmap:${payloadType} VP8/90000
a=fmtp:${payloadType} packetization-mode=1
a=rtcp:${port + 1}
a=recvonly
`;

  const sdpPath = path.posix.join(hlsDir.replace(/\\/g, "/"), "stream.sdp");
  fs.writeFileSync(sdpPath, sdpContent);
  console.log("📝 SDP file written:", sdpPath);
  console.log("📄 SDP content:\n", sdpContent);
  return sdpPath;
};

function cleanupHLS() {
  console.log("🧹 Cleaning up plain transport and files");
  if (plainTransport) {
    plainTransport.close();
    plainTransport = null;
  }
}

export function stopHLSStream() {
  console.log("🛑 Stopping HLS stream...");
  isStreaming = false;
  if (ffmpegProcess) {
    ffmpegProcess.kill("SIGKILL");
    ffmpegProcess = null;
  }
  cleanupHLS();
}

export async function startHLSStream(router: Router): Promise<boolean> {
  if (isStreaming) return false;

  try {
    if (!fs.existsSync(hlsDir)) fs.mkdirSync(hlsDir, { recursive: true });
    fs.readdirSync(hlsDir).forEach((f) => {
      if (f.endsWith(".ts") || f.endsWith(".m3u8")) fs.unlinkSync(path.join(hlsDir, f));
    });

    plainTransport = await router.createPlainTransport({
      listenIp: { ip: "127.0.0.1" },
      rtcpMux: false,
      comedia: true,
    });

    console.log("✅ Plain transport created on port", plainTransport.tuple.localPort);

    const vp8Codec = router.rtpCapabilities.codecs?.find(
      (c) => c.mimeType.toLowerCase() === "video/vp8"
    );
    const payloadType = vp8Codec?.preferredPayloadType || 96;
    const sdpPath = createSDPFile(plainTransport.tuple.localPort, payloadType);

    plainTransport.on("tuple", () => console.log("📥 RTP packet received on plain transport"));

    ffmpegProcess = ffmpeg()
      .input(sdpPath)
      .inputOptions([
        "-protocol_whitelist", "file,udp,rtp",
        "-fflags", "+genpts",
        "-re",
        "-f", "rtp"
      ])
      .videoCodec("libx264")
      .outputOptions([
        "-preset", "ultrafast",
        "-tune", "zerolatency",
        "-g", "30",
        "-sc_threshold", "0",
        "-b:v", "1000k",
        "-pix_fmt", "yuv420p",
        "-f", "hls",
        "-hls_time", "2",
        "-hls_list_size", "5",
        "-hls_flags", "delete_segments+append_list",
        "-hls_segment_filename", path.join(hlsDir, "segment_%03d.ts"),
        "-hls_base_url", "/hls/",
      ])
      .output(path.join(hlsDir, "stream.m3u8"))
      .on("start", (cmd) => {
        console.log("🎥 FFmpeg started:", cmd);
        isStreaming = true;
      })
      .on("stderr", (line) => {
        if (line.includes("frame=") || line.includes("time=")) {
          console.log("📺 FFmpeg:", line.trim());
        }
      })
      .on("error", (err) => {
        console.error("❌ FFmpeg error:", err);
        isStreaming = false;
        cleanupHLS();
      })
      .on("end", () => {
        console.log("🛑 FFmpeg process ended");
        isStreaming = false;
        cleanupHLS();
      })
      .run();

    return true;
  } catch (err) {
    console.error("❌ Failed to start HLS:", err);
    isStreaming = false;
    return false;
  }
}

export async function connectProducerToHLS(router: Router, producerId: string): Promise<boolean> {
  if (!plainTransport || !isStreaming) {
    console.log("❌ Cannot connect: plainTransport or stream inactive");
    return false;
  }

  try {
    console.log("🔌 Connecting producer", producerId, "to HLS");

    const vp8Codec = router.rtpCapabilities.codecs?.find(
      (c) => c.mimeType.toLowerCase() === "video/vp8"
    );

    const consumer = await plainTransport.consume({
      producerId,
      rtpCapabilities: {
        codecs: vp8Codec ? [vp8Codec] : [],
        headerExtensions: [],
      },
      paused: false,
    });

    consumer.on("transportclose", () => console.log("🧯 Transport closed for HLS consumer"));
    consumer.on("producerclose", () => console.log("❌ Producer closed for HLS consumer"));

    await consumer.resume();
    console.log("▶️ HLS consumer resumed:", consumer.id);

    return true;
  } catch (err) {
    console.error("❌ Failed to connect producer to HLS:", err);
    return false;
  }
}

export async function startTestHLSStream(): Promise<boolean> {
  if (isStreaming) return false;
  if (!fs.existsSync(hlsDir)) fs.mkdirSync(hlsDir, { recursive: true });

  try {
    const testVideoPath = path.join(__dirname, "../../public/hls/un.mp4");

    ffmpegProcess = ffmpeg()
      .input(testVideoPath)
      .videoCodec("libx264")
      .outputOptions([
        "-preset", "ultrafast",
        "-tune", "zerolatency",
        "-g", "30",
        "-sc_threshold", "0",
        "-b:v", "500k",
        "-pix_fmt", "yuv420p",
        "-f", "hls",
        "-hls_time", "2",
        "-hls_list_size", "5",
        "-hls_flags", "delete_segments+append_list",
        "-hls_segment_filename", path.join(hlsDir, "segment_%03d.ts"),
      ])
      .output(path.join(hlsDir, "stream.m3u8"))
      .on("start", (cmd) => {
        console.log("🧪 Test HLS started:", cmd);
        isStreaming = true;
      })
      .on("stderr", (line) => {
        if (line.includes("frame=")) console.log("🧪 Test Stream:", line.trim());
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
    console.error("❌ Failed test stream:", err);
    return false;
  }
}
