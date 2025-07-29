import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ffmpegProcess: any = null;
let isStreaming = false;

export function startHLSStream(): boolean {
  if (isStreaming) return false;

  const hlsDir = path.join(__dirname, '../../public/hls');
  if (!fs.existsSync(hlsDir)) fs.mkdirSync(hlsDir, { recursive: true });

  fs.readdirSync(hlsDir).forEach(file => {
    if (file.endsWith('.ts') || file.endsWith('.m3u8')) {
      fs.unlinkSync(path.join(hlsDir, file));
    }
  });

  ffmpegProcess = ffmpeg()
    .input('rtmp://localhost:1935/live/stream')
    .inputOptions(['-re'])
    .outputOptions([
      '-c:v libx264', '-c:a aac', '-preset veryfast',
      '-tune zerolatency', '-f hls', '-hls_time 2',
      '-hls_list_size 10', '-hls_flags delete_segments', '-hls_allow_cache 0',
    ])
    .output(path.join(hlsDir, 'stream.m3u8'))
    .on('start', () => {
      console.log('HLS started');
      isStreaming = true;
    })
    .on('error', err => {
      console.error('FFmpeg error:', err);
      isStreaming = false;
    })
    .on('end', () => {
      console.log('HLS ended');
      isStreaming = false;
    })
    .run();

  return true;
}

export function stopHLSStream() {
  if (ffmpegProcess) {
    ffmpegProcess.kill('SIGTERM');
    ffmpegProcess = null;
    isStreaming = false;
  }
}

export function getHLSStatus() {
  return isStreaming;
}
