import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  type Node, type Edge, MarkerType, ConnectionLineType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { get } from '../../lib/api';
import type { GraphData } from '../../types';

/* ── Node Category Styling & Themes ── */
interface CategoryStyle {
  bg: string;
  border: string;
  glow: string;
  icon: string;
  badgeBg: string;
  badgeText: string;
  label: string;
}

const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  Patient: {
    bg: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
    border: '#38BDF8',
    glow: 'rgba(2, 132, 199, 0.4)',
    icon: '🧑‍⚕️',
    badgeBg: '#E0F2FE',
    badgeText: '#0369A1',
    label: 'Patient',
  },
  Disease: {
    bg: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
    border: '#F87171',
    glow: 'rgba(239, 68, 68, 0.4)',
    icon: '🦠',
    badgeBg: '#FEE2E2',
    badgeText: '#B91C1C',
    label: 'Condition',
  },
  Medication: {
    bg: 'linear-gradient(135deg, #10B981 0%, #047857 100%)',
    border: '#34D399',
    glow: 'rgba(16, 185, 129, 0.4)',
    icon: '💊',
    badgeBg: '#D1FAE5',
    badgeText: '#047857',
    label: 'Medication',
  },
  Clinician: {
    bg: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
    border: '#A78BFA',
    glow: 'rgba(139, 92, 246, 0.4)',
    icon: '👨‍⚕️',
    badgeBg: '#EDE9FE',
    badgeText: '#6D28D9',
    label: 'Clinician',
  },
  ProgressionState: {
    bg: 'linear-gradient(135deg, #F97316 0%, #C2410C 100%)',
    border: '#FB923C',
    glow: 'rgba(249, 115, 22, 0.45)',
    icon: '📈',
    badgeBg: '#FFEDD5',
    badgeText: '#C2410C',
    label: 'Risk State',
  },
  InterventionWindow: {
    bg: 'linear-gradient(135deg, #E11D48 0%, #9F1239 100%)',
    border: '#FB7185',
    glow: 'rgba(225, 29, 72, 0.5)',
    icon: '⏰',
    badgeBg: '#FFE4E6',
    badgeText: '#9F1239',
    label: 'Window Alert',
  },
  Intervention: {
    bg: 'linear-gradient(135deg, #F59E0B 0%, #B45309 100%)',
    border: '#FBBF24',
    glow: 'rgba(245, 158, 11, 0.4)',
    icon: '⚡',
    badgeBg: '#FEF3C7',
    badgeText: '#B45309',
    label: 'Intervention',
  },
  SimilarPatient: {
    bg: 'linear-gradient(135deg, #06B6D4 0%, #0E7490 100%)',
    border: '#22D3EE',
    glow: 'rgba(6, 182, 212, 0.4)',
    icon: '👥',
    badgeBg: '#CFFAFE',
    badgeText: '#0E7490',
    label: 'Similar Case',
  },
};

const EDGE_CONFIGS: Record<string, { stroke: string; label: string; isAnimated: boolean }> = {
  HAS_CONDITION:    { stroke: '#EF4444', label: 'diagnosed with', isAnimated: true },
  COMORBID_WITH:    { stroke: '#F97316', label: 'comorbid', isAnimated: true },
  ON_MEDICATION:    { stroke: '#10B981', label: 'prescribed', isAnimated: true },
  PRESCRIBED:       { stroke: '#10B981', label: 'prescribed', isAnimated: true },
  ASSIGNED_TO:      { stroke: '#8B5CF6', label: 'cared by', isAnimated: true },
  IN_PROGRESSION:   { stroke: '#F97316', label: 'active risk', isAnimated: true },
  OPENS_WINDOW:     { stroke: '#E11D48', label: 'opens window', isAnimated: true },
  RECEIVED:         { stroke: '#F59E0B', label: 'received', isAnimated: false },
  SIMILAR_TO:       { stroke: '#06B6D4', label: 'similar cohort', isAnimated: false },
  PERFORMED_BY:     { stroke: '#8B5CF6', label: 'performed by', isAnimated: false },
};

