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
      addToast('Clinical intervention logged & synced with hospital EHR graph.');
      onSuccess(res);
      onClose();
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 580 }}>
        {/* ── Modal Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38,
              height: 38,
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-primary-container)',
              color: 'var(--color-on-primary-container)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <span className="material-symbols-outlined">clinical_notes</span>
            </div>
            <div>
              <h2 className="font-headline-md" style={{ margin: 0 }}>
                Record Clinical Intervention
              </h2>
              <span style={{ fontSize: 11, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>sync</span>
                Auto-syncing with Hospital Graph EHR
              </span>
            </div>
          </div>

          <button
            className="btn btn-sm btn-ghost"
            onClick={onClose}
            style={{ borderRadius: '50%', width: 32, height: 32, padding: 0 }}
          >
            ✕
          </button>
        </div>

        {/* ── Form ── */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">Intervention Category</label>
              <select
                className="form-select"
                value={type}
                onChange={(e) => setType(e.target.value as InterventionCreate['type'])}
              >
                <option value="medication_change">Medication Adjustment (Vasopressor / Antibiotic)</option>
                <option value="procedure">Fluid Bolus / Resuscitation</option>
                <option value="dosage_change">Dosage Titration</option>
                <option value="other">Respiratory / Airway Support</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Performed At</label>
              <input
                className="form-input"
                type="datetime-local"
                value={performedAt}
                onChange={(e) => setPerformedAt(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Clinical Action &amp; Orders</label>
            <textarea
              className="form-textarea"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g., Administered 1000 mL IV 0.9% Normal Saline bolus over 30 mins; initiated broad-spectrum Vancomycin."
              required
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 12 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? (
                'Syncing Intervention…'
              ) : (
                <>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>
                  <span>Commit to Clinical Graph</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
