const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;

const server = http.createServer();

const normalizeUserId = userId => {
  if (userId === undefined || userId === null) return null;
  const v = String(userId).trim();
  return v.length ? v : null;
};

const roomForUser = userId => `user:${normalizeUserId(userId)}`;
const roomForGroup = groupId => `group:${groupId}`;

const isUserOnline = userId => {
  const normalized = normalizeUserId(userId);
  if (!normalized) return false;
  const sockets = onlineUsers.get(normalized);
  return Boolean(sockets && sockets.size > 0);
};

// userId -> Set<socketId>
const onlineUsers = new Map();
// socketId -> userId
const socketToUser = new Map();
// groupId -> { members: string[], createdBy: string, createdAt: number }
const activeGroups = new Map();
// callId -> { participants: string[], isGroup: boolean }
const activeCalls = new Map();

const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

io.on('connection', socket => {
  console.log('User connected:', socket.id);

  const emitOnlineUsers = () => {
    io.emit('online_users', Array.from(onlineUsers.keys()));
  };

  socket.on('register', payload => {
    const userId = normalizeUserId(payload?.userId);
    if (!userId) return;

    socketToUser.set(socket.id, userId);
    socket.join(roomForUser(userId));

    const sockets = onlineUsers.get(userId) ?? new Set();
    sockets.add(socket.id);
    onlineUsers.set(userId, sockets);

    emitOnlineUsers();
  });

  socket.on('get_online_users', () => {
    socket.emit('online_users', Array.from(onlineUsers.keys()));
  });

  // Single user call
  socket.on('call_user', (data, ack) => {
    const registeredUserId = socketToUser.get(socket.id);
    if (!registeredUserId) {
      ack?.({ ok: false, error: 'not_registered' });
      return;
    }

    const fromUserId = normalizeUserId(registeredUserId);
    const toUserId = normalizeUserId(data?.toUserId);
    const callId = String(data?.callId ?? '').trim();
    const isVideo = data?.isVideo ?? true;

    if (!fromUserId || !toUserId || !callId) {
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }
    if (!isUserOnline(toUserId)) {
      console.log('Call failed (user offline):', {
        fromUserId,
        toUserId,
        callId,
      });
      ack?.({ ok: false, error: 'user_offline' });
      return;
    }

    console.log('Call request:', { fromUserId, toUserId, callId, isVideo });

    io.to(roomForUser(toUserId)).emit('incoming_call', {
      callId,
      fromUserId,
      toUserId,
      isVideo,
      metadata: data?.metadata ?? null,
    });
    ack?.({ ok: true });
  });

  // Group call - call multiple users
  socket.on('group_call', (data, ack) => {
    const registeredUserId = socketToUser.get(socket.id);
    if (!registeredUserId) {
      ack?.({ ok: false, error: 'not_registered' });
      return;
    }

    const toUserIds = data?.toUserIds;
    const callId = String(data?.callId ?? '').trim();
    const isVideo = data?.isVideo ?? true;

    if (!Array.isArray(toUserIds) || toUserIds.length === 0 || !callId) {
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }

    activeCalls.set(callId, {
      participants: [registeredUserId, ...toUserIds],
      isGroup: true,
      initiator: registeredUserId,
      isVideo,
      createdAt: Date.now(),
    });

    let successCount = 0;
    toUserIds.forEach(uid => {
      if (isUserOnline(uid)) {
        io.to(roomForUser(uid)).emit('incoming_call', {
          callId,
          fromUserId: registeredUserId,
          toUserId: uid,
          isVideo,
          isGroupCall: true,
          participants: [registeredUserId, ...toUserIds],
        });
        successCount++;
      }
    });

    console.log('Group call:', {
      callId,
      from: registeredUserId,
      reached: successCount,
    });
    ack?.({ ok: true, reached: successCount, total: toUserIds.length });
  });

  socket.on('accept_call', (data, ack) => {
    const registeredUserId = socketToUser.get(socket.id);
    if (!registeredUserId) {
      ack?.({ ok: false, error: 'not_registered' });
      return;
    }

    const fromUserId = normalizeUserId(registeredUserId);
    const toUserId = normalizeUserId(data?.toUserId);
    const callId = String(data?.callId ?? '').trim();
    if (!fromUserId || !toUserId || !callId) {
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }

    io.to(roomForUser(toUserId)).emit('call_accepted', {
      callId,
      fromUserId,
      toUserId,
    });
    ack?.({ ok: true });
  });

  socket.on('reject_call', (data, ack) => {
    const registeredUserId = socketToUser.get(socket.id);
    if (!registeredUserId) {
      ack?.({ ok: false, error: 'not_registered' });
      return;
    }

    const fromUserId = normalizeUserId(registeredUserId);
    const toUserId = normalizeUserId(data?.toUserId);
    const callId = String(data?.callId ?? '').trim();
    if (!fromUserId || !toUserId || !callId) {
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }

    io.to(roomForUser(toUserId)).emit('call_rejected', {
      callId,
      fromUserId,
      toUserId,
      reason: data?.reason ?? null,
    });
    ack?.({ ok: true });
  });

  socket.on('webrtc_offer', (data, ack) => {
    const registeredUserId = socketToUser.get(socket.id);
    if (!registeredUserId) {
      ack?.({ ok: false, error: 'not_registered' });
      return;
    }

    const fromUserId = normalizeUserId(registeredUserId);
    const toUserId = normalizeUserId(data?.toUserId);
    const callId = String(data?.callId ?? '').trim();
    const sdp = data?.sdp;
    if (!fromUserId || !toUserId || !callId || !sdp) {
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }

    io.to(roomForUser(toUserId)).emit('webrtc_offer', {
      callId,
      fromUserId,
      toUserId,
      sdp,
    });
    ack?.({ ok: true });
  });

  socket.on('webrtc_answer', (data, ack) => {
    const registeredUserId = socketToUser.get(socket.id);
    if (!registeredUserId) {
      ack?.({ ok: false, error: 'not_registered' });
      return;
    }

    const fromUserId = normalizeUserId(registeredUserId);
    const toUserId = normalizeUserId(data?.toUserId);
    const callId = String(data?.callId ?? '').trim();
    const sdp = data?.sdp;
    if (!fromUserId || !toUserId || !callId || !sdp) {
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }

    io.to(roomForUser(toUserId)).emit('webrtc_answer', {
      callId,
      fromUserId,
      toUserId,
      sdp,
    });
    ack?.({ ok: true });
  });

  socket.on('webrtc_ice_candidate', (data, ack) => {
    const registeredUserId = socketToUser.get(socket.id);
    if (!registeredUserId) {
      ack?.({ ok: false, error: 'not_registered' });
      return;
    }

    const fromUserId = normalizeUserId(registeredUserId);
    const toUserId = normalizeUserId(data?.toUserId);
    const callId = String(data?.callId ?? '').trim();
    const candidate = data?.candidate;
    if (!fromUserId || !toUserId || !callId || !candidate) {
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }

    io.to(roomForUser(toUserId)).emit('webrtc_ice_candidate', {
      callId,
      fromUserId,
      toUserId,
      candidate,
    });
    ack?.({ ok: true });
  });

  socket.on('end_call', (data, ack) => {
    const registeredUserId = socketToUser.get(socket.id);
    if (!registeredUserId) {
      ack?.({ ok: false, error: 'not_registered' });
      return;
    }

    const fromUserId = normalizeUserId(registeredUserId);
    const toUserId = normalizeUserId(data?.toUserId);
    const callId = String(data?.callId ?? '').trim();
    if (!fromUserId || !toUserId || !callId) {
      ack?.({ ok: false, error: 'invalid_payload' });
      return;
    }

    io.to(roomForUser(toUserId)).emit('call_ended', {
      callId,
      fromUserId,
      toUserId,
      reason: data?.reason ?? null,
    });
    ack?.({ ok: true });
  });

  // Send message - supports single and group
  socket.on('send_message', data => {
    console.log('Message received:', data);

    const toUserId = data?.toUserId;
    const toUserIds = data?.toUserIds;

    // Group message
    if (Array.isArray(toUserIds) && toUserIds.length > 0) {
      toUserIds.forEach(uid => {
        if (uid !== data?.fromUserId) {
          io.to(roomForUser(uid)).emit('receive_message', {
            ...data,
            isGroupMessage: true,
          });
        }
      });
      return;
    }

    // Single message
    if (!toUserId) return;
    io.to(roomForUser(toUserId)).emit('receive_message', data);
  });

  // Create group
  socket.on('create_group', (data, ack) => {
    const registeredUserId = socketToUser.get(socket.id);
    if (!registeredUserId) {
      ack?.({ ok: false, error: 'not_registered' });
      return;
    }

    const members = data?.members;
    const groupName = data?.name || 'Group Chat';
    if (!Array.isArray(members) || members.length === 0) {
      ack?.({ ok: false, error: 'invalid_members' });
      return;
    }

    const groupId = `group_${Date.now()}_${Math.random()
      .toString(16)
      .slice(2)}`;
    const allMembers = [...new Set([registeredUserId, ...members])];

    activeGroups.set(groupId, {
      id: groupId,
      name: groupName,
      members: allMembers,
      createdBy: registeredUserId,
      createdAt: Date.now(),
    });

    allMembers.forEach(uid => {
      io.to(roomForUser(uid)).emit('group_created', {
        groupId,
        name: groupName,
        members: allMembers,
        createdBy: registeredUserId,
      });
    });

    console.log('Group created:', { groupId, members: allMembers });
    ack?.({ ok: true, groupId, members: allMembers });
  });

  // Get user's groups
  socket.on('get_groups', (data, ack) => {
    const registeredUserId = socketToUser.get(socket.id);
    if (!registeredUserId) {
      ack?.({ ok: false, error: 'not_registered' });
      return;
    }

    const userGroups = [];
    activeGroups.forEach(group => {
      if (group.members.includes(registeredUserId)) {
        userGroups.push(group);
      }
    });

    ack?.({ ok: true, groups: userGroups });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);

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