/** UUID regex to filter out raw gibberish reading IDs */
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Clean and sanitize raw API graph data */
function sanitizeGraphData(data: GraphData): { nodes: GraphData['nodes']; edges: GraphData['edges'] } {
  const cleanNodes: GraphData['nodes'] = [];
  const cleanIds = new Set<string>();

  for (const n of data.nodes) {
    // Skip raw VitalReading time-series or empty/gibberish UUID labels
    if (n.type === 'VitalReading') continue;
    if (!n.label || UUID_REGEX.test(n.label.trim())) continue;
    if (cleanIds.has(n.id)) continue;

    cleanIds.add(n.id);
    cleanNodes.push(n);
  }

  // Filter edges to only those connecting valid nodes
  const cleanEdges = data.edges.filter(
    (e) => cleanIds.has(e.source) && cleanIds.has(e.target)
  );

  return { nodes: cleanNodes, edges: cleanEdges };
}

/** Computes beautiful circular radial orbits for nodes */
function computeCircularLayout(
  nodes: GraphData['nodes'],
  filterCategory: string
): Node[] {
  const filtered = filterCategory === 'all'
    ? nodes
    : nodes.filter((n) => n.type === 'Patient' || n.type === filterCategory);

  const patientNode = filtered.find((n) => n.type === 'Patient');
  const otherNodes = filtered.filter((n) => n.type !== 'Patient');

  const centerX = 480;
  const centerY = 360;

  const result: Node[] = [];

  // Patient Node (Central Large Circle)
  if (patientNode) {
    result.push(createCircularNode(patientNode, centerX - 55, centerY - 55, true));
  }

  // Group nodes by type for organized, aesthetic clustering
  const innerTypes = ['Disease', 'ProgressionState', 'Clinician'];
  const outerTypes = ['Medication', 'InterventionWindow', 'Intervention', 'SimilarPatient'];

  const innerNodes = otherNodes.filter((n) => innerTypes.includes(n.type));
  const outerNodes = otherNodes.filter((n) => outerTypes.includes(n.type));

  // If few nodes overall, place them in a single balanced orbit
  if (otherNodes.length <= 6) {
    const radius = 220;
    otherNodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / otherNodes.length - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle) - 45;
      const y = centerY + radius * Math.sin(angle) - 45;
      result.push(createCircularNode(n, x, y, false));
    });
  } else {
    // Ring 1 (Inner Orbit - Core Conditions & Clinicians)
    const innerRadius = 190;
    innerNodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / Math.max(innerNodes.length, 1) - Math.PI / 2;
      const x = centerX + innerRadius * Math.cos(angle) - 45;
      const y = centerY + innerRadius * Math.sin(angle) - 45;
      result.push(createCircularNode(n, x, y, false));
    });

    // Ring 2 (Outer Orbit - Medications & Interventions)
    const outerRadius = 320;
    outerNodes.forEach((n, i) => {
      const angle = (2 * Math.PI * (i + 0.35)) / Math.max(outerNodes.length, 1) - Math.PI / 2;
      const x = centerX + outerRadius * Math.cos(angle) - 45;
      const y = centerY + outerRadius * Math.sin(angle) - 45;
      result.push(createCircularNode(n, x, y, false));
    });
  }

  return result;
}

