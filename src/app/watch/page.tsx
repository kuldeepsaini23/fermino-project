import StreamDetails from "@/components/global/watch/StreamDetails";
import StreamStats from "@/components/global/watch/StreamStats";
import VideoPlayer from "@/components/global/watch/VideoPlayer";

export default function WatchPage() {
  const streamUrl = "http://localhost:8000/hls/stream.m3u8";

  // You can use a separate hook or prop drill if you want `viewers` here
  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <h1 className="text-2xl font-bold mb-4">Live Watch Page</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <VideoPlayer streamUrl={streamUrl} />
          <StreamDetails />
        </div>
        <div>
          <StreamStats isLive={true} viewers={42} />
        </div>
      </div>
    </div>
  );
}
