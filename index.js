const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;

const server = http.createServer();

const io = new Server(server, {
  cors: {
    origin: "*", // allow all clients
  },
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // when client sends message
  socket.on("send_message", (data) => {
    console.log("Message received:", data);

    // broadcast to all clients
    io.emit("receive_message", data);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Socket.IO server running on port ${PORT}`);
});
