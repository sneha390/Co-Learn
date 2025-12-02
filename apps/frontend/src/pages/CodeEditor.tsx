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
  const [, setAuth] = useRecoilState(authAtom);
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

  // Sidebar panel state
  const [activePanel, setActivePanel] = useState<"ai" | "chat" | "info" | null>("ai");

  // Handle Ctrl+Enter to run code
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
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


  // Fetch room data to get chatId
  useEffect(() => {
    const fetchRoomData = async () => {
      if (user.roomId) {
        try {
          const response = await fetch(`http://${IP_ADDRESS}:3000/room/${user.roomId}`);
          if (response.ok) {
            const data = await response.json();
            if (data.room && data.room.chatId) {
              setChatId(data.room.chatId);
            }
          }
        } catch (error) {
          console.error("Error fetching room data:", error);
        }
      }
    };

    fetchRoomData();
  }, [user.roomId, IP_ADDRESS]);

  // WebSocket connection logic
  useEffect(() => {
    if (!socket) {
      navigate("/" + params.roomId);
    }
    else {
      socket.send(JSON.stringify({ type: "requestToGetUsers", userId: user.id }));
      socket.send(JSON.stringify({ type: "requestForAllData" }));
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
  }, []);


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
      };
    }
  }, [code, language, currentButtonState, isLoading, socket, connectedUsers, ioSessions, activeIoSessionId]);

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
    <div className="bg-gray-900 border border-gray-800 rounded-lg shadow-2xl flex flex-col h-full">
      <h2 className="text-xl font-bold text-gray-300 p-3 border-b border-gray-800">
        Test Cases (Input / Output)
      </h2>
      <div className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col">
            <p className="text-xs text-gray-400 mb-1">Input</p>
            <textarea
              value={activeSession.input}
              onChange={handleInputChange}
              placeholder="Enter input..."
              className="bg-gray-800 border border-gray-700 text-white w-full p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs h-32"
            />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-gray-400">Output</p>
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
            <div className="bg-gray-800 border border-gray-700 text-green-400 p-2 rounded-md overflow-y-auto font-mono text-xs min-h-[6rem]">
              {activeSession.output.length > 0 ? (
                activeSession.output.map((line, index) => (
                  <pre key={index} className="whitespace-pre-wrap">
                    {line}
                  </pre>
                ))
              ) : (
                <p className="text-gray-500">No output yet.</p>
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
        <div className="bg-gray-900 border border-gray-800 rounded-lg shadow-2xl flex flex-col h-full">
          <h2 className="text-xl font-bold text-gray-300 p-3 border-b border-gray-800 flex items-center gap-2">
            <FiBox /> AI Assistant
          </h2>
          <div className="flex-grow p-4 overflow-y-auto space-y-4">
            {aiMessages.length > 0 ? (
              aiMessages.map((msg, index) => (
                <div key={index} className={`flex items-start gap-3 ${msg.sender === 'user' ? 'justify-end' : ''}`}>
                  {msg.sender === 'ai' && <div className="w-8 h-8 rounded-full bg-blue-500 flex-shrink-0 flex items-center justify-center font-bold">A</div>}
                  <div className={`max-w-xs md:max-w-md lg:max-w-sm rounded-lg px-4 py-2 ${msg.sender === 'user' ? 'bg-gray-700' : 'bg-gray-800'}`}>
                    <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center mt-4">Ask the AI for a hint or to explain a concept!</p>
            )}
            {isAiLoading && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500 flex-shrink-0 flex items-center justify-center font-bold">A</div>
                <div className="max-w-xs md:max-w-md lg:max-w-sm rounded-lg px-4 py-2 bg-gray-800">
                  <AiOutlineLoading3Quarters className="animate-spin text-gray-400" />
                </div>
              </div>
            )}
            <div ref={aiChatEndRef} />
          </div>
          <form onSubmit={handleAiSubmit} className="p-3 border-t border-gray-800 flex gap-2">
            <input
              type="text"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder="Chat with the AI..."
              className="bg-gray-800 border border-gray-700 text-white w-full p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              disabled={isAiLoading}
            />
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-md disabled:opacity-50" disabled={isAiLoading || !aiInput.trim()}>
              <AiOutlineSend size={20} />
            </button>
          </form>
        </div>
      );
    }

    if (activePanel === "chat") {
      return (
        <div className="bg-gray-900 border border-gray-800 rounded-lg shadow-2xl flex flex-col h-full">
          <h2 className="text-xl font-bold text-gray-300 p-3 border-b border-gray-800 flex items-center gap-2">
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
              <div className="flex-1 flex items-center justify-center text-gray-500 text-sm px-4">
                Chat is unavailable until the room is fully initialized.
              </div>
            )}
          </div>
        </div>
      );
    }

    if (activePanel === "info") {
      return (
        <div className="bg-gray-900 border border-gray-800 rounded-lg shadow-2xl flex flex-col h-full">
          <h2 className="text-xl font-bold text-gray-300 p-3 border-b border-gray-800 flex items-center gap-2">
            <FiUsers /> Members & Room
          </h2>
          <div className="p-4 flex-1 flex flex-col gap-4 overflow-y-auto">
            <div>
              <h3 className="text-sm font-semibold text-gray-200 mb-2 flex items-center gap-2">
                <FiUsers /> Members
              </h3>
              <div className="space-y-3">
                {connectedUsers.length > 0 ? (
                  connectedUsers.map((u: any) => (
                    <div key={u.id} className="flex items-center gap-3 bg-gray-800 rounded-lg p-3">
                      <div className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center text-lg font-bold">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-200">{u.name}</p>
                        <p className="text-xs text-gray-400 truncate">{u.id}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-sm text-center">No other users connected.</p>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-200 mb-2 flex items-center gap-2">
                <FiHash /> Invite Code
              </h3>
              <p className="text-gray-400 text-xs mb-1">Share this room code with your teammates</p>
              <div className="flex items-center gap-2">
                <p className="text-green-400 font-mono bg-gray-800 p-2 rounded select-all w-full truncate">{user.roomId || '...'}</p>
                <button onClick={handleCopy} className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-md">
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
    const aiSubmission = {
      userQuery: currentAiInput,
      language: language,
      code: code,
      input: activeSession.input,
      output: activeSession.output.join('\n') // Send joined output
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
        className="mt-3 bg-gray-900 border border-gray-800 rounded-lg shadow-2xl flex flex-col"
        style={{ height: isIoCollapsed ? 40 : ioPanelHeight }}
      >
        <div
          className="flex items-center justify-between px-4 py-2 border-b border-gray-800 cursor-row-resize select-none"
          onMouseDown={startIoResizeDrag}
        >
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-gray-200">Test Cases (Input / Output)</h3>
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">
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
              className="text-xs px-2 py-1 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-200"
            >
              {isIoCollapsed ? "Show" : "Hide"}
            </button>
          </div>
        </div>
        {!isIoCollapsed && (
          <div className="flex-1 p-3 flex flex-col gap-3 overflow-hidden">
            <div className="flex gap-3 h-full">
              <div className="w-1/2 flex flex-col h-full">
                <p className="text-xs text-gray-400 mb-1">Input</p>
                <textarea
                  value={activeSession.input}
                  onChange={handleInputChange}
                  placeholder="Enter input..."
                  className="bg-gray-800 border border-gray-700 text-white w-full p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs flex-1 resize-none"
                />
              </div>
              <div className="w-1/2 flex flex-col h-full">
                <p className="text-xs text-gray-400 mb-1">Output</p>
                <div className="bg-gray-800 border border-gray-700 text-green-400 p-2 rounded-md overflow-y-auto font-mono text-xs flex-1">
                  {activeSession.output.length > 0 ? (
                    activeSession.output.map((line, index) => (
                      <pre key={index} className="whitespace-pre-wrap">
                        {line}
                      </pre>
                    ))
                  ) : (
                    <p className="text-gray-500">No output yet.</p>
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
    <div className={`min-h-screen font-sans ${isDark ? "bg-black text-gray-300" : "bg-white text-gray-900"}`}>
      <Sidebar
        showRooms
        onOpenAccount={() => setIsAccountOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      <div className={`flex flex-col h-[calc(100vh-2rem)] gap-4 p-4 ${isSidebarOpen ? "lg:ml-64" : ""}`}>
        <nav className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen((v) => !v)}
              className="hidden lg:inline-flex items-center justify-center w-9 h-9 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700"
            >
              {isSidebarOpen ? <FiChevronsLeft size={18} /> : <FiChevronsRight size={18} />}
            </button>
            <span className="text-2xl font-bold text-white">CoLearn Live</span>
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded-full">Room {user.roomId || "..."}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handlePanelToggle("ai")}
              className={`px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition ${activePanel === 'ai' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
            >
              <FiBox /> AI Tutor
            </button>
            <button
              onClick={() => handlePanelToggle("chat")}
              className={`px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition ${activePanel === 'chat' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
            >
              <FiMessageCircle /> Chat
            </button>
            <button
              onClick={() => handlePanelToggle("info")}
              className={`px-3 py-2 rounded-md text-sm font-medium flex items-center gap-2 transition ${activePanel === 'info' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
            >
              <FiUsers /> Members & Room
            </button>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="bg-gray-800 border border-gray-700 text-white px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
              className={`bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-md shadow-lg transition-all flex items-center justify-center gap-2 ${isLoading ? 'opacity-60 cursor-not-allowed' : 'hover:scale-105'}`}
              disabled={isLoading}
            >
              {isLoading && <AiOutlineLoading3Quarters className="animate-spin" />}
              <span>{currentButtonState}</span>
            </button>
            <button
              onClick={handleLogout}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm"
            >
              Logout
            </button>
          </div>
        </nav>

        <div className="flex flex-1 gap-4 overflow-hidden flex-col lg:flex-row">
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 border border-gray-800 rounded-lg overflow-hidden shadow-2xl">
              <MonacoEditor
                value={code}
                language={language}
                theme="vs-dark"
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

