import React, { useState } from "react";
import { AiOutlineClose, AiOutlineMail, AiOutlineLock, AiOutlineUser } from "react-icons/ai";
import { useRecoilValue } from "recoil";
import { themeAtom } from "../atoms/themeAtom";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (token: string, user: { id: string; name: string; email: string }) => void;
  IP_ADDRESS: string;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess, IP_ADDRESS }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const theme = useRecoilValue(themeAtom);
  const isDark = theme === "dark";

  const resetForm = () => {
    setName("");
    setEmail("");
    setPassword("");
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint = isSignUp ? "/auth/signup" : "/auth/signin";
      const body = isSignUp
        ? { name, email, password }
        : { email, password };

      const response = await fetch(`http://${IP_ADDRESS}:3000${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "An error occurred");
        setLoading(false);
        return;
      }

      // Store token in localStorage
      localStorage.setItem("authToken", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      onSuccess(data.token, data.user);
      resetForm();
      onClose();
    } catch (error) {
      console.error("Auth error:", error);
      setError("Failed to connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setIsSignUp(!isSignUp);
    resetForm();
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 ${isDark ? "bg-black/50" : "bg-gray-900/50"} flex items-center justify-center z-50 p-4`}>
      <div className={`${isDark ? "bg-gray-800 border-gray-700" : "bg-blue-50 border-blue-200"} rounded-xl shadow-2xl w-full max-w-md relative border-2`}>
        {/* Close button */}
        <button
          onClick={onClose}
          className={`absolute top-4 right-4 ${isDark ? "text-gray-400 hover:text-white" : "text-gray-500 hover:text-gray-700"} transition-colors`}
        >
          <AiOutlineClose size={24} />
        </button>

        {/* Header */}
        <div className={`p-6 border-b ${isDark ? "border-gray-700" : "border-blue-200 bg-blue-100/50"}`}>
          <h2 className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
            {isSignUp ? "Create Account" : "Sign In"}
          </h2>
          <p className={`${isDark ? "text-gray-400" : "text-gray-600"} text-sm mt-1`}>
            {isSignUp
              ? "Join CoLearn to start coding together"
              : "Welcome back! Sign in to continue"}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {isSignUp && (
            <div>
              <label className={`block text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"} mb-2`}>
                Name
              </label>
              <div className="relative">
                <AiOutlineUser className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${isDark ? "text-gray-400" : "text-gray-500"}`} size={20} />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  required
                  className={`w-full pl-10 pr-4 py-2 ${isDark ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400" : "bg-white border-gray-300 text-gray-900 placeholder-gray-500 hover:border-blue-400"} border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition`}
                />
              </div>
            </div>
          )}

          <div>
            <label className={`block text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"} mb-2`}>
              Email
            </label>
            <div className="relative">
              <AiOutlineMail className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${isDark ? "text-gray-400" : "text-gray-500"}`} size={20} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                className={`w-full pl-10 pr-4 py-2 ${isDark ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400" : "bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-500"} border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`}
              />
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"} mb-2`}>
              Password
            </label>
            <div className="relative">
              <AiOutlineLock className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${isDark ? "text-gray-400" : "text-gray-500"}`} size={20} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSignUp ? "At least 6 characters" : "Enter your password"}
                required
                minLength={isSignUp ? 6 : undefined}
                className={`w-full pl-10 pr-4 py-2 ${isDark ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400" : "bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-500"} border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`}
              />
            </div>
          </div>

          {error && (
            <div className={`${isDark ? "bg-red-900/50 border-red-700 text-red-200" : "bg-red-50 border-red-200 text-red-700"} border px-4 py-3 rounded-lg text-sm`}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transform hover:scale-[1.02] active:scale-[0.98]"
          >
            {loading ? "Processing..." : isSignUp ? "Sign Up" : "Sign In"}
          </button>

          <div className={`text-center text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
            {isSignUp ? (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={switchMode}
                  className={`${isDark ? "text-blue-400 hover:text-blue-300" : "text-blue-600 hover:text-blue-700"} font-medium transition-colors`}
                >
                  Sign In
                </button>
              </>
            ) : (
              <>
                Don't have an account?{" "}
                <button
                  type="button"
                  onClick={switchMode}
                  className={`${isDark ? "text-blue-400 hover:text-blue-300" : "text-blue-600 hover:text-blue-700"} font-medium transition-colors`}
                >
                  Sign Up
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default AuthModal;

