import React from "react";
import { useRecoilValue } from "recoil";
import { authAtom } from "../atoms/authAtom";

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const AccountModal: React.FC<AccountModalProps> = ({ isOpen, onClose }) => {
  const auth = useRecoilValue(authAtom);
  const user = auth.user;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Account</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-sm"
          >
            Close
          </button>
        </div>
        {user ? (
          <div className="space-y-2 text-sm">
            <p>
              <span className="text-gray-400">Name:</span> {user.name}
            </p>
            <p>
              <span className="text-gray-400">Email:</span> {user.email}
            </p>
            <p>
              <span className="text-gray-400">ID:</span> {user.id}
            </p>
          </div>
        ) : (
          <p className="text-gray-400 text-sm">Not signed in.</p>
        )}
      </div>
    </div>
  );
};

export default AccountModal;


