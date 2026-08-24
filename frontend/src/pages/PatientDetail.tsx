import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { get } from '../lib/api';
import { ApiError } from '../lib/api';
import { usePatientsStore } from '../stores/patients';
import { usePredictionsStore } from '../stores/predictions';
import { useVitalsStore } from '../stores/vitals';
import { useVitalsSocket } from '../hooks/useVitalsSocket';
import PatientHeader from '../components/PatientHeader';
import RiskScoreCard from '../components/RiskScoreCard';
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
      // Poll once after 1s, once more after 3s
      setTimeout(() => fetchPrediction(), 1000);
      setTimeout(() => fetchPrediction(), 3000);
    }
    // Also refresh vitals list
    if (id) {
      try {
        const vit = await get<VitalReading[]>(`/patients/${id}/vitals/latest`);
        setVitals(id, vit);
      } catch { /* ignore */ }
    }
  }

  function handleInterventionSuccess() {
    // Trigger graph re-fetch by changing key
    setGraphKey((k) => k + 1);
  }

  if (loading) {
    return (
      <div className="flex-col">
        <div className="skeleton skeleton-card" style={{ height: 100 }} />
        <div className="grid-2">
          <div className="skeleton skeleton-card" style={{ height: 200 }} />
          <div className="skeleton skeleton-chart" />
        </div>
        <div className="skeleton skeleton-card" style={{ height: 300 }} />
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

  // Find current window_id for intervention modal
  const currentWindowId = prediction?.window_open
    ? undefined // We don't have window_id from prediction; will be null in the modal
    : null;

  const isAlzheimers = Boolean(
    patient?.conditions?.some((c) => c.name.toLowerCase().includes('alzheimer'))
  );

  const availableTabs: Tab[] = isAlzheimers
    ? ['overview', 'history', 'graph', 'imaging']
    : ['overview', 'history', 'graph'];

  return (
    <div className="flex-col">
      <PatientHeader patient={patient} />

      {/* Tabs */}
      <div className="tab-bar">
        {availableTabs.map((tab) => (
          <button
            key={tab}
            className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="flex-col">
          <div className="grid-2">
            {/* Risk Score Card or Insufficient Data */}
            {prediction ? (
              <RiskScoreCard
                prediction={prediction}
                onIntervene={() => setShowModal(true)}
              />
            ) : insufficientData ? (
              <div className="card" style={{ opacity: 0.7 }}>
                <span className="text-label">Sepsis Risk Score</span>
                <div style={{ marginTop: 16, textAlign: 'center', padding: '20px 0' }}>
                  <p style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>
                    Insufficient data sequence. 2 hours of vitals required for Sepsis prediction.
                  </p>
                  {insufficientData.hours_available !== undefined && (
                    <p className="text-mono" style={{ marginTop: 8, fontSize: 13, color: 'var(--color-text-muted)' }}>
                      {insufficientData.hours_available.toFixed(1)}h available / {insufficientData.hours_required || 2}h required
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="card" style={{ opacity: 0.7 }}>
                <span className="text-label">Sepsis Risk Score</span>
                <div className="empty-state">No prediction available</div>
              </div>
            )}

            {/* Trajectory Chart */}
            {prediction ? (
              <RiskTrajectoryChart prediction={prediction} />
            ) : (
              <div className="card" style={{ opacity: 0.7 }}>
                <span className="text-label">6-Hour Predicted Risk Trajectory</span>
                <div className="empty-state" style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {insufficientData
                    ? 'Insufficient data for trajectory'
                    : 'No prediction data available'}
                </div>
              </div>
            )}
          </div>

          {/* SHAP Panel */}
          {prediction && prediction.shap_explanation.length > 0 && (
            <ShapPanel
              features={prediction.shap_explanation}
              onHoverFeature={setHighlightFeature}
            />
          )}

          {/* Vitals Table */}
          <VitalsTable
            vitals={vitals || []}
            highlightFeature={highlightFeature}
          />

          {/* Vitals Entry Form */}
          <VitalsEntryForm
            patientId={id!}
            onVitalPosted={handleVitalPosted}
          />
        </div>
      )}

      {activeTab === 'history' && <HistoryTab patientId={id!} />}
      {activeTab === 'graph' && <GraphTab key={graphKey} patientId={id!} />}
      {activeTab === 'imaging' && <ImagingTab />}

      {/* Intervention Modal */}
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
