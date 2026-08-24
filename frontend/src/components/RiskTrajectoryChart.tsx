import {
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';
import type { SepsisPrediction } from '../types';

interface Props {
  prediction: SepsisPrediction;
}

export default function RiskTrajectoryChart({ prediction }: Props) {
  // trajectory[0] = now, trajectory[1..5] = next 5 hours
  const data = prediction.trajectory.map((val, i) => ({
    hour: i === 0 ? 'Now' : `+${i}h`,
    risk: val,
    lower: prediction.trajectory_confidence_band.lower[i],
    upper: prediction.trajectory_confidence_band.upper[i],
    isHistorical: i === 0,
  }));

  return (
    <div className="card">
      <h2 className="text-heading" style={{ marginBottom: 12 }}>
        6-Hour Predicted Risk Trajectory
      </h2>
      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis
              dataKey="hour"
              tick={{ fontSize: 12, fill: '#475569' }}
              axisLine={{ stroke: '#E2E8F0' }}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 12, fill: '#475569' }}
              axisLine={{ stroke: '#E2E8F0' }}
            />
            <Tooltip
              contentStyle={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: 4,
                fontSize: 13,
              }}
              formatter={(value) => [Number(value).toFixed(1), 'Risk']}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />

            {/* Confidence band */}
            <Area
              dataKey="upper"
              stroke="none"
              fill="#DC262620"
              name="Upper Bound"
              dot={false}
              activeDot={false}
              legendType="none"
            />
            <Area
              dataKey="lower"
              stroke="none"
              fill="#FFFFFF"
              name="Lower Bound"
              dot={false}
              activeDot={false}
              legendType="none"
            />

            {/* Threshold line */}
            <ReferenceLine
              y={prediction.threshold_used}
              stroke="#D97706"
              strokeDasharray="6 4"
              strokeWidth={1.5}
              label={{
                value: `Threshold: ${prediction.threshold_used}`,
                position: 'right',
                fontSize: 11,
                fill: '#D97706',
              }}
            />

            {/* Trajectory line — solid for historical point, dotted for forecast */}
            <Line
              dataKey="risk"
              stroke="#DC2626"
              strokeWidth={2}
              strokeDasharray="0 0"
              dot={{ r: 3, fill: '#DC2626' }}
              name="Risk Trajectory"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
