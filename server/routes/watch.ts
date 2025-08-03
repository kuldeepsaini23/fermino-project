import { Router } from 'express';
import { getPlaylist } from '../controller/watch';
import { 
  checkHLSHealth, 
  getHLSStatus, 
  startTestHLSStream, 
  stopHLSStream,
  startTestWithSDPFile 
} from '../service/hlsService';
import fs from 'fs';
import path from 'path';

const router = Router();

router.get('/playlist.m3u8', getPlaylist);

router.get('/debug', (req, res) => {
  const health = checkHLSHealth();
  res.json({
    ...health,
    hlsStatus: getHLSStatus(),
    timestamp: new Date().toISOString()
  });
});

// Create a manual HLS stream without FFmpeg for testing
router.post('/test-manual-hls', async (req, res) => {
  try {
    console.log("🧪 Manual HLS test requested");
    
    const hlsDir = path.join(__dirname, "../../public/hls");
    
    // Ensure directory exists
    if (!fs.existsSync(hlsDir)) {
      fs.mkdirSync(hlsDir, { recursive: true });
    }
    
    // Create a working HLS manifest
    const manifestContent = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:6
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:6.0,
manual_segment_00000.ts
#EXTINF:6.0,
manual_segment_00001.ts
#EXTINF:6.0,
manual_segment_00002.ts
#EXT-X-ENDLIST
`;
    
    const manifestPath = path.join(hlsDir, "stream.m3u8");
    fs.writeFileSync(manifestPath, manifestContent);
    
    // Create dummy segment files with some actual data
    for (let i = 0; i < 3; i++) {
      const segmentPath = path.join(hlsDir, `manual_segment_0000${i}.ts`);
      // Create a dummy TS file with proper headers
      const tsHeader = Buffer.from([
        0x47, 0x40, 0x00, 0x10, // TS packet header
        0x00, 0x00, 0xB0, 0x0D, // PAT
        0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0xF0, 0x00
      ]);
      
      // Create a 64KB dummy segment
      const segmentData = Buffer.alloc(65536);
      tsHeader.copy(segmentData, 0);
      
      fs.writeFileSync(segmentPath, segmentData);
    }
    
    console.log("✅ Manual HLS structure created");
    
    res.json({ 
      success: true, 
      message: "Manual HLS test created successfully - should play immediately",
      url: "/hls/stream.m3u8",
      files: {
        manifest: fs.existsSync(manifestPath),
        segments: fs.readdirSync(hlsDir).filter(f => f.endsWith('.ts')).length
      }
    });
    
  } catch (error: any) {
    console.error("❌ Manual HLS test error:", error);
    res.json({ 
      success: false, 
      error: error.message || "Unknown error occurred" 
    });
  }
});

// Enhanced color bar test endpoint
router.post('/test-colorbar', async (req, res) => {
  try {
    console.log("🧪 Color bar test requested");
    const started = await startTestHLSStream();
    
    if (started) {
      res.json({ 
        success: true, 
        message: "Color bar test stream started successfully",
        url: "/hls/stream.m3u8"
      });
    } else {
      res.json({ 
        success: false, 
        error: "Failed to start color bar test stream" 
      });
    }
  } catch (error: any) {
    console.error("❌ Color bar test error:", error);
    res.json({ 
      success: false, 
      error: error.message || "Unknown error occurred" 
    });
  }
});

// Stop HLS endpoint
router.post('/stop', async (req, res) => {
  try {
    console.log("🛑 HLS stop requested");
    stopHLSStream();
    
    // Also clean up manual test files
    const hlsDir = path.join(__dirname, "../../public/hls");
    if (fs.existsSync(hlsDir)) {
      const files = fs.readdirSync(hlsDir);
      files.forEach(file => {
        if (file.startsWith('manual_') || file === 'stream.m3u8') {
          try {
            fs.unlinkSync(path.join(hlsDir, file));
            console.log(`🗑️ Cleaned up: ${file}`);
          } catch (e) {
            console.log(`⚠️ Could not remove ${file}`);
          }
        }
      });
    }
    
    res.json({ 
      success: true, 
      message: "HLS stream stopped and cleaned up successfully" 
    });
  } catch (error: any) {
    console.error("❌ HLS stop error:", error);
    res.json({ 
      success: false, 
      error: error.message || "Unknown error occurred" 
    });
  }
});

// Test with pre-made SDP file
router.post('/test-sdp', async (req, res) => {
  try {
    console.log("🧪 SDP file test requested");
    const started = await startTestWithSDPFile();
    
    if (started) {
      res.json({ 
        success: true, 
        message: "SDP file test started successfully",
        url: "/hls/stream.m3u8"
      });
    } else {
      res.json({ 
        success: false, 
        error: "Failed to start SDP file test" 
      });
    }
  } catch (error: any) {
    console.error("❌ SDP file test error:", error);
    res.json({ 
      success: false, 
      error: error.message || "Unknown error occurred" 
    });
  }
});

// FFmpeg validation endpoint
router.get('/validate-ffmpeg', (req, res) => {
  const ffmpeg = require('fluent-ffmpeg');
  
  ffmpeg.getAvailableFormats((err: any, formats: any) => {
    if (err) {
      res.json({
        success: false,
        error: "FFmpeg not available",
        details: err.message
      });
    } else {
      const hasHLS = formats && formats.hls;
      const hasH264 = formats && (formats.h264 || formats.libx264);
      const hasLavfi = formats && formats.lavfi;
      
      res.json({
        success: true,
        ffmpegAvailable: true,
        hlsSupport: !!hasHLS,
        h264Support: !!hasH264,
        lavfiSupport: !!hasLavfi,
        formatCount: Object.keys(formats || {}).length,
        availableFormats: Object.keys(formats || {}).slice(0, 10) // Show first 10 formats
      });
    }
  });
});

// Test basic file operations
router.get('/test-file-ops', (req, res) => {
  try {
    const hlsDir = path.join(__dirname, "../../public/hls");
    
    // Test directory creation
    if (!fs.existsSync(hlsDir)) {
      fs.mkdirSync(hlsDir, { recursive: true });
    }
    
    // Test file writing
    const testFile = path.join(hlsDir, 'test_write.txt');
    fs.writeFileSync(testFile, 'test data');
    
    // Test file reading
    const content = fs.readFileSync(testFile, 'utf8');
    
    // Test file deletion
    fs.unlinkSync(testFile);
    
    res.json({
      success: true,
      message: "All file operations successful",
      hlsDir: hlsDir,
      canWrite: true,
      canRead: content === 'test data',
      canDelete: true
    });
    
  } catch (error: any) {
    res.json({
      success: false,
      error: error.message,
      details: "File operations failed - check permissions"
    }); 
  }
});

export default router;