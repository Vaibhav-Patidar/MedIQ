import { create } from 'zustand';
import type { PatientListItem, PatientDetail } from '../types';

interface PatientsState {
  list: PatientListItem[];
  byId: Record<string, PatientDetail>;
  setList: (list: PatientListItem[]) => void;
  setPatient: (id: string, patient: PatientDetail) => void;
}

export const usePatientsStore = create<PatientsState>((set) => ({
  list: [],
  byId: {},
  setList: (list) => set({ list }),
  setPatient: (id, patient) =>
    set((s) => ({ byId: { ...s.byId, [id]: patient } })),
}));
