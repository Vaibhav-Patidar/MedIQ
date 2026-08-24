import { create } from 'zustand';

interface WsState {
  connected: boolean;
  setConnected: (c: boolean) => void;
}

export const useWsStore = create<WsState>((set) => ({
  connected: false,
  setConnected: (connected) => set({ connected }),
}));
