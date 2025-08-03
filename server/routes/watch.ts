import { Router } from 'express';
import { getPlaylist } from '../controller/watch';
import { checkHLSHealth, getHLSStatus, startTestHLSStream, stopHLSStream } from '../service/hlsService';

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

// Test color bar endpoint
router.post('/test-colorbar', async (req, res) => {
  try {
    console.log("🧪 Color bar test requested via HTTP");
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
    console.log("🛑 HLS stop requested via HTTP");
    
    if (getHLSStatus()) {
      stopHLSStream();
      res.json({ 
        success: true, 
        message: "HLS stream stopped successfully"
      });
    } else {
      res.json({ 
        success: true, 
        message: "HLS stream was not running"
      });
    }
  } catch (error: any) {
    console.error("❌ HLS stop error:", error);
    res.json({ 
      success: false, 
      error: error.message || "Unknown error occurred"
    });
  }
});

export default router;