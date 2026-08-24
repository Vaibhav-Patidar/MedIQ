import { useState } from 'react';
import type { ShapFeature } from '../types';
import { parseShapImpact } from '../lib/utils';

interface Props {
  features: ShapFeature[];
  onHoverFeature?: (feature: string | null) => void;
}

export default function ShapPanel({ features, onHoverFeature }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (features.length === 0) {
    return null;
  }

  const maxImpact = Math.max(...features.map((f) => parseShapImpact(f.impact).value), 1);

  return (
    <div className="card">
      <h2 className="text-heading" style={{ marginBottom: 12 }}>
        SHAP Feature Attribution
      </h2>
      <div className="flex-col" style={{ gap: 8 }}>
        {features.map((f, i) => {
          const { value, positive } = parseShapImpact(f.impact);
          const pct = (value / maxImpact) * 100;
          const isHovered = hoveredIdx === i;

          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '6px 8px',
                borderRadius: 'var(--radius)',
                background: isHovered ? '#F1F5F9' : 'transparent',
                cursor: 'pointer',
                transition: 'background 150ms linear',
              }}
              onMouseEnter={() => {
                setHoveredIdx(i);
                onHoverFeature?.(f.feature);
              }}
              onMouseLeave={() => {
                setHoveredIdx(null);
                onHoverFeature?.(null);
              }}
            >
              <span style={{ width: 100, fontSize: 13, fontWeight: 500, flexShrink: 0 }}>
                {f.feature}
              </span>
              <span className="text-mono" style={{ width: 50, fontSize: 12, flexShrink: 0, color: 'var(--color-text-secondary)' }}>
                {f.value}
              </span>
              <div style={{ flex: 1, display: 'flex', justifyContent: positive ? 'flex-start' : 'flex-end' }}>
                <div
                  style={{
                    width: `${Math.max(pct, 4)}%`,
                    height: 18,
                    borderRadius: 2,
                    background: positive ? '#DC262640' : '#0284C740',
                    border: `1px solid ${positive ? '#DC2626' : '#0284C7'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: positive ? 'var(--color-critical)' : 'var(--color-info)',
                    whiteSpace: 'nowrap',
                  }}>
                    {f.impact}
                  </span>
                </div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--color-text-muted)', width: 90, textAlign: 'right', flexShrink: 0 }}>
                {positive ? 'Increases risk' : 'Protective'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
