import React, { useState, useEffect, useRef } from "react";
import MonacoEditor from '@monaco-editor/react';
import { userAtom } from "../atoms/userAtom";
import { authAtom } from "../atoms/authAtom";
import { useRecoilState, useRecoilValue } from "recoil";
import { AiOutlineLoading3Quarters, AiOutlineSend, AiOutlineCopy, AiOutlineCheck } from "react-icons/ai"; // Import icons
import { FiMessageCircle, FiUsers, FiHash, FiBox, FiChevronsLeft, FiChevronsRight } from "react-icons/fi";
import { socketAtom } from "../atoms/socketAtom";
import { useNavigate, useParams } from "react-router-dom";
import { connectedUsersAtom } from "../atoms/connectedUsersAtom";
import { IP_ADDRESS } from "../Globle";
import Chat from "../components/Chat";
import Sidebar from "../components/Sidebar";
import AccountModal from "../components/AccountModal";
import SettingsModal from "../components/SettingsModal";
import { themeAtom } from "../atoms/themeAtom";
import { sidebarOpenAtom } from "../atoms/sidebarAtom";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// AI Message type
type AiMessage = {
  sender: 'user' | 'ai';
  text: string;
};

// Type for an Input/Output session
type IOSession = {
  id: number;
  input: string;
  output: string[];
};

