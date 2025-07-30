import { Server, Socket } from "socket.io";
import {
  WebRtcTransport,
  Producer,
  Consumer,
} from "mediasoup/node/lib/types";
import {
  createRouter,
  createWebRtcTransport,
  createWorker,
} from "../service/mediasoup";
import {
  getHLSStatus,
  stopHLSStream,
  getHLSUrl,
  checkHLSHealth,
  startHLSStream,
  startTestHLSStream,
  connectProducerToHLS,
} from "../service/hlsService";

const peers = new Map<string, Peer>();
const transports = new Map<string, WebRtcTransport>();
const producers = new Map<string, Producer>();
const consumers = new Map<string, Consumer>();

type Peer = {
  socket: Socket;
  transports: Map<string, WebRtcTransport>;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
};

export const setupSocket = async (io: Server) => {
  const worker = await createWorker();
  const router = await createRouter(worker);

  io.on("connection", (socket: Socket) => {
    console.log("🔗 Client connected:", socket.id);

    peers.set(socket.id, {
      socket,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
    });

    socket.emit("connection-success", {
      socketId: socket.id,
      existingProducers: Array.from(producers.keys()),
      hlsUrl: getHLSUrl(),
      hlsStatus: getHLSStatus(),
    });

    socket.on("getRouterRtpCapabilities", (callback) => {
      console.log("📡 Router RTP capabilities requested");
      callback(router.rtpCapabilities);
    });

    socket.on("createWebRtcTransport", async (_, callback) => {
      try {
        console.log("🚀 Creating WebRTC transport for", socket.id);
        const transport = await createWebRtcTransport(router);
        const peer = peers.get(socket.id);
        if (!peer) {
          callback({ error: "Peer not found" });
          return;
        }

        peer.transports.set(transport.id, transport);
        transports.set(transport.id, transport);

        callback({
          params: {
            id: transport.id,
            iceParameters: transport.iceParameters,
            iceCandidates: transport.iceCandidates,
            dtlsParameters: transport.dtlsParameters,
          },
        });
        
        console.log("✅ WebRTC transport created:", transport.id);
      } catch (error: any) {
        console.error("❌ Error creating transport:", error);
        callback({ error: error.message });
      }
    });

    socket.on("connectTransport", async ({ dtlsParameters, transportId }, callback) => {
      try {
        console.log("🔌 Connecting transport:", transportId);
        const transport = transports.get(transportId);
        if (transport) {
          await transport.connect({ dtlsParameters });
          console.log("✅ Transport connected:", transportId);
        }
        callback("success");
      } catch (error: any) {
        console.error("❌ Transport connection failed:", error);
        callback({ error: error.message });
      }
    });

    socket.on("produce", async ({ kind, rtpParameters, transportId }, callback) => {
      try {
        console.log(`🎬 Producing ${kind} on transport ${transportId}`);
        const transport = transports.get(transportId);
        if (!transport) {
          callback({ error: "Transport not found" });
          return;
        }

        const producer = await transport.produce({ kind, rtpParameters });
        const peer = peers.get(socket.id);
        if (!peer) {
          callback({ error: "Peer not found" });
          return;
        }

        peer.producers.set(producer.id, producer);
        producers.set(producer.id, producer);

        producer.on("transportclose", () => {
          console.log("🔌 Producer transport closed:", producer.id);
          producer.close();
          producers.delete(producer.id);
          peer.producers.delete(producer.id);
          checkAndStopHLS();
        });

        // Notify other clients about new producer
        socket.broadcast.emit("newProducer", {
          producerId: producer.id,
          socketId: socket.id,
          kind,
        });

        // Handle HLS for video producers
        if (kind === "video") {
          console.log("🎥 Video producer created, handling HLS...");
          await handleHLSForVideoProducer(router, producer.id, io);
        }

        callback({ id: producer.id });
        console.log(`✅ ${kind} producer created:`, producer.id);
      } catch (error: any) {
        console.error("❌ Produce error:", error);
        callback({ error: error.message });
      }
    });

    socket.on("consume", async ({ consumerTransportId, producerId, rtpCapabilities }, callback) => {
      try {
        console.log("🍽️ Creating consumer for producer:", producerId);
        
        if (!router.canConsume({ producerId, rtpCapabilities })) {
          callback({ error: "Cannot consume" });
          return;
        }

        const transport = transports.get(consumerTransportId);
        if (!transport) {
          callback({ error: "Consumer transport not found" });
          return;
        }

        const consumer = await transport.consume({
          producerId,
          rtpCapabilities,
          paused: true,
        });

        const peer = peers.get(socket.id);
        if (!peer) {
          callback({ error: "Peer not found" });
          return;
        }

        peer.consumers.set(consumer.id, consumer);
        consumers.set(consumer.id, consumer);

        consumer.on("transportclose", () => {
          console.log("🔌 Consumer transport closed:", consumer.id);
          consumer.close();
          consumers.delete(consumer.id);
          peer.consumers.delete(consumer.id);
        });

        consumer.on("producerclose", () => {
          console.log("🎭 Producer closed for consumer:", consumer.id);
          consumer.close();
          consumers.delete(consumer.id);
          peer.consumers.delete(consumer.id);
          socket.emit("consumerClosed", { consumerId: consumer.id });
        });

        callback({
          params: {
            producerId,
            id: consumer.id,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            type: consumer.type,
            producerPaused: consumer.producerPaused,
          },
        });
        
        console.log("✅ Consumer created:", consumer.id);
      } catch (error: any) {
        console.error("❌ Consume error:", error);
        callback({ error: error.message });
      }
    });

    socket.on("consumerResume", async ({ consumerId }, callback) => {
      try {
        console.log("▶️ Resuming consumer:", consumerId);
        const consumer = consumers.get(consumerId);
        if (consumer) {
          await consumer.resume();
          console.log("✅ Consumer resumed:", consumerId);
        }
        callback("success");
      } catch (error: any) {
        console.error("❌ Resume error:", error);
        callback({ error: error.message });
      }
    });

    // HLS related endpoints
    socket.on("getHLSStatus", (callback) => {
      const health = checkHLSHealth();
      const videoProducerCount = Array.from(producers.values()).filter(p => p.kind === 'video').length;
      
      callback({
        ...health,
        url: getHLSUrl(),
        activeProducers: producers.size,
        videoProducers: videoProducerCount,
      });
    });

    socket.on("startHLS", async (callback) => {
      try {
        if (!getHLSStatus()) {
          console.log("🚀 Manual HLS start requested");
          const started = await startHLSStream(router);
          if (started) {
            io.emit("hlsStatusChanged", { status: true, url: getHLSUrl() });
            
            // Connect existing video producers
            const videoProducers = Array.from(producers.values()).filter(p => p.kind === 'video');
            for (const producer of videoProducers) {
              setTimeout(async () => {
                await connectProducerToHLS(router, producer.id);
              }, 2000);
            }
            
            callback({ success: true, url: getHLSUrl() });
          } else {
            callback({ success: false, error: "Failed to start HLS" });
          }
        } else {
          callback({ success: true, url: getHLSUrl(), message: "HLS already running" });
        }
      } catch (error: any) {
        console.error("❌ Manual HLS start error:", error);
        callback({ success: false, error: error.message });
      }
    });

    socket.on("stopHLS", (callback) => {
      try {
        console.log("🛑 Manual HLS stop requested");
        if (getHLSStatus()) {
          stopHLSStream();
          io.emit("hlsStatusChanged", { status: false, url: null });
          callback({ success: true });
        } else {
          callback({ success: true, message: "HLS not running" });
        }
      } catch (error: any) {
        console.error("❌ Manual HLS stop error:", error);
        callback({ success: false, error: error.message });
      }
    });

    socket.on("startTestHLS", async (callback) => {
      try {
        console.log("🧪 Test HLS start requested");
        const started = await startTestHLSStream();
        if (started) {
          io.emit("hlsStatusChanged", { status: true, url: getHLSUrl() });
        }
        callback({ 
          success: started, 
          message: started ? "Test HLS started" : "Failed to start test HLS",
          url: started ? getHLSUrl() : null
        });
      } catch (error: any) {
        console.error("❌ Test HLS error:", error);
        callback({ success: false, error: error.message });
      }
    });

    socket.on("disconnect", () => {
      console.log("🔗 Client disconnected:", socket.id);
      
      const peer = peers.get(socket.id);
      if (peer) {
        // Close all transports, producers, and consumers for this peer
        peer.transports.forEach(t => { 
          t.close(); 
          transports.delete(t.id); 
        });
        
        peer.producers.forEach(p => { 
          p.close(); 
          producers.delete(p.id); 
          socket.broadcast.emit("producerClosed", { producerId: p.id }); 
        });
        
        peer.consumers.forEach(c => { 
          c.close(); 
          consumers.delete(c.id); 
        });
        
        peers.delete(socket.id);
      }

      // Check if we should stop HLS
      checkAndStopHLS();
    });
  });

  // Health monitoring
  setInterval(() => {
    if (getHLSStatus()) {
      const health = checkHLSHealth();
      if (!health.hasSegments || !health.manifestExists) {
        console.warn("⚠️ HLS health issue detected:", health);
        io.emit("hlsHealthWarning", health);
      }
    }
  }, 15000);
};

// Helper function to handle HLS for video producers
async function handleHLSForVideoProducer(router: any, producerId: string, io: Server) {
  try {
    if (!getHLSStatus()) {
      console.log("🚀 Starting HLS stream for first video producer");
      const started = await startHLSStream(router);
      if (started) {
        io.emit("hlsStatusChanged", { status: true, url: getHLSUrl() });
        
        // Wait a bit for HLS to initialize, then connect producer
        setTimeout(async () => {
          await connectProducerToHLS(router, producerId);
        }, 3000);
      }
    } else {
      console.log("🔌 Connecting producer to existing HLS stream");
      // HLS already running, just connect this producer
      setTimeout(async () => {
        await connectProducerToHLS(router, producerId);
      }, 1000);
    }
  } catch (error) {
    console.error("❌ Error handling HLS for producer:", error);
  }
}

// Helper function to check if HLS should be stopped
function checkAndStopHLS() {
  const videoProducers = Array.from(producers.values()).filter(p => p.kind === "video");
  if (videoProducers.length === 0 && getHLSStatus()) {
    console.log("🛑 No video producers left, stopping HLS");
    stopHLSStream();
    // Note: io.emit would need to be passed here if you want to notify clients
  }
}