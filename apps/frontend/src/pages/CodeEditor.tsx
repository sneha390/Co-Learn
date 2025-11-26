import React, { useState, useEffect, useRef } from "react";
import MonacoEditor from '@monaco-editor/react';
import { userAtom } from "../atoms/userAtom";
import { useRecoilState } from "recoil";
import { AiOutlineLoading3Quarters, AiOutlineSend, AiOutlineCopy, AiOutlineCheck } from "react-icons/ai"; // Import icons
import { socketAtom } from "../atoms/socketAtom";
import { useNavigate, useParams } from "react-router-dom";
import { connectedUsersAtom } from "../atoms/connectedUsersAtom";
import { IP_ADDRESS } from "../Globle";
import Chat from "../components/Chat";

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
  const navigate = useNavigate();
  const [isCopied, setIsCopied] = useState(false);

  // --- I/O Tabs State ---
  const [ioSessions, setIoSessions] = useState<IOSession[]>([{ id: 1, input: "", output: [] }]);
  const [activeIoSessionId, setActiveIoSessionId] = useState<number>(1);
  const activeSession = ioSessions.find(s => s.id === activeIoSessionId) || ioSessions[0];


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

  const handleAddSession = () => {
    const newSessionId = (ioSessions[ioSessions.length - 1]?.id || 0) + 1;
    const newSessions = [...ioSessions, { id: newSessionId, input: "", output: [] }];
    syncIoSessions(newSessions);
    handleSwitchSession(newSessionId);
  };

  const handleSwitchSession = (id: number) => {
    setActiveIoSessionId(id);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "activeIoSession", sessionId: id, roomId: user.roomId }));
    }
  }

  const handleLanguageChange = (value: string) => {
    setLanguage(value);
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "language", language: value, roomId: user.roomId }));
  }

  const handleButtonStatus = (value: string, isLoading: boolean) => {
    setCurrentButtonState(value);
    setIsLoading(isLoading);
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "submitBtnStatus", value, isLoading, roomId: user.roomId }));
  }

  const handleEditorDidMount = (editor: any) => {
    editor.onDidChangeModelContent(() => {
      const currentCode = editor.getValue();
      if (currentCode !== code && socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "code", code: currentCode, roomId: user.roomId }));
      }
    });
  };

  return (
    <div className="min-h-screen bg-black text-gray-300 font-sans p-4">
      <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-2rem)]">

        <div className="flex flex-col w-full lg:w-2/3">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold text-gray-200">Code Together</h1>
            <div className="flex gap-4 items-center">
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
            </div>
          </div>
          <div className="border border-gray-800 rounded-lg overflow-hidden shadow-2xl flex-grow">
            <MonacoEditor
              value={code}
              language={language}
              theme="vs-dark"
              onMount={handleEditorDidMount}
              onChange={(value) => setCode(value)}
              options={{ minimap: { enabled: false }, fontSize: 14 }}
            />
          </div>
        </div>

        <div className="w-full lg:w-1/3 flex flex-col gap-4">
          <div className="flex gap-4 h-1/2">
            <div className="w-1/2 bg-gray-900 border border-gray-800 rounded-lg shadow-2xl flex flex-col">
              <h2 className="text-xl font-bold text-gray-300 p-3 border-b border-gray-800">AI Assistant</h2>
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
            {chatId && (
              <div className="w-1/2">
                <Chat
                  socket={socket}
                  chatId={chatId}
                  userId={user.id}
                  userName={user.name}
                  IP_ADDRESS={IP_ADDRESS}
                />
              </div>
            )}
          </div>

          <div className="flex-grow flex flex-col gap-4 h-1/2">
            <div className="flex gap-4">
              <div className="w-1/2 bg-gray-900 border border-gray-800 p-3 rounded-lg">
                <h2 className="text-lg font-semibold text-gray-400 mb-2">Users</h2>
                <div className="space-y-2 max-h-24 overflow-y-auto">
                  {connectedUsers.length > 0 ? (
                    connectedUsers.map((u: any) => (
                      <div key={u.id} className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">{u.name.charAt(0).toUpperCase()}</div>
                        <span className="text-sm">{u.name}</span>
                      </div>
                    ))
                  ) : <p className="text-gray-500 text-sm">No other users.</p>}
                </div>
              </div>
              <div className="w-1/2 bg-gray-900 border border-gray-800 p-3 rounded-lg">
                <h2 className="text-lg font-semibold text-gray-400 mb-2">Invite Code</h2>
                <div className="flex items-center gap-2">
                  <p className="text-green-400 font-mono bg-gray-800 p-2 rounded select-all w-full truncate">{user.roomId || '...'}</p>
                  <button onClick={handleCopy} className="bg-gray-700 hover:bg-gray-600 text-white p-2 rounded-md">
                    {isCopied ? <AiOutlineCheck /> : <AiOutlineCopy />}
                  </button>
                </div>
              </div>
            </div>

            {/* Input & Output Tabs */}
            <div className="flex-grow flex flex-col bg-gray-900 border border-gray-800 rounded-lg">
              <div className="flex border-b border-gray-800">
                {ioSessions.map(session => (
                  <button
                    key={session.id}
                    onClick={() => handleSwitchSession(session.id)}
                    className={`px-4 py-2 text-sm ${activeIoSessionId === session.id ? 'bg-gray-800 text-white' : 'text-gray-400 hover:bg-gray-800/50'}`}
                  >
                    Tab {session.id}
                  </button>
                ))}
                <button onClick={handleAddSession} className="px-4 py-2 text-sm text-blue-400 hover:bg-gray-800/50">+</button>
              </div>
              <div className="flex-grow flex gap-4 p-3">
                <div className="w-1/2 flex flex-col">
                  <h2 className="text-lg font-semibold text-gray-400 mb-2">Input</h2>
                  <textarea
                    value={activeSession.input}
                    onChange={handleInputChange}
                    placeholder="Enter input..."
                    className="bg-gray-800 border border-gray-700 text-white w-full p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm flex-grow"
                  />
                </div>
                <div className="w-1/2 flex flex-col">
                  <div className="flex justify-between items-center mb-2">
                    <h2 className="text-lg font-semibold text-gray-400">Output</h2>
                    <button onClick={() => setIoSessions(prev => prev.map(s => s.id === activeIoSessionId ? { ...s, output: [] } : s))} className="text-red-500 hover:text-red-400 text-sm">Clear</button>
                  </div>
                  <div className="bg-gray-800 border border-gray-700 text-green-400 p-2 rounded-md flex-grow overflow-y-auto font-mono text-sm">
                    {activeSession.output.length > 0 ? activeSession.output.map((line, index) => <pre key={index} className="whitespace-pre-wrap">{line}</pre>) : <p className="text-gray-500">No output yet.</p>}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default CodeEditor;

