import React, { useEffect } from "react";
import { useRecoilState } from "recoil";
import { themeAtom, Theme } from "../atoms/themeAtom";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [theme, setTheme] = useRecoilState(themeAtom);
  const isDark = theme === "dark";

  // Handle Esc key to close modal
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const changeTheme = (value: Theme) => {
    setTheme(value);
    localStorage.setItem("theme", value);
  };

  return (
    <div className={`fixed inset-0 z-50 ${isDark ? "bg-black/50" : "bg-gray-900/50"} flex items-center justify-center p-4`}>
      <div className={`${isDark ? "bg-gray-900 border-gray-700" : "bg-blue-50 border-blue-200 shadow-xl"} border-2 rounded-xl shadow-2xl w-full max-w-sm p-6 transition-all duration-200`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-lg font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>Settings</h2>
          <button
            onClick={onClose}
            className={`${isDark ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-gray-900"} text-sm`}
          >
            Close
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <p className={`text-sm font-semibold mb-2 ${isDark ? "text-gray-200" : "text-gray-700"}`}>Theme</p>
            <div className="flex gap-3">
              <button
                onClick={() => changeTheme("dark")}
                className={`px-3 py-2 rounded-md text-sm transition-all duration-200 ${
                  theme === "dark"
                    ? "bg-blue-600 text-white shadow-md"
                    : isDark ? "bg-gray-800 text-gray-300 hover:bg-gray-700" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                } hover:scale-105 active:scale-95`}
              >
                Dark
              </button>
              <button
                onClick={() => changeTheme("light")}
                className={`px-3 py-2 rounded-md text-sm transition-all duration-200 ${
                  theme === "light"
                    ? "bg-blue-600 text-white shadow-md"
                    : isDark ? "bg-gray-800 text-gray-300 hover:bg-gray-700" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                } hover:scale-105 active:scale-95`}
              >
                Light
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;


