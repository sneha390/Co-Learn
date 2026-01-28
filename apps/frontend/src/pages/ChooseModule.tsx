import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useRecoilState, useRecoilValue } from "recoil";
import { userAtom } from "../atoms/userAtom";
import { authAtom } from "../atoms/authAtom";
import { socketAtom } from "../atoms/socketAtom";
import { themeAtom } from "../atoms/themeAtom";
import { sidebarOpenAtom } from "../atoms/sidebarAtom";
import Sidebar from "../components/Sidebar";
import AccountModal from "../components/AccountModal";
import SettingsModal from "../components/SettingsModal";
import { IP_ADDRESS } from "../Globle";
import { FiChevronsLeft, FiChevronsRight, FiBook } from "react-icons/fi";

interface LearningModuleSummary {
  moduleId: string;
  title: string;
  language: string;
  difficulty: string;
  estimatedTimeMinutes: number;
}

const ChooseModule: React.FC = () => {
  const params = useParams();
  const navigate = useNavigate();
  const [auth] = useRecoilState(authAtom);
  const [user] = useRecoilState(userAtom);
  const [socket] = useRecoilState<WebSocket | null>(socketAtom);
  const theme = useRecoilValue(themeAtom);
  const [sidebarOpen, setSidebarOpen] = useRecoilState(sidebarOpenAtom);
  const [modules, setModules] = useState<LearningModuleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startingId, setStartingId] = useState<string | null>(null);

  const roomIdFromUrl = params.roomId || user.roomId;
  const isDark = theme === "dark";

  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    const fetchModules = async () => {
      if (!auth.token) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`http://${IP_ADDRESS}:3000/learning/modules`, {
          headers: { Authorization: `Bearer ${auth.token}` },
        });
        if (!res.ok) {
          setError("Could not load modules.");
          return;
        }
        const data = await res.json();
        setModules(data.modules || []);
      } catch (e) {
        console.error("Failed to fetch modules", e);
        setError("Failed to load modules.");
      } finally {
        setLoading(false);
      }
    };
    fetchModules();
  }, [auth.token]);

  const handleStartModule = async (moduleId: string) => {
    if (!roomIdFromUrl || !auth.token) return;
    setStartingId(moduleId);
    try {
      const res = await fetch(
        `http://${IP_ADDRESS}:3000/learning/room/create`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${auth.token}`,
          },
          body: JSON.stringify({ roomId: roomIdFromUrl, moduleId }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Failed to start module.");
        return;
      }
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({ type: "startLearningModule", moduleId })
        );
      }
      navigate(`/learn/${roomIdFromUrl}`);
    } catch (e) {
      console.error("Failed to start module", e);
      setError("Failed to start module.");
    } finally {
      setStartingId(null);
    }
  };

  const handleBackToEditor = () => {
    if (roomIdFromUrl) navigate(`/code/${roomIdFromUrl}`);
    else navigate("/");
  };

  return (
    <div
      className={`min-h-screen font-sans flex ${
        isDark
          ? "bg-black text-gray-200"
          : "bg-gradient-to-br from-gray-50 to-blue-50"
      }`}
    >
      <Sidebar
        showRooms
        onOpenAccount={() => setIsAccountOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      <div className="flex flex-col flex-1 p-4 gap-4 overflow-auto">
        <nav
          className={`border rounded-xl px-4 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 ${
            isDark
              ? "bg-gray-900 border-gray-800"
              : "bg-blue-50/80 border-blue-200"
          }`}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className={`hidden lg:inline-flex items-center justify-center w-9 h-9 rounded-md border ${
                isDark
                  ? "bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-800 border-gray-300"
              }`}
            >
              {sidebarOpen ? (
                <FiChevronsLeft size={18} />
              ) : (
                <FiChevronsRight size={18} />
              )}
            </button>
            <button
              onClick={handleBackToEditor}
              className={`p-2 rounded-lg border ${
                isDark
                  ? "bg-gray-800 hover:bg-gray-700 border-gray-700"
                  : "bg-white hover:bg-gray-100 border-gray-300"
              }`}
              title="Back to editor"
            >
              <span className="text-lg">←</span>
            </button>
            <div>
              <div
                className={`text-xl font-bold ${
                  isDark ? "text-white" : "text-gray-900"
                }`}
              >
                CoLearn · Learn
              </div>
              <p
                className={`text-xs ${
                  isDark ? "text-gray-400" : "text-gray-600"
                }`}
              >
                Room {roomIdFromUrl || "..."}
              </p>
            </div>
          </div>
        </nav>

        <div
          className={`flex-1 rounded-xl border p-6 ${
            isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"
          }`}
        >
          <h1
            className={`text-2xl font-bold mb-2 ${
              isDark ? "text-white" : "text-gray-900"
            }`}
          >
            Choose a learning module
          </h1>
          <p
            className={`text-sm mb-6 ${
              isDark ? "text-gray-400" : "text-gray-600"
            }`}
          >
            Start a guided lesson with checkpoints and an AI tutor. More modules
            will appear here as they’re added.
          </p>

          {error && (
            <div
              className={`mb-4 px-4 py-2 rounded-lg text-sm ${
                isDark ? "bg-red-900/30 text-red-300" : "bg-red-50 text-red-700"
              }`}
            >
              {error}
            </div>
          )}

          {loading ? (
            <p className={isDark ? "text-gray-400" : "text-gray-600"}>
              Loading modules...
            </p>
          ) : modules.length === 0 ? (
            <p className={isDark ? "text-gray-400" : "text-gray-600"}>
              No modules available yet.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {modules.map((mod) => (
                <div
                  key={mod.moduleId}
                  className={`rounded-xl border p-4 flex flex-col ${
                    isDark
                      ? "bg-gray-800 border-gray-700 hover:border-gray-600"
                      : "bg-gray-50 border-gray-200 hover:border-blue-300"
                  }`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div
                      className={`p-2 rounded-lg ${
                        isDark ? "bg-blue-900/50" : "bg-blue-100"
                      }`}
                    >
                      <FiBook
                        className={isDark ? "text-blue-300" : "text-blue-600"}
                        size={24}
                      />
                    </div>
                    <div>
                      <h2
                        className={`font-semibold text-lg ${
                          isDark ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {mod.title}
                      </h2>
                      <p
                        className={`text-xs capitalize ${
                          isDark ? "text-gray-400" : "text-gray-600"
                        }`}
                      >
                        {mod.language} · {mod.difficulty} · ~
                        {mod.estimatedTimeMinutes} min
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleStartModule(mod.moduleId)}
                    disabled={startingId !== null}
                    className={`mt-auto w-full py-2 px-4 rounded-lg font-medium text-sm transition-colors ${
                      startingId === mod.moduleId
                        ? "opacity-70 cursor-wait"
                        : ""
                    } ${
                      isDark
                        ? "bg-blue-600 hover:bg-blue-500 text-white"
                        : "bg-blue-600 hover:bg-blue-700 text-white"
                    }`}
                  >
                    {startingId === mod.moduleId ? "Starting…" : "Start"}
                  </button>
                </div>
              ))}
            </div>
          )}
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

export default ChooseModule;
