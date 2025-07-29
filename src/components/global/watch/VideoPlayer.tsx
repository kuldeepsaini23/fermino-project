"use client"
import useHlsPlayer from "@/hooks/useHlsPlayer";

interface Props {
  streamUrl: string;
}
const VideoPlayer = ({ streamUrl }: Props)=> {
  const { videoRef, isLoading, error } = useHlsPlayer(streamUrl);

  return (
    <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center text-white">Loading...</div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-red-500">{error}</div>
      )}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        controls
        className="w-full h-full"
      />
    </div>
  );
}

export default VideoPlayer;