/* eslint-disable @typescript-eslint/no-explicit-any */
import { Server, Socket } from 'socket.io';
import {  WebRtcTransport, Producer, Consumer, RtpCapabilities } from 'mediasoup/node/lib/types';
import {  createRouter, createWebRtcTransport, createWorker } from '../service/mediasoup';
import { getHLSStatus, startHLSStream, stopHLSStream } from '../service/hlsService';

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

export const setupSocket =async (io: Server) => {

  const worker = await createWorker();
  const router = await createRouter(worker);

  io.on('connection', (socket: Socket) => {
    console.log('Client connected:', socket.id);

    peers.set(socket.id, {
      socket,
      transports: new Map(),
      producers: new Map(),
      consumers: new Map(),
    });

    socket.emit('connection-success', {
      socketId: socket.id,
      existingProducers: Array.from(producers.keys()),
    });

    socket.on('getRouterRtpCapabilities', (callback: (rtpCapabilities: RtpCapabilities) => void) => {
     
      callback(router.rtpCapabilities);
    });

    socket.on('createWebRtcTransport', async ({  }: { sender: boolean }, callback) => {
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
        console.error('Error creating WebRTC transport:', error);
        callback({ error: error.message });
      }
    });

    socket.on('connectTransport', async ({ dtlsParameters, transportId }: any, callback) => {
      try {
        const transport = transports.get(transportId);
        if (transport) {
          await transport.connect({ dtlsParameters });
          callback('success');
        }
      } catch (error: any) {
        console.error('Error connecting transport:', error);
        callback({ error: error.message });
      }
    });

    socket.on('produce', async (
      { kind, rtpParameters, transportId }: { kind: 'audio' | 'video'; rtpParameters: any; transportId: string },
      callback
    ) => {
      try {
        const transport = transports.get(transportId);
        if (transport) {
          const producer = await transport.produce({ kind, rtpParameters });
          const peer = peers.get(socket.id);
          if (!peer) return;

          peer.producers.set(producer.id, producer);
          producers.set(producer.id, producer);

          producer.on('transportclose', () => {
            producer.close();
            producers.delete(producer.id);
            peer.producers.delete(producer.id);
          });

          socket.broadcast.emit('newProducer', {
            producerId: producer.id,
            socketId: socket.id,
          });

          if (kind === 'video' && !getHLSStatus()) {
            setTimeout(() => startHLSStream(), 1000);
          }

          callback({ id: producer.id });
        }
      } catch (error: any) {
        console.error('Error producing:', error);
        callback({ error: error.message });
      }
    });

    socket.on('consume', async (
      {
        consumerTransportId,
        producerId,
        rtpCapabilities,
      }: { consumerTransportId: string; producerId: string; rtpCapabilities: RtpCapabilities },
      callback
    ) => {
      try {
        if (!router.canConsume({ producerId, rtpCapabilities })) {
          return callback({ error: 'Cannot consume' });
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

        consumer.on('transportclose', () => {
          consumer.close();
          consumers.delete(consumer.id);
          peer.consumers.delete(consumer.id);
        });

        consumer.on('producerclose', () => {
          consumer.close();
          consumers.delete(consumer.id);
          peer.consumers.delete(consumer.id);
          socket.emit('consumerClosed', { consumerId: consumer.id });
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
        console.error('Error consuming:', error);
        callback({ error: error.message });
      }
    });

    socket.on('consumerResume', async ({ consumerId }: { consumerId: string }, callback) => {
      try {
        const consumer = consumers.get(consumerId);
        if (consumer) {
          await consumer.resume();
          callback('success');
        }
      } catch (error: any) {
        console.error('Error resuming consumer:', error);
        callback({ error: error.message });
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);

      const peer = peers.get(socket.id);
      if (peer) {
        peer.transports.forEach((transport: WebRtcTransport) => {
          transport.close();
          transports.delete(transport.id);
        });

        peer.producers.forEach((producer: Producer) => {
          producer.close();
          producers.delete(producer.id);
          socket.broadcast.emit('producerClosed', { producerId: producer.id });
        });

        peer.consumers.forEach((consumer: Consumer) => {
          consumer.close();
          consumers.delete(consumer.id);
        });

        peers.delete(socket.id);
      }

      if (producers.size === 0 && getHLSStatus()) {
        stopHLSStream();
      }
    });
  });
};
