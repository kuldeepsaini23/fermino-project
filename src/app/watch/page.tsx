"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Play, Pause, Volume2, VolumeX, Users, Wifi, AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function WatchPage() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [viewerCount] = useState(42)
  const [streamQuality, setStreamQuality] = useState("Auto")

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto">
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This is a UI demo. The actual HLS streaming requires FFMPEG transcoding and a media server to work properly.
          </AlertDescription>
        </Alert>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wifi className="h-6 w-6" />
                Live Stream
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 px-3 py-1 rounded-full text-sm bg-red-100 text-red-800">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  LIVE (Demo)
                </div>
                <div className="flex items-center gap-2 px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800">
                  <Users className="h-4 w-4" />
                  {viewerCount} viewers
                </div>
              </div>
            </CardTitle>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <Card>
              <CardContent className="p-0">
                <div className="relative">
                  <div className="w-full aspect-video bg-black rounded-t-lg flex items-center justify-center">
                    <div className="text-center text-white">
                      <Wifi className="h-16 w-16 mx-auto mb-4 opacity-50" />
                      <h3 className="text-2xl font-semibold mb-2">Live Stream Demo</h3>
                      <p className="text-gray-300 mb-4">HLS video player would appear here</p>
                      <div className="flex justify-center gap-4">
                        <div className="bg-gray-800 px-3 py-1 rounded text-sm">1080p</div>
                        <div className="bg-gray-800 px-3 py-1 rounded text-sm">WebRTC → HLS</div>
                        <div className="bg-gray-800 px-3 py-1 rounded text-sm">Low Latency</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-b-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button onClick={() => setIsPlaying(!isPlaying)} size="sm">
                        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button onClick={() => setIsMuted(!isMuted)} variant="outline" size="sm">
                        {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Quality:</span>
                      <select
                        value={streamQuality}
                        onChange={(e) => setStreamQuality(e.target.value)}
                        className="text-sm border rounded px-2 py-1"
                      >
                        <option value="Auto">Auto</option>
                        <option value="1080">1080p</option>
                        <option value="720">720p</option>
                        <option value="480">480p</option>
                        <option value="360">360p</option>
                      </select>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Stream Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h3 className="font-semibold text-gray-900">Fermion Live Demo</h3>
                  <p className="text-sm text-gray-600 mt-1">WebRTC to HLS streaming demonstration</p>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Status:</span>
                    <span className="text-red-600 font-medium">Live (Demo)</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Viewers:</span>
                    <span className="font-medium">{viewerCount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Quality:</span>
                    <span className="font-medium">{streamQuality}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Latency:</span>
                    <span className="font-medium">~3-5s</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Technical Stack</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-sm">
                  <div className="font-medium text-gray-900">Frontend:</div>
                  <div className="text-gray-600">Next.js, TypeScript, Tailwind</div>
                </div>
                <div className="text-sm">
                  <div className="font-medium text-gray-900">WebRTC:</div>
                  <div className="text-gray-600">MediaSoup SFU</div>
                </div>
                <div className="text-sm">
                  <div className="font-medium text-gray-900">Streaming:</div>
                  <div className="text-gray-600">FFMPEG → HLS</div>
                </div>
                <div className="text-sm">
                  <div className="font-medium text-gray-900">Signaling:</div>
                  <div className="text-gray-600">Socket.io</div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">About This Stream</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">
                  This demonstrates a complete WebRTC to HLS streaming pipeline. Streamers connect via WebRTC on the
                  /stream page, and viewers watch the converted HLS stream here with optimized low latency.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
