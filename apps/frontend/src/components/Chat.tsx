import React, { useState, useEffect, useRef } from "react";
import { AiOutlineSend } from "react-icons/ai";
import { useRecoilValue } from "recoil";
import { themeAtom } from "../atoms/themeAtom";

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
  const theme = useRecoilValue(themeAtom);
  const isDark = theme === "dark";

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
    <div className={`${isDark ? "bg-gray-900 border-gray-800" : "bg-blue-50 border-blue-200"} border-2 rounded-lg shadow-2xl flex flex-col h-full`}>
      <h2 className={`text-xl font-bold p-4 border-b ${isDark ? "text-gray-300 border-gray-800" : "text-gray-900 border-blue-200 bg-blue-100/50"}`}>Chat</h2>
      <div className="flex-grow p-4 overflow-y-auto space-y-3 scroll-smooth">
        {messages.length > 0 ? (
          messages.map((msg, index) => (
            <div
              key={index}
              className={`flex items-start gap-3 animate-fade-in ${
                msg.userId === userId ? "justify-end flex-row-reverse" : ""
              }`}
            >
              <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-white text-sm shadow-md ${
                msg.userId === userId ? "bg-blue-500" : "bg-green-500"
              }`}>
                {msg.userName.charAt(0).toUpperCase()}
              </div>
              <div className="flex flex-col max-w-xs md:max-w-md lg:max-w-sm">
                {msg.userId !== userId && (
                  <p className={`text-xs font-semibold mb-1 px-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                    {msg.userName}
                  </p>
                )}
                <div
                  className={`rounded-2xl px-4 py-2.5 shadow-sm transition-all border ${
                    msg.userId === userId
                      ? "bg-blue-600 text-white rounded-tr-sm border-blue-700"
                      : isDark ? "bg-gray-800 text-gray-300 rounded-tl-sm border-gray-700" : "bg-white text-gray-800 rounded-tl-sm border-gray-300"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap break-words">{msg.message}</p>
                  <p className={`text-xs mt-1.5 ${msg.userId === userId ? "text-blue-100" : isDark ? "text-gray-500" : "text-gray-500"}`}>
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className={`flex flex-col items-center justify-center h-full ${isDark ? "text-gray-500" : "text-gray-400 bg-gray-50"}`}>
            <svg className="w-16 h-16 mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-center">No messages yet. Start chatting!</p>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>
      <form onSubmit={handleSendMessage} className={`p-3 border-t flex gap-2 ${isDark ? "border-gray-800" : "border-blue-200 bg-blue-50/30"}`}>
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="Type a message..."
          className={`${isDark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500" : "bg-white border-gray-300 text-gray-900 placeholder-gray-500 hover:border-blue-400"} border w-full p-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition`}
          disabled={!socket || socket.readyState !== WebSocket.OPEN}
        />
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white p-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95"
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

