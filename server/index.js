import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

const app = express();
const server = createServer(app);

// Базовая настройка CORS
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Инициализация Supabase с проверкой ошибок
let supabase;
try {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase connected');
  } else {
    console.log('⚠️ Supabase credentials not found, running in local mode');
  }
} catch (error) {
  console.log('⚠️ Supabase init failed, running in local mode:', error.message);
}

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    supabase: supabase ? 'connected' : 'local_mode'
  });
});

// Socket.io аутентификация
io.use((socket, next) => {
  const user = socket.handshake.auth;
  if (user && user.userId) {
    socket.userId = user.userId;
    socket.username = user.username;
    next();
  } else {
    // Разрешаем анонимные подключения для тестирования
    socket.userId = 'anonymous_' + Math.random().toString(36).substr(2, 9);
    socket.username = 'Anonymous';
    next();
  }
});

// Обработчики Socket.io
io.on('connection', (socket) => {
  console.log('🔗 User connected:', socket.username);

  // Приветственное сообщение
  socket.emit('welcome', {
    message: 'Connected to Local Messenger',
    userId: socket.userId,
    timestamp: new Date().toISOString()
  });

  // Создание комнаты
  socket.on('create-room', (roomData) => {
    const room = {
      id: 'room_' + Math.random().toString(36).substr(2, 9),
      name: roomData.name || 'New Room',
      description: roomData.description || 'Room description',
      created_by: socket.userId,
      created_at: new Date().toISOString(),
      is_private: false
    };

    // Сохраняем в Supabase если доступно
    if (supabase) {
      supabase
        .from('rooms')
        .insert({
          name: room.name,
          description: room.description,
          created_by: room.created_by,
          is_private: false
        })
        .then(({ error }) => {
          if (error) console.error('Supabase room save error:', error);
        });
    }

    socket.emit('room-created', room);
    socket.join(room.id);
    console.log(`✅ Room created: ${room.name}`);
  });

  // Отправка сообщения
  socket.on('send-message', async (data) => {
    try {
      const message = {
        id: 'msg_' + Math.random().toString(36).substr(2, 9),
        room_id: data.roomId,
        user_id: data.user?.id || socket.userId,
        content: data.content,
        created_at: new Date().toISOString(),
        user: data.user || {
          id: socket.userId,
          username: socket.username,
          display_name: socket.username
        }
      };

      // Сохраняем в Supabase
      if (supabase) {
        const { error } = await supabase
          .from('messages')
          .insert({
            room_id: data.roomId,
            user_id: message.user_id,
            content: data.content
          });

        if (error) {
          console.error('Supabase message save error:', error);
        }
      }

      // Отправляем в комнату
      io.to(data.roomId).emit('new-message', message);
      console.log(`💬 Message sent to room ${data.roomId}`);
      
    } catch (error) {
      console.error('❌ Message send error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Получение сообщений комнаты
  socket.on('get-messages', async (roomId) => {
    try {
      let messages = [];
      
      if (supabase) {
        const { data, error } = await supabase
          .from('messages')
          .select(`
            *,
            profiles:user_id (
              username,
              display_name
            )
          `)
          .eq('room_id', roomId)
          .order('created_at', { ascending: true });

        if (!error) messages = data || [];
      }

      socket.emit('room-messages', { roomId, messages });
    } catch (error) {
      console.error('❌ Get messages error:', error);
    }
  });

  // Отключение
  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.username);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 LM Server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
});

export default app;
