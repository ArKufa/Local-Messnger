import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';

function App() {
  const [socket, setSocket] = useState(null);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);

  useEffect(() => {
    const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
    const newSocket = io(serverUrl);
    
    newSocket.on('connect', () => {
      console.log('Connected to server');
    });

    newSocket.on('connected', (data) => {
      console.log('Server welcome:', data);
    });

    newSocket.on('new-message', (msg) => {
      setMessages(prev => [...prev, msg]);
    });

    newSocket.on('rooms-list', (roomList) => {
      setRooms(roomList);
    });

    newSocket.on('room-created', (room) => {
      setRooms(prev => [...prev, room]);
      setCurrentRoom(room);
    });

    setSocket(newSocket);

    return () => newSocket.close();
  }, []);

  const createRoom = () => {
    const roomName = prompt('Enter room name:');
    if (roomName && socket) {
      socket.emit('create-room', { name: roomName });
    }
  };

  const sendMessage = () => {
    if (message.trim() && socket && currentRoom) {
      socket.emit('send-message', {
        roomId: currentRoom.id,
        content: message.trim()
      });
      setMessage('');
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial' }}>
      <h1>Local Messenger Test</h1>
      
      <div style={{ display: 'flex', gap: '20px' }}>
        {/* Сайдбар комнат */}
        <div style={{ width: '300px' }}>
          <button onClick={createRoom} style={{ marginBottom: '10px' }}>
            Create Room
          </button>
          <div>
            {rooms.map(room => (
              <div 
                key={room.id} 
                onClick={() => setCurrentRoom(room)}
                style={{ 
                  padding: '10px', 
                  border: '1px solid #ccc', 
                  marginBottom: '5px',
                  cursor: 'pointer',
                  backgroundColor: currentRoom?.id === room.id ? '#e3f2fd' : 'white'
                }}
              >
                {room.name} ({room.usersCount} users)
              </div>
            ))}
          </div>
        </div>

        {/* Область чата */}
        <div style={{ flex: 1 }}>
          {currentRoom ? (
            <>
              <h2>{currentRoom.name}</h2>
              <div style={{ height: '400px', border: '1px solid #ccc', overflowY: 'scroll', padding: '10px' }}>
                {messages
                  .filter(msg => msg.roomId === currentRoom.id)
                  .map(msg => (
                    <div key={msg.id} style={{ marginBottom: '10px' }}>
                      <strong>{msg.user.display_name}:</strong> {msg.content}
                      <div style={{ fontSize: '12px', color: '#666' }}>
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
              </div>
              <div style={{ display: 'flex', marginTop: '10px' }}>
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="Type a message..."
                  style={{ flex: 1, padding: '10px' }}
                />
                <button onClick={sendMessage}>Send</button>
              </div>
            </>
          ) : (
            <p>Select or create a room to start chatting</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
