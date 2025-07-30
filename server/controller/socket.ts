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

    socket.on("getRouterRtpCapabilities", (callback) => {
      callback(router.rtpCapabilities);
    });

    socket.on("createWebRtcTransport", async (_, callback) => {
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
        console.error("Error creating transport:", error);
        callback({ error: error.message });
      }
    });

    socket.on("connectTransport", async ({ dtlsParameters, transportId }, callback) => {
      try {
        const transport = transports.get(transportId);
        if (transport) await transport.connect({ dtlsParameters });
        callback("success");
      } catch (error: any) {
        console.error("Transport connection failed:", error);
        callback({ error: error.message });
      }
    });

    socket.on("produce", async ({ kind, rtpParameters, transportId }, callback) => {
      try {
        const transport = transports.get(transportId);
        if (!transport) return callback({ error: "Transport not found" });

        const producer = await transport.produce({ kind, rtpParameters });
        const peer = peers.get(socket.id);
        if (!peer) return callback({ error: "Peer not found" });

        peer.producers.set(producer.id, producer);
        producers.set(producer.id, producer);

        producer.on("transportclose", () => {
          producer.close();
          producers.delete(producer.id);
          peer.producers.delete(producer.id);

          if (producers.size === 0 && getHLSStatus()) {
            stopHLSStream();
            io.emit("hlsStatusChanged", { status: false, url: null });
          }
        });

        socket.broadcast.emit("newProducer", {
          producerId: producer.id,
          socketId: socket.id,
          kind,
        });

        if (kind === "video") {
          if (!getHLSStatus()) {
            const started = await startHLSStream(router);
            if (started) {
              io.emit("hlsStatusChanged", { status: true, url: getHLSUrl() });
              setTimeout(async () => {
                await connectProducerToHLS(router, producer.id);
              }, 3000);
            }
          } else {
            setTimeout(async () => {
              await connectProducerToHLS(router, producer.id);
            }, 1000);
          }
        }

        callback({ id: producer.id });
      } catch (error: any) {
        console.error("Produce error:", error);
        callback({ error: error.message });
      }
    });

    socket.on("consume", async ({ consumerTransportId, producerId, rtpCapabilities }, callback) => {
      try {
        if (!router.canConsume({ producerId, rtpCapabilities }))
          return callback({ error: "Cannot consume" });

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
        console.error("Consume error:", error);
        callback({ error: error.message });
      }
    });

    socket.on("consumerResume", async ({ consumerId }, callback) => {
      try {
        const consumer = consumers.get(consumerId);
        if (consumer) await consumer.resume();
        callback("success");
      } catch (error: any) {
        console.error("Resume error:", error);
        callback({ error: error.message });
      }
    });

    socket.on("getHLSStatus", (callback) => {
      const health = checkHLSHealth();
      callback({
        ...health,
        url: getHLSUrl(),
        activeProducers: producers.size,
        videoProducers: Array.from(producers.values()).filter(p => p.kind === 'video').length,
      });
    });

    socket.on("startHLS", async (callback) => {
      try {
        if (!getHLSStatus()) {
          const started = await startHLSStream(router);
          if (started) {
            io.emit("hlsStatusChanged", { status: true, url: getHLSUrl() });
            const videoProducers = Array.from(producers.values()).filter(p => p.kind === 'video');
            for (const producer of videoProducers) {
              setTimeout(async () => await connectProducerToHLS(router, producer.id), 2000);
            }
            callback({ success: true, url: getHLSUrl() });
          } else {
            callback({ success: false, error: "Failed to start HLS" });
          }
        } else {
          callback({ success: true, url: getHLSUrl(), message: "HLS already running" });
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
          callback({ success: true, message: "HLS not running" });
        }
      } catch (error: any) {
        callback({ success: false, error: error.message });
      }
    });

    socket.on("startTestHLS", async (callback) => {
      try {
        const started = await startTestHLSStream();
        callback({ success: started, message: started ? "Test HLS started" : "Failed to start test HLS" });
      } catch (error: any) {
        callback({ success: false, error: error.message });
      }
    });

    socket.on("disconnect", () => {
      const peer = peers.get(socket.id);
      if (peer) {
        peer.transports.forEach(t => { t.close(); transports.delete(t.id); });
        peer.producers.forEach(p => { p.close(); producers.delete(p.id); socket.broadcast.emit("producerClosed", { producerId: p.id }); });
        peer.consumers.forEach(c => { c.close(); consumers.delete(c.id); });
        peers.delete(socket.id);
      }

      const hasVideoProducers = Array.from(producers.values()).some(p => p.kind === "video");
      if (!hasVideoProducers && getHLSStatus()) {
        stopHLSStream();
        io.emit("hlsStatusChanged", { status: false, url: null });
      }
    });
  });

  setInterval(() => {
    if (getHLSStatus()) {
      const health = checkHLSHealth();
      if (!health.hasSegments || !health.manifestExists) {
        console.warn("HLS health issue:", health);
        io.emit("hlsHealthWarning", health);
      }
    }
  }, 15000);
};
