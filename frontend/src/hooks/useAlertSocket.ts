import { useEffect, useRef } from 'react';
import { MediqSocket } from '../lib/ws';
import { useAlertsStore } from '../stores/alerts';
import { useAuthStore } from '../stores/auth';
import { useToastStore } from '../stores/toast';
import type { ActiveAlert } from '../types';

export function useAlertSocket() {
  const token = useAuthStore((s) => s.token);
  const addAlert = useAlertsStore((s) => s.addAlert);
  const removeAlert = useAlertsStore((s) => s.removeAlert);
  const addToast = useToastStore((s) => s.addToast);
  const socketRef = useRef<MediqSocket | null>(null);

  useEffect(() => {
    if (!token) return;

    const socket = new MediqSocket('/alerts');
    socketRef.current = socket;

    socket.on('window_opened', (data) => {
      addAlert(data as ActiveAlert);
    });

    socket.on('escalated', (data) => {
      addAlert(data as ActiveAlert);
      const alert = data as ActiveAlert;
      addToast(`Escalated to next available clinician — ${alert.patient_name}`);
    });

    socket.on('window_closed', (data) => {
      const alert = data as ActiveAlert;
      removeAlert(alert.window_id);
    });

    socket.connect();

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, addAlert, removeAlert, addToast]);
}
