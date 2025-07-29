"use client";

import { Video, VideoOff, Mic, MicOff, Users } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface Streamer {
  id: string;
  name: string;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
}

interface StreamersCardProps {
  streamers: Streamer[];
}

const StreamersCard = ({ streamers }: StreamersCardProps) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Other Streamers</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {streamers.map((streamer) => (
            <div key={streamer.id} className="relative">
              <div className="w-full h-48 bg-gray-900 rounded-lg flex items-center justify-center">
                <div className="text-center text-white">
                  <Users className="h-8 w-8 mx-auto mb-2" />
                  <p className="text-sm">{streamer.name}</p>
                  <div className="flex justify-center gap-2 mt-2">
                    {streamer.isVideoEnabled ? (
                      <Video className="h-4 w-4 text-green-400" />
                    ) : (
                      <VideoOff className="h-4 w-4 text-red-400" />
                    )}
                    {streamer.isAudioEnabled ? (
                      <Mic className="h-4 w-4 text-green-400" />
                    ) : (
                      <MicOff className="h-4 w-4 text-red-400" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default StreamersCard;
