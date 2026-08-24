import type { PatientDetail, SepsisPrediction } from '../types';
import { computeCountdown, formatScoreChange } from '../lib/utils';
import { useState, useEffect } from 'react';

interface Props {
  patient: PatientDetail;
  prediction: SepsisPrediction | null;
  onIntervene: () => void;
}

export default function PatientHeader({ patient, prediction, onIntervene }: Props) {
  const doctor = patient.assigned_doctor;
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!prediction?.window_open || !prediction?.window_closes_at) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [prediction?.window_open, prediction?.window_closes_at]);

  const countdown = prediction?.window_open && prediction?.window_closes_at
    ? computeCountdown(prediction.window_closes_at)
    : null;

  const isCritical = Boolean(prediction && (prediction.window_open || prediction.risk_score >= 65));
  const score = prediction ? prediction.risk_score : null;

  // Semi-circle rotation degrees (from 0 to 180 deg)
  const rotationDeg = score !== null ? Math.min(Math.max((score / 100) * 180, 0), 180) : 0;

  return (
    <div className="card-elevated" style={{
      marginBottom: 32,
      padding: '32px 36px',
      position: 'relative',
      overflow: 'hidden',
      border: '1px solid var(--color-outline-variant)',
    }}>
      {/* Background ambient corner gradient */}
      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: 320,
        height: '100%',
        background: isCritical
          ? 'linear-gradient(to left, rgba(186, 26, 26, 0.06), transparent)'
          : 'linear-gradient(to left, rgba(150, 210, 201, 0.15), transparent)',
        pointerEvents: 'none',
      }} />

      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 28,
        position: 'relative',
        zIndex: 10,
      }}>
        {/* ── Left: Patient Demographics & Conditions ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flex: 1, minWidth: 320 }}>
          {/* Avatar Circle */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: 'var(--color-surface-container-high)',
              border: '2px solid var(--color-outline-variant)',
              color: 'var(--color-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 26,
              fontWeight: 700,
              fontFamily: 'var(--font-display)',
              boxShadow: 'var(--shadow-sm)',
            }}>
              {patient.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
            </div>

            {isCritical && (
              <div style={{
                position: 'absolute',
                bottom: -4,
                right: -4,
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'var(--color-error)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>priority_high</span>
              </div>
            )}
          </div>

          {/* Details */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
              <h1 className="font-display-lg" style={{ margin: 0, fontSize: 28 }}>
                {patient.name}
              </h1>
              <span className="badge badge-neutral" style={{ letterSpacing: '0.05em' }}>
                MRN: {patient.patient_id.slice(0, 8).toUpperCase()}
              </span>
            </div>

            <p className="font-body-md" style={{ margin: '0 0 10px', color: 'var(--color-on-surface-variant)' }}>
              {patient.age}Y • {patient.sex} • Blood: {patient.blood_type || '—'} • {patient.ward}, Bed {patient.bed_number}
              {doctor && ` • Attending: ${doctor.name}`}
            </p>

            {/* Badges & Condition Pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <span className="badge badge-stable" style={{ padding: '4px 10px' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>monitor_heart</span>
                Telemetry Streaming
              </span>

              {patient.conditions.map((c, i) => (
                <span
                  key={i}
                  className={`badge ${c.type === 'critical' ? 'badge-critical' : 'badge-neutral'}`}
                  style={{ padding: '4px 10px' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>emergency</span>
                  {c.name} {c.icd_code ? `(${c.icd_code})` : ''}
                </span>
              ))}

              {patient.comorbidities.map((c, i) => (
                <span
                  key={`com-${i}`}
                  className="badge badge-high"
                  style={{ padding: '4px 10px' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>health_and_safety</span>
                  {c.name}
                  {c.adjustment && (
                    <span style={{ marginLeft: 4, opacity: 0.9 }}>
                      (Alert @ {c.adjustment.threshold}%)
                    </span>
                  )}
                </span>
              ))}
            </div>

            {/* Active Medications Row */}
            {patient.medications && patient.medications.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>medication</span>
                  Rx:
                </span>
                {patient.medications.slice(0, 3).map((m, i) => (
                  <span
                    key={`med-${i}`}
                    className="badge"
                    style={{
                      background: '#e6f4ea',
                      color: '#137333',
                      border: '1px solid #ceead6',
                      padding: '3px 8px',
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    💊 {m.name} {m.dosage ? `(${m.dosage})` : ''} {m.frequency ? `• ${m.frequency}` : ''}
                  </span>
                ))}
                {patient.medications.length > 3 && (
                  <span
                    className="badge badge-neutral"
                    style={{ padding: '3px 8px', fontSize: 11, fontWeight: 600 }}
                  >
                    +{patient.medications.length - 3} more
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Hero Sepsis Risk Gauge ── */}
        {score !== null && prediction ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            background: 'var(--color-surface-container-low)',
            padding: '20px 28px',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-outline-variant)',
            minWidth: 200,
            boxShadow: 'var(--shadow-sm)',
          }}>
            <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', marginBottom: 8 }}>
              Sepsis Risk Index
            </span>

            {/* Gauge Arc representation */}
            <div style={{ position: 'relative', width: 120, height: 60, overflow: 'hidden', marginBottom: 6 }}>
              {/* Background Track */}
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: 120,
                height: 120,
                borderRadius: '50%',
                border: '10px solid var(--color-surface-container-highest)',
                clipPath: 'polygon(0 0, 100% 0, 100% 50%, 0 50%)',
              }} />
              {/* Fill Arc */}
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: 120,
                height: 120,
                borderRadius: '50%',
                border: `10px solid ${isCritical ? 'var(--color-error)' : 'var(--color-primary)'}`,
                clipPath: 'polygon(0 0, 100% 0, 100% 50%, 0 50%)',
                transform: `rotate(${rotationDeg - 180}deg)`,
                transformOrigin: '50% 50%',
                transition: 'transform 1s cubic-bezier(0.16, 1, 0.3, 1)',
              }} />
              {/* Centered Score */}
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                textAlign: 'center',
                fontFamily: 'var(--font-mono)',
                fontSize: 22,
                fontWeight: 800,
                color: isCritical ? 'var(--color-error)' : 'var(--color-on-surface)',
                lineHeight: 1,
              }}>
                {score.toFixed(1)}%
              </div>
            </div>

            {/* Trajectory Direction */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
              <span className="material-symbols-outlined" style={{
                fontSize: 16,
                color: prediction.risk_score_change?.startsWith('+') ? 'var(--color-error)' : 'var(--color-success)',
              }}>
                {prediction.risk_score_change?.startsWith('+') ? 'trending_up' : 'trending_down'}
              </span>
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                color: prediction.risk_score_change?.startsWith('+') ? 'var(--color-error)' : 'var(--color-success)',
              }}>
                {formatScoreChange(prediction.risk_score_change)} trend
              </span>
            </div>

            {/* Active Window Button */}
            {prediction.window_open && countdown && !countdown.expired && (
              <button
                className="btn btn-danger btn-sm"
                onClick={onIntervene}
                style={{ marginTop: 12, width: '100%' }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>timer</span>
                Intervene ({String(countdown.minutes).padStart(2, '0')}:{String(countdown.seconds).padStart(2, '0')})
              </button>
            )}
          </div>
        ) : (
          <div style={{
            background: 'var(--color-surface-container-low)',
            padding: '16px 24px',
            borderRadius: 'var(--radius-lg)',
            textAlign: 'center',
          }}>
            <span className="font-label-sm" style={{ color: 'var(--color-outline)' }}>
              Admission Assessment
            </span>
            <p style={{ fontSize: 13, color: 'var(--color-on-surface-variant)', margin: '4px 0 0' }}>
              Awaiting 2h telemetry sequence
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
