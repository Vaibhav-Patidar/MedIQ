import { create } from 'zustand';
import type { UserPublic } from '../types';

interface AuthState {
  token: string | null;
  user: UserPublic | null;
  setToken: (token: string, user: UserPublic) => void;
  clearToken: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem('mediq_token'),
  user: (() => {
    try {
      const u = localStorage.getItem('mediq_user');
      return u ? JSON.parse(u) : null;
    } catch { return null; }
  })(),
  setToken: (token, user) => {
    localStorage.setItem('mediq_token', token);
    localStorage.setItem('mediq_user', JSON.stringify(user));
    set({ token, user });
  },
  clearToken: () => {
    localStorage.removeItem('mediq_token');
    localStorage.removeItem('mediq_user');
    set({ token: null, user: null });
  },
}));
