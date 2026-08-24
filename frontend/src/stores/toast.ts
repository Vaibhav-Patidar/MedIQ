import { create } from 'zustand';

interface Toast {
  id: number;
  message: string;
  exiting?: boolean;
}

interface ToastState {
  toasts: Toast[];
  addToast: (message: string) => void;
  removeToast: (id: number) => void;
  markExiting: (id: number) => void;
}

let nextId = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (message) => {
    const id = nextId++;
    set((s) => ({ toasts: [...s.toasts, { id, message }] }));
    // Auto-dismiss after 4s (spec §8)
    setTimeout(() => {
      set((s) => ({
        toasts: s.toasts.map(t => t.id === id ? { ...t, exiting: true } : t),
      }));
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) }));
      }, 150);
    }, 4000);
  },
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) })),
  markExiting: (id) =>
    set((s) => ({
      toasts: s.toasts.map(t => t.id === id ? { ...t, exiting: true } : t),
    })),
}));
