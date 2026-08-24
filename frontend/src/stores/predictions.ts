import { create } from 'zustand';
import type { SepsisPrediction } from '../types';

interface PredictionsState {
  byPatientId: Record<string, SepsisPrediction>;
  setPrediction: (patientId: string, prediction: SepsisPrediction) => void;
}

export const usePredictionsStore = create<PredictionsState>((set) => ({
  byPatientId: {},
  setPrediction: (patientId, prediction) =>
    set((s) => ({ byPatientId: { ...s.byPatientId, [patientId]: prediction } })),
}));
