import { useState, type FormEvent } from 'react';
import { post } from '../lib/api';
import { useToastStore } from '../stores/toast';
import type { InterventionCreate, Intervention } from '../types';

interface Props {
  patientId: string;
  windowId?: string | null;
  onClose: () => void;
  onSuccess: (intervention: Intervention) => void;
}

export default function InterventionModal({ patientId, windowId, onClose, onSuccess }: Props) {
  const [type, setType] = useState<InterventionCreate['type']>('medication_change');
  const [description, setDescription] = useState('');
  const [performedAt, setPerformedAt] = useState(new Date().toISOString().slice(0, 16));
  const [loading, setLoading] = useState(false);
  const addToast = useToastStore((s) => s.addToast);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const body: InterventionCreate = {
        type,
        description,
        performed_at: new Date(performedAt).toISOString(),
        window_id: windowId || null,
      };
      const res = await post<Intervention>(`/patients/${patientId}/interventions`, body);
      addToast('Intervention logged to patient graph.');
      onSuccess(res);
      onClose();
    } catch {
      // handled by envelope
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Log Intervention</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Intervention Type</label>
            <select
              className="form-input"
              value={type}
              onChange={(e) => setType(e.target.value as InterventionCreate['type'])}
            >
              <option value="medication_change">Medication Change</option>
              <option value="procedure">Procedure</option>
              <option value="dosage_change">Dosage Change</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Notes</label>
            <textarea
              className="form-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the intervention..."
              required
            />
          </div>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label className="form-label">Performed At</label>
            <input
              className="form-input"
              type="datetime-local"
              value={performedAt}
              onChange={(e) => setPerformedAt(e.target.value)}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Logging…' : 'Log Intervention'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