/** Construct a Circular Node with custom styling */
function createCircularNode(
  n: GraphData['nodes'][0],
  x: number,
  y: number,
  isPatient: boolean
): Node {
  const style = CATEGORY_STYLES[n.type] || CATEGORY_STYLES.Disease;
  const size = isPatient ? 110 : 90;

  return {
    id: n.id,
    type: 'default',
    position: { x, y },
    data: {
      label: (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          padding: '8px 6px',
          textAlign: 'center',
          userSelect: 'none',
        }}>
          <span style={{ fontSize: isPatient ? 24 : 20, lineHeight: 1, marginBottom: 3 }}>
            {style.icon}
          </span>
          <span style={{
            fontSize: isPatient ? 12 : 10,
            fontWeight: 700,
            color: '#FFFFFF',
            lineHeight: 1.15,
            maxWidth: size - 14,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: isPatient ? 2 : 2,
            WebkitBoxOrient: 'vertical',
            wordBreak: 'break-word',
          }}>
            {n.label}
          </span>
          {isPatient && (
            <span style={{
              fontSize: 8,
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.8)',
              marginTop: 2,
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
            }}>
              Core Patient
            </span>
          )}
        </div>
      ),
      rawLabel: n.label,
      nodeType: n.type,
      categoryInfo: style,
    },
    style: {
      width: size,
      height: size,
      borderRadius: '50%',
      background: style.bg,
      border: `2.5px solid ${style.border}`,
      boxShadow: isPatient
        ? `0 0 35px ${style.glow}, 0 10px 25px rgba(0, 0, 0, 0.25)`
        : `0 0 20px ${style.glow}, 0 6px 16px rgba(0, 0, 0, 0.15)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      transition: 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s ease',
      padding: 0,
    },
  };
}

/** Construct Edges with smooth step curves and badge labels */
function createStyledEdges(rawEdges: GraphData['edges'], activeNodes: Node[]): Edge[] {
  const activeIds = new Set(activeNodes.map((n) => n.id));

  return rawEdges
    .filter((e) => activeIds.has(e.source) && activeIds.has(e.target))
    .map((e, i) => {
      const cfg = EDGE_CONFIGS[e.relation] || { stroke: '#94A3B8', label: e.relation.toLowerCase().replace(/_/g, ' '), isAnimated: false };

      return {
        id: `e-${i}-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        label: cfg.label,
        type: ConnectionLineType.SmoothStep,
        animated: cfg.isAnimated,
        labelStyle: {
          fontSize: 9,
          fill: cfg.stroke,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.4px',
          fontFamily: 'Inter, sans-serif',
        },
        labelBgStyle: {
          fill: '#FFFFFF',
          fillOpacity: 0.95,
          stroke: `${cfg.stroke}40`,
          strokeWidth: 1,
        },
        labelBgPadding: [6, 4] as [number, number],
        labelBgBorderRadius: 10,
        style: {
          stroke: cfg.stroke,
          strokeWidth: 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: cfg.stroke,
          width: 14,
          height: 12,
        },
      };
    });
}

