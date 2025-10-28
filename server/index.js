// server/index.js
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

// Загружаем переменные окружения
dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3001;

// Настройка CORS
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Local Messenger Server is running!',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'Local Messenger API',
    timestamp: new Date().toISOString()
  });
});

// Хранилище в памяти (если Supabase недоступен)
const rooms = new Map();
const messages = new Map();

// Socket.io обработчики
io.on('connection', (socket) => {
  console.log('🔗 User connected:', socket.id);

  // Приветственное сообщение
  socket.emit('connected', {
    message: 'Welcome to Local Messenger!',
    userId: socket.id,
    serverTime: new Date().toISOString()
  });

  // Создать комнату
  socket.on('create-room', (data) => {
    const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const room = {
      id: roomId,
      name: data.name || 'New Room',
      description: data.description || '',
      createdBy: socket.id,
      createdAt: new Date().toISOString(),
      users: [socket.id]
    };

    rooms.set(roomId, room);
    socket.join(roomId);

    socket.emit('room-created', room);
    console.log(`✅ Room created: ${room.name} (${roomId})`);
  });

  // Присоединиться к комнате
  socket.on('join-room', (roomId) => {
    const room = rooms.get(roomId);
    if (room) {
      socket.join(roomId);
      if (!room.users.includes(socket.id)) {
        room.users.push(socket.id);
      }
      
      // Отправить историю сообщений
      const roomMessages = messages.get(roomId) || [];
      socket.emit('room-joined', {
        room,
        messages: roomMessages,
        users: room.users.length
      });

      // Уведомить других пользователей
      socket.to(roomId).emit('user-joined', {
        userId: socket.id,
        roomId,
        usersCount: room.users.length
      });

      console.log(`👤 User ${socket.id} joined room ${room.name}`);
    } else {
      socket.emit('error', { message: 'Room not found' });
    }
  });

  // Отправить сообщение
  socket.on('send-message', (data) => {
    const { roomId, content, user } = data;
    
    if (!roomId || !content) {
      socket.emit('error', { message: 'Room ID and content are required' });
      return;
    }

    const message = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      roomId,
      content,
      user: user || {
        id: socket.id,
        username: `user_${socket.id.substr(0, 6)}`,
        display_name: `User ${socket.id.substr(0, 6)}`
      },
      timestamp: new Date().toISOString()
    };

    // Сохраняем сообщение
    if (!messages.has(roomId)) {
      messages.set(roomId, []);
    }
    messages.get(roomId).push(message);

    // Отправляем всем в комнате
    io.to(roomId).emit('new-message', message);
    console.log(`💬 Message sent to room ${roomId}`);
  });

  // Получить список комнат
  socket.on('get-rooms', () => {
    const roomList = Array.from(rooms.values()).map(room => ({
      ...room,
      usersCount: room.users.length,
      messageCount: (messages.get(room.id) || []).length
    }));
    
    socket.emit('rooms-list', roomList);
  });

  // Отключение
  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
    
    // Удаляем пользователя из всех комнат
    rooms.forEach((room, roomId) => {
      if (room.users.includes(socket.id)) {
        room.users = room.users.filter(userId => userId !== socket.id);
        
        // Уведомляем остальных
        socket.to(roomId).emit('user-left', {
          userId: socket.id,
          roomId,
          usersCount: room.users.length
        });

        // Если комната пустая, удаляем её через некоторое время
        if (room.users.length === 0) {
          setTimeout(() => {
            if (rooms.get(roomId)?.users.length === 0) {
              rooms.delete(roomId);
              messages.delete(roomId);
              console.log(`🗑️ Room deleted: ${room.name}`);
            }
          }, 300000); // 5 минут
        }
      }
    });
  });
});

// Запуск сервера
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
🚀 Local Messenger Server started!
📍 Port: ${PORT}
📡 WebSocket: ws://0.0.0.0:${PORT}
🌐 Health: http://0.0.0.0:${PORT}/health
⏰ Time: ${new Date().toISOString()}
  `);
});

// Обработка graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

export default app;
