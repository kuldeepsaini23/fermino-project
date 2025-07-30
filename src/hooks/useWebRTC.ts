import { RemoteProducer } from "@/types/media"
import { Device, Producer, Transport } from "mediasoup-client/types"
import { useEffect, useRef, useState } from "react"
import { io, Socket } from "socket.io-client"

const useWebRTC = () => {
  const [isConnected, setIsConnected] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(false)
  const [isAudioEnabled, setIsAudioEnabled] = useState(false)
  const [remoteProducers, setRemoteProducers] = useState<RemoteProducer[]>([])

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const localStreamRef = useRef<MediaStream | null>(null)

  const socket = useRef<Socket | null>(null)
  const device = useRef<Device | null>(null)

  const producerTransport = useRef<Transport | null>(null)
  const consumerTransport = useRef<Transport | null>(null)
  const videoProducer = useRef<Producer | null>(null)
  const audioProducer = useRef<Producer | null>(null) 

  useEffect(() => {
    socket.current = io("http://localhost:8000")
    console.log("Connecting to WebSocket server...")
    const s = socket.current
    console.log("WebSocket connection established", s)
    s.on("connect", () => {
      console.log("Connected to WebSocket server")
    })

    s.on("connection-success", ({ existingProducers }) => {
      console.log("Connection successful")
      setIsConnected(true)
      setRemoteProducers(existingProducers.map((id: string) => ({ id, socketId: "unknown" })))
    })

    s.on("newProducer", ({ producerId, socketId }) => {
      setRemoteProducers((prev) => [...prev, { id: producerId, socketId }])
    })

    s.on("producerClosed", ({ producerId }) => {
      setRemoteProducers((prev) => prev.filter((p) => p.id !== producerId))
    })

    s.on("consumerClosed", ({ consumerId }) => {
      setRemoteProducers((prev) =>
        prev.map((p) => (p.consumer?.id === consumerId ? { ...p, consumer: undefined } : p))
      )
    })

    return () => {
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach((t) => t.stop())
      s.disconnect()
    }
  }, [])

  const startStreaming = async () => {
    console.log("Starting streaming...")
    const d = new Device()
    await new Promise<void>((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.current?.emit("getRouterRtpCapabilities", async (rtpCapabilities: any) => {
        await d.load({ routerRtpCapabilities: rtpCapabilities })
        device.current = d
        resolve()
      })
    })

    await createProducerTransport()
    await createConsumerTransport()
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    localStreamRef.current = stream
    if (localVideoRef.current) localVideoRef.current.srcObject = stream

    const videoTrack = stream.getVideoTracks()[0]
    if (videoTrack && producerTransport.current) {
      videoProducer.current = await producerTransport.current.produce({ track: videoTrack })
      setIsVideoEnabled(true)
    }
    const audioTrack = stream.getAudioTracks()[0]
    if (audioTrack && producerTransport.current) {
      audioProducer.current = await producerTransport.current.produce({ track: audioTrack })
      setIsAudioEnabled(true)
    }
    setIsStreaming(true)
  }

  const stopStreaming = () => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localVideoRef.current!.srcObject = null
    videoProducer.current?.close()
    audioProducer.current?.close()
    setIsStreaming(false)
    setIsVideoEnabled(false)
    setIsAudioEnabled(false)
  }

  const toggleVideo = () => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0]
    if (videoTrack) {
      const newState = !isVideoEnabled
      videoTrack.enabled = newState
      setIsVideoEnabled(newState)
    }
  }

  const toggleAudio = () => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0]
    if (audioTrack) {
      const newState = !isAudioEnabled
      audioTrack.enabled = newState
      setIsAudioEnabled(newState)
    }
  }

  const createProducerTransport = async () => {
    return new Promise<void>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.current?.emit("createWebRtcTransport", { sender: true }, async (response: any) => {
        if (response.error) return reject(response.error)
        const transport = device.current!.createSendTransport(response.params)
        producerTransport.current = transport

        transport.on("connect", ({ dtlsParameters }, callback, errback) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          socket.current?.emit("connectTransport", { dtlsParameters, transportId: transport.id }, (res: any) => {
            if (res === "success") {
              callback();
            } else {
              errback(res.error);
            }
          })
        })

        transport.on("produce", ({ kind, rtpParameters }, callback, errback) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          socket.current?.emit("produce", { kind, rtpParameters, transportId: transport.id }, (res: any) => {
              if (res === "success") {
               callback({ id: res.id })
            } else {
              errback(res.error);
            }
      
          })
        })
        resolve()
      })
    })
  }

  const createConsumerTransport = async () => {
    return new Promise<void>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      socket.current?.emit("createWebRtcTransport", { sender: false }, async (response: any) => {
        if (response.error) return reject(response.error)
        const transport = device.current!.createRecvTransport(response.params)
        consumerTransport.current = transport

        transport.on("connect", ({ dtlsParameters }, callback, errback) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          socket.current?.emit("connectTransport", { dtlsParameters, transportId: transport.id }, (res: any) => {
            if (res === "success") {
              callback();
            } else {
              errback(res.error);
            }
          })
        })
        resolve()
      })
    })
  }

  return {
    isConnected,
    isStreaming,
    isVideoEnabled,
    isAudioEnabled,
    remoteProducers,
    localVideoRef,
    startStreaming,
    stopStreaming,
    toggleVideo,
    toggleAudio,
  }
}


export default useWebRTC;