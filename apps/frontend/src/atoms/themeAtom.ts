import { atom } from 'recoil';

export type Theme = 'dark' | 'light';

export const themeAtom = atom<Theme>({
  key: 'themeAtom',
  default: (localStorage.getItem('theme') as Theme) || 'dark',
});


