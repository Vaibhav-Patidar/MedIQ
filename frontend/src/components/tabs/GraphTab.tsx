import { useEffect, useState, useCallback } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  type Node, type Edge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { get } from '../../lib/api';
import type { GraphData } from '../../types';

const nodeColors: Record<string, string> = {
  Patient: '#0284C7',
  Disease: '#DC2626',
  Medication: '#16A34A',
  Clinician: '#7C3AED',
  Intervention: '#D97706',
  VitalReading: '#64748B',
  ProgressionState: '#EA580C',
  InterventionWindow: '#DC2626',
};

export default function GraphTab({ patientId }: { patientId: string }) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      const data = await get<GraphData>(`/patients/${patientId}/graph`);
      // Layout nodes in a radial pattern, patient at center
      const centerX = 400;
      const centerY = 300;
      const radius = 200;

      const flowNodes: Node[] = data.nodes.map((n, i) => {
        const isPatient = n.type === 'Patient';
        const angle = (2 * Math.PI * i) / Math.max(data.nodes.length - 1, 1);
        return {
          id: n.id,
          type: 'default',
          position: isPatient
            ? { x: centerX, y: centerY }
            : { x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle) },
          data: {
            label: n.label,
            nodeType: n.type,
          },
          style: {
            background: nodeColors[n.type] || '#64748B',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 4,
            padding: '8px 14px',
            fontSize: isPatient ? 14 : 12,
            fontWeight: isPatient ? 600 : 500,
            fontFamily: 'Inter, sans-serif',
            minWidth: isPatient ? 140 : 100,
            textAlign: 'center' as const,
          },
        };
      });

      const flowEdges: Edge[] = data.edges.map((e, i) => ({
        id: `e-${i}`,
        source: e.source,
        target: e.target,
        label: e.relation.replace(/_/g, ' '),
        labelStyle: { fontSize: 10, fill: '#475569' },
        style: { stroke: '#94A3B8', strokeWidth: 1.5 },
        animated: false,
      }));

      setNodes(flowNodes);
      setEdges(flowEdges);
      setError('');
    } catch {
      setError('Failed to load graph data');
    }
    setLoading(false);
  }, [patientId]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  if (loading) return <div className="skeleton skeleton-chart" />;
  if (error) return <div className="error-banner">{error} <button className="btn btn-sm" onClick={loadGraph}>Retry</button></div>;

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: '12px 16px', borderBottom: 'var(--border)' }}>
        <h2 className="text-heading">Patient Knowledge Graph</h2>
        <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
          This view reflects the patient's conditions, medications, assigned clinician, and logged interventions as a connected ontology object.
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          {Object.entries(nodeColors).slice(0, 5).map(([type, color]) => (
            <span key={type} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: color, display: 'inline-block' }} />
              {type}
            </span>
          ))}
        </div>
      </div>
      <div style={{ height: 500 }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          onNodeClick={(_, node) => setSelectedNode(node)}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#E2E8F0" gap={20} />
          <Controls />
          <MiniMap
            nodeColor={(n) => nodeColors[(n.data as { nodeType: string }).nodeType] || '#64748B'}
            style={{ background: '#F8FAFC', border: '1px solid #E2E8F0' }}
          />
        </ReactFlow>
      </div>
      {selectedNode && (
        <div style={{ padding: '12px 16px', borderTop: 'var(--border)', fontSize: 13 }}>
          <strong>{(selectedNode.data as { label: string }).label}</strong>
          <span style={{ marginLeft: 8, color: 'var(--color-text-secondary)' }}>
            Type: {(selectedNode.data as { nodeType: string }).nodeType}
          </span>
          <button
            className="btn btn-sm"
            style={{ marginLeft: 12 }}
            onClick={() => setSelectedNode(null)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
