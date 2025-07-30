"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Play, Square, RefreshCw, TestTube} from "lucide-react";

interface HLSStatus {
  isStreaming: boolean;
  hasSegments: boolean;
  manifestExists: boolean;
  url: string | null;
  activeProducers: number;
  videoProducers: number;
}

const HLSDebug = () => {
  const [hlsStatus, setHlsStatus] = useState<HLSStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>("");

  const fetchHLSStatus = async () => {
    try {
      const response = await fetch("http://localhost:8000/api/watch/debug");
      const data = await response.json();
      setHlsStatus(data);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch (error) {
      console.error("Failed to fetch HLS status:", error);
    }
  };

  const startTestColorBar = async () => {
    setLoading(true);
    try {
      const response = await fetch("http://localhost:8000/api/watch/test-colorbar", {
        method: "POST",
      });
      const result = await response.json();
      
      if (result.success) {
        alert("✅ Color bar test stream started! Check video player below.");
      } else {
        alert(`❌ Failed: ${result.error || "Unknown error"}`);
      }
      
      setTimeout(fetchHLSStatus, 2000);
    } catch (error) {
      alert("❌ Error starting color bar test");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const stopHLS = async () => {
    setLoading(true);
    try {
      const response = await fetch("http://localhost:8000/api/watch/stop", {
        method: "POST",
      });
      const result = await response.json();
      
      if (result.success) {
        alert("✅ HLS stream stopped successfully!");
      } else {
        alert(`❌ Failed to stop: ${result.error || "Unknown error"}`);
      }
      
      setTimeout(fetchHLSStatus, 1000);
    } catch (error) {
      alert("❌ Error stopping HLS stream");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHLSStatus();
    const interval = setInterval(fetchHLSStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TestTube className="h-5 w-5" />
          HLS Debug Panel - Multiple Test Methods
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        
        {/* Status Section */}
        <div className="flex gap-2 flex-wrap">
          <Button 
            onClick={fetchHLSStatus} 
            variant="outline" 
            size="sm"
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh Status
          </Button>
        </div>

        {hlsStatus && (
          <div className="space-y-3">
            <Alert>
              <AlertDescription>
                Last updated: {lastUpdate}
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Streaming:</span>
                  <span className={hlsStatus.isStreaming ? "text-green-600" : "text-red-600"}>
                    {hlsStatus.isStreaming ? "✅ Yes" : "❌ No"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Manifest:</span>
                  <span className={hlsStatus.manifestExists ? "text-green-600" : "text-red-600"}>
                    {hlsStatus.manifestExists ? "✅ Exists" : "❌ Missing"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Segments:</span>
                  <span className={hlsStatus.hasSegments ? "text-green-600" : "text-red-600"}>
                    {hlsStatus.hasSegments ? "✅ Generated" : "❌ None"}
                  </span>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Producers:</span>
                  <span className="text-blue-600">{hlsStatus.activeProducers || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Video:</span>
                  <span className="text-blue-600">{hlsStatus.videoProducers || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span>Stream URL:</span>
                  <span className="text-sm">
                    {hlsStatus.url ? (
                      <a href={`http://localhost:8000${hlsStatus.url}`} 
                         target="_blank" 
                         className="text-blue-500 underline">
                        ✅ Available
                      </a>
                    ) : "❌ None"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Test Methods */}
        <div className="border-t pt-4">
          <h3 className="font-semibold mb-3">🧪 Test Methods</h3>
          
          <div className="grid grid-cols-1 gap-3">
            
            {/* Method 1: Color Bar Test (Most Reliable) */}
            <div className="p-3 border rounded-lg bg-green-50 border-green-200">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <TestTube className="h-4 w-4 text-green-600" />
                1. Color Bar Test Stream (✅ Recommended)
              </h4>
              <p className="text-xs text-gray-600 mb-2">
                Tests FFmpeg with generated color bars and sine wave audio - most reliable method
              </p>
              <div className="flex gap-2">
                <Button 
                  onClick={startTestColorBar} 
                  size="sm"
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Play className="h-4 w-4" />
                  Start Color Bar Test
                </Button>
              </div>
            </div>

            {/* Method 2: Stop Stream */}
            <div className="p-3 border rounded-lg bg-red-50 border-red-200">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <Square className="h-4 w-4 text-red-600" />
                2. Stop Any Running Stream
              </h4>
              <p className="text-xs text-gray-600 mb-2">
                Cleanly stops all HLS processes and clears generated files
              </p>
              <Button 
                onClick={stopHLS} 
                size="sm"
                variant="destructive"
                disabled={loading}
              >
                <Square className="h-4 w-4" />
                Stop HLS
              </Button>
            </div>

            {/* Instructions */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <h4 className="font-medium text-sm mb-2 text-blue-800">📋 Testing Instructions</h4>
              <ol className="text-xs text-blue-700 space-y-1">
                <li>{`1. Click "Color Bar Test" - should generate HLS stream immediately`}</li>
                <li>2. Watch the video player below - should show color bars in ~5 seconds</li>
                <li>3. If successful, try WebRTC streaming from /stream page</li>
                <li>{`4. Use "Stop HLS" to clean up between tests`}</li>
                <li>5. Check browser console (F12) and server logs for detailed errors</li>
              </ol>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default HLSDebug;