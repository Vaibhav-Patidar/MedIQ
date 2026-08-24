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
    <div className="card">
      <h2 className="text-heading" style={{ marginBottom: 12 }}>Vitals — Last 12h</h2>
      {vitals.length === 0 ? (
        <div className="empty-state">No vitals recorded yet.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>HR</th>
                <th>BP</th>
                <th>Temp</th>
                <th>RR</th>
                <th>SpO2</th>
                <th>WBC</th>
                <th>Lactate</th>
                <th>Creat.</th>
                <th>Urine</th>
              </tr>
            </thead>
            <tbody>
              {vitals.map((v, i) => (
                <tr key={v.reading_id || i}>
                  <td className="text-mono">{formatTime(v.timestamp)}</td>
                  <td className={`text-mono ${highlightCol === 'heart_rate' ? 'vital-row-highlight' : ''}`}>
                    {v.heart_rate ?? '—'}
                  </td>
                  <td className={`text-mono ${highlightCol === 'bp_systolic' ? 'vital-row-highlight' : ''}`}>
                    {v.bp_systolic !== null && v.bp_diastolic !== null
                      ? `${v.bp_systolic}/${v.bp_diastolic}`
                      : '—'}
                  </td>
                  <td className={`text-mono ${highlightCol === 'temperature' ? 'vital-row-highlight' : ''}`}>
                    {v.temperature !== null ? v.temperature.toFixed(1) : '—'}
                  </td>
                  <td className={`text-mono ${highlightCol === 'respiratory_rate' ? 'vital-row-highlight' : ''}`}>
                    {v.respiratory_rate ?? '—'}
                  </td>
                  <td className={`text-mono ${highlightCol === 'spo2' ? 'vital-row-highlight' : ''}`}>
                    {v.spo2 ?? '—'}
                  </td>
                  <td className={`text-mono ${highlightCol === 'wbc' ? 'vital-row-highlight' : ''}`}>
                    {v.wbc !== null ? v.wbc.toFixed(1) : '—'}
                  </td>
                  <td className={`text-mono ${highlightCol === 'lactate' ? 'vital-row-highlight' : ''}`}>
                    {v.lactate !== null ? v.lactate.toFixed(2) : '—'}
                  </td>
                  <td className={`text-mono ${highlightCol === 'creatinine' ? 'vital-row-highlight' : ''}`}>
                    {v.creatinine !== null ? v.creatinine.toFixed(2) : '—'}
                  </td>
                  <td className="text-mono">{v.urine_output !== null ? v.urine_output.toFixed(0) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
