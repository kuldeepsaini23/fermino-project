import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import streamRoutes from "./routes/stream";
import watchRoutes from "./routes/watch";
import { handleStreamSocket } from "./controller/stream";
import cors from "cors";
import path from 'path';
import { initializeMediasoup } from "./service/mediasoup";
import { setupSocket } from "./controller/socket";

dotenv.config();


const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

app.use(cors());
app.use(express.json());

app.use('/hls', express.static(path.join(__dirname, '../public/hls')));
app.use("/api/stream", streamRoutes);
app.use("/api/watch", watchRoutes);

io.of("/stream").on("connection", (socket) => {
  console.log("🎥 Streamer connected");
  handleStreamSocket(socket);
});



initializeMediasoup().then(() => {
  setupSocket(io);
  const PORT = process.env.PORT || 8000;
  httpServer.listen(PORT, () => console.log(`Server running on ${PORT}`));
}).catch(console.error);