import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { get } from '../lib/api';
import { ApiError } from '../lib/api';
import { usePatientsStore } from '../stores/patients';
import { usePredictionsStore } from '../stores/predictions';
import { useVitalsStore } from '../stores/vitals';
import { useVitalsSocket } from '../hooks/useVitalsSocket';
import PatientHeader from '../components/PatientHeader';
import RiskTrajectoryChart from '../components/RiskTrajectoryChart';
import ShapPanel from '../components/ShapPanel';
import VitalsTable from '../components/VitalsTable';
import VitalsEntryForm from '../components/VitalsEntryForm';
import InterventionModal from '../components/InterventionModal';
import HistoryTab from '../components/tabs/HistoryTab';
import GraphTab from '../components/tabs/GraphTab';
import ImagingTab from '../components/tabs/ImagingTab';
import type { PatientDetail as PatientDetailType, SepsisPrediction, VitalReading } from '../types';

type Tab = 'overview' | 'history' | 'graph' | 'imaging';

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>();
  const setPatient = usePatientsStore((s) => s.setPatient);
  const setPrediction = usePredictionsStore((s) => s.setPrediction);
  const setVitals = useVitalsStore((s) => s.setVitals);
  const vitals = useVitalsStore((s) => id ? s.byPatientId[id] : undefined);

  const [patient, setPatientLocal] = useState<PatientDetailType | null>(null);
  const [prediction, setPredictionLocal] = useState<SepsisPrediction | null>(null);
  const [insufficientData, setInsufficientData] = useState<{ hours_available?: number; hours_required?: number } | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [highlightFeature, setHighlightFeature] = useState<string | null>(null);
  const [graphKey, setGraphKey] = useState(0);

  // WebSocket for vitals
  useVitalsSocket(id);

  const fetchPrediction = useCallback(async () => {
    if (!id) return;
    try {
      const pred = await get<SepsisPrediction>(`/patients/${id}/predictions/sepsis`);
      setPredictionLocal(pred);
      setPrediction(id, pred);
      setInsufficientData(null);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'insufficient_data') {
        setInsufficientData({
          hours_available: err.hoursAvailable,
          hours_required: err.hoursRequired,
        });
        setPredictionLocal(null);
      }
    }
  }, [id, setPrediction]);

  useEffect(() => {
    if (!id) return;
    async function load() {
      setLoading(true);
      try {
        const [pat, vit] = await Promise.all([
          get<PatientDetailType>(`/patients/${id}`),
          get<VitalReading[]>(`/patients/${id}/vitals/latest`),
        ]);
        setPatientLocal(pat);
        setPatient(id!, pat);
        setVitals(id!, vit);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load patient');
      }
      await fetchPrediction();
      setLoading(false);
    }
    load();
  }, [id, setPatient, setVitals, fetchPrediction]);

  async function handleVitalPosted(triggered: boolean) {
    if (triggered && id) {
      setTimeout(() => fetchPrediction(), 1000);
      setTimeout(() => fetchPrediction(), 3000);
    }
    if (id) {
      try {
        const vit = await get<VitalReading[]>(`/patients/${id}/vitals/latest`);
        setVitals(id, vit);
      } catch { /* ignore */ }
    }
  }

  function handleInterventionSuccess() {
    setGraphKey((k) => k + 1);
  }

  if (loading) {
    return (
      <div className="flex-col">
        <div className="skeleton" style={{ height: 160, borderRadius: 'var(--radius-xl)' }} />
        <div className="grid-2">
          <div className="skeleton skeleton-chart" />
          <div className="skeleton skeleton-chart" />
        </div>
        <div className="skeleton" style={{ height: 300 }} />
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="error-banner">
        <span>{error || 'Patient not found'}</span>
        <button className="btn btn-sm" onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  const currentWindowId = prediction?.window_open
    ? undefined
    : null;

  const isAlzheimers = Boolean(
    patient?.conditions?.some((c) => c.name.toLowerCase().includes('alzheimer'))
  );

  const availableTabs: Tab[] = isAlzheimers
    ? ['overview', 'history', 'graph', 'imaging']
    : ['overview', 'history', 'graph'];

  return (
    <div className="flex-col" style={{ gap: 24 }}>
      {/* ── Patient Hero Header with Sepsis Gauge ── */}
      <PatientHeader
        patient={patient}
        prediction={prediction}
        onIntervene={() => setShowModal(true)}
      />

      {/* ── Tab Navigation Bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div className="tab-bar">
          {availableTabs.map((tab) => (
            <button
              key={tab}
              className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {tab === 'overview' && <span className="material-symbols-outlined" style={{ fontSize: 16 }}>dashboard</span>}
              {tab === 'history' && <span className="material-symbols-outlined" style={{ fontSize: 16 }}>history</span>}
              {tab === 'graph' && <span className="material-symbols-outlined" style={{ fontSize: 16 }}>account_tree</span>}
              {tab === 'imaging' && <span className="material-symbols-outlined" style={{ fontSize: 16 }}>medical_information</span>}
              <span>
                {tab === 'overview' && 'Clinical Overview'}
                {tab === 'history' && 'Prediction History'}
                {tab === 'graph' && 'Ontology Graph'}
                {tab === 'imaging' && 'Neuro Imaging'}
              </span>
            </button>
          ))}
        </div>

        {prediction?.window_open && (
          <button
            className="btn btn-danger"
            onClick={() => setShowModal(true)}
          >
            <span className="material-symbols-outlined">emergency</span>
            <span>Record Immediate Intervention</span>
          </button>
        )}
      </div>

      {/* ── Tab Content ── */}
      {activeTab === 'overview' && (
        <div className="flex-col" style={{ gap: 24 }}>
          {/* Insufficient Data State */}
          {insufficientData && (
            <div className="card" style={{
              background: 'var(--color-surface-container-low)',
              border: '1px dashed var(--color-outline)',
              textAlign: 'center',
              padding: '32px 24px',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 36, color: 'var(--color-primary)', marginBottom: 8, display: 'block' }}>
                hourglass_top
              </span>
              <h3 className="font-headline-md" style={{ margin: '0 0 6px' }}>
                Accumulating Telemetry Baseline
              </h3>
              <p style={{ color: 'var(--color-on-surface-variant)', fontSize: 14, margin: '0 auto', maxWidth: 460 }}>
                A minimum of 2 hours of continuous vitals time-series is required to generate reliable multi-parameter sepsis trajectory predictions.
              </p>
              {insufficientData.hours_available !== undefined && (
                <div style={{ marginTop: 12 }}>
                  <span className="badge badge-neutral text-mono" style={{ fontSize: 12 }}>
                    {insufficientData.hours_available.toFixed(1)}h Available / {insufficientData.hours_required || 2}h Required
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Trajectory and Explainability Grid */}
          <div className="grid-2">
            {prediction ? (
              <RiskTrajectoryChart prediction={prediction} />
            ) : (
              <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: 280 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--color-outline)', marginBottom: 8 }}>
                  show_chart
                </span>
                <span style={{ color: 'var(--color-on-surface-variant)', fontSize: 14 }}>
                  {insufficientData ? 'Trajectory will render after 2h of vitals' : 'No prediction trajectory available'}
                </span>
              </div>
            )}

            {prediction && prediction.shap_explanation.length > 0 ? (
              <ShapPanel
                features={prediction.shap_explanation}
                onHoverFeature={setHighlightFeature}
              />
            ) : (
              <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: 280 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--color-outline)', marginBottom: 8 }}>
                  psychology
                </span>
                <span style={{ color: 'var(--color-on-surface-variant)', fontSize: 14 }}>
                  Feature impact analysis pending next model inference run
                </span>
              </div>
            )}
          </div>

          {/* Vitals History Table */}
          <VitalsTable
            vitals={vitals || []}
            highlightFeature={highlightFeature}
          />

          {/* Bedside Vitals Entry Form */}
          <VitalsEntryForm
            patientId={id!}
            onVitalPosted={handleVitalPosted}
          />
        </div>
      )}

      {activeTab === 'history' && <HistoryTab patientId={id!} />}
      {activeTab === 'graph' && <GraphTab key={graphKey} patientId={id!} />}
      {activeTab === 'imaging' && <ImagingTab />}

      {/* ── Intervention Modal ── */}
      {showModal && (
        <InterventionModal
          patientId={id!}
          windowId={currentWindowId}
          onClose={() => setShowModal(false)}
          onSuccess={handleInterventionSuccess}
        />
      )}
    </div>
  );
}
