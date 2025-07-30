import { Server, Socket } from "socket.io";
import {
  WebRtcTransport,
  Producer,
  Consumer,
  RtpCapabilities,
} from "mediasoup/node/lib/types";
import {
  createRouter,
  createWebRtcTransport,
  createWorker,
} from "../service/mediasoup";
import {
  getHLSStatus,
  startHLSStream,
  stopHLSStream,
  connectProducerToHLS,
  getHLSUrl,
  checkHLSHealth,
  startTestHLSStream,
} from "../service/hlsService";

// Peer structure
type Peer = {
  socket: Socket;
  transports: Map<string, WebRtcTransport>;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
};

const peers = new Map<string, Peer>();
const transports = new Map<string, WebRtcTransport>();
const producers = new Map<string, Producer>();
const consumers = new Map<string, Consumer>();

export const setupSocket = async (io: Server) => {
  const worker = await createWorker();
  const router = await createRouter(worker);

  io.on("connection", (socket: Socket) => {
    console.log("Client connected:", socket.id);

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

    socket.on(
      "getRouterRtpCapabilities",
      (callback: (rtpCapabilities: RtpCapabilities) => void) => {
        callback(router.rtpCapabilities);
      }
    );

    socket.on(
      "createWebRtcTransport",
      async ({}: { sender: boolean }, callback) => {
        try {
          const transport = await createWebRtcTransport(router);
          const peer = peers.get(socket.id);
          if (!peer) return;

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
        } catch (error: any) {
          console.error("Error creating WebRTC transport:", error);
          callback({ error: error.message });
        }
      }
    );

    socket.on(
      "connectTransport",
      async ({ dtlsParameters, transportId }: any, callback) => {
        try {
          const transport = transports.get(transportId);
          if (transport) {
            await transport.connect({ dtlsParameters });
            callback("success");
          }
        } catch (error: any) {
          console.error("Error connecting transport:", error);
          callback({ error: error.message });
        }
      }
    );

    socket.on(
      "produce",
      async (
        {
          kind,
          rtpParameters,
          transportId,
        }: { kind: "audio" | "video"; rtpParameters: any; transportId: string },
        callback
      ) => {
        try {
          console.log(
            `📺 Producing ${kind} track for transport ${transportId}`
          );

          const transport = transports.get(transportId);
          if (!transport) {
            console.error("❌ Transport not found:", transportId);
            return callback({ error: "Transport not found" });
          }

          const producer = await transport.produce({ kind, rtpParameters });
          console.log(`✅ Producer created: ${producer.id} (${kind})`);

          const peer = peers.get(socket.id);
          if (!peer) {
            console.error("❌ Peer not found:", socket.id);
            return callback({ error: "Peer not found" });
          }

          peer.producers.set(producer.id, producer);
          producers.set(producer.id, producer);

          // Event handlers...
          producer.on("transportclose", () => {
            console.log(`🔌 Producer transport closed: ${producer.id}`);
            producer.close();
            producers.delete(producer.id);
            peer.producers.delete(producer.id);

            if (producers.size === 0 && getHLSStatus()) {
              console.log("🛑 Stopping HLS - no more producers");
              stopHLSStream();
              io.emit("hlsStatusChanged", { status: false, url: null });
            }
          });

          socket.broadcast.emit("newProducer", {
            producerId: producer.id,
            socketId: socket.id,
            kind,
          });

          // Handle HLS streaming for video producers
          if (kind === "video") {
            console.log("🎥 Setting up MediaSoup HLS for video producer");

            if (!getHLSStatus()) {
              console.log("▶️ Starting MediaSoup HLS stream");
              const hlsStarted = await startHLSStream(router); // Use MediaSoup version
              if (hlsStarted) {
                io.emit("hlsStatusChanged", {
                  status: true,
                  url: getHLSUrl(),
                });
                console.log("✅ MediaSoup HLS stream started");
              } else {
                console.error("❌ Failed to start MediaSoup HLS stream");
              }
            }

            // ✅ CONNECT IMMEDIATELY AFTER PRODUCER IS CREATED
            console.log("🔗 Connecting producer to MediaSoup HLS...");
            const connected = await connectProducerToHLS(router, producer.id);
            if (connected) {
              console.log(
                `✅ Producer ${producer.id} connected to MediaSoup HLS stream`
              );
            } else {
              console.error(
                `❌ Failed to connect producer ${producer.id} to MediaSoup HLS`
              );
            }
          }
          callback({ id: producer.id });
        } catch (error: any) {
          console.error("❌ Error producing:", error);
          callback({ error: error.message });
        }
      }
    );

    socket.on(
      "consume",
      async (
        {
          consumerTransportId,
          producerId,
          rtpCapabilities,
        }: {
          consumerTransportId: string;
          producerId: string;
          rtpCapabilities: RtpCapabilities;
        },
        callback
      ) => {
        try {
          if (!router.canConsume({ producerId, rtpCapabilities })) {
            return callback({ error: "Cannot consume" });
          }

          const transport = transports.get(consumerTransportId);
          if (!transport) return;

          const consumer = await transport.consume({
            producerId,
            rtpCapabilities,
            paused: true,
          });

          const peer = peers.get(socket.id);
          if (!peer) return;

          peer.consumers.set(consumer.id, consumer);
          consumers.set(consumer.id, consumer);

          consumer.on("transportclose", () => {
            consumer.close();
            consumers.delete(consumer.id);
            peer.consumers.delete(consumer.id);
          });

          consumer.on("producerclose", () => {
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
        } catch (error: any) {
          console.error("Error consuming:", error);
          callback({ error: error.message });
        }
      }
    );

    socket.on(
      "consumerResume",
      async ({ consumerId }: { consumerId: string }, callback) => {
        try {
          const consumer = consumers.get(consumerId);
          if (consumer) {
            await consumer.resume();
            callback("success");
          }
        } catch (error: any) {
          console.error("Error resuming consumer:", error);
          callback({ error: error.message });
        }
      }
    );

    // HLS-specific events
    socket.on("getHLSStatus", (callback) => {
      const health = checkHLSHealth();
      callback({
        ...health,
        url: getHLSUrl(),
      });
    });

    socket.on("startHLS", async (callback) => {
      try {
        if (!getHLSStatus()) {
          const started = await startHLSStream(router);
          if (started) {
            io.emit("hlsStatusChanged", {
              status: true,
              url: getHLSUrl(),
            });
            callback({ success: true, url: getHLSUrl() });
          } else {
            callback({ success: false, error: "Failed to start HLS stream" });
          }
        } else {
          callback({
            success: true,
            url: getHLSUrl(),
            message: "HLS already running",
          });
        }
      } catch (error: any) {
        callback({ success: false, error: error.message });
      }
    });

    socket.on("stopHLS", (callback) => {
      try {
        if (getHLSStatus()) {
          stopHLSStream();
          io.emit("hlsStatusChanged", { status: false, url: null });
          callback({ success: true });
        } else {
          callback({ success: true, message: "HLS was not running" });
        }
      } catch (error: any) {
        callback({ success: false, error: error.message });
      }
    });

    socket.on("disconnect", () => {
      console.log("🔌 Client disconnected:", socket.id);

      const peer = peers.get(socket.id);
      if (peer) {
        // Close all transports
        peer.transports.forEach((transport: WebRtcTransport) => {
          console.log(`🔌 Closing transport: ${transport.id}`);
          transport.close();
          transports.delete(transport.id);
        });

        // Close all producers
        peer.producers.forEach((producer: Producer) => {
          console.log(`🎥 Closing producer: ${producer.id}`);
          producer.close();
          producers.delete(producer.id);
          socket.broadcast.emit("producerClosed", { producerId: producer.id });
        });

        // Close all consumers
        peer.consumers.forEach((consumer: Consumer) => {
          console.log(`👥 Closing consumer: ${consumer.id}`);
          consumer.close();
          consumers.delete(consumer.id);
        });

        peers.delete(socket.id);
      }

      // Stop HLS if no more video producers
      const hasVideoProducers = Array.from(producers.values()).some(
        (p) => p.kind === "video"
      );
      if (!hasVideoProducers && getHLSStatus()) {
        console.log("🛑 No more video producers, stopping HLS");
        stopHLSStream();
        io.emit("hlsStatusChanged", { status: false, url: null });
      }
    });
  });

  // Periodic HLS health check
  setInterval(() => {
    if (getHLSStatus()) {
      const health = checkHLSHealth();
      if (!health.hasSegments || !health.manifestExists) {
        console.warn("HLS health check failed:", health);
        // Optionally restart HLS or notify clients
        io.emit("hlsHealthWarning", health);
      }
    }
  }, 10000); // Check every 10 seconds
};
