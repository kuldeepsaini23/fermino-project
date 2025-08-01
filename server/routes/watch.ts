import { Router } from 'express';
import { getPlaylist } from '../controller/watch';
import { 
  checkHLSHealth, 
  getHLSStatus, 
  startTestHLSStream, 
  stopHLSStream,
  startHLSWithDirectRTP 
} from '../service/hlsService';
import { createRouter, createWorker } from '../service/mediasoup';

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

// Test color bar stream
router.post('/test-colorbar', async (req, res) => {
  try {
    console.log("🧪 Starting color bar test stream...");
    const success = await startTestHLSStream();
    
    if (success) {
      res.json({ 
        success: true, 
        message: "Color bar test stream started successfully",
        url: "/hls/stream.m3u8"
      });
    } else {
      res.json({ 
        success: false, 
        error: "Failed to start test stream - check server logs"
      });
    }
  } catch (error: any) {
    console.error("❌ Test stream error:", error);
    res.json({ 
      success: false, 
      error: error.message || "Unknown error occurred"
    });
  }
});

// Stop HLS stream
router.post('/stop', (req, res) => {
  try {
    console.log("🛑 Stop HLS request received");
    stopHLSStream();
    res.json({ 
      success: true, 
      message: "HLS stream stopped successfully"
    });
  } catch (error: any) {
    console.error("❌ Stop HLS error:", error);
    res.json({ 
      success: false, 
      error: error.message || "Failed to stop stream"
    });
  }
});

// Test direct RTP approach
router.post('/test-direct-rtp', async (req, res) => {
  try {
    console.log("🧪 Starting direct RTP test...");
    const worker = await createWorker();
    const mediaRouter = await createRouter(worker);
    
    const success = await startHLSWithDirectRTP(mediaRouter);
    
    if (success) {
      res.json({ 
        success: true, 
        message: "Direct RTP test started successfully",
        url: "/hls/stream.m3u8"
      });
    } else {
      res.json({ 
        success: false, 
        error: "Failed to start direct RTP test"
      });
    }
  } catch (error: any) {
    console.error("❌ Direct RTP test error:", error);
    res.json({ 
      success: false, 
      error: error.message || "Unknown error occurred"
    });
  }
});

export default router;