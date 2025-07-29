import { Button } from "@/components/ui/button";
import { Video, VideoOff, Mic, MicOff, Users } from "lucide-react";

interface Props {
  isConnected: boolean;
  isStreaming: boolean;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  startStreaming: () => void;
  stopStreaming: () => void;
  toggleVideo: () => void;
  toggleAudio: () => void;
  streamCount: number;
}

const StreamControls = ({
  isConnected,
  isStreaming,
  isVideoEnabled,
  isAudioEnabled,
  startStreaming,
  stopStreaming,
  toggleVideo,
  toggleAudio,
  streamCount,
}: Props) => {
  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <div
          className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
            isConnected
              ? "bg-green-100 text-green-800"
              : "bg-red-100 text-red-800"
          }`}
        >
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected ? "bg-green-500" : "bg-red-500"
            }`}
          />
          {isConnected ? "Connected" : "Disconnected"}
        </div>
        <div className="flex items-center gap-2 px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800">
          <Users className="h-4 w-4" />
          {streamCount} Streamers
        </div>
      </div>
      <div className="flex gap-2">
        {!isStreaming ? (
          <Button onClick={startStreaming}>Start Streaming</Button>
        ) : (
          <>
            <Button onClick={stopStreaming} variant="destructive">
              Stop Streaming
            </Button>
            <Button
              onClick={toggleVideo}
              variant={isVideoEnabled ? "default" : "secondary"}
            >
              {isVideoEnabled ? (
                <Video className="h-4 w-4" />
              ) : (
                <VideoOff className="h-4 w-4" />
              )}
            </Button>
            <Button
              onClick={toggleAudio}
              variant={isAudioEnabled ? "default" : "secondary"}
            >
              {isAudioEnabled ? (
                <Mic className="h-4 w-4" />
              ) : (
                <MicOff className="h-4 w-4" />
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default StreamControls;
