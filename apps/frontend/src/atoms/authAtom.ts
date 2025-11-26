import { atom } from 'recoil';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export const authAtom = atom<{
  isAuthenticated: boolean;
  user: AuthUser | null;
  token: string | null;
}>({
  key: 'authAtom',
  default: {
    isAuthenticated: false,
    user: null,
    token: null,
  },
});

