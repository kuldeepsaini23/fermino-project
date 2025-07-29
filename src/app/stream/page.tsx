"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Video, VideoOff, Mic, MicOff, Users, AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function StreamPage() {
  const [isVideoEnabled, setIsVideoEnabled] = useState(false)
  const [isAudioEnabled, setIsAudioEnabled] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamers] = useState([
    { id: "1", name: "User 1", isVideoEnabled: true, isAudioEnabled: true },
    { id: "2", name: "User 2", isVideoEnabled: true, isAudioEnabled: false },
  ])

  const startStreaming = () => {
    setIsStreaming(true)
    setIsVideoEnabled(true)
    setIsAudioEnabled(true)
  }

  const stopStreaming = () => {
    setIsStreaming(false)
    setIsVideoEnabled(false)
    setIsAudioEnabled(false)
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto">
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This is a UI demo. The full WebRTC functionality requires MediaSoup, FFMPEG, and a backend server to work
            properly.
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
            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center gap-2 px-3 py-1 rounded-full text-sm bg-green-100 text-green-800">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                Connected (Demo)
              </div>
              <div className="flex items-center gap-2 px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800">
                <Users className="h-4 w-4" />
                {streamers.length} Streamers
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
                    onClick={() => setIsVideoEnabled(!isVideoEnabled)}
                    variant={isVideoEnabled ? "default" : "secondary"}
                  >
                    {isVideoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                  </Button>
                  <Button
                    onClick={() => setIsAudioEnabled(!isAudioEnabled)}
                    variant={isAudioEnabled ? "default" : "secondary"}
                  >
                    {isAudioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Your Stream</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="w-full h-64 bg-gray-900 rounded-lg flex items-center justify-center">
                {isStreaming ? (
                  <div className="text-center text-white">
                    <Video className="h-12 w-12 mx-auto mb-2" />
                    <p>Your camera feed would appear here</p>
                    <p className="text-sm text-gray-300 mt-1">
                      Status: {isVideoEnabled ? "Video On" : "Video Off"} | {isAudioEnabled ? "Audio On" : "Audio Off"}
                    </p>
                  </div>
                ) : (
                  <div className="text-center text-gray-400">
                    <VideoOff className="h-12 w-12 mx-auto mb-2" />
                    <p>{`Click "Start Streaming" to begin`}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

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
        </div>
      </div>
    </div>
  )
}
