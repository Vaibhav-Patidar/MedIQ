import { create } from 'zustand';
import type { ActiveAlert } from '../types';

interface AlertsState {
  active: ActiveAlert[];
  setActive: (alerts: ActiveAlert[]) => void;
  addAlert: (alert: ActiveAlert) => void;
  removeAlert: (windowId: string) => void;
}

export const useAlertsStore = create<AlertsState>((set) => ({
  active: [],
  setActive: (alerts) => set({ active: alerts }),
  addAlert: (alert) =>
    set((s) => ({
      active: [alert, ...s.active.filter(a => a.window_id !== alert.window_id)],
    })),
  removeAlert: (windowId) =>
    set((s) => ({ active: s.active.filter(a => a.window_id !== windowId) })),
}));
