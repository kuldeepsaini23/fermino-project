"use client";

import {  VideoOff } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface YourStreamCardProps {
  isStreaming: boolean;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  videoRef: any;
}

const YourStreamCard = ({
  isStreaming,
  isVideoEnabled,
  isAudioEnabled,
  videoRef,
}: YourStreamCardProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Stream</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="w-full aspect-video bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center">
          {isStreaming ? (
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-center text-gray-400">
              <VideoOff className="h-12 w-12 mx-auto mb-2" />
              <p>{`Click "Start Streaming" to begin`}</p>
            </div>
          )}
        </div>
        {isStreaming && (
          <div className="mt-2 text-sm text-gray-300">
            Status: {isVideoEnabled ? "🎥 On" : "🎥 Off"} |{" "}
            {isAudioEnabled ? "🎤 On" : "🎤 Off"}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default YourStreamCard;
