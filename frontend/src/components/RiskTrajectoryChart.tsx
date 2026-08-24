import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';
import type { SepsisPrediction } from '../types';

interface Props {
  prediction: SepsisPrediction;
}

export default function RiskTrajectoryChart({ prediction }: Props) {
  const isHighRisk = prediction.risk_score >= 65 || prediction.window_open;
  const primaryStroke = isHighRisk ? '#ba1a1a' : '#2D6962';
  const bandFill = isHighRisk ? 'rgba(186, 26, 26, 0.12)' : 'rgba(45, 105, 98, 0.12)';

  const data = prediction.trajectory.map((val, i) => ({
    hour: i === 0 ? 'Now' : `+${i}h`,
    risk: val,
    lower: prediction.trajectory_confidence_band.lower[i],
    upper: prediction.trajectory_confidence_band.upper[i],
  }));

  return (
    <div className="card" style={{ padding: 24, position: 'relative', overflow: 'hidden' }}>
      {/* Decorative Blur */}
      <div style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: 200,
        height: 200,
        background: 'rgba(45, 105, 98, 0.04)',
        borderRadius: '50%',
        filter: 'blur(40px)',
        pointerEvents: 'none',
      }} />

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, position: 'relative', zIndex: 10 }}>
        <div>
          <h2 className="font-headline-md" style={{ margin: 0 }}>
            6-Hour Sepsis Risk Trajectory
          </h2>
          <p style={{ fontSize: 13, color: 'var(--color-on-surface-variant)', margin: '2px 0 0' }}>
            Continuous XGBoost inference with 95% confidence interval forecast
          </p>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          <span className="badge badge-neutral" style={{ textTransform: 'none', fontWeight: 600 }}>
            Decision Threshold: {prediction.threshold_used}%
          </span>
        </div>
      </div>

      {/* Chart */}
      <div style={{ width: '100%', height: 280, position: 'relative', zIndex: 10 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: -10 }}>
            <defs>
              <linearGradient id="trajectoryGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={primaryStroke} stopOpacity={0.25} />
                <stop offset="100%" stopColor={primaryStroke} stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-container-high)" />
            <XAxis
              dataKey="hour"
              tick={{ fontSize: 12, fill: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-sans)', fontWeight: 500 }}
              axisLine={{ stroke: 'var(--color-outline-variant)' }}
              tickLine={{ stroke: 'var(--color-outline-variant)' }}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 12, fill: 'var(--color-on-surface-variant)', fontFamily: 'var(--font-mono)' }}
              axisLine={{ stroke: 'var(--color-outline-variant)' }}
              tickLine={{ stroke: 'var(--color-outline-variant)' }}
              unit="%"
            />
            <Tooltip
              contentStyle={{
                background: 'var(--color-surface-container-lowest)',
                border: '1px solid var(--color-outline-variant)',
                borderRadius: 8,
                boxShadow: 'var(--shadow-md)',
                fontSize: 13,
                fontFamily: 'var(--font-sans)',
              }}
              formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Risk Score']}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8, fontFamily: 'var(--font-sans)' }}
            />

            {/* Confidence Area */}
            <Area
              dataKey="upper"
              stroke="none"
              fill={bandFill}
              name="95% Confidence Band"
              dot={false}
              activeDot={false}
            />
            <Area
              dataKey="lower"
              stroke="none"
              fill="transparent"
              legendType="none"
              dot={false}
              activeDot={false}
            />

            {/* Threshold Line */}
            <ReferenceLine
              y={prediction.threshold_used}
              stroke="var(--color-moderate)"
              strokeDasharray="6 4"
              strokeWidth={2}
              label={{
                value: `Alert Trigger (${prediction.threshold_used}%)`,
                position: 'insideTopRight',
                fontSize: 11,
                fontWeight: 700,
                fill: 'var(--color-moderate)',
                fontFamily: 'var(--font-sans)',
              }}
            />

            {/* Trajectory Line */}
            <Line
              type="monotone"
              dataKey="risk"
              stroke={primaryStroke}
              strokeWidth={3}
              dot={{ r: 4, fill: primaryStroke, stroke: '#FFFFFF', strokeWidth: 2 }}
              activeDot={{ r: 6, fill: primaryStroke }}
              name="Predicted Sepsis Trajectory"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Trajectory Timeline markings */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 12,
        paddingTop: 12,
        borderTop: '1px solid var(--color-surface-container)',
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        color: 'var(--color-on-surface-variant)',
      }}>
        <span>Telemetry Ingestion: -12h</span>
        <span>Current Timestamp (Now)</span>
        <span>Forecast Horizon: +5h</span>
      </div>
    </div>
  );
}
