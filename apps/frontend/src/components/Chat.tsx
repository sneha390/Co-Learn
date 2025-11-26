import React, { useState, useEffect, useRef } from "react";
import { AiOutlineSend } from "react-icons/ai";

interface ChatMessage {
  userId: string;
  userName: string;
  message: string;
  timestamp: string;
}

interface ChatProps {
  socket: WebSocket | null;
  chatId: string;
  userId: string;
  userName: string;
  IP_ADDRESS: string;
}

const Chat: React.FC<ChatProps> = ({ socket, chatId, userId, userName: _userName, IP_ADDRESS }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load chat history from backend
  useEffect(() => {
    const loadChatHistory = async () => {
      try {
        const response = await fetch(`http://${IP_ADDRESS}:3000/chat/${chatId}?limit=50`);
        if (response.ok) {
          const data = await response.json();
          setMessages(data.messages || []);
        }
      } catch (error) {
        console.error("Error loading chat history:", error);
      }
    };

    if (chatId) {
      loadChatHistory();
    }
  }, [chatId, IP_ADDRESS]);

  // Listen for chat messages from WebSocket
  useEffect(() => {
    if (socket) {
      const handleMessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "chat" && data.chatMessage) {
            setMessages((prev) => [...prev, data.chatMessage]);
            
            // Also save to backend
            fetch(`http://${IP_ADDRESS}:3000/chat/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chatId,
                userId: data.chatMessage.userId,
                userName: data.chatMessage.userName,
                message: data.chatMessage.message,
              }),
            }).catch((error) => {
              console.error("Error saving chat message:", error);
            });
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };

      socket.addEventListener("message", handleMessage);

      return () => {
        socket.removeEventListener("message", handleMessage);
      };
    }
  }, [socket, chatId, IP_ADDRESS]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const message = inputMessage.trim();
    setInputMessage("");

    // Send via WebSocket for real-time broadcasting
    socket.send(
      JSON.stringify({
        type: "chat",
        message: message,
      })
    );
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg shadow-2xl flex flex-col h-full">
      <h2 className="text-xl font-bold text-gray-300 p-3 border-b border-gray-800">Chat</h2>
      <div className="flex-grow p-4 overflow-y-auto space-y-3">
        {messages.length > 0 ? (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`flex items-start gap-3 ${
                msg.userId === userId ? "justify-end" : ""
              }`}
            >
              {msg.userId !== userId && (
                <div className="w-8 h-8 rounded-full bg-green-500 flex-shrink-0 flex items-center justify-center font-bold text-white text-sm">
                  {msg.userName.charAt(0).toUpperCase()}
                </div>
              )}
              <div
                className={`max-w-xs md:max-w-md lg:max-w-sm rounded-lg px-4 py-2 ${
                  msg.userId === userId
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-300"
                }`}
              >
                {msg.userId !== userId && (
                  <p className="text-xs font-semibold mb-1 opacity-80">
                    {msg.userName}
                  </p>
                )}
                <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                <p className="text-xs opacity-60 mt-1">
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              {msg.userId === userId && (
                <div className="w-8 h-8 rounded-full bg-blue-500 flex-shrink-0 flex items-center justify-center font-bold text-white text-sm">
                  {msg.userName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          ))
        ) : (
          <p className="text-gray-500 text-center mt-4">
            No messages yet. Start chatting!
          </p>
        )}
        <div ref={chatEndRef} />
      </div>
      <form onSubmit={handleSendMessage} className="p-3 border-t border-gray-800 flex gap-2">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="Type a message..."
          className="bg-gray-800 border border-gray-700 text-white w-full p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          disabled={!socket || socket.readyState !== WebSocket.OPEN}
        />
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-md disabled:opacity-50"
          disabled={
            !inputMessage.trim() ||
            !socket ||
            socket.readyState !== WebSocket.OPEN
          }
        >
          <AiOutlineSend size={20} />
        </button>
      </form>
    </div>
  );
};

export default Chat;

