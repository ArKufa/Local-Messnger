// server.js
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Basic routes
app.get('/', (req, res) => {
  res.json({
    message: '🚀 Local Messenger Server is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      status: '/status'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    service: 'Local Messenger API',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/status', (req, res) => {
  res.json({
    server: 'running',
    connections: io.engine.clientsCount,
    timestamp: new Date().toISOString()
  });
});

// Socket.io setup
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// In-memory storage
const rooms = new Map();
const users = new Map();

// Socket.io handlers
io.on('connection', (socket) => {
  console.log('🔗 New connection:', socket.id);
  
  users.set(socket.id, {
    id: socket.id,
    username: `user_${socket.id.substring(0, 6)}`,
    connectedAt: new Date().toISOString(),
    currentRoom: null
  });

  // Welcome message
  socket.emit('welcome', {
    message: 'Welcome to Local Messenger!',
    userId: socket.id,
    serverTime: new Date().toISOString()
  });

  // Get all rooms
  socket.on('get-rooms', () => {
    const roomList = Array.from(rooms.values()).map(room => ({
      id: room.id,
      name: room.name,
      description: room.description,
      userCount: room.users.size,
      createdAt: room.createdAt
    }));
    
    socket.emit('rooms-list', roomList);
  });

  // Create room
  socket.on('create-room', (data) => {
    const roomId = `room_${Date.now()}`;
    const room = {
      id: roomId,
      name: data.name || 'New Room',
      description: data.description || 'Chat room',
      createdBy: socket.id,
      createdAt: new Date().toISOString(),
      users: new Set([socket.id])
    };

    rooms.set(roomId, room);
    
    socket.join(roomId);
    socket.emit('room-created', {
      id: roomId,
      name: room.name,
      description: room.description
    });

    console.log(`✅ Room created: ${room.name} (${roomId})`);
  });

  // Join room
  socket.on('join-room', (roomId) => {
    const room = rooms.get(roomId);
    if (room) {
      room.users.add(socket.id);
      socket.join(roomId);
      
      const user = users.get(socket.id);
      user.currentRoom = roomId;

      // Send room info
      socket.emit('room-joined', {
        room: {
          id: room.id,
          name: room.name,
          description: room.description,
          userCount: room.users.size
        },
        users: Array.from(room.users).map(userId => ({
          id: userId,
          username: users.get(userId)?.username || 'Unknown'
        }))
      });

      // Notify others
      socket.to(roomId).emit('user-joined', {
        user: {
          id: socket.id,
          username: user.username
        },
        userCount: room.users.size
      });

      console.log(`👤 ${user.username} joined ${room.name}`);
    } else {
      socket.emit('error', { message: 'Room not found' });
    }
  });

  // Send message
  socket.on('send-message', (data) => {
    const { roomId, content } = data;
    const user = users.get(socket.id);
    const room = rooms.get(roomId);

    if (!room || !user) {
      socket.emit('error', { message: 'Room or user not found' });
      return;
    }

    if (!room.users.has(socket.id)) {
      socket.emit('error', { message: 'Not in this room' });
      return;
    }

    const message = {
      id: `msg_${Date.now()}`,
      roomId,
      content,
      user: {
        id: user.id,
        username: user.username
      },
      timestamp: new Date().toISOString()
    };

    // Broadcast to room
    io.to(roomId).emit('new-message', message);
    console.log(`💬 ${user.username} in ${room.name}: ${content}`);
  });

  // Leave room
  socket.on('leave-room', (roomId) => {
    const room = rooms.get(roomId);
    const user = users.get(socket.id);

    if (room && user) {
      room.users.delete(socket.id);
      socket.leave(roomId);
      user.currentRoom = null;

      // Notify others
      socket.to(roomId).emit('user-left', {
        user: {
          id: user.id,
          username: user.username
        },
        userCount: room.users.size
      });

      console.log(`👋 ${user.username} left ${room.name}`);
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    console.log('🔌 User disconnected:', user?.username || socket.id);

    // Remove from all rooms
    rooms.forEach((room, roomId) => {
      if (room.users.has(socket.id)) {
        room.users.delete(socket.id);
        socket.to(roomId).emit('user-left', {
          user: {
            id: socket.id,
            username: user?.username || 'Unknown'
          },
          userCount: room.users.size
        });
      }
    });

    users.delete(socket.id);
  });
});

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
🌈 Local Messenger Server Started!
📍 Port: ${PORT}
🚀 Health: http://localhost:${PORT}/health
📡 WebSocket: ws://localhost:${PORT}
⏰ Started: ${new Date().toISOString()}
  `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
