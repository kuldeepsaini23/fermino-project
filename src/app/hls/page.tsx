"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Play, Square, RefreshCw, TestTube, FileText, Settings} from "lucide-react";

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
  const [ffmpegStatus, setFFmpegStatus] = useState<any>(null);
  const [fileOpsStatus, setFileOpsStatus] = useState<any>(null);

  const fetchHLSStatus = async () => {
    try {
      const response = await fetch("http://localhost:7000/api/watch/debug");
      const data = await response.json();
      setHlsStatus(data);
      setLastUpdate(new Date().toLocaleTimeString());
    } catch (error) {
      console.error("Failed to fetch HLS status:", error);
    }
  };

  const validateFFmpeg = async () => {
    setLoading(true);
    try {
      const response = await fetch("http://localhost:7000/api/watch/validate-ffmpeg");
      const data = await response.json();
      setFFmpegStatus(data);
      
      if (data.success) {
        const lavfiStatus = data.lavfiSupport ? "✅ Yes" : "❌ No";
        alert(`✅ FFmpeg Working!\n\nHLS Support: ${data.hlsSupport ? 'Yes' : 'No'}\nH264 Support: ${data.h264Support ? 'Yes' : 'No'}\nLavfi Support: ${lavfiStatus}\nTotal Formats: ${data.formatCount}`);
      } else {
        alert(`❌ FFmpeg validation failed: ${data.error}\n\nPlease install FFmpeg from https://ffmpeg.org/download.html`);
      }
    } catch (error) {
      alert("❌ Error validating FFmpeg");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const testFileOperations = async () => {
    try {
      const response = await fetch("http://localhost:7000/api/watch/test-file-ops");
      const data = await response.json();
      setFileOpsStatus(data);
      
      if (data.success) {
        alert("✅ File operations working perfectly!\n\nDirectory creation: ✅\nFile writing: ✅\nFile reading: ✅\nFile deletion: ✅");
      } else {
        alert(`❌ File operations failed: ${data.error}\n\nThis might be a permissions issue.`);
      }
    } catch (error) {
      alert("❌ Error testing file operations");
      console.error(error);
    }
  };

  const startManualHLS = async () => {
    setLoading(true);
    try {
      const response = await fetch("http://localhost:7000/api/watch/test-manual-hls", {
        method: "POST",
      });
      const result = await response.json();
      
      if (result.success) {
        alert(`✅ Manual HLS test created!\n\nManifest: ${result.files.manifest ? 'Created' : 'Failed'}\nSegments: ${result.files.segments} files\n\nCheck video player below - should play immediately!`);
      } else {
        alert(`❌ Manual HLS failed: ${result.error || "Unknown error"}`);
      }
      
      setTimeout(fetchHLSStatus, 1000);
    } catch (error) {
      alert("❌ Error creating manual HLS test");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const startTestColorBar = async () => {
    setLoading(true);
    try {
      const response = await fetch("http://localhost:7000/api/watch/test-colorbar", {
        method: "POST",
      });
      const result = await response.json();
      
      if (result.success) {
        alert("✅ FFmpeg color bar test started! Check video player below.");
      } else {
        alert(`❌ FFmpeg test failed: ${result.error || "Unknown error"}\n\nTry the Manual HLS test instead.`);
      }
      
      setTimeout(fetchHLSStatus, 2000);
    } catch (error) {
      alert("❌ Error starting FFmpeg test");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const testSDPFile = async () => {
    setLoading(true);
    try {
      const response = await fetch("http://localhost:7000/api/watch/test-sdp", {
        method: "POST",
      });
      const result = await response.json();
      
      if (result.success) {
        alert("✅ SDP file test created! This tests the file structure without FFmpeg.");
      } else {
        alert(`❌ SDP test failed: ${result.error || "Unknown error"}`);
      }
      
      setTimeout(fetchHLSStatus, 1000);
    } catch (error) {
      alert("❌ Error starting SDP test");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const stopHLS = async () => {
    setLoading(true);
    try {
      const response = await fetch("http://localhost:7000/api/watch/stop", {
        method: "POST",
      });
      const result = await response.json();
      
      if (result.success) {
        alert("✅ All HLS streams stopped and files cleaned up!");
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
          HLS Debug Panel - Comprehensive Testing Suite
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
          <Button 
            onClick={testFileOperations} 
            variant="outline" 
            size="sm"
            disabled={loading}
          >
            <FileText className="h-4 w-4" />
            Test File Ops
          </Button>
          <Button 
            onClick={validateFFmpeg} 
            variant="outline" 
            size="sm"
            disabled={loading}
          >
            <Settings className="h-4 w-4" />
            Validate FFmpeg
          </Button>
        </div>

        {/* File Operations Status */}
        {fileOpsStatus && (
          <div className={`p-3 rounded-lg border ${fileOpsStatus.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <h4 className="font-medium text-sm mb-2">📁 File Operations Status</h4>
            <div className="text-xs space-y-1">
              <div>Directory Access: {fileOpsStatus.success ? '✅ Working' : '❌ Failed'}</div>
              {fileOpsStatus.success && (
                <>
                  <div>Can Write: {fileOpsStatus.canWrite ? '✅ Yes' : '❌ No'}</div>
                  <div>Can Read: {fileOpsStatus.canRead ? '✅ Yes' : '❌ No'}</div>
                  <div>Can Delete: {fileOpsStatus.canDelete ? '✅ Yes' : '❌ No'}</div>
                  <div className="text-gray-600">Path: {fileOpsStatus.hlsDir}</div>
                </>
              )}
              {!fileOpsStatus.success && (
                <div className="text-red-600">Error: {fileOpsStatus.error}</div>
              )}
            </div>
          </div>
        )}

        {/* FFmpeg Status */}
        {ffmpegStatus && (
          <div className={`p-3 rounded-lg border ${ffmpegStatus.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <h4 className="font-medium text-sm mb-2">🔧 FFmpeg Status</h4>
            <div className="text-xs space-y-1">
              <div>Available: {ffmpegStatus.success ? '✅ Yes' : '❌ No'}</div>
              {ffmpegStatus.success && (
                <>
                  <div>HLS Support: {ffmpegStatus.hlsSupport ? '✅ Yes' : '❌ No'}</div>
                  <div>H264 Support: {ffmpegStatus.h264Support ? '✅ Yes' : '❌ No'}</div>
                  <div>Lavfi Support: {ffmpegStatus.lavfiSupport ? '✅ Yes' : '❌ No (Test patterns unavailable)'}</div>
                  <div>Total Formats: {ffmpegStatus.formatCount}</div>
                  {ffmpegStatus.availableFormats && (
                    <div className="text-gray-600">Sample formats: {ffmpegStatus.availableFormats.join(', ')}</div>
                  )}
                </>
              )}
              {!ffmpegStatus.success && (
                <div className="text-red-600">Error: {ffmpegStatus.error}</div>
              )}
            </div>
          </div>
        )}

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
          <h3 className="font-semibold mb-3">🧪 Test Methods (Try in order)</h3>
          
          <div className="grid grid-cols-1 gap-3">
            
            {/* Method 0: Manual HLS (Most Reliable) */}
            <div className="p-3 border rounded-lg bg-blue-50 border-blue-200">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4 text-blue-600" />
                0. Manual HLS Test (🎯 Most Reliable)
              </h4>
              <p className="text-xs text-gray-600 mb-2">
                Creates HLS files manually without FFmpeg - tests video player and file delivery
              </p>
              <div className="flex gap-2">
                <Button 
                  onClick={startManualHLS} 
                  size="sm"
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Play className="h-4 w-4" />
                  Create Manual HLS
                </Button>
              </div>
            </div>

            {/* Method 1: FFmpeg Color Bar Test */}
            <div className="p-3 border rounded-lg bg-green-50 border-green-200">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <TestTube className="h-4 w-4 text-green-600" />
                1. FFmpeg Color Bar Test
              </h4>
              <p className="text-xs text-gray-600 mb-2">
                Uses FFmpeg to generate test patterns - requires lavfi support
              </p>
              <div className="flex gap-2">
                <Button 
                  onClick={startTestColorBar} 
                  size="sm"
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Play className="h-4 w-4" />
                  Start FFmpeg Test
                </Button>
                <Button 
                  onClick={testSDPFile} 
                  size="sm"
                  disabled={loading}
                  variant="outline"
                >
                  Test SDP Structure
                </Button>
              </div>
            </div>

            {/* Method 2: Stop Stream */}
            <div className="p-3 border rounded-lg bg-red-50 border-red-200">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                <Square className="h-4 w-4 text-red-600" />
                2. Stop & Clean Up
              </h4>
              <p className="text-xs text-gray-600 mb-2">
                Stops all processes and cleans up generated files
              </p>
              <Button 
                onClick={stopHLS} 
                size="sm"
                variant="destructive"
                disabled={loading}
              >
                <Square className="h-4 w-4" />
                Stop All Streams
              </Button>
            </div>

            {/* Instructions */}
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h4 className="font-medium text-sm mb-2 text-yellow-800">🚀 Quick Start Guide</h4>
              <ol className="text-xs text-yellow-700 space-y-1">
                <li><strong>Step 1:</strong> Click "Test File Ops" - must show ✅ Working</li>
                <li><strong>Step 2:</strong> Click "Create Manual HLS" - should work immediately</li>
                <li><strong>Step 3:</strong> Check video player below - should show content</li>
                <li><strong>Step 4:</strong> If manual test works, try "Validate FFmpeg"</li>
                <li><strong>Step 5:</strong> If FFmpeg works, try "Start FFmpeg Test"</li>
                <li><strong>Step 6:</strong> Try WebRTC streaming from /stream page</li>
              </ol>
              
              <div className="mt-3 p-2 bg-yellow-100 rounded text-xs">
                <strong>📝 Your Current Issue:</strong><br/>
                FFmpeg lacks "lavfi" support (test pattern generator). The manual test bypasses this completely and should work right away!
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default HLSDebug;