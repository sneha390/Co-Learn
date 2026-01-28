import React, { useEffect, useState, useRef } from "react";
import MonacoEditor from "@monaco-editor/react";
import { useParams, useNavigate } from "react-router-dom";
import { useRecoilState, useRecoilValue } from "recoil";
import { userAtom } from "../atoms/userAtom";
import { authAtom } from "../atoms/authAtom";
import { socketAtom } from "../atoms/socketAtom";
import { connectedUsersAtom } from "../atoms/connectedUsersAtom";
import { themeAtom } from "../atoms/themeAtom";
import { sidebarOpenAtom } from "../atoms/sidebarAtom";
import Sidebar from "../components/Sidebar";
import AccountModal from "../components/AccountModal";
import SettingsModal from "../components/SettingsModal";
import Chat from "../components/Chat";
import { IP_ADDRESS } from "../Globle";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  FiChevronsLeft,
  FiChevronsRight,
  FiMessageCircle,
  FiUsers,
  FiBox,
} from "react-icons/fi";
import { AiOutlineSend, AiOutlineLoading3Quarters } from "react-icons/ai";

type AiMode = "socratic" | "hint" | "review" | "summarizer" | undefined;

type CheckpointType =
  | "predict-output"
  | "fix-code"
  | "write-code"
  | "explain-to-unlock"
  | "reflection";

interface Checkpoint {
  checkpointId: string;
  title: string;
  type: CheckpointType;
  summary: string;
  description: string;
  starterCode?: string;
  readOnlyCode?: boolean;
  expectedOutput?: string;
  requirePeerReview?: boolean;
  aiMode: AiMode;
}

interface LearningModule {
  moduleId: string;
  title: string;
  language: string;
  difficulty: string;
  estimatedTimeMinutes: number;
  checkpoints: Checkpoint[];
}

interface LearningProgressCheckpoint {
  checkpointId: string;
  status: "pending" | "in_progress" | "completed";
  explanationText?: string;
  explanationAccepted?: boolean;
  reflectionText?: string;
}

interface LearningProgress {
  currentCheckpointIndex: number;
  checkpoints: LearningProgressCheckpoint[];
}

type AiMessage = {
  sender: "user" | "ai";
  text: string;
};

type ActivePanel = "chat" | "ai" | "info";

const LearningRoom: React.FC = () => {
  const params = useParams();
  // NOTE: navigate is intentionally not used yet; we keep it around
  // for future flows where learners might jump back to the main room.
  const navigate = useNavigate();
  const [user, setUser] = useRecoilState(userAtom);
  const [auth] = useRecoilState(authAtom);
  const [socket, setSocket] = useRecoilState<WebSocket | null>(socketAtom);
  const [connectedUsers, setConnectedUsers] =
    useRecoilState<any[]>(connectedUsersAtom);
  const [activePanel, setActivePanel] = useState<ActivePanel>("ai");
  const [chatId, setChatId] = useState<string>("");
  const theme = useRecoilValue(themeAtom);
  const isDark = theme === "dark";
  const [isSidebarOpen, setIsSidebarOpen] =
    useRecoilState(sidebarOpenAtom);
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const [module, setModule] = useState<LearningModule | null>(null);
  const [progress, setProgress] = useState<LearningProgress | null>(null);
  const [currentCheckpointIndex, setCurrentCheckpointIndex] =
    useState<number>(0);

  const [code, setCode] = useState<string>("# Python\n# Loading checkpoint...\n");
  const [language, setLanguage] = useState<string>("python");
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [reflection, setReflection] = useState("");
  const [navError, setNavError] = useState<string | null>(null);

  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const aiChatEndRef = useRef<HTMLDivElement>(null);

  const [chatReady, setChatReady] = useState(false);

  const roomIdFromUrl = params.roomId || user.roomId;

  const currentCheckpoint: Checkpoint | undefined =
    module?.checkpoints[currentCheckpointIndex];

  const currentAiMode: AiMode = currentCheckpoint?.aiMode;

  const currentProgressCheckpoint =
    progress?.checkpoints.find(
      (cp) => cp.checkpointId === currentCheckpoint?.checkpointId
    ) || null;

  const canEditCode = !!currentCheckpoint && !currentCheckpoint.readOnlyCode;

  const roomLabel = roomIdFromUrl || "...";

  const isReflectionCheckpoint =
    currentCheckpoint?.type === "reflection";
  const isExplainCheckpoint =
    currentCheckpoint?.type === "explain-to-unlock";

  useEffect(() => {
    aiChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages]);


  // Fetch learning state (module + per-user progress).
  // If the room is not yet a learning room, we automatically attach the
  // default Python "Loops for Beginners" module the first time someone
  // navigates here from the Learn button.
  useEffect(() => {
    const fetchLearningState = async () => {
      if (!auth.token || !roomIdFromUrl) return;
      try {
        let res = await fetch(
          `http://${IP_ADDRESS}:3000/learning/room/${roomIdFromUrl}/state`,
          {
            headers: {
              Authorization: `Bearer ${auth.token}`,
            },
          }
        );

        // If this room has no learning module yet, go to the module picker.
        if (res.status === 404) {
          navigate(`/learn/${roomIdFromUrl}/choose`, { replace: true });
          return;
        }

        if (!res.ok) return;
        const data = await res.json();
        if (data.module) {
          setModule(data.module);
          setLanguage(data.module.language || "python");
        }
        if (data.room?.currentCheckpointIndex != null) {
          setCurrentCheckpointIndex(data.room.currentCheckpointIndex);
        }
        if (data.progress) {
          setProgress({
            currentCheckpointIndex:
              data.progress.currentCheckpointIndex ?? 0,
            checkpoints: data.progress.checkpoints || [],
          });
        }

        // Basic chatId fetch using existing /room endpoint
        const roomRes = await fetch(
          `http://${IP_ADDRESS}:3000/room/${roomIdFromUrl}`
        );
        if (roomRes.ok) {
          const roomData = await roomRes.json();
          if (roomData.room && roomData.room.chatId) {
            setChatId(roomData.room.chatId);
            setChatReady(true);
          }
        }
      } catch (e) {
        console.error("Failed to fetch learning room state", e);
      }
    };
    fetchLearningState();
  }, [auth.token, roomIdFromUrl]);

  // Apply starter code when checkpoint changes
  useEffect(() => {
    if (!currentCheckpoint) return;
    if (currentCheckpoint.starterCode) {
      setCode(currentCheckpoint.starterCode);
    }
  }, [currentCheckpoint?.checkpointId]);

  // Ensure there is a WebSocket connection for this room and
  // wire up basic listeners for users / code sync.
  useEffect(() => {
    const effectiveRoomId = roomIdFromUrl;
    if (!effectiveRoomId) return;

    const authUser: any = (auth as any)?.user;
    const userIdForWs = user.id || authUser?.id;
    const userNameForWs = user.name || authUser?.name || "Learner";

    // If there is no socket yet OR the existing one is closed
    // (e.g. it was created on the CodeEditor page and closed on unmount),
    // create a fresh connection for this learning room.
    if ((!socket || socket.readyState === WebSocket.CLOSED) && userIdForWs) {
      const ws = new WebSocket(
        `ws://${IP_ADDRESS}:5000?roomId=${effectiveRoomId}&id=${userIdForWs}&name=${encodeURIComponent(
          userNameForWs
        )}`
      );
      setSocket(ws);
      // We don't attach handlers here; they'll be attached below once
      // socket state is updated.
      return;
    }

    if (!socket || socket.readyState === WebSocket.CLOSED) return;

    const handleMessage = (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      if (data.type === "users") {
        setConnectedUsers(data.users || []);
      }
      if (data.type === "code") setCode(data.code);
      // In learning room we never override language from WebSocket—it comes from the module (Python).
    };

    socket.addEventListener("message", handleMessage);

    // request current users and typing state
    if (socket.readyState === WebSocket.OPEN && user.id) {
      socket.send(
        JSON.stringify({ type: "requestToGetUsers", userId: user.id })
      );
    } else {
      socket.addEventListener(
        "open",
        () => {
          if (user.id) {
            socket.send(
              JSON.stringify({ type: "requestToGetUsers", userId: user.id })
            );
          }
        },
        { once: true }
      );
    }

    return () => {
      socket.removeEventListener("message", handleMessage);
    };
  }, [socket, roomIdFromUrl, user.id, auth, setSocket, setConnectedUsers]);

  const handleEditorDidMount = (editor: any) => {
    editor.onDidChangeModelContent(() => {
      const currentCode = editor.getValue();
      if (currentCode !== code && socket?.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "code",
            code: currentCode,
            roomId: roomIdFromUrl,
          })
        );
      }
    });
  };

  const handleAiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiInput.trim() || isAiLoading || !currentCheckpoint) return;

    const msg: AiMessage = { sender: "user", text: aiInput };
    setAiMessages((prev) => [...prev, msg]);
    const currentInput = aiInput;
    setAiInput("");
    setIsAiLoading(true);

    const submission = {
      userQuery: currentInput,
      language,
      code,
      input: "",
      output: "",
      roomId: roomIdFromUrl,
      checkpointType: currentCheckpoint.type,
      checkpointTitle: currentCheckpoint.title,
      checkpointDescription: currentCheckpoint.description,
      aiMode: currentCheckpoint.aiMode,
    };

    try {
      const res = await fetch(`http://${IP_ADDRESS}:3000/ai-tutor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submission),
      });
      if (!res.ok) {
        throw new Error(`Server responded with status ${res.status}`);
      }
      const { aiResponseText } = await res.json();
      setAiMessages((prev) => [
        ...prev,
        { sender: "ai", text: aiResponseText || "No response." },
      ]);
    } catch (err) {
      console.error("AI tutor error", err);
      setAiMessages((prev) => [
        ...prev,
        {
          sender: "ai",
          text: "Error connecting to the AI guide. Please try again.",
        },
      ]);
    } finally {
      setIsAiLoading(false);
    }
  };

  // NOTE (iteration choice): We are not using AI evaluation to unlock checkpoints.
  // Users can write explanations/reflections locally and manually move forward
  // using "Mark complete" + "Next".

  const handleAdvanceCheckpoint = async () => {
    if (!roomIdFromUrl) return;
    setIsAdvancing(true);
    setNavError(null);
    try {
      const res = await fetch(
        `http://${IP_ADDRESS}:3000/learning/room/${roomIdFromUrl}/next`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${auth.token}`,
          },
        }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.room?.currentCheckpointIndex != null) {
        const nextIndex = data.room.currentCheckpointIndex;
        setCurrentCheckpointIndex(nextIndex);
        // If the backend returns the same index, surface it so it doesn't feel broken.
        if (nextIndex === currentCheckpointIndex && module) {
          setNavError(
            `Already at the last checkpoint (${currentCheckpointIndex + 1}/${module.checkpoints.length}).`
          );
        }
      } else if (!res.ok && data?.error) {
        setNavError(data.error || "Cannot advance checkpoint.");
        console.warn("Cannot advance checkpoint:", data);
      } else if (!res.ok) {
        setNavError("Cannot advance checkpoint.");
      }
    } catch (e) {
      console.error("Failed to advance checkpoint", e);
      setNavError("Failed to advance checkpoint.");
    } finally {
      setIsAdvancing(false);
    }
  };

  const [isCompletingCheckpoint, setIsCompletingCheckpoint] = useState(false);

  const handleCompleteCheckpoint = async () => {
    if (!roomIdFromUrl || !currentCheckpoint || !auth.token) return;
    setIsCompletingCheckpoint(true);
    try {
      const res = await fetch(
        `http://${IP_ADDRESS}:3000/learning/room/${roomIdFromUrl}/checkpoints/${currentCheckpoint.checkpointId}/complete`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${auth.token}`,
          },
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn("Failed to complete checkpoint:", data);
        return;
      }
      if (data.progress) {
        setProgress({
          currentCheckpointIndex:
            data.progress.currentCheckpointIndex ?? (progress?.currentCheckpointIndex || 0),
          checkpoints: data.progress.checkpoints || [],
        });
      }
    } catch (e) {
      console.error("Failed to complete checkpoint", e);
    } finally {
      setIsCompletingCheckpoint(false);
    }
  };

  const handlePreviousCheckpoint = async () => {
    if (!roomIdFromUrl) return;
    setIsAdvancing(true);
    try {
      const res = await fetch(
        `http://${IP_ADDRESS}:3000/learning/room/${roomIdFromUrl}/previous`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${auth.token}`,
          },
        }
      );
      const data = await res.json();
      if (res.ok && data.room?.currentCheckpointIndex != null) {
        setCurrentCheckpointIndex(data.room.currentCheckpointIndex);
      }
    } catch (e) {
      console.error("Failed to go to previous checkpoint", e);
    } finally {
      setIsAdvancing(false);
    }
  };

  const renderCheckpointList = () => {
    if (!module) return null;
    return (
      <div
        className={`border rounded-lg p-4 h-full overflow-y-auto ${
          isDark ? "bg-gray-900 border-gray-800" : "bg-blue-50 border-blue-200"
        }`}
      >
        <div className="mb-2">
          <h2
            className={`text-lg font-semibold ${
              isDark ? "text-gray-200" : "text-gray-800"
            }`}
          >
            {module.title}
          </h2>
        </div>
        <p
          className={`text-xs mb-4 ${
            isDark ? "text-gray-400" : "text-gray-600"
          }`}
        >
          Language: {module.language} · Difficulty: {module.difficulty} ·
          Est. {module.estimatedTimeMinutes} min
        </p>
        <ul className="space-y-2">
          {module.checkpoints.map((cp, index) => {
            const cpProgress = progress?.checkpoints.find(
              (p) => p.checkpointId === cp.checkpointId
            );
            const isActive = index === currentCheckpointIndex;
            const isPast = index < currentCheckpointIndex;
            const isLocked = index > currentCheckpointIndex;
            return (
              <li
                key={cp.checkpointId}
                className={`flex items-start gap-2 rounded-md p-2 text-sm ${
                  isActive
                    ? isDark
                      ? "bg-blue-900 border border-blue-600"
                      : "bg-blue-100 border border-blue-400"
                    : isPast
                    ? isDark
                      ? "bg-gray-800 border border-gray-700"
                      : "bg-white border border-gray-200"
                    : isDark
                    ? "bg-gray-900 border border-gray-800 opacity-70"
                    : "bg-gray-100 border border-gray-200 opacity-70"
                }`}
              >
                <div className="mt-1">
                  {isPast ? "✅" : isLocked ? "🔒" : "➡️"}
                </div>
                <div>
                  <p
                    className={`font-semibold ${
                      isDark ? "text-gray-200" : "text-gray-800"
                    }`}
                  >
                    {index + 1}. {cp.title}
                  </p>
                  <p
                    className={`text-xs ${
                      isDark ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {cp.summary}
                  </p>
                  {cpProgress && (
                    <p className="text-[10px] mt-1 text-green-400">
                      Status: {cpProgress.status}
                      {cpProgress.explanationAccepted && " · Explanation accepted"}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const renderCenterPanel = () => {
    if (!currentCheckpoint) {
      return (
        <div
          className={`flex-1 flex items-center justify-center rounded-lg border ${
            isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"
          }`}
        >
          <p
            className={isDark ? "text-gray-400" : "text-gray-600"}
          >
            Loading checkpoint...
          </p>
        </div>
      );
    }

        const isNextDisabled = isAdvancing;
        const isPrevDisabled = isAdvancing || currentCheckpointIndex === 0;

    return (
      <div className="flex-1 flex flex-col gap-3">
        <div
          className={`rounded-lg border p-4 ${
            isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"
          }`}
        >
          <h2
            className={`text-xl font-semibold mb-2 ${
              isDark ? "text-white" : "text-gray-900"
            }`}
          >
            {currentCheckpoint.title}
          </h2>
          {module && (
            <p className={`text-xs mb-2 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
              Checkpoint {currentCheckpointIndex + 1} of {module.checkpoints.length}
            </p>
          )}
          <div
            className={`prose prose-sm max-w-none ${
              isDark ? "prose-invert text-gray-200" : "text-gray-800"
            }`}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {currentCheckpoint.description}
            </ReactMarkdown>
          </div>
        </div>

        {navError && (
          <div
            className={`rounded-lg border px-4 py-2 text-sm ${
              isDark
                ? "bg-red-900/30 border-red-900 text-red-200"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {navError}
          </div>
        )}

        <div
          className={`flex-1 rounded-lg border overflow-hidden ${
            isDark ? "bg-gray-900 border-gray-800" : "bg-gray-50 border-gray-200"
          }`}
        >
          <MonacoEditor
            value={code}
            language={language}
            theme={isDark ? "vs-dark" : "vs"}
            onMount={handleEditorDidMount}
            onChange={(value) => {
              setCode(value || "");
            }}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              readOnly: !canEditCode,
            }}
          />
        </div>

        {isExplainCheckpoint && (
          <div
            className={`rounded-lg border p-3 flex flex-col gap-2 ${
              isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"
            }`}
          >
            <p
              className={`text-sm font-semibold ${
                isDark ? "text-gray-200" : "text-gray-800"
              }`}
            >
              Explanation
            </p>
            <textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Write your explanation in plain English..."
              className={`w-full rounded-md border p-2 text-sm ${
                isDark
                  ? "bg-gray-800 border-gray-700 text-white"
                  : "bg-white border-gray-300 text-gray-900"
              }`}
              rows={4}
            />
            <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
              Use <strong>Mark complete</strong> when you’re satisfied, then click <strong>Next</strong>.
            </p>
          </div>
        )}

        {isReflectionCheckpoint && (
          <div
            className={`rounded-lg border p-3 flex flex-col gap-2 ${
              isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"
            }`}
          >
            <p
              className={`text-sm font-semibold ${
                isDark ? "text-gray-200" : "text-gray-800"
              }`}
            >
              Reflection
            </p>
            <textarea
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder="What did you learn about loops? What is still fuzzy?"
              className={`w-full rounded-md border p-2 text-sm ${
                isDark
                  ? "bg-gray-800 border-gray-700 text-white"
                  : "bg-white border-gray-300 text-gray-900"
              }`}
              rows={3}
            />
          </div>
        )}

        <div className="flex justify-between items-center mt-1">
          <div />
          <div className="flex items-center gap-2">
            <button
              onClick={handleCompleteCheckpoint}
              disabled={isCompletingCheckpoint}
              className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-sm disabled:opacity-50 flex items-center gap-2"
              title="Mark this checkpoint as completed"
            >
              {isCompletingCheckpoint && (
                <AiOutlineLoading3Quarters className="animate-spin" />
              )}
              Mark complete
            </button>
            <button
              onClick={handlePreviousCheckpoint}
              disabled={isPrevDisabled}
              className="px-3 py-1.5 rounded-md bg-gray-700 text-white text-sm disabled:opacity-30 flex items-center gap-2"
            >
              Previous
            </button>
            <button
              onClick={handleAdvanceCheckpoint}
              disabled={isNextDisabled}
              className="px-4 py-1.5 rounded-md bg-green-600 text-white text-sm disabled:opacity-50 flex items-center gap-2"
            >
              {isAdvancing && (
                <AiOutlineLoading3Quarters className="animate-spin" />
              )}
              Next
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderRightPanel = () => {
    if (activePanel === "chat") {
      return (
        <div
          className={`flex flex-col h-full border rounded-lg ${
            isDark ? "bg-gray-900 border-gray-800" : "bg-blue-50 border-blue-200"
          }`}
        >
          <h2
            className={`text-lg font-semibold p-3 border-b ${
              isDark ? "border-gray-800 text-gray-200" : "border-blue-200"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              <FiMessageCircle /> Chat
            </span>
          </h2>
          <div className="flex-1">
            {chatReady && chatId && socket ? (
              <Chat
                socket={socket}
                chatId={chatId}
                userId={user.id}
                userName={user.name}
                IP_ADDRESS={IP_ADDRESS}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
                Chat loading...
              </div>
            )}
          </div>
        </div>
      );
    }

    if (activePanel === "info") {
      return (
        <div
          className={`flex flex-col h-full border rounded-lg p-3 ${
            isDark ? "bg-gray-900 border-gray-800" : "bg-blue-50 border-blue-200"
          }`}
        >
          <h2
            className={`text-lg font-semibold mb-3 ${
              isDark ? "text-gray-200" : "text-gray-800"
            }`}
          >
            <FiUsers className="inline-block mr-1" /> Learners
          </h2>
          <div className="space-y-2 overflow-y-auto text-sm">
            {connectedUsers.length > 0 ? (
              connectedUsers.map((u: any) => (
                <div
                  key={u.id}
                  className={`flex items-center gap-2 rounded-md border px-2 py-1 ${
                    isDark
                      ? "bg-gray-800 border-gray-700"
                      : "bg-white border-gray-200"
                  }`}
                >
                  <div className="w-7 h-7 rounded-full bg-blue-500 text-white flex items-center justify-center text-xs font-semibold">
                    {u.name?.charAt(0).toUpperCase() || "?"}
                  </div>
                  <div className="flex-1">
                    <p
                      className={
                        isDark ? "text-gray-200" : "text-gray-800"
                      }
                    >
                      {u.name}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p
                className={
                  isDark ? "text-gray-500" : "text-gray-600"
                }
              >
                Waiting for other learners to join this room.
              </p>
            )}
          </div>
        </div>
      );
    }

    // Default: AI Guide
    return (
      <div
        className={`flex flex-col h-full border rounded-lg ${
          isDark ? "bg-gray-900 border-gray-800" : "bg-blue-50 border-blue-200"
        }`}
      >
        <h2
          className={`text-lg font-semibold p-3 border-b flex items-center gap-2 ${
            isDark ? "border-gray-800 text-gray-200" : "border-blue-200"
          }`}
        >
          <FiBox /> AI Guide
        </h2>
        <div className="flex-1 p-3 overflow-y-auto space-y-3">
          {aiMessages.length === 0 && (
            <p
              className={`text-sm ${
                isDark ? "text-gray-400" : "text-gray-600"
              }`}
            >
              Ask the AI guide about this checkpoint. It will respond in{" "}
              <strong>{currentAiMode || "tutor"}</strong> mode and stay
              scoped to the current task.
            </p>
          )}
          {aiMessages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex ${
                msg.sender === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-xs md:max-w-sm rounded-2xl px-3 py-2 text-sm ${
                  msg.sender === "user"
                    ? "bg-blue-600 text-white rounded-tr-sm"
                    : isDark
                    ? "bg-gray-800 text-gray-200 rounded-tl-sm"
                    : "bg-white text-gray-800 rounded-tl-sm border border-gray-200"
                }`}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {msg.text}
                </ReactMarkdown>
              </div>
            </div>
          ))}
          {isAiLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <AiOutlineLoading3Quarters className="animate-spin" /> AI
              thinking...
            </div>
          )}
          <div ref={aiChatEndRef} />
        </div>
        <form
          onSubmit={handleAiSubmit}
          className={`p-3 border-t flex gap-2 ${
            isDark ? "border-gray-800" : "border-blue-200"
          }`}
        >
          <input
            type="text"
            value={aiInput}
            onChange={(e) => setAiInput(e.target.value)}
            placeholder="Ask the AI about this checkpoint..."
            className={`flex-1 rounded-md border px-3 py-2 text-sm ${
              isDark
                ? "bg-gray-800 border-gray-700 text-white"
                : "bg-white border-gray-300 text-gray-900"
            }`}
            disabled={isAiLoading}
          />
          <button
            type="submit"
            disabled={isAiLoading || !aiInput.trim()}
            className="px-3 py-2 rounded-md bg-blue-600 text-white disabled:opacity-50 flex items-center justify-center"
          >
            <AiOutlineSend size={18} />
          </button>
        </form>
      </div>
    );
  };

  return (
    <div
      className={`min-h-screen font-sans flex ${
        isDark ? "bg-black text-gray-200" : "bg-gradient-to-br from-gray-50 to-blue-50"
      }`}
    >
      <Sidebar
        showRooms
        onOpenAccount={() => setIsAccountOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      <div className="flex flex-col flex-1 p-4 gap-4 overflow-hidden">
        <nav
          className={`border rounded-xl px-4 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 ${
            isDark
              ? "bg-gray-900 border-gray-800"
              : "bg-blue-50/80 border-blue-200"
          }`}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen((v) => !v)}
              className={`hidden lg:inline-flex items-center justify-center w-9 h-9 rounded-md border ${
                isDark
                  ? "bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-800 border-gray-300"
              }`}
            >
              {isSidebarOpen ? (
                <FiChevronsLeft size={18} />
              ) : (
                <FiChevronsRight size={18} />
              )}
            </button>
            <button
              onClick={() => roomIdFromUrl && navigate(`/code/${roomIdFromUrl}`)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium ${
                isDark
                  ? "bg-gray-800 hover:bg-gray-700 border-gray-700 text-gray-200"
                  : "bg-white hover:bg-gray-100 border-gray-300 text-gray-800"
              }`}
              title="Back to editor"
            >
              <span className="text-lg">←</span>
              <span>Back to editor</span>
            </button>
            <div>
              <div
                className={`text-xl font-bold ${
                  isDark ? "text-white" : "text-gray-900"
                }`}
              >
                CoLearn · Guided Module
              </div>
              <p
                className={`text-xs ${
                  isDark ? "text-gray-400" : "text-gray-600"
                }`}
              >
                Room {roomLabel}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setActivePanel("ai")}
              className={`px-3 py-2 rounded-md text-sm flex items-center gap-2 ${
                activePanel === "ai"
                  ? "bg-blue-600 text-white"
                  : isDark
                  ? "bg-gray-800 text-gray-300"
                  : "bg-white text-gray-800"
              }`}
            >
              <FiBox /> AI Guide
            </button>
            <button
              onClick={() => setActivePanel("chat")}
              className={`px-3 py-2 rounded-md text-sm flex items-center gap-2 ${
                activePanel === "chat"
                  ? "bg-blue-600 text-white"
                  : isDark
                  ? "bg-gray-800 text-gray-300"
                  : "bg-white text-gray-800"
              }`}
            >
              <FiMessageCircle /> Chat
            </button>
            <button
              onClick={() => setActivePanel("info")}
              className={`px-3 py-2 rounded-md text-sm flex items-center gap-2 ${
                activePanel === "info"
                  ? "bg-blue-600 text-white"
                  : isDark
                  ? "bg-gray-800 text-gray-300"
                  : "bg-white text-gray-800"
              }`}
            >
              <FiUsers /> Learners
            </button>
          </div>
        </nav>

        <div className="flex flex-1 gap-4 overflow-hidden flex-col lg:flex-row">
          <div className="w-full lg:w-64 flex-shrink-0">
            {renderCheckpointList()}
          </div>
          <div className="flex-1 flex flex-col">{renderCenterPanel()}</div>
          <div className="w-full lg:w-80 flex-shrink-0">
            {renderRightPanel()}
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

export default LearningRoom;

