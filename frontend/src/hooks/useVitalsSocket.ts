import { useEffect, useRef } from 'react';
import { MediqSocket } from '../lib/ws';
import { useVitalsStore } from '../stores/vitals';
import { useAuthStore } from '../stores/auth';
import type { VitalReading } from '../types';

export function useVitalsSocket(patientId: string | undefined) {
  const token = useAuthStore((s) => s.token);
  const appendVital = useVitalsStore((s) => s.appendVital);
  const socketRef = useRef<MediqSocket | null>(null);

  useEffect(() => {
    if (!token || !patientId) return;

    const socket = new MediqSocket(`/patients/${patientId}/vitals`);
    socketRef.current = socket;

    socket.on('vitals_update', (data) => {
      appendVital(patientId, data as VitalReading);
    });

    socket.connect();

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, patientId, appendVital]);
}
