import React, { useEffect } from "react";
import { useRecoilValue } from "recoil";
import { authAtom } from "../atoms/authAtom";
import { themeAtom } from "../atoms/themeAtom";

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AccountModal: React.FC<AccountModalProps> = ({ isOpen, onClose }) => {
  const auth = useRecoilValue(authAtom);
  const theme = useRecoilValue(themeAtom);
  const user = auth.user;
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

  return (
    <div className={`fixed inset-0 z-50 ${isDark ? "bg-black/50" : "bg-gray-900/50"} flex items-center justify-center p-4`}>
      <div className={`${isDark ? "bg-gray-900 border-gray-700" : "bg-blue-50 border-blue-200 shadow-xl"} border-2 rounded-xl shadow-2xl w-full max-w-sm p-6 transition-all duration-200`}>
        <div className="flex items-center justify-between mb-4">
          <h2 className={`text-lg font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>Account</h2>
          <button
            onClick={onClose}
            className={`${isDark ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-gray-900"} text-sm`}
          >
            Close
          </button>
        </div>
        {user ? (
          <div className={`space-y-2 text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>
            <p>
              <span className={isDark ? "text-gray-400" : "text-gray-600"}>Name:</span> {user.name}
            </p>
            <p>
              <span className={isDark ? "text-gray-400" : "text-gray-600"}>Email:</span> {user.email}
            </p>
            <p>
              <span className={isDark ? "text-gray-400" : "text-gray-600"}>ID:</span> {user.id}
            </p>
          </div>
        ) : (
          <p className={isDark ? "text-gray-400" : "text-gray-600"} style={{ fontSize: '0.875rem' }}>Not signed in.</p>
        )}
      </div>
    </div>
  );
};

export default AccountModal;


