import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { io } from 'socket.io-client';
import { Send, Users, MessageCircle, LogIn, LogOut } from 'lucide-react';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

function App() {
  const [user, setUser] = useState(null);
  const [socket, setSocket] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState('signin');

  useEffect(() => {
    // Проверить существующую сессию
    checkUser();
    
    // Слушать изменения аутентификации
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          setUser(session.user);
          initializeSocket(session.access_token);
          await loadUserProfile(session.user.id);
        } else {
          setUser(null);
          socket?.disconnect();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const initializeSocket = (token) => {
    const newSocket = io(import.meta.env.VITE_SERVER_URL, {
      auth: { token }
    });

    newSocket.on('connect', () => {
      console.log('Connected to server');
      newSocket.emit('join-rooms');
    });

    newSocket.on('new-message', (message) => {
      setMessages(prev => [...prev, message]);
    });

    newSocket.on('room-created', (room) => {
      setRooms(prev => [...prev, room]);
    });

    setSocket(newSocket);
  };

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUser(user);
      const { data: { session } } = await supabase.auth.getSession();
      if (session) initializeSocket(session.access_token);
    }
  };

  const loadUserProfile = async (userId) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!profile) {
      // Создать профиль при первом входе
      const username = `user_${Math.random().toString(36).substr(2, 9)}`;
      await supabase.from('profiles').insert({
        id: userId,
        username,
        display_name: username
      });
    }
  };

  const handleSignIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) alert(error.message);
    else setIsAuthModalOpen(false);
  };

  const handleSignUp = async (email, password, username) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username }
      }
    });
    
    if (error) {
      alert(error.message);
    } else {
      // Профиль создается автоматически через триггер
      setIsAuthModalOpen(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    socket?.disconnect();
  };

  const sendMessage = () => {
    if (!newMessage.trim() || !currentRoom || !socket) return;

    socket.emit('send-message', {
      roomId: currentRoom.id,
      content: newMessage.trim()
    });

    setNewMessage('');
  };

  const createRoom = (name) => {
    if (!socket) return;
    
    socket.emit('create-room', {
      name,
      isPrivate: false
    });
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <div className="text-center mb-8">
            <MessageCircle className="w-16 h-16 text-indigo-600 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-gray-900">Local Messenger</h1>
            <p className="text-gray-600 mt-2">Connect with people in your local network</p>
          </div>
          
          <button
            onClick={() => setIsAuthModalOpen(true)}
            className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
          >
            Get Started
          </button>
        </div>

        {isAuthModalOpen && (
          <AuthModal
            mode={authMode}
            onSignIn={handleSignIn}
            onSignUp={handleSignUp}
            onClose={() => setIsAuthModalOpen(false)}
            onSwitchMode={() => setAuthMode(mode => mode === 'signin' ? 'signup' : 'signin')}
          />
        )}
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-gray-100">
      {/* Сайдбар */}
      <div className="w-80 bg-white shadow-lg flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-xl font-semibold">Local Messenger</h2>
          <button
            onClick={handleSignOut}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-4">
            <button
              onClick={() => createRoom(`Room ${rooms.length + 1}`)}
              className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
            >
              Create Room
            </button>
          </div>

          <div className="space-y-2 p-4">
            {rooms.map(room => (
              <div
                key={room.id}
                onClick={() => setCurrentRoom(room)}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  currentRoom?.id === room.id ? 'bg-indigo-100 border-indigo-500 border' : 'hover:bg-gray-50'
                }`}
              >
                <h3 className="font-semibold">{room.name}</h3>
                <p className="text-sm text-gray-600 truncate">{room.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Основной чат */}
      <div className="flex-1 flex flex-col">
        {currentRoom ? (
          <>
            <div className="bg-white shadow-sm p-4 border-b">
              <h2 className="text-xl font-semibold">{currentRoom.name}</h2>
              <p className="text-gray-600">{currentRoom.description}</p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages
                .filter(msg => msg.room_id === currentRoom.id)
                .map(message => (
                  <div key={message.id} className="flex space-x-3">
                    <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                      {message.profiles?.display_name?.charAt(0) || 'U'}
                    </div>
                    <div>
                      <div className="flex items-baseline space-x-2">
                        <span className="font-semibold">
                          {message.profiles?.display_name}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(message.created_at).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-gray-800">{message.content}</p>
                    </div>
                  </div>
                ))}
            </div>

            <div className="bg-white border-t p-4">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:border-indigo-500"
                />
                <button
                  onClick={sendMessage}
                  className="bg-indigo-600 text-white p-2 rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <Users className="w-16 h-16 mx-auto mb-4" />
              <p>Select a room to start chatting</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Компонент модального окна аутентификации
function AuthModal({ mode, onSignIn, onSignUp, onClose, onSwitchMode }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (mode === 'signin') {
      onSignIn(email, password);
    } else {
      onSignUp(email, password, username);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">
            {mode === 'signin' ? 'Sign In' : 'Sign Up'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:border-indigo-500"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full bg-indigo-600 text-white py-3 px-4 rounded-lg font-semibold hover:bg-indigo-700 transition-colors"
          >
            {mode === 'signin' ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            onClick={onSwitchMode}
            className="text-indigo-600 hover:text-indigo-800"
          >
            {mode === 'signin' 
              ? "Don't have an account? Sign up" 
              : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
