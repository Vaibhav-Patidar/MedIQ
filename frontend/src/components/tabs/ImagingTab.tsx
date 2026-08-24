export default function ImagingTab() {
  return (
    <div className="card">
      <div className="empty-state" style={{ padding: 60 }}>
        <h2 className="text-heading" style={{ marginBottom: 8, color: 'var(--color-text-secondary)' }}>
          Alzheimer's Module
        </h2>
        <p>Coming in Phase 2</p>
        <p style={{ fontSize: 12, marginTop: 8 }}>
          MRI upload, 3D CNN progression analysis, brain heatmap, treatment effectiveness gauge.
        </p>
      </div>
    </div>
  );
}