const CodeEditor: React.FC = () => {
  const [code, setCode] = useState<any>("// Write your code here...");
  const [language, setLanguage] = useState("javascript");
  const [socket, setSocket] = useRecoilState<WebSocket | null>(socketAtom);
  const [isLoading, setIsLoading] = useState(false); // Loading state for code submission
  const [currentButtonState, setCurrentButtonState] = useState("Run Code");
  const [user, setUser] = useRecoilState(userAtom);
  const [auth, setAuth] = useRecoilState(authAtom);
  const navigate = useNavigate();
  const [isCopied, setIsCopied] = useState(false);
  const theme = useRecoilValue(themeAtom);
  const isDark = theme === "dark";
  const [isSidebarOpen, setIsSidebarOpen] = useRecoilState(sidebarOpenAtom);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // --- I/O Tabs State ---
  const [ioSessions, setIoSessions] = useState<IOSession[]>([{ id: 1, input: "", output: [] }]);
  const [activeIoSessionId, setActiveIoSessionId] = useState<number>(1);
  const activeSession = ioSessions.find(s => s.id === activeIoSessionId) || ioSessions[0];

  // I/O panel layout & behavior
  const [isIoCollapsed, setIsIoCollapsed] = useState(false);
  const [ioPanelHeight, setIoPanelHeight] = useState(200);
  const ioDragInfoRef = useRef<{ startY: number; startHeight: number } | null>(null);


  // AI Assistant State
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const aiChatEndRef = useRef<HTMLDivElement>(null);


  // multiplayer state
  const [connectedUsers, setConnectedUsers] = useRecoilState<any[]>(connectedUsersAtom);
  const params = useParams();

  // Chat state
  const [chatId, setChatId] = useState<string>("");

  // Learning room metadata (if this room has been upgraded to a module)
  const [isLearningRoom, setIsLearningRoom] = useState<boolean>(false);
  const [learningModuleId, setLearningModuleId] = useState<string | null>(null);

  // Sidebar panel state
  const [activePanel, setActivePanel] = useState<"ai" | "chat" | "info" | null>("ai");

  // Handle Ctrl+Enter or Ctrl+' to run code
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && (event.key === 'Enter' || event.key === "'")) {
        event.preventDefault();
        if (!isLoading) {
          handleSubmit();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isLoading, code, activeSession]); // Rerun if dependencies change


  // Fetch room data to get chatId and load room data
  useEffect(() => {
    const effectiveRoomId = user.roomId || params.roomId;
    if (!effectiveRoomId) return;

    const fetchRoomData = async () => {
      try {
        // Get room info for chatId and learning metadata
        const roomResponse = await fetch(`http://${IP_ADDRESS}:3000/room/${effectiveRoomId}`);
        if (roomResponse.ok) {
          const roomData = await roomResponse.json();
          if (roomData.room && roomData.room.chatId) {
            setChatId(roomData.room.chatId);
          }
          if (roomData.room) {
            setIsLearningRoom(!!roomData.room.isLearningRoom);
            setLearningModuleId(roomData.room.moduleId || null);
          }
        }

        // Get all room data (code, language, AI messages)
        // Load from database if WebSocket hasn't synced yet (initial page load)
        const dataResponse = await fetch(`http://${IP_ADDRESS}:3000/room/${effectiveRoomId}/data`);
        if (dataResponse.ok) {
          const data = await dataResponse.json();
          
          // Load code and language from database (will be overridden by WebSocket sync if connected)
          if (data.code !== undefined) {
            setCode(data.code);
          }
          if (data.language) {
            setLanguage(data.language);
          }
          
          // Always load AI messages from database (they're not synced via WebSocket)
          if (data.aiMessages && Array.isArray(data.aiMessages)) {
            setAiMessages(data.aiMessages);
          }
        }
      } catch (error) {
        console.error("Error fetching room data:", error);
      }
    };

    fetchRoomData();
  }, [user.roomId, params.roomId, IP_ADDRESS]);

  // WebSocket connection logic
  useEffect(() => {
    const effectiveRoomId = user.roomId || params.roomId;
    
    // If no socket but we have a roomId in URL, create a socket here.
    // This prevents "Back to editor" from bouncing to the landing page.
    if ((!socket || socket.readyState === WebSocket.CLOSED) && effectiveRoomId) {
      const authUser = auth.user || (() => {
        try {
          const stored = localStorage.getItem("user");
          return stored ? JSON.parse(stored) : null;
        } catch {
          return null;
        }
      })();

      const userIdForWs = user.id || authUser?.id;
      const userNameForWs = user.name || authUser?.name || "User";

      if (userIdForWs) {
        // Ensure user atom has the roomId so downstream code uses it consistently
        if (!user.roomId && params.roomId) {
          setUser((prev) => ({ ...prev, roomId: params.roomId as string }));
        }

        const ws = new WebSocket(
          `ws://${IP_ADDRESS}:5000?roomId=${effectiveRoomId}&id=${userIdForWs}&name=${encodeURIComponent(
            userNameForWs
          )}`
        );
        
        ws.onopen = () => {
          // Once connected, request initial data
          if (user.id) {
            ws.send(JSON.stringify({ type: "requestToGetUsers", userId: user.id }));
            ws.send(JSON.stringify({ type: "requestForAllData" }));
          }
        };
        
        ws.onclose = () => {
          console.log("Connection closed");
          setUser({ id: "", name: "", roomId: "" });
          setSocket(null);
        };
        
        setSocket(ws);
        return;
      }
    }
    
    // If we have a socket but user.roomId doesn't match params.roomId, we need to reconnect
    if (socket && params.roomId && user.roomId !== params.roomId) {
      // Close existing socket and redirect to join the new room
      if (socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      setSocket(null);
      return;
    }
    
    // Only send messages if socket is OPEN (not CONNECTING or CLOSED)
    if (socket && socket.readyState === WebSocket.OPEN) {
      if (user.id) {
        socket.send(JSON.stringify({ type: "requestToGetUsers", userId: user.id }));
        socket.send(JSON.stringify({ type: "requestForAllData" }));
      }
      socket.onclose = () => {
        console.log("Connection closed");
        setUser({ id: "", name: "", roomId: "" });
        setSocket(null);
      }
    }
    
    return () => {
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
    };
  }, [socket, params.roomId, user.roomId, user.id, auth.user, setSocket, setUser]);


  useEffect(() => {
    if (socket) {
      socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "users") setConnectedUsers(data.users);
        if (data.type === "code") setCode(data.code);
        if (data.type === "language") setLanguage(data.language);
        if (data.type === "submitBtnStatus") {
          setCurrentButtonState(data.value);
          setIsLoading(data.isLoading);
        }
        // ... other message types

        // Handle I/O session updates
        if (data.type === "ioSessions") setIoSessions(data.sessions);
        if (data.type === "activeIoSession") setActiveIoSessionId(data.sessionId);
        if (data.type === "output") {
          console.log(data)
          setIoSessions(prev => prev.map(s => s.id === data.sessionId ? { ...s, output: [...s.output, data.message] } : s));
          handleButtonStatus("Run Code", false);
        }

        if (data.type === "requestForAllData" && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: "allData",
            code,
            language,
            currentButtonState,
            isLoading,
            ioSessions,
            activeIoSessionId,
            userId: data.userId
          }));
        }

        if (data.type === "allData") {
          setCode(data.code);
          setLanguage(data.language);
          setCurrentButtonState(data.currentButtonState);
          setIsLoading(data.isLoading);
          setIoSessions(data.ioSessions || [{ id: 1, input: "", output: [] }]); // fallback for older clients
          setActiveIoSessionId(data.activeIoSessionId || 1);
        }

        // When a learning module is started by someone, move everyone to the
        // learning room view for this room.
        if (data.type === "enterLearningModule") {
          const effectiveRoomId = user.roomId || params.roomId;
          if (effectiveRoomId) {
            navigate(`/learn/${effectiveRoomId}`);
          }
        }
      };
    }
  }, [code, language, currentButtonState, isLoading, socket, connectedUsers, ioSessions, activeIoSessionId, user.roomId, params.roomId, navigate]);

  useEffect(() => {
    aiChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages]);

  const startIoResizeDrag = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isIoCollapsed) return;
    ioDragInfoRef.current = {
      startY: event.clientY,
      startHeight: ioPanelHeight,
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!ioDragInfoRef.current) return;
      const delta = ioDragInfoRef.current.startY - e.clientY;
      let newHeight = ioDragInfoRef.current.startHeight + delta;
      newHeight = Math.max(120, Math.min(newHeight, 400));
      setIoPanelHeight(newHeight);
    };

    const handleMouseUp = () => {
      ioDragInfoRef.current = null;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };


  const handleSubmit = async () => {
    handleButtonStatus("Submitting...", true);
    // Clear output for the current tab only
    setIoSessions(prev => prev.map(s => s.id === activeIoSessionId ? { ...s, output: [] } : s));

    const submission = {
      code,
      language,
      roomId: user.roomId,
      input: activeSession.input,
      sessionId: activeIoSessionId // Send session ID with submission
    };

    try {
      const res = await fetch(`http://${IP_ADDRESS}:3000/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submission),
      });

      handleButtonStatus("Compiling...", true);

      if (!res.ok) {
        setIoSessions(prev => prev.map(s => s.id === activeIoSessionId ? { ...s, output: [...s.output, "Error submitting code. Please try again."] } : s));
        handleButtonStatus("Run Code", false);
      }
    } catch (error) {
      console.error("Submission failed:", error);
      setIoSessions(prev => prev.map(s => s.id === activeIoSessionId ? { ...s, output: [...s.output, "Failed to connect to the execution server."] } : s));
      handleButtonStatus("Run Code", false);
    }
  };

  const handlePanelToggle = (panel: "ai" | "chat" | "info") => {
    setActivePanel(prev => (prev === panel ? null : panel));
  };

  const renderIoPanelRight = () => (
    <div className={`${isDark ? "bg-gray-900 border-gray-800" : "bg-blue-50 border-blue-200"} border-2 rounded-lg shadow-2xl flex flex-col h-full transition-all duration-200`}>
      <h2 className={`text-xl font-bold p-3 border-b ${isDark ? "text-gray-300 border-gray-800" : "text-gray-900 border-blue-200 bg-blue-100/50"}`}>
        Test Cases (Input / Output)
      </h2>
      <div className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col">
            <p className={`text-xs mb-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}>Input</p>
            <textarea
              value={activeSession.input}
              onChange={handleInputChange}
              placeholder="Enter input..."
              className={`${isDark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500" : "bg-white border-gray-300 text-gray-900 placeholder-gray-500 hover:border-blue-400"} border w-full p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs h-32 transition`}
            />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>Output</p>
              <button
                onClick={() =>
                  setIoSessions((prev) =>
                    prev.map((s) =>
                      s.id === activeIoSessionId ? { ...s, output: [] } : s
                    )
                  )
                }
                className="text-red-500 hover:text-red-400 text-xs"
              >
                Clear
              </button>
            </div>
            <div className={`${isDark ? "bg-gray-800 border-gray-700" : "bg-gray-100 border-gray-300"} border text-green-600 p-2 rounded-md overflow-y-auto font-mono text-xs min-h-[6rem] transition`}>
              {activeSession.output.length > 0 ? (
                activeSession.output.map((line, index) => (
                  <pre key={index} className="whitespace-pre-wrap">
                    {line}
                  </pre>
                ))
              ) : (
                <p className={isDark ? "text-gray-500" : "text-gray-600"}>No output yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderPanelContent = () => {
    if (!activePanel) {
      return renderIoPanelRight();
    }

    if (activePanel === "ai") {
      return (
        <div className={`${isDark ? "bg-gray-900 border-gray-800" : "bg-blue-50 border-blue-200 shadow-xl"} border-2 rounded-lg flex flex-col h-full transition-all duration-200`}>
          <h2 className={`text-xl font-bold p-3 border-b flex items-center gap-2 ${isDark ? "text-gray-300 border-gray-800" : "text-gray-900 border-blue-200 bg-blue-100/50"}`}>
            <FiBox /> AI Assistant
          </h2>
          <div className="flex-grow p-4 overflow-y-auto space-y-4">
            {aiMessages.length > 0 ? (
              aiMessages.map((msg, index) => (
                <div key={index} className={`flex items-start gap-3 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
                  {msg.sender === 'ai' && <div className="w-8 h-8 rounded-full bg-blue-500 flex-shrink-0 flex items-center justify-center font-bold text-white">A</div>}
                  <div className={`max-w-xs md:max-w-md lg:max-w-sm rounded-2xl px-4 py-2.5 shadow-sm transition-all ${msg.sender === 'user' ? (isDark ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-blue-500 text-white rounded-tr-sm border border-blue-600') : (isDark ? 'bg-gray-800' : 'bg-white border border-gray-300')} ${msg.sender === 'user' ? (isDark ? 'text-white' : 'text-white') : (isDark ? 'text-gray-300' : 'text-gray-800')}`}>
                    {msg.sender === 'ai' ? (
                      <div className={`text-sm prose ${isDark ? "prose-invert" : ""} prose-sm max-w-none`}>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            code: ({ node, inline, className, children, ...props }: any) => {
                              const match = /language-(\w+)/.exec(className || '');
                              return !inline && match ? (
                                <pre className={`${isDark ? "bg-gray-900" : "bg-gray-200"} rounded p-2 overflow-x-auto my-2`}>
                                  <code className={className} {...props}>
                                    {children}
                                  </code>
                                </pre>
                              ) : (
                                <code className={`${isDark ? "bg-gray-900" : "bg-gray-200"} px-1 py-0.5 rounded text-xs`} {...props}>
                                  {children}
                                </code>
                              );
                            },
                            p: ({ children }: any) => <p className="mb-2 last:mb-0">{children}</p>,
                            ul: ({ children }: any) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                            ol: ({ children }: any) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                            li: ({ children }: any) => <li className="text-sm">{children}</li>,
                            h1: ({ children }: any) => <h1 className="text-lg font-bold mb-2">{children}</h1>,
                            h2: ({ children }: any) => <h2 className="text-base font-bold mb-2">{children}</h2>,
                            h3: ({ children }: any) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
                            strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
                            em: ({ children }: any) => <em className="italic">{children}</em>,
                            blockquote: ({ children }: any) => <blockquote className={`border-l-4 ${isDark ? "border-gray-600" : "border-gray-400"} pl-3 italic my-2`}>{children}</blockquote>,
                          }}
                        >
                          {msg.text}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className={`text-center mt-4 ${isDark ? "text-gray-500" : "text-gray-600"}`}>Ask the AI for a hint or to explain a concept!</p>
            )}
            {isAiLoading && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500 flex-shrink-0 flex items-center justify-center font-bold text-white">A</div>
                <div className={`max-w-xs md:max-w-md lg:max-w-sm rounded-lg px-4 py-2 ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
                  <AiOutlineLoading3Quarters className={`animate-spin ${isDark ? "text-gray-400" : "text-gray-600"}`} />
                </div>
              </div>
            )}
            <div ref={aiChatEndRef} />
          </div>
          <form onSubmit={handleAiSubmit} className={`p-3 border-t flex gap-2 ${isDark ? "border-gray-800" : "border-blue-200 bg-blue-50/30"}`}>
            <input
              type="text"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder="Chat with the AI..."
              className={`${isDark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500" : "bg-white border-gray-300 text-gray-900 placeholder-gray-500 hover:border-blue-400"} border w-full p-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition`}
              disabled={isAiLoading}
            />
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white p-2.5 rounded-lg disabled:opacity-50 transition-all shadow-md hover:shadow-lg transform hover:scale-105 active:scale-95" disabled={isAiLoading || !aiInput.trim()}>
              <AiOutlineSend size={20} />
            </button>
          </form>
        </div>
      );
    }

    if (activePanel === "chat") {
      return (
        <div className={`${isDark ? "bg-gray-900 border-gray-800" : "bg-blue-50 border-blue-200 shadow-xl"} border-2 rounded-lg flex flex-col h-full transition-all duration-200`}>
          <h2 className={`text-xl font-bold p-3 border-b flex items-center gap-2 ${isDark ? "text-gray-300 border-gray-800" : "text-gray-900 border-blue-200 bg-blue-100/50"}`}>
            <FiMessageCircle /> Room Chat
          </h2>
          <div className="flex-1">
            {chatId ? (
              <Chat
                socket={socket}
                chatId={chatId}
                userId={user.id}
                userName={user.name}
                IP_ADDRESS={IP_ADDRESS}
              />
            ) : (
              <div className={`flex-1 flex items-center justify-center text-sm px-4 ${isDark ? "text-gray-500" : "text-gray-600 bg-gray-50"}`}>
                Chat is unavailable until the room is fully initialized.
              </div>
            )}
          </div>
        </div>
      );
    }

    if (activePanel === "info") {
      return (
        <div className={`${isDark ? "bg-gray-900 border-gray-800" : "bg-blue-50 border-blue-200 shadow-xl"} border-2 rounded-lg flex flex-col h-full transition-all duration-200`}>
          <h2 className={`text-xl font-bold p-3 border-b flex items-center gap-2 ${isDark ? "text-gray-300 border-gray-800" : "text-gray-900 border-blue-200 bg-blue-100/50"}`}>
            <FiUsers /> Members & Room
          </h2>
          <div className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto">
            <div>
              <h3 className={`text-sm font-semibold mb-2 flex items-center gap-2 ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                <FiUsers /> Members
              </h3>
              <div className="space-y-3">
                {connectedUsers.length > 0 ? (
                  connectedUsers.map((u: any) => (
                    <div key={u.id} className={`flex items-center gap-3 rounded-lg p-3 border ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-300 shadow-sm"}`}>
                      <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center text-lg font-bold">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className={`text-sm font-semibold ${isDark ? "text-gray-200" : "text-gray-800"}`}>{u.name}</p>
                        <p className={`text-xs truncate ${isDark ? "text-gray-400" : "text-gray-600"}`}>{u.id}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className={`text-sm text-center ${isDark ? "text-gray-500" : "text-gray-600"}`}>No other users connected.</p>
                )}
              </div>
            </div>
            <div>
              <h3 className={`text-sm font-semibold mb-2 flex items-center gap-2 ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                <FiHash /> Invite Code
              </h3>
              <p className={`text-xs mb-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}>Share this room code with your teammates</p>
              <div className="flex items-center gap-2">
                <p className={`text-green-600 font-mono ${isDark ? "bg-gray-800" : "bg-white border border-gray-300"} p-2 rounded select-all w-full truncate`}>{user.roomId || '...'}</p>
                <button onClick={handleCopy} className={`${isDark ? "bg-gray-700 hover:bg-gray-600" : "bg-blue-100 hover:bg-blue-200 border border-blue-300 text-blue-700"} p-2 rounded-md transition`}>
                  {isCopied ? <AiOutlineCheck /> : <AiOutlineCopy />}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  const handleAiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim() || isAiLoading) return;

    const userMessage: AiMessage = { sender: 'user', text: aiInput };
    setAiMessages(prev => [...prev, userMessage]);
    const currentAiInput = aiInput;
    setAiInput("");
    setIsAiLoading(true);

    // Prepare the payload for the backend
    const effectiveRoomId = user.roomId || params.roomId;
    const aiSubmission = {
      userQuery: currentAiInput,
      language: language,
      code: code,
      input: activeSession.input,
      output: activeSession.output.join('\n'), // Send joined output
      roomId: effectiveRoomId // Include roomId to save messages
    };

    try {
      const res = await fetch(`http://${IP_ADDRESS}:3000/ai-tutor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aiSubmission),
      });

      if (!res.ok) {
        throw new Error(`Server responded with status: ${res.status}`);
      }

      const { aiResponseText } = await res.json();
      setAiMessages(prev => [...prev, { sender: 'ai', text: aiResponseText || "Sorry, I couldn't generate a response." }]);
    } catch (error) {
      console.error("Error communicating with AI service:", error);
      setAiMessages(prev => [...prev, { sender: 'ai', text: "Error connecting to the AI assistant via the server." }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(user.roomId);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000); // Reset after 2 seconds
  };

  const syncIoSessions = (newSessions: IOSession[]) => {
    setIoSessions(newSessions);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "ioSessions", sessions: newSessions, roomId: user.roomId }));
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const newSessions = ioSessions.map(s => s.id === activeIoSessionId ? { ...s, input: newValue } : s);
    syncIoSessions(newSessions);
  };

  const handleLanguageChange = (value: string) => {
    setLanguage(value);
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "language", language: value, roomId: user.roomId }));
  }

  const handleButtonStatus = (value: string, isLoading: boolean) => {
    setCurrentButtonState(value);
    setIsLoading(isLoading);
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "submitBtnStatus", value, isLoading, roomId: user.roomId }));
  };

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");
    setAuth({
      isAuthenticated: false,
      user: null,
      token: null,
    });
    setUser({ id: "", name: "", roomId: "" });
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
    setSocket(null);
    navigate("/");
  };

  const handleEditorDidMount = (editor: any) => {
    editor.onDidChangeModelContent(() => {
      const currentCode = editor.getValue();
      if (currentCode !== code && socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "code", code: currentCode, roomId: user.roomId }));
      }
    });
  };

  const shouldShowBottomIo = !!activePanel;

  const renderBottomIoPanel = () => {
    if (!shouldShowBottomIo) return null;

    return (
      <div
        className={`mt-3 ${isDark ? "bg-gray-900 border-gray-800" : "bg-blue-50 border-blue-200"} border-2 rounded-lg shadow-2xl flex flex-col transition-all duration-200`}
        style={{ height: isIoCollapsed ? 40 : ioPanelHeight }}
      >
        <div
          className={`flex items-center justify-between px-4 py-2 border-b cursor-row-resize select-none ${isDark ? "border-gray-800" : "border-blue-200 bg-blue-100/50"}`}
          onMouseDown={startIoResizeDrag}
        >
          <div className="flex items-center gap-2">
            <h3 className={`text-sm font-semibold ${isDark ? "text-gray-200" : "text-gray-800"}`}>Test Cases (Input / Output)</h3>
            <span className={`text-[10px] uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-600"}`}>
              Drag to resize
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                setIoSessions((prev) =>
                  prev.map((s) =>
                    s.id === activeIoSessionId ? { ...s, output: [] } : s
                  )
                )
              }
              className="text-red-500 hover:text-red-400 text-xs"
            >
              Clear
            </button>
            <button
              onClick={() => setIsIoCollapsed((v) => !v)}
              className={`text-xs px-2 py-1 rounded-md border transition ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700" : "bg-white hover:bg-blue-50 text-gray-800 border-gray-300"}`}
            >
              {isIoCollapsed ? "Show" : "Hide"}
            </button>
          </div>
        </div>
        {!isIoCollapsed && (
          <div className="flex-1 p-3 flex flex-col gap-3 overflow-hidden">
            <div className="flex gap-3 h-full">
              <div className="w-1/2 flex flex-col h-full">
                <p className={`text-xs mb-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}>Input</p>
                <textarea
                  value={activeSession.input}
                  onChange={handleInputChange}
                  placeholder="Enter input..."
                  className={`${isDark ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500" : "bg-white border-gray-300 text-gray-900 placeholder-gray-500 hover:border-blue-400"} border w-full p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs flex-1 resize-none transition`}
                />
              </div>
              <div className="w-1/2 flex flex-col h-full">
                <p className={`text-xs mb-1 ${isDark ? "text-gray-400" : "text-gray-600"}`}>Output</p>
                <div className={`${isDark ? "bg-gray-800 border-gray-700" : "bg-gray-100 border-gray-300"} border text-green-600 p-2 rounded-md overflow-y-auto font-mono text-xs flex-1 transition`}>
                  {activeSession.output.length > 0 ? (
                    activeSession.output.map((line, index) => (
                      <pre key={index} className="whitespace-pre-wrap">
                        {line}
                      </pre>
                    ))
                  ) : (
                    <p className={isDark ? "text-gray-500" : "text-gray-600"}>No output yet.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`min-h-screen font-sans transition-colors duration-200 ${isDark ? "bg-black text-gray-300" : "bg-gradient-to-br from-gray-50 to-blue-50 text-gray-900"} flex h-screen overflow-hidden`}>      <Sidebar
      showRooms
      onOpenAccount={() => setIsAccountOpen(true)}
      onOpenSettings={() => setIsSettingsOpen(true)}
    />
      <div className={`flex flex-col h-full flex-1 w-full gap-4 p-4 overflow-y-auto`}> 
        <nav className={`${isDark ? "bg-gray-900 border-gray-800" : "bg-blue-50/80 backdrop-blur-sm border-blue-200 shadow-lg"} border rounded-xl px-4 py-3 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between transition-all duration-200`}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen((v) => !v)}
              className={`hidden lg:inline-flex items-center justify-center w-9 h-9 rounded-md border ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700" : "bg-gray-100 hover:bg-gray-200 text-gray-800 border-gray-300"}`}
            >
              {isSidebarOpen ? <FiChevronsLeft size={18} /> : <FiChevronsRight size={18} />}
            </button>
            <span className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>CoLearn Live</span>
            <span className={`text-xs px-2 py-1 rounded-full ${isDark ? "text-gray-500 bg-gray-800" : "text-blue-700 bg-blue-100 border border-blue-200"}`}>Room {user.roomId || "..."}</span>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={() => handlePanelToggle("ai")}
              className={`px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-all duration-200 ${activePanel === 'ai' ? 'bg-blue-600 text-white shadow-md' : (isDark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-white text-gray-700 hover:bg-blue-50 border border-gray-300')} hover:scale-105 active:scale-95`}
            >
              <FiBox /> AI Tutor
            </button>
            <button
              onClick={() => handlePanelToggle("chat")}
              className={`px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-all duration-200 ${activePanel === 'chat' ? 'bg-blue-600 text-white shadow-md' : (isDark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')} hover:scale-105 active:scale-95`}
            >
              <FiMessageCircle /> Chat
            </button>
            <button
              onClick={() => handlePanelToggle("info")}
              className={`px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition-all duration-200 ${activePanel === 'info' ? 'bg-blue-600 text-white shadow-md' : (isDark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')} hover:scale-105 active:scale-95`}
            >
              <FiUsers /> Members & Room
            </button>
            {/* Learning section: Learn button that opens the guided module */}
            <div className="flex flex-col ml-2">
              <button
                onClick={() => {
                  const effectiveRoomId = user.roomId || params.roomId;
                  if (!effectiveRoomId) return;
                  navigate(`/learn/${effectiveRoomId}/choose`);
                }}
                className={`mt-1 px-3 py-1.5 rounded-md text-xs font-medium ${isDark ? "bg-blue-700 text-white hover:bg-blue-600" : "bg-blue-600 text-white hover:bg-blue-700"} transition-all`}
              >
                Learn
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className={`${isDark ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-300 text-gray-900 shadow-sm hover:border-blue-400"} border px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200`}
            >
              <option value="javascript">JavaScript</option>
              <option value="python">Python</option>
              <option value="cpp">C++</option>
              <option value="java">Java</option>
              <option value="rust">Rust</option>
              <option value="go">Go</option>
            </select>
            <button
              onClick={handleSubmit}
              className={`bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-md shadow-lg transition-all flex items-center justify-center gap-2 ${isLoading ? 'opacity-60 cursor-not-allowed' : 'hover:scale-105 active:scale-95'} duration-200`}
              disabled={isLoading}
            >
              {isLoading && <AiOutlineLoading3Quarters className="animate-spin" />}
              <span>{currentButtonState}</span>
            </button>
            <button
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm transition-all duration-200 hover:scale-105 active:scale-95 shadow-md"
            >
              Logout
            </button>
          </div>
        </nav>

        <div className="flex flex-1 gap-4 overflow-hidden flex-col lg:flex-row">
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className={`flex-1 border ${isDark ? "border-gray-800" : "border-gray-300 bg-gray-50"} rounded-lg overflow-hidden shadow-2xl transition-all duration-200`}>
              <MonacoEditor
                value={code}
                language={language}
                theme={isDark ? "vs-dark" : "vs"}
                onMount={handleEditorDidMount}
                onChange={(value) => setCode(value)}
                options={{ minimap: { enabled: false }, fontSize: 14 }}
              />
            </div>
            {renderBottomIoPanel()}
          </div>

          <div className={`flex flex-col lg:w-1/3 flex-1 lg:flex-initial`}>
            {renderPanelContent()}
          </div>
        </div>
      </div>
      <AccountModal
        isOpen={isAccountOpen}
        onClose={() => setIsAccountOpen(false)}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
};

export default CodeEditor;