export default function GraphTab({ patientId }: { patientId: string }) {
  const [rawData, setRawData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');

  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      const data = await get<GraphData>(`/patients/${patientId}/graph`);
      const sanitized = sanitizeGraphData(data);
      setRawData(sanitized);
      setError('');
    } catch {
      setError('Failed to load clinical ontology graph.');
    }
    setLoading(false);
  }, [patientId]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  const { nodes, edges } = useMemo(() => {
    if (!rawData) return { nodes: [], edges: [] };
    const computedNodes = computeCircularLayout(rawData.nodes, activeCategoryFilter);
    const computedEdges = createStyledEdges(rawData.edges, computedNodes);
    return { nodes: computedNodes, edges: computedEdges };
  }, [rawData, activeCategoryFilter]);

  if (loading) return <div className="skeleton skeleton-chart" style={{ height: 550, borderRadius: 12 }} />;
  if (error) {
    return (
      <div className="error-banner" style={{ margin: '20px 0' }}>
        <span>{error}</span>
        <button className="btn btn-sm" onClick={loadGraph}>Retry</button>
      </div>
    );
  }

  const selectedData = selectedNode?.data as {
    rawLabel?: string;
    nodeType?: string;
    categoryInfo?: CategoryStyle;
  } | undefined;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--color-border)', borderRadius: 12 }}>
      {/* ── Top Header & Filter Toolbar ── */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--color-border)',
        background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>🕸️</span>
            <h2 className="text-heading" style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              Medical Ontology & Knowledge Graph
            </h2>
          </div>
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
            Connected clinical network of patient diagnoses, comorbidities, active medications, care team, and real-time sepsis windows.
          </p>
        </div>

        {/* ── Category Filter Pills ── */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { key: 'all', label: 'All Entities', icon: '🌐' },
            { key: 'Disease', label: 'Conditions', icon: '🦠' },
            { key: 'Medication', label: 'Medications', icon: '💊' },
            { key: 'Clinician', label: 'Care Team', icon: '👨‍⚕️' },
            { key: 'ProgressionState', label: 'Risk State', icon: '📈' },
          ].map((cat) => (
            <button
              key={cat.key}
              onClick={() => setActiveCategoryFilter(cat.key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 12px',
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                border: activeCategoryFilter === cat.key ? '1.5px solid #0284C7' : '1px solid var(--color-border)',
                background: activeCategoryFilter === cat.key ? '#E0F2FE' : '#FFFFFF',
                color: activeCategoryFilter === cat.key ? '#0369A1' : 'var(--color-text-secondary)',
                transition: 'all 0.2s ease',
              }}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── React Flow Canvas with Circular Nodes ── */}
      <div style={{ height: 560, position: 'relative', background: '#F8FAFC' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          onNodeClick={(_, node) => setSelectedNode(node)}
          proOptions={{ hideAttribution: true }}
          minZoom={0.3}
          maxZoom={2}
        >
          <Background color="#CBD5E1" gap={24} size={1.2} />
          <Controls
            showInteractive={false}
            style={{
              background: '#FFFFFF',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
            }}
          />
          <MiniMap
            nodeColor={(n) => {
              const t = (n.data as { nodeType?: string })?.nodeType;
              return CATEGORY_STYLES[t || '']?.border || '#64748B';
            }}
            style={{
              background: '#FFFFFF',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
            }}
            maskColor="rgba(241, 245, 249, 0.7)"
          />
        </ReactFlow>

        {/* ── Floating Legend Overlay ── */}
        <div style={{
          position: 'absolute',
          top: 14,
          left: 14,
          display: 'flex',
          gap: 6,
          background: 'rgba(255, 255, 255, 0.92)',
          backdropFilter: 'blur(8px)',
          padding: '6px 12px',
          borderRadius: 24,
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          pointerEvents: 'none',
        }}>
          {Object.entries(CATEGORY_STYLES).slice(0, 5).map(([key, style]) => (
            <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, color: '#475569' }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: style.border,
                display: 'inline-block',
              }} />
              {style.label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Node Inspection Drawer ── */}
      {selectedNode && selectedData && (
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid var(--color-border)',
          background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          animation: 'fadeIn 0.2s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: selectedData.categoryInfo?.bg || '#64748B',
              border: `2px solid ${selectedData.categoryInfo?.border || '#94A3B8'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              boxShadow: `0 0 12px ${selectedData.categoryInfo?.glow || 'transparent'}`,
            }}>
              {selectedData.categoryInfo?.icon || '📋'}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong style={{ fontSize: 15, color: 'var(--color-text-primary)' }}>
                  {selectedData.rawLabel}
                </strong>
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 12,
                  background: selectedData.categoryInfo?.badgeBg || '#F1F5F9',
                  color: selectedData.categoryInfo?.badgeText || '#475569',
                  textTransform: 'uppercase',
                  letterSpacing: '0.4px',
                }}>
                  {selectedData.categoryInfo?.label || selectedData.nodeType}
                </span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '2px 0 0' }}>
                {selectedData.nodeType === 'Patient' && 'Central patient subject in the current clinical ICU pathway.'}
                {selectedData.nodeType === 'Disease' && 'Diagnosed clinical condition or chronic comorbidity linked via SNOMED/ICD ontology.'}
                {selectedData.nodeType === 'Medication' && 'Active pharmacological agent prescribed in the current EHR treatment plan.'}
                {selectedData.nodeType === 'Clinician' && 'Attending clinician responsible for escalation alerts and intervention decisions.'}
                {selectedData.nodeType === 'ProgressionState' && 'Current AI-inferred sepsis risk trajectory calculated from streaming multi-parameter vitals.'}
                {selectedData.nodeType === 'InterventionWindow' && 'Active therapeutic window requiring rapid clinical response.'}
                {selectedData.nodeType === 'Intervention' && 'Clinical protocol or bundle executed for this patient.'}
                {selectedData.nodeType === 'SimilarPatient' && 'Matched retrospective patient case with proven positive response.'}
              </p>
            </div>
          </div>

          <button
            className="btn btn-sm"
            onClick={() => setSelectedNode(null)}
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              background: '#F1F5F9',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
              fontWeight: 600,
              fontSize: 12,
            }}
          >
            ✕ Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
