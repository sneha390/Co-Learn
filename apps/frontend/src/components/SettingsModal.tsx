import React from "react";
import { useRecoilState } from "recoil";
import { themeAtom, Theme } from "../atoms/themeAtom";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [theme, setTheme] = useRecoilState(themeAtom);

  if (!isOpen) return null;

  const changeTheme = (value: Theme) => {
    setTheme(value);
    localStorage.setItem("theme", value);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-sm"
          >
            Close
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-gray-200 mb-2">Theme</p>
            <div className="flex gap-3">
              <button
                onClick={() => changeTheme("dark")}
                className={`px-3 py-2 rounded-md text-sm ${
                  theme === "dark"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-300"
                }`}
              >
                Dark
              </button>
              <button
                onClick={() => changeTheme("light")}
                className={`px-3 py-2 rounded-md text-sm ${
                  theme === "light"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-300"
                }`}
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


