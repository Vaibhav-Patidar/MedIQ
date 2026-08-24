import { create } from 'zustand';
import type { VitalReading } from '../types';

interface VitalsState {
  byPatientId: Record<string, VitalReading[]>;
  setVitals: (patientId: string, vitals: VitalReading[]) => void;
  appendVital: (patientId: string, vital: VitalReading) => void;
}

export const useVitalsStore = create<VitalsState>((set) => ({
  byPatientId: {},
  setVitals: (patientId, vitals) =>
    set((s) => ({ byPatientId: { ...s.byPatientId, [patientId]: vitals } })),
  appendVital: (patientId, vital) =>
    set((s) => ({
      byPatientId: {
        ...s.byPatientId,
        [patientId]: [...(s.byPatientId[patientId] || []), vital],
      },
    })),
}));
