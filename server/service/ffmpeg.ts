import ffmpeg from 'fluent-ffmpeg';
import path from 'path';

export function startFFmpeg(inputStream: string) {
  const outputDir = path.resolve('public/hls');

  return ffmpeg(inputStream)
    .inputOptions('-re') // real-time
    .outputOptions([
      '-c:v libx264',
      '-preset ultrafast',
      '-f hls',
      '-hls_time 2',
      '-hls_list_size 5',
      '-hls_flags delete_segments',
    ])
    .output(path.join(outputDir, 'playlist.m3u8'))
    .run();
}
