import React, { useEffect, useState } from "react";
import { useRecoilState } from "recoil";
import { authAtom } from "../atoms/authAtom";
import { userAtom } from "../atoms/userAtom";
import { sidebarOpenAtom } from "../atoms/sidebarAtom";
import { IP_ADDRESS } from "../Globle";
import { useNavigate, useLocation } from "react-router-dom";

type Room = { roomId: string; members?: string[] };

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
  const [rooms, setRooms] = useState<Room[]>([]);
  const navigate = useNavigate();
  const location = useLocation();

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

  const handleRoomClick = (roomId: string) => {
    // Open room in new tab
    const url = location.pathname.startsWith("/code/") 
      ? `/code/${roomId}` 
      : `/${roomId}`;
    
    // Open in new tab
    window.open(url, '_blank');
  };

  return (
    <>
      {/* Toggle button (mobile) */}
      <button
        className="fixed top-4 left-4 z-40 bg-gray-900 text-white px-3 py-2 rounded-md border border-gray-700 lg:hidden"
        onClick={() => setIsOpen((v) => !v)}
      >
        {isOpen ? "Close" : "Menu"}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-gray-900 border-r border-gray-800 p-4 flex flex-col transform transition-transform 
  ${isOpen
            ? "translate-x-0 lg:translate-x-0 lg:static" // Open: Static position (takes up space)
            : "-translate-x-full lg:hidden"              // Closed: Hidden on desktop (removes space)
          }`}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-gray-400">Account</p>
            <p className="text-sm font-semibold">
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
            <h2 className="text-sm font-semibold text-gray-200 mb-2">
              Your Rooms
            </h2>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {auth.isAuthenticated ? (
                rooms.length > 0 ? (
                  rooms.map((room) => (
                    <button
                      key={room.roomId}
                      onClick={() => handleRoomClick(room.roomId)}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700"
                    >
                      <p className="font-semibold">Room {room.roomId}</p>
                      <p className="text-xs text-gray-400 truncate">
                        Members: {room.members?.length ?? 1}
                      </p>
                    </button>
                  ))
                ) : (
                  <p className="text-xs text-gray-500">
                    You are not part of any rooms yet.
                  </p>
                )
              ) : (
                <p className="text-xs text-gray-500">
                  Sign in to see your rooms.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="mt-auto pt-4 border-t border-gray-700 flex flex-col gap-2">
          <button
            className="w-full px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-gray-200 text-left"
            onClick={onOpenSettings}
          >
            Settings
          </button>
          <button
            className="w-full px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-gray-200 text-left"
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


