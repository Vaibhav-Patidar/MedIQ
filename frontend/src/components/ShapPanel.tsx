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
    <div className="card" style={{ padding: 24 }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-secondary-container)',
          color: 'var(--color-on-secondary-container)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <span className="material-symbols-outlined">psychology</span>
        </div>
        <div>
          <h3 className="font-headline-md" style={{ margin: 0 }}>
            Risk Drivers &amp; Explainability
          </h3>
          <p style={{ fontSize: 12, color: 'var(--color-on-surface-variant)', margin: '2px 0 0' }}>
            Model Feature Attribution (TreeSHAP Decomposition)
          </p>
        </div>
      </div>

      {/* ── Feature Attribution Bars ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {features.map((f, i) => {
          const { value, positive } = parseShapImpact(f.impact);
          const pct = Math.min((value / maxImpact) * 100, 100);
          const isHovered = hoveredIdx === i;

          return (
            <div
              key={i}
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                background: isHovered ? 'var(--color-surface-container-high)' : 'var(--color-surface-container-low)',
                border: '1px solid var(--color-outline-variant)',
                cursor: 'pointer',
                transition: 'all var(--transition)',
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-on-surface)' }}>
                    {f.feature}
                  </span>
                  <span className="text-mono" style={{ fontSize: 12, color: 'var(--color-on-surface-variant)' }}>
                    ({f.value})
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="text-mono" style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: positive ? 'var(--color-error)' : 'var(--color-primary)',
                  }}>
                    {f.impact}
                  </span>
                  <span className={`badge ${positive ? 'badge-critical' : 'badge-stable'}`} style={{ fontSize: 10, padding: '2px 6px' }}>
                    {positive ? '↑ Risk' : '↓ Protective'}
                  </span>
                </div>
              </div>

              {/* Visual Impact Bar */}
              <div style={{
                width: '100%',
                height: 6,
                borderRadius: 3,
                background: 'var(--color-surface-container-highest)',
                overflow: 'hidden',
              }}>
                <div style={{
                  width: `${Math.max(pct, 6)}%`,
                  height: '100%',
                  background: positive ? 'var(--color-error)' : 'var(--color-primary)',
                  borderRadius: 3,
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
