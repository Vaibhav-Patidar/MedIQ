import type { VitalReading } from '../types';
import { formatTime } from '../lib/utils';

interface Props {
  vitals: VitalReading[];
  highlightFeature?: string | null;
}

const featureColumnMap: Record<string, string> = {
  'Temperature': 'temperature',
  'Heart rate': 'heart_rate',
  'HeartRate': 'heart_rate',
  'HR': 'heart_rate',
  'SpO2': 'spo2',
  'BP': 'bp_systolic',
  'SBP': 'bp_systolic',
  'DBP': 'bp_diastolic',
  'Respiratory rate': 'respiratory_rate',
  'RR': 'respiratory_rate',
  'WBC': 'wbc',
  'Lactate': 'lactate',
  'Creatinine': 'creatinine',
};

export default function VitalsTable({ vitals, highlightFeature }: Props) {
  const highlightCol = highlightFeature ? featureColumnMap[highlightFeature] : null;

  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 className="font-headline-md" style={{ margin: 0 }}>
            Telemetry &amp; Vitals History
          </h3>
          <p style={{ fontSize: 12, color: 'var(--color-on-surface-variant)', margin: '2px 0 0' }}>
            Physiologic time-series sequence from bed monitor feed
          </p>
        </div>

        <span className="badge badge-neutral" style={{ fontSize: 11 }}>
          {vitals.length} Recorded Readings
        </span>
      </div>

      {vitals.length === 0 ? (
        <div className="empty-state">No telemetry readings recorded yet.</div>
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>HR (bpm)</th>
                <th>BP (mmHg)</th>
                <th>Temp (°C)</th>
                <th>RR (/min)</th>
                <th>SpO2 (%)</th>
                <th>WBC</th>
                <th>Lactate</th>
                <th>Creatinine</th>
                <th>Urine (mL)</th>
              </tr>
            </thead>
            <tbody>
              {vitals.map((v, i) => (
                <tr key={v.reading_id || i}>
                  <td className="text-mono" style={{ fontWeight: 600 }}>
                    {formatTime(v.timestamp)}
                  </td>
                  <td className="text-mono" style={{
                    color: highlightCol === 'heart_rate' ? 'var(--color-error)' : 'inherit',
                    fontWeight: highlightCol === 'heart_rate' ? 700 : 'inherit',
                    background: highlightCol === 'heart_rate' ? 'rgba(186, 26, 26, 0.08)' : 'transparent',
                  }}>
                    {v.heart_rate ?? '—'}
                  </td>
                  <td className="text-mono" style={{
                    color: highlightCol === 'bp_systolic' ? 'var(--color-error)' : 'inherit',
                    fontWeight: highlightCol === 'bp_systolic' ? 700 : 'inherit',
                    background: highlightCol === 'bp_systolic' ? 'rgba(186, 26, 26, 0.08)' : 'transparent',
                  }}>
                    {v.bp_systolic !== null && v.bp_diastolic !== null
                      ? `${v.bp_systolic}/${v.bp_diastolic}`
                      : '—'}
                  </td>
                  <td className="text-mono" style={{
                    color: highlightCol === 'temperature' ? 'var(--color-error)' : 'inherit',
                    fontWeight: highlightCol === 'temperature' ? 700 : 'inherit',
                    background: highlightCol === 'temperature' ? 'rgba(186, 26, 26, 0.08)' : 'transparent',
                  }}>
                    {v.temperature !== null ? v.temperature.toFixed(1) : '—'}
                  </td>
                  <td className="text-mono" style={{
                    color: highlightCol === 'respiratory_rate' ? 'var(--color-error)' : 'inherit',
                    fontWeight: highlightCol === 'respiratory_rate' ? 700 : 'inherit',
                    background: highlightCol === 'respiratory_rate' ? 'rgba(186, 26, 26, 0.08)' : 'transparent',
                  }}>
                    {v.respiratory_rate ?? '—'}
                  </td>
                  <td className="text-mono" style={{
                    color: highlightCol === 'spo2' ? 'var(--color-error)' : 'inherit',
                    fontWeight: highlightCol === 'spo2' ? 700 : 'inherit',
                    background: highlightCol === 'spo2' ? 'rgba(186, 26, 26, 0.08)' : 'transparent',
                  }}>
                    {v.spo2 ?? '—'}
                  </td>
                  <td className="text-mono" style={{
                    color: highlightCol === 'wbc' ? 'var(--color-error)' : 'inherit',
                    fontWeight: highlightCol === 'wbc' ? 700 : 'inherit',
                    background: highlightCol === 'wbc' ? 'rgba(186, 26, 26, 0.08)' : 'transparent',
                  }}>
                    {v.wbc !== null ? v.wbc.toFixed(1) : '—'}
                  </td>
                  <td className="text-mono" style={{
                    color: highlightCol === 'lactate' ? 'var(--color-error)' : 'inherit',
                    fontWeight: highlightCol === 'lactate' ? 700 : 'inherit',
                    background: highlightCol === 'lactate' ? 'rgba(186, 26, 26, 0.08)' : 'transparent',
                  }}>
                    {v.lactate !== null ? v.lactate.toFixed(2) : '—'}
                  </td>
                  <td className="text-mono" style={{
                    color: highlightCol === 'creatinine' ? 'var(--color-error)' : 'inherit',
                    fontWeight: highlightCol === 'creatinine' ? 700 : 'inherit',
                    background: highlightCol === 'creatinine' ? 'rgba(186, 26, 26, 0.08)' : 'transparent',
                  }}>
                    {v.creatinine !== null ? v.creatinine.toFixed(2) : '—'}
                  </td>
                  <td className="text-mono">
                    {v.urine_output !== null ? v.urine_output.toFixed(0) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
