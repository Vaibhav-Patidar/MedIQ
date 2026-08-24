import { useState, useEffect } from 'react';
import type { SepsisPrediction } from '../types';
import { urgencyClass, riskClass, formatScoreChange, reasonLabel, computeCountdown } from '../lib/utils';

interface Props {
  prediction: SepsisPrediction;
  onIntervene: () => void;
}

export default function RiskScoreCard({ prediction, onIntervene }: Props) {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!prediction.window_open || !prediction.window_closes_at) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [prediction.window_open, prediction.window_closes_at]);

  const countdown = prediction.window_open && prediction.window_closes_at
    ? computeCountdown(prediction.window_closes_at)
    : null;

  const isExpired = countdown?.expired;

  return (
    <div className={`card ${prediction.window_open && !isExpired ? 'card-critical' : ''}`}>
      <div className="flex-row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <span className="text-label">Sepsis Risk Score</span>
        <span className={`badge badge-${urgencyClass(prediction.urgency)}`}>
          ⚠ {prediction.urgency}
        </span>
      </div>

      <div className="flex-row" style={{ gap: 16, alignItems: 'flex-end' }}>
        <span className={`text-risk-score ${riskClass(prediction.risk_score)}`}>
          {prediction.risk_score.toFixed(1)}
        </span>
        <span
          className="text-mono"
          style={{
            fontSize: 16,
            color: prediction.risk_score_change?.startsWith('+')
              ? 'var(--color-critical)'
              : prediction.risk_score_change?.startsWith('-')
              ? 'var(--color-success)'
              : 'var(--color-text-muted)',
            marginBottom: 6,
          }}
        >
          {formatScoreChange(prediction.risk_score_change)}
        </span>
      </div>

      {/* Threshold badge */}
      {prediction.threshold_adjustment_reason && (
        <div style={{ marginTop: 10 }}>
          <span className="threshold-badge">
            Threshold adjusted: {reasonLabel(prediction.threshold_adjustment_reason)} — alert at {prediction.threshold_used}
          </span>
        </div>
      )}

      {/* Window state */}
      {prediction.window_open && countdown && !isExpired ? (
        <div style={{ marginTop: 16, padding: '12px 16px', background: '#FEF2F2', borderRadius: 'var(--radius)' }}>
          <span className="countdown-label">Intervention Window Closes In</span>
          <p className="countdown" style={{ color: 'var(--color-critical)', marginTop: 4 }}>
            {String(countdown.hours).padStart(2, '0')}:{String(countdown.minutes).padStart(2, '0')}:{String(countdown.seconds).padStart(2, '0')}
          </p>
          <button
            className="btn btn-danger"
            style={{ marginTop: 10 }}
            onClick={onIntervene}
          >
            Review &amp; Intervene
          </button>
        </div>
      ) : prediction.window_open && isExpired ? (
        <div style={{ marginTop: 16 }}>
          <span className="window-closed-badge">WINDOW CLOSED</span>
        </div>
      ) : !prediction.window_open ? (
        <div style={{ marginTop: 16 }}>
          <span className="window-closed-badge">WINDOW CLOSED</span>
        </div>
      ) : null}
    </div>
  );
}
