import React, { useEffect, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import { authAtom } from "../atoms/authAtom";
import { userAtom } from "../atoms/userAtom";
import { sidebarOpenAtom } from "../atoms/sidebarAtom";
import { themeAtom } from "../atoms/themeAtom";
import { IP_ADDRESS } from "../Globle";
import { useNavigate, useLocation } from "react-router-dom";
import { AiOutlineDelete } from "react-icons/ai";

type Room = { roomId: string; members?: string[]; ownerId?: string };

interface SidebarProps {
  showRooms?: boolean;
  onOpenAccount: () => void;
  onOpenSettings: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  showRooms = true,
  onOpenAccount,
  onOpenSettings,
}) => {
  const [auth, setAuth] = useRecoilState(authAtom);
  const [, setUser] = useRecoilState(userAtom);
  const [isOpen, setIsOpen] = useRecoilState(sidebarOpenAtom);
  const theme = useRecoilValue(themeAtom);
  const [rooms, setRooms] = useState<Room[]>([]);
  const navigate = useNavigate();
  const location = useLocation();
  const isDark = theme === "dark";

  useEffect(() => {
    const fetchRooms = async () => {
      if (!auth.token || !showRooms) return;
      try {
        const res = await fetch(`http://${IP_ADDRESS}:3000/rooms/my`, {
          headers: { Authorization: `Bearer ${auth.token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        setRooms(data.rooms || []);
      } catch (e) {
        console.error("Failed to fetch rooms:", e);
      }
    };
    fetchRooms();
  }, [auth.token, showRooms]);

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");
    setAuth({ isAuthenticated: false, user: null, token: null });
    setUser({ id: "", name: "", roomId: "" });
    navigate("/");
  };

  const handleRoomClick = (roomId: string, e?: React.MouseEvent) => {
    // Prevent delete action if clicking delete button
    if (e && (e.target as HTMLElement).closest('.delete-button')) {
      return;
    }
    
    // Open room in new tab
    const url = location.pathname.startsWith("/code/") 
      ? `/code/${roomId}` 
      : `/${roomId}`;
    
    // Open in new tab
    window.open(url, '_blank');
  };

  const handleDeleteRoom = async (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!confirm(`Are you sure you want to delete Room ${roomId}? This action cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`http://${IP_ADDRESS}:3000/room/${roomId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${auth.token}` },
      });

      if (res.ok) {
        // Remove room from list
        setRooms(prev => prev.filter(r => r.roomId !== roomId));
      } else {
        const errorData = await res.json();
        alert(errorData.error || "Failed to delete room");
      }
    } catch (error) {
      console.error("Error deleting room:", error);
      alert("Failed to delete room. Please try again.");
    }
  };

  return (
    <>
      {/* Toggle button (mobile) */}
      <button
        className={`fixed top-4 left-4 z-40 ${isDark ? "bg-gray-900 text-white border-gray-700" : "bg-white text-gray-900 border-gray-300"} px-3 py-2 rounded-md border lg:hidden`}
        onClick={() => setIsOpen((v) => !v)}
      >
        {isOpen ? "Close" : "Menu"}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 ${isDark ? "bg-gray-900 border-gray-800" : "bg-blue-50/95 backdrop-blur-sm border-blue-200 shadow-xl"} border-r-2 p-4 flex flex-col transform transition-all duration-200
  ${isOpen
            ? "translate-x-0 lg:translate-x-0 lg:static" // Open: Static position (takes up space)
            : "-translate-x-full lg:hidden"              // Closed: Hidden on desktop (removes space)
          }`}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>Account</p>
            <p className={`text-sm font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
              {auth.user ? auth.user.name : "Guest"}
            </p>
          </div>
          {auth.isAuthenticated && (
            <button
              onClick={handleLogout}
              className="text-xs px-3 py-1 rounded-full bg-red-600 hover:bg-red-700 text-white"
            >
              Logout
            </button>
          )}
        </div>

        {showRooms && (
          <div className="mb-4">
            <h2 className={`text-sm font-semibold mb-2 ${isDark ? "text-gray-200" : "text-gray-800"}`}>
              Your Rooms
            </h2>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {auth.isAuthenticated ? (
                rooms.length > 0 ? (
                  rooms.map((room) => {
                    const isOwner = room.ownerId === auth.user?.id;
                    return (
                      <div
                        key={room.roomId}
                        className={`relative group w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-200 ${isDark ? "bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700" : "bg-white border-gray-300 text-gray-800 hover:bg-blue-100 shadow-sm"} border hover:scale-[1.02] active:scale-[0.98]`}
                      >
                        <button
                          onClick={(e) => handleRoomClick(room.roomId, e)}
                          className="w-full text-left"
                        >
                          <p className="font-semibold">Room {room.roomId}</p>
                          <p className={`text-xs truncate ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                            Members: {room.members?.length ?? 1}
                          </p>
                        </button>
                        {isOwner && (
                          <button
                            onClick={(e) => handleDeleteRoom(room.roomId, e)}
                            className="delete-button absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-600 text-red-500 hover:text-white"
                            title="Delete room"
                          >
                            <AiOutlineDelete size={16} />
                          </button>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-600"}`}>
                    You are not part of any rooms yet.
                  </p>
                )
              ) : (
                <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-600"}`}>
                  Sign in to see your rooms.
                </p>
              )}
            </div>
          </div>
        )}

        <div className={`mt-auto pt-4 ${isDark ? "border-gray-700" : "border-blue-200"} border-t-2 flex flex-col gap-2`}>
          <button
            className={`w-full px-3 py-2 rounded-lg transition-all duration-200 border ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700" : "bg-white hover:bg-blue-100 text-gray-800 border-gray-300 shadow-sm"} text-sm text-left hover:scale-[1.02] active:scale-[0.98]`}
            onClick={onOpenSettings}
          >
            Settings
          </button>
          <button
            className={`w-full px-3 py-2 rounded-lg transition-all duration-200 border ${isDark ? "bg-gray-800 hover:bg-gray-700 text-gray-200 border-gray-700" : "bg-white hover:bg-blue-100 text-gray-800 border-gray-300 shadow-sm"} text-sm text-left hover:scale-[1.02] active:scale-[0.98]`}
            onClick={onOpenAccount}
          >
            Account
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;


