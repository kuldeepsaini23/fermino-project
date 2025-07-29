"use client"

import StreamControls from "@/components/global/stream/StreamControls"
import StreamersCard from "@/components/global/stream/StreamersCard"
import YourStreamCard from "@/components/global/stream/YourStreamCard"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import useWebRTC from "@/hooks/useWebRTC"
import { AlertCircle, Video } from "lucide-react"

const StreamPage = () => {
  const {
    isConnected,
    isStreaming,
    isVideoEnabled,
    isAudioEnabled,
    remoteProducers,
    localVideoRef,
    startStreaming,
    stopStreaming,
    toggleVideo,
    toggleAudio,
  } = useWebRTC()

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto">
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            WebRTC powered by MediaSoup, Socket.IO and FFMPEG. This UI is fully interactive.
          </AlertDescription>
        </Alert>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Video className="h-6 w-6" />
              Stream Dashboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StreamControls
              isConnected={isConnected}
              isStreaming={isStreaming}
              isVideoEnabled={isVideoEnabled}
              isAudioEnabled={isAudioEnabled}
              startStreaming={startStreaming}
              stopStreaming={stopStreaming}
              toggleVideo={toggleVideo}
              toggleAudio={toggleAudio}
              streamCount={remoteProducers.length + 1}
            />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <YourStreamCard
            isStreaming={isStreaming}
            isVideoEnabled={isVideoEnabled}
            isAudioEnabled={isAudioEnabled}
            videoRef={localVideoRef}
          />
          <StreamersCard streamers={remoteProducers.map(producer => ({
            ...producer,
            name: `Streamer ${producer.id}`,
            isVideoEnabled: true,
            isAudioEnabled: true
          }))} />
        </div>
      </div>
    </div>
  )
}


export default StreamPage;