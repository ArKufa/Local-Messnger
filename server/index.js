import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

// Supabase клиент
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

app.use(cors());
app.use(express.json());

// Middleware для аутентификации Socket.io
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    if (token) {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error) throw error;
      socket.userId = user.id;
    }
    next();
  } catch (error) {
    next(new Error("Authentication error"));
  }
});

// Подключения Socket.io
io.on('connection', (socket) => {
  console.log('User connected:', socket.userId);

  // Обновить статус онлайн
  updateUserStatus(socket.userId, true);

  // Присоединиться к комнатам пользователя
  socket.on('join-rooms', async () => {
    const rooms = await getUserRooms(socket.userId);
    rooms.forEach(room => {
      socket.join(room.id);
    });
  });

  // Отправить сообщение
  socket.on('send-message', async (data) => {
    try {
      const { data: message, error } = await supabase
        .from('messages')
        .insert({
          room_id: data.roomId,
          user_id: socket.userId,
          content: data.content,
          message_type: data.type || 'text'
        })
        .select(`
          *,
          profiles:user_id (
            username,
            display_name,
            avatar_url
          )
        `)
        .single();

      if (error) throw error;

      // Отправить сообщение всем в комнате
      io.to(data.roomId).emit('new-message', message);
    } catch (error) {
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Создать комнату
  socket.on('create-room', async (roomData) => {
    try {
      const { data: room, error } = await supabase
        .from('rooms')
        .insert({
          name: roomData.name,
          description: roomData.description,
          is_private: roomData.isPrivate || false,
          created_by: socket.userId
        })
        .select()
        .single();

      if (error) throw error;

      // Добавить создателя в комнату
      await supabase
        .from('room_members')
        .insert({
          room_id: room.id,
          user_id: socket.userId
        });

      socket.emit('room-created', room);
    } catch (error) {
      socket.emit('error', { message: 'Failed to create room' });
    }
  });

  // Отключение пользователя
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.userId);
    updateUserStatus(socket.userId, false);
  });
});

// Вспомогательные функции
async function updateUserStatus(userId, isOnline) {
  if (!userId) return;
  
  await supabase
    .from('profiles')
    .update({
      is_online: isOnline,
      last_seen: new Date().toISOString()
    })
    .eq('id', userId);
}

async function getUserRooms(userId) {
  const { data, error } = await supabase
    .from('room_members')
    .select(`
      room_id,
      rooms (*)
    `)
    .eq('user_id', userId);

  return data?.map(item => item.rooms) || [];
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`LM Server running on port ${PORT}`);
});
