const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;

const server = http.createServer();

const roomForUser = (userId) => `user:${userId}`;

// userId -> Set<socketId>
const onlineUsers = new Map();
// socketId -> userId
const socketToUser = new Map();

const io = new Server(server, {
  cors: {
    origin: "*", // allow all clients
  },
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  const emitOnlineUsers = () => {
    io.emit("online_users", Array.from(onlineUsers.keys()));
  };

  socket.on("register", (payload) => {
    const userId = payload?.userId;
    if (!userId) return;

    socketToUser.set(socket.id, userId);
    socket.join(roomForUser(userId));

    const sockets = onlineUsers.get(userId) ?? new Set();
    sockets.add(socket.id);
    onlineUsers.set(userId, sockets);

    emitOnlineUsers();
  });

  socket.on("get_online_users", () => {
    socket.emit("online_users", Array.from(onlineUsers.keys()));
  });

  // when client sends message
  socket.on("send_message", (data) => {
    console.log("Message received:", data);

    const toUserId = data?.toUserId;
    if (!toUserId) return;

    // deliver only to the target user (all their active sockets)
    io.to(roomForUser(toUserId)).emit("receive_message", data);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    const userId = socketToUser.get(socket.id);
    socketToUser.delete(socket.id);
    if (!userId) return;

    const sockets = onlineUsers.get(userId);
    if (!sockets) return;
    sockets.delete(socket.id);
    if (sockets.size === 0) {
      onlineUsers.delete(userId);
    } else {
      onlineUsers.set(userId, sockets);
    }

    emitOnlineUsers();
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Socket.IO server running on port ${PORT}`);
});
