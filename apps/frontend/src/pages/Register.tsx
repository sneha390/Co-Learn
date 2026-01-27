import { useEffect, useState } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { userAtom } from '../atoms/userAtom';
import { authAtom, AuthUser } from '../atoms/authAtom';
import { useNavigate, useParams } from 'react-router-dom';
import { socketAtom } from '../atoms/socketAtom';
import { IP_ADDRESS } from '../Globle';
import AuthModal from '../components/AuthModal';
import Sidebar from '../components/Sidebar';
import AccountModal from '../components/AccountModal';
import SettingsModal from '../components/SettingsModal';
import { themeAtom } from '../atoms/themeAtom';

// --- Helper Components & Icons ---

const Spinner = () => (
    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
);

const FeatureIcon = ({ children, isDark }: { children: React.ReactNode; isDark: boolean }) => (
    <div className={`${isDark ? "bg-gray-700/50" : "bg-blue-100"} p-2 rounded-full mr-4 shrink-0`}>
        {children}
    </div>
);

const Register = () => {
    const [roomId, setRoomId] = useState<string>("");
    const [error, setError] = useState<string>("");
    const [isAccountOpen, setIsAccountOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [hasAutoJoined, setHasAutoJoined] = useState(false);
    
    const params = useParams();
    const [, setUser] = useRecoilState(userAtom);
    const [auth, setAuth] = useRecoilState(authAtom);
    const [socket, setSocket] = useRecoilState<WebSocket | null>(socketAtom);
    const [loading, setLoading] = useState<boolean>(false);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const navigate = useNavigate();
    const theme = useRecoilValue(themeAtom);
    const isDark = theme === 'dark';

    useEffect(() => {
        document.title = "CoLearn - Collaborative Coding";
        // Pre-fill room ID from the URL parameter
        setRoomId(params.roomId || "");

        // Check for existing auth token
        const token = localStorage.getItem("authToken");
        const storedUser = localStorage.getItem("user");

        if (token && storedUser) {
            try {
                const userData = JSON.parse(storedUser);
                setAuth({
                    isAuthenticated: true,
                    user: userData,
                    token: token,
                });
                // Verify token with backend
                verifyToken(token);
            } catch (error) {
                console.error("Error parsing stored user:", error);
                localStorage.removeItem("authToken");
                localStorage.removeItem("user");
            }
        } else {
            setShowAuthModal(true);
        }
    }, [params.roomId, setAuth]);

    // Auto-join room if roomId is in URL and user is authenticated
    useEffect(() => {
        if (params.roomId && auth.isAuthenticated && auth.user && auth.token && !loading && !socket && !hasAutoJoined) {
            // Room ID is in URL and user is authenticated - auto-join
            const roomIdFromUrl = params.roomId.trim();
            if (roomIdFromUrl.length === 6) {
                setRoomId(roomIdFromUrl);
                setHasAutoJoined(true);
                // Small delay to ensure state is set
                const timer = setTimeout(() => {
                    initializeSocket(true);
                }, 100);
                return () => clearTimeout(timer);
            }
        }
    }, [params.roomId, auth.isAuthenticated, auth.user, auth.token, loading, socket, hasAutoJoined]);

    const verifyToken = async (token: string) => {
        try {
            const response = await fetch(`http://${IP_ADDRESS}:3000/auth/verify`, {
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });

            if (!response.ok) {
                throw new Error("Token invalid");
            }

            const data = await response.json();
            setAuth({
                isAuthenticated: true,
                user: data.user,
                token: token,
            });
        } catch (error) {
            console.error("Token verification failed:", error);
            localStorage.removeItem("authToken");
            localStorage.removeItem("user");
            setAuth({
                isAuthenticated: false,
                user: null,
                token: null,
            });
            setShowAuthModal(true);
        }
    };

    const handleAuthSuccess = (token: string, userData: AuthUser) => {
        setAuth({
            isAuthenticated: true,
            user: userData,
            token: token,
        });
        setShowAuthModal(false);
    };

    // This is your original, working socket logic
    const initializeSocket = async (isJoining = false) => {
        setError(""); // Clear previous errors

        // Check authentication
        if (!auth.isAuthenticated || !auth.user || !auth.token) {
            setShowAuthModal(true);
            return;
        }

        if (isJoining && (roomId.trim() === "" || roomId.length !== 6)) {
            setError("Please enter a valid 6-digit Room ID to join.");
            return;
        }

        setLoading(true);
        const userId = auth.user.id;
        const userName = auth.user.name;
        let finalRoomId = roomId;

        try {
            // Create or join room in MongoDB
            if (isJoining) {
                // Join existing room
                const joinResponse = await fetch(`http://${IP_ADDRESS}:3000/room/join`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${auth.token}`,
                    },
                    body: JSON.stringify({
                        roomId: roomId,
                    }),
                });

                if (!joinResponse.ok) {
                    const errorData = await joinResponse.json();
                    setError(errorData.error || "Failed to join room. Please check the Room ID.");
                    setLoading(false);
                    return;
                }

                const joinData = await joinResponse.json();
                finalRoomId = joinData.room.roomId;
            } else {
                // Create new room - WebSocket will generate roomId
                // We'll create it after WebSocket connection
            }
        } catch (error) {
            console.error("Error creating/joining room:", error);
            setError("Failed to connect to the server. Please try again.");
            setLoading(false);
            return;
        }

        if (!socket || socket.readyState === WebSocket.CLOSED) {
            const ws = new WebSocket(`ws://${IP_ADDRESS}:5000?roomId=${finalRoomId}&id=${userId}&name=${userName}`);
            setSocket(ws);

            ws.onopen = () => {
                console.log("Connected to WebSocket");
            };

            ws.onmessage = async (event) => {
                const data = JSON.parse(event.data);
                if (data.type === "roomId") {
                    const roomIdFromServer = data.roomId;
                    
                    try {
                        if (!isJoining) {
                            // Create room in MongoDB for new rooms
                            const createResponse = await fetch(`http://${IP_ADDRESS}:3000/room/create`, {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    Authorization: `Bearer ${auth.token}`,
                                },
                                body: JSON.stringify({
                                    roomId: roomIdFromServer,
                                }),
                            });

                            if (!createResponse.ok) {
                                setError("Failed to create room in database.");
                                setLoading(false);
                                ws.close();
                                return;
                            }
                        }

                        // Set user and navigate for both create and join
                        setUser({
                            id: userId,
                            name: userName,
                            roomId: roomIdFromServer
                        });
                        setLoading(false);
                        console.log("Server Message: ", data.message);
                        navigate("/code/" + roomIdFromServer);
                    } catch (error) {
                        console.error("Error handling room:", error);
                        setError("Failed to process room.");
                        setLoading(false);
                        ws.close();
                    }
                } else if (data.type === 'error') {
                    setError(data.message);
                    setLoading(false);
                    ws.close();
                }
            };

            ws.onclose = () => {
                console.log("WebSocket connection closed.");
                setLoading(false);
            };

            ws.onerror = (err) => {
                console.error("WebSocket error:", err);
                setError("Failed to connect to the server. Please try again.");
                setLoading(false);
            };
        } else {
            console.log("Socket connection already exists.");
            setLoading(false);
        }
    }

    const handleCreateRoom = () => {
        if (!loading) initializeSocket(false);
    }

    const handleJoinRoom = () => {
        if (!loading) initializeSocket(true);
    }

    return (
        <div className={`min-h-screen flex font-sans ${isDark ? "bg-gray-900 text-white" : "bg-gradient-to-br from-blue-50 via-white to-indigo-50 text-gray-900"}`}>
            <Sidebar
                showRooms
                onOpenAccount={() => setIsAccountOpen(true)}
                onOpenSettings={() => setIsSettingsOpen(true)}
            />
            <div className="flex-1 flex items-center justify-center p-6 overflow-hidden lg:ml-64 relative">
                <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 ${isDark ? "bg-indigo-600/30" : "bg-indigo-400/20"} rounded-full blur-3xl animate-pulse pointer-events-none`} />
                {/* Main Content: Info + Join/Create Room */}
                <div className="w-full max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center z-10">
                    {/* Left Side: Information about CoLearn */}
                    <div className="space-y-6">
                        <h1 className={`text-5xl md:text-6xl font-extrabold tracking-tight ${isDark ? "text-white" : "bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent"}`}>CoLearn</h1>
                        <p className={`${isDark ? "text-gray-300" : "text-gray-700"} text-lg md:text-xl leading-relaxed`}>
                            The ultimate platform for collaborative learning. Code in real-time, get instant feedback from our AI assistant, and master everything from basic algorithms to complex software architecture together.
                        </p>
                        <ul className="space-y-4 pt-4">
                            <li className="flex items-center"><FeatureIcon isDark={isDark}><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></FeatureIcon><span className={isDark ? "text-gray-200" : "text-gray-700"}><strong>Real-time Collaborative Editor:</strong> Code together with zero latency.</span></li>
                            <li className="flex items-center"><FeatureIcon isDark={isDark}><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect x="4" y="12" width="8" height="8" rx="2"/><path d="M20 12h-4"/><path d="m16 12-4 4-4-4"/></svg></FeatureIcon><span className={isDark ? "text-gray-200" : "text-gray-700"}><strong>AI-Powered Assistant:</strong> Get hints, debug code, and learn best practices.</span></li>
                            <li className="flex items-center"><FeatureIcon isDark={isDark}><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" x2="12" y1="9" y2="13"></line><line x1="12" x2="12.01" y1="17" y2="17"></line></svg></FeatureIcon><span className={isDark ? "text-gray-200" : "text-gray-700"}><strong>Architecture Nudges:</strong> Our AI guides you towards scalable and efficient code design.</span></li>
                        </ul>
                    </div>
                    
                    {/* Right Side: Join/Create Room Form */}
                    <div className={`${isDark ? "bg-gray-800/50 backdrop-blur-sm border-gray-700" : "bg-blue-50/90 backdrop-blur-sm border-blue-200 shadow-xl"} border-2 p-8 rounded-2xl`}>
                        <h2 className={`text-2xl font-bold mb-6 text-center ${isDark ? "text-white" : "text-gray-900"}`}>Join or Create a Room</h2>
                        {auth.isAuthenticated && auth.user && (
                            <div className={`mb-4 p-3 border ${isDark ? "bg-gray-700/50 border-gray-600" : "bg-blue-100 border-blue-200"} rounded-lg`}>
                                <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>Signed in as</p>
                                <p className={`${isDark ? "text-white" : "text-gray-900"} font-semibold`}>{auth.user.name}</p>
                                <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-600"}`}>{auth.user.email}</p>
                            </div>
                        )}
                        <div className="space-y-6">
                            <div>
                                <label htmlFor="roomId" className={`block text-sm font-medium ${isDark ? "text-gray-400" : "text-gray-700"} mb-2`}>Room ID (for joining)</label>
                                <input type="text" id="roomId" placeholder="Enter 6-digit Room ID" value={roomId} onChange={(e) => setRoomId(e.target.value)} className={`w-full p-3 ${isDark ? "bg-gray-700 text-white border-gray-600" : "bg-white text-gray-900 border-gray-300 hover:border-blue-400"} rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition duration-200`} />
                            </div>
                            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                            <div className="flex flex-col space-y-4 pt-2">
                                <button disabled={loading || !auth.isAuthenticated} onClick={handleJoinRoom} className="w-full h-12 flex items-center justify-center py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed">{loading ? <Spinner /> : 'Join Room'}</button>
                                <button disabled={loading || !auth.isAuthenticated} onClick={handleCreateRoom} className="w-full h-12 flex items-center justify-center py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold shadow-md hover:shadow-lg transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed">{loading ? <Spinner /> : 'Create New Room'}</button>
                            </div>
                        </div>
                    </div>
                </div>
                <AuthModal
                    isOpen={showAuthModal}
                    onClose={() => {
                        if (auth.isAuthenticated) {
                            setShowAuthModal(false);
                        }
                    }}
                    onSuccess={handleAuthSuccess}
                    IP_ADDRESS={IP_ADDRESS}
                />
                <AccountModal
                    isOpen={isAccountOpen}
                    onClose={() => setIsAccountOpen(false)}
                />
                <SettingsModal
                    isOpen={isSettingsOpen}
                    onClose={() => setIsSettingsOpen(false)}
                />
            </div>
        </div>
    );
};

export default Register;
