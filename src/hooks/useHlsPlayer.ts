// app/watch/hooks/useHlsPlayer.ts
import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

const useHlsPlayer = (streamUrl: string) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewers, setViewers] = useState(1);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (Hls.isSupported()) {
      const hls = new Hls({ lowLatencyMode: true });
      hlsRef.current = hls;

      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsLive(true);
        setIsLoading(false);
        setError(null);
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          setError('Stream error occurred');
          hls.destroy();
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
    } else {
      setError('HLS not supported');
    }

    const viewerInterval = setInterval(() => {
      setViewers((v) => Math.max(1, v + Math.floor(Math.random() * 3) - 1));
    }, 10000);

    return () => {
      hlsRef.current?.destroy();
      clearInterval(viewerInterval);
    };
  }, [streamUrl]);

  return { videoRef, isLoading, isLive, error, viewers };
}


export default useHlsPlayer;