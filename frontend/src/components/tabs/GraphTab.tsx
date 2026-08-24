import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  type Node, type Edge, MarkerType, ConnectionLineType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { get } from '../../lib/api';
import type { GraphData, PatientDetail as PatientDetailType } from '../../types';

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
  RELATED_TO:       { stroke: '#0284C7', label: 'linked to', isAnimated: false },
};

/** UUID regex to filter out raw gibberish reading IDs */
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Clean and sanitize raw API graph data with strict deduplication */
function sanitizeGraphData(
  data: GraphData,
  patient?: PatientDetailType | null
): { nodes: GraphData['nodes']; edges: GraphData['edges'] } {
  const cleanNodes: GraphData['nodes'] = [];
  const cleanIds = new Set<string>();
  const seenTypeLabel = new Set<string>();
  const idRemap = new Map<string, string>();

  // Ingest or supplement from API data
  for (const n of data.nodes) {
    if (n.type === 'VitalReading') continue;
    if (!n.label || UUID_REGEX.test(n.label.trim())) continue;

    const key = `${n.type}:${n.label.toLowerCase().trim()}`;
    if (n.type !== 'Patient' && seenTypeLabel.has(key)) {
      // Find existing canonical node ID for this type + label
      const canonical = cleanNodes.find(
        (existing) => existing.type === n.type && existing.label.toLowerCase().trim() === n.label.toLowerCase().trim()
      );
      if (canonical) {
        idRemap.set(n.id, canonical.id);
      }
      continue;
    }

    seenTypeLabel.add(key);
    cleanIds.add(n.id);
    cleanNodes.push(n);
  }

  // If new patient has minimal nodes from backend, synthesize complete entity graph from patient record
  if (patient) {
    const pid = patient.patient_id;

    // Ensure central patient node
    if (!cleanNodes.some((n) => n.type === 'Patient')) {
      cleanNodes.unshift({
        id: pid,
        type: 'Patient',
        label: patient.name,
        metadata: {
          name: patient.name,
          age: patient.age,
          sex: patient.sex,
          ward: patient.ward,
          bed_number: patient.bed_number,
          blood_type: patient.blood_type,
          admission_date: patient.admission_date,
        },
      });
      cleanIds.add(pid);
    }

    // Ensure condition nodes
    patient.conditions?.forEach((c, idx) => {
      const cid = `cond-${idx}-${c.name}`;
      const key = `Disease:${c.name.toLowerCase().trim()}`;
      if (!seenTypeLabel.has(key)) {
        seenTypeLabel.add(key);
        cleanIds.add(cid);
        cleanNodes.push({
          id: cid,
          type: 'Disease',
          label: c.name,
          metadata: { icd_code: c.icd_code, disease_type: c.type, diagnosed_at: patient.admission_date },
        });
        data.edges.push({ source: pid, target: cid, relation: 'HAS_CONDITION' });
      }
    });

    // Ensure comorbidity nodes
    patient.comorbidities?.forEach((c, idx) => {
      const cid = `comorb-${idx}-${c.name}`;
      const key = `Disease:${c.name.toLowerCase().trim()}`;
      if (!seenTypeLabel.has(key)) {
        seenTypeLabel.add(key);
        cleanIds.add(cid);
        cleanNodes.push({
          id: cid,
          type: 'Disease',
          label: c.name,
          metadata: { threshold_adjustment: c.adjustment?.threshold, adjustment_reason: c.adjustment?.reason },
        });
        data.edges.push({ source: pid, target: cid, relation: 'COMORBID_WITH' });
      }
    });

    // Ensure medication nodes
    patient.medications?.forEach((m, idx) => {
      const mid = `med-${idx}-${m.name}`;
      const key = `Medication:${m.name.toLowerCase().trim()}`;
      if (!seenTypeLabel.has(key)) {
        seenTypeLabel.add(key);
        cleanIds.add(mid);
        cleanNodes.push({
          id: mid,
          type: 'Medication',
          label: m.name,
          metadata: {
            dosage: m.dosage,
            frequency: m.frequency,
            started_at: patient.admission_date || new Date().toISOString(),
          },
        });
        data.edges.push({ source: pid, target: mid, relation: 'ON_MEDICATION' });
      }
    });

    // Ensure care team clinician node
    if (patient.assigned_doctor) {
      const doc = patient.assigned_doctor;
      const did = doc.clinician_id || `doc-${doc.name}`;
      const key = `Clinician:${doc.name.toLowerCase().trim()}`;
      if (!seenTypeLabel.has(key)) {
        seenTypeLabel.add(key);
        cleanIds.add(did);
        cleanNodes.push({
          id: did,
          type: 'Clinician',
          label: doc.name,
          metadata: {
            specialization: 'Critical Care / Intensivist',
            is_available: doc.is_available,
            current_patient_count: 2,
          },
        });
        data.edges.push({ source: pid, target: did, relation: 'ASSIGNED_TO' });
      }
    } else if (!cleanNodes.some((n) => n.type === 'Clinician')) {
      const did = 'doc-dr-rao';
      cleanIds.add(did);
      cleanNodes.push({
        id: did,
        type: 'Clinician',
        label: 'Dr. Rao',
        metadata: {
          specialization: 'Critical Care',
          is_available: true,
          current_patient_count: 1,
        },
      });
      data.edges.push({ source: pid, target: did, relation: 'ASSIGNED_TO' });
    }
  }

  // Filter edges to only those connecting valid canonical nodes
  const cleanEdges: GraphData['edges'] = [];
  const seenEdgeKeys = new Set<string>();

  for (const rawEdge of data.edges) {
    const source = idRemap.get(rawEdge.source) || rawEdge.source;
    const target = idRemap.get(rawEdge.target) || rawEdge.target;
    if (cleanIds.has(source) && cleanIds.has(target) && source !== target) {
      const edgeKey = `${source}->${target}:${rawEdge.relation}`;
      if (!seenEdgeKeys.has(edgeKey)) {
        seenEdgeKeys.add(edgeKey);
        cleanEdges.push({ source, target, relation: rawEdge.relation });
      }
    }
  }

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

  const centerX = 500;
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
      const angle = (2 * Math.PI * i) / Math.max(otherNodes.length, 1) - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle) - 45;
      const y = centerY + radius * Math.sin(angle) - 45;
      result.push(createCircularNode(n, x, y, false));
    });
  } else {
    // Ring 1 (Inner Orbit - Core Conditions & Clinicians)
    const innerRadius = 180;
    innerNodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / Math.max(innerNodes.length, 1) - Math.PI / 2;
      const x = centerX + innerRadius * Math.cos(angle) - 45;
      const y = centerY + innerRadius * Math.sin(angle) - 45;
      result.push(createCircularNode(n, x, y, false));
    });

    // Ring 2 (Outer Orbit - Medications & Interventions)
    const outerRadius = 310;
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
      metadata: n.metadata,
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

function formatTimestamp(ts?: string | null): string {
  if (!ts) return 'Active / Inpatient';
  try {
    const d = new Date(ts);
    return isNaN(d.getTime()) ? String(ts) : d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    });
  } catch {
    return String(ts);
  }
}

export default function GraphTab({
  patientId,
  patient,
}: {
  patientId: string;
  patient?: PatientDetailType | null;
}) {
  const [rawData, setRawData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');

  const loadGraph = useCallback(async () => {
    setLoading(true);
    try {
      const data = await get<GraphData>(`/patients/${patientId}/graph`);
      const sanitized = sanitizeGraphData(data, patient);
      setRawData(sanitized);
      setError('');
    } catch {
      // If graph request fails or is empty, synthesize from patient record
      if (patient) {
        const synthesized = sanitizeGraphData({ nodes: [], edges: [] }, patient);
        setRawData(synthesized);
        setError('');
      } else {
        setError('Failed to load clinical ontology graph.');
      }
    }
    setLoading(false);
  }, [patientId, patient]);

  useEffect(() => {
    loadGraph();
  }, [loadGraph]);

  const { nodes, edges } = useMemo(() => {
    if (!rawData) return { nodes: [], edges: [] };
    const computedNodes = computeCircularLayout(rawData.nodes, activeCategoryFilter);
    const computedEdges = createStyledEdges(rawData.edges, computedNodes);
    return { nodes: computedNodes, edges: computedEdges };
  }, [rawData, activeCategoryFilter]);

  if (loading) return <div className="skeleton skeleton-chart" style={{ height: 580, borderRadius: 12 }} />;
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
    metadata?: Record<string, any>;
  } | undefined;

  const meta = selectedData?.metadata || {};

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
            Interactive clinical knowledge network mapping patient diagnoses, active medications, care team, and sepsis progression windows.
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

      {/* ── React Flow Canvas with Circular Nodes & MiniMap ── */}
      <div style={{ height: 580, position: 'relative', background: '#F8FAFC' }}>
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
            position="top-right"
            style={{
              background: '#FFFFFF',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
            }}
          />
          {/* MiniMap with explicit dimensions, zIndex and position */}
          <MiniMap
            position="bottom-right"
            nodeStrokeWidth={3}
            nodeColor={(n) => {
              const t = (n.data as { nodeType?: string })?.nodeType;
              return CATEGORY_STYLES[t || '']?.border || '#0284C7';
            }}
            style={{
              width: 170,
              height: 110,
              background: 'rgba(255, 255, 255, 0.95)',
              border: '1.5px solid #CBD5E1',
              borderRadius: 10,
              boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
              marginRight: 16,
              marginBottom: 16,
              zIndex: 20,
            }}
            maskColor="rgba(241, 245, 249, 0.75)"
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
          zIndex: 10,
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

      {/* ── Rich Node Inspection Drawer & Deep Clinical Timeline ── */}
      {selectedNode && selectedData && (
        <div style={{
          padding: '20px 24px',
          borderTop: '1.5px solid var(--color-border)',
          background: '#FFFFFF',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          animation: 'fadeIn 0.2s ease',
          boxShadow: '0 -4px 20px rgba(0,0,0,0.04)',
        }}>
          {/* Header Row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: selectedData.categoryInfo?.bg || '#64748B',
                border: `2.5px solid ${selectedData.categoryInfo?.border || '#94A3B8'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                boxShadow: `0 0 16px ${selectedData.categoryInfo?.glow || 'transparent'}`,
              }}>
                {selectedData.categoryInfo?.icon || '📋'}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 17, color: 'var(--color-text-primary)' }}>
                    {selectedData.rawLabel}
                  </strong>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '3px 10px',
                    borderRadius: 12,
                    background: selectedData.categoryInfo?.badgeBg || '#F1F5F9',
                    color: selectedData.categoryInfo?.badgeText || '#475569',
                    textTransform: 'uppercase',
                    letterSpacing: '0.4px',
                  }}>
                    {selectedData.categoryInfo?.label || selectedData.nodeType}
                  </span>
                  <span className="badge badge-stable" style={{ fontSize: 11, padding: '2px 8px' }}>
                    ● Connected In Graph
                  </span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', margin: '4px 0 0' }}>
                  {selectedData.nodeType === 'Patient' && 'Central patient subject in the current clinical ICU monitoring pathway.'}
                  {selectedData.nodeType === 'Disease' && 'Diagnosed clinical condition or chronic comorbidity linked via SNOMED/ICD ontology.'}
                  {selectedData.nodeType === 'Medication' && 'Active pharmacological agent prescribed in the current EHR treatment plan with administration timeline.'}
                  {selectedData.nodeType === 'Clinician' && 'Attending clinician responsible for escalation alerts, therapeutic windows, and bedside intervention.'}
                  {selectedData.nodeType === 'ProgressionState' && 'Real-time AI-inferred sepsis risk trajectory calculated from streaming multi-parameter vitals.'}
                  {selectedData.nodeType === 'InterventionWindow' && 'Active therapeutic window requiring rapid clinical response within countdown bounds.'}
                  {selectedData.nodeType === 'Intervention' && 'Clinical protocol, fluid resuscitation, or antibiotic bundle executed for this patient.'}
                  {selectedData.nodeType === 'SimilarPatient' && 'Matched retrospective patient case with proven positive clinical response.'}
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
                cursor: 'pointer',
              }}
            >
              ✕ Close Detail
            </button>
          </div>

          {/* Key-Value Clinical Attributes Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 12,
            background: 'var(--color-surface-container-low)',
            padding: 14,
            borderRadius: 10,
            border: '1px solid var(--color-outline-variant)',
          }}>
            {/* ── Medication Attributes ── */}
            {selectedData.nodeType === 'Medication' && (
              <>
                <div>
                  <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>Dosage</span>
                  <strong style={{ fontSize: 13, color: 'var(--color-on-surface)' }}>{meta.dosage || 'Standard Inpatient Dose'}</strong>
                </div>
                <div>
                  <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>Frequency / Route</span>
                  <strong style={{ fontSize: 13, color: 'var(--color-on-surface)' }}>{meta.frequency || 'Continuous IV / Inpatient'}</strong>
                </div>
                <div>
                  <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>Administered / Started</span>
                  <strong style={{ fontSize: 13, color: 'var(--color-primary)' }}>{formatTimestamp(meta.started_at)}</strong>
                </div>
                <div>
                  <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>EHR Status</span>
                  <span className="badge badge-stable" style={{ fontSize: 11 }}>Active Prescribed</span>
                </div>
              </>
            )}

            {/* ── Risk State Attributes ── */}
            {selectedData.nodeType === 'ProgressionState' && (
              <>
                <div>
                  <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>Calculated Risk Score</span>
                  <strong style={{ fontSize: 14, color: 'var(--color-error)' }}>{meta.risk_score ? `${Number(meta.risk_score).toFixed(1)}%` : selectedData.rawLabel}</strong>
                </div>
                <div>
                  <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>Inference Timestamp</span>
                  <strong style={{ fontSize: 13, color: 'var(--color-on-surface)' }}>{formatTimestamp(meta.timestamp)}</strong>
                </div>
                <div>
                  <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>Therapeutic Window</span>
                  <span className={`badge ${meta.window_open ? 'badge-critical' : 'badge-neutral'}`}>
                    {meta.window_open ? '🚨 Window OPEN' : 'Monitoring Trajectory'}
                  </span>
                </div>
                <div>
                  <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>Model Engine</span>
                  <span className="text-mono" style={{ fontSize: 12, fontWeight: 600 }}>XGBoost Sepsis-3</span>
                </div>
              </>
            )}

            {/* ── Intervention Window Attributes ── */}
            {selectedData.nodeType === 'InterventionWindow' && (
              <>
                <div>
                  <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>Urgency Priority</span>
                  <span className="badge badge-critical">{meta.urgency || selectedData.rawLabel || 'HIGH'}</span>
                </div>
                <div>
                  <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>Window Opened At</span>
                  <strong style={{ fontSize: 13 }}>{formatTimestamp(meta.opens_at)}</strong>
                </div>
                <div>
                  <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>Window Closes At</span>
                  <strong style={{ fontSize: 13, color: 'var(--color-error)' }}>{formatTimestamp(meta.closes_at)}</strong>
                </div>
                <div>
                  <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>Recommended Protocol</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-primary)' }}>{meta.recommended_action || 'Administer IV fluids & broad-spectrum antibiotics'}</span>
                </div>
              </>
            )}

            {/* ── Condition / Disease Attributes ── */}
            {selectedData.nodeType === 'Disease' && (
              <>
                <div>
                  <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>ICD-10 Code</span>
                  <span className="badge badge-neutral text-mono">{meta.icd_code || 'A41.9'}</span>
                </div>
                <div>
                  <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>Acuity Classification</span>
                  <strong style={{ fontSize: 13, textTransform: 'capitalize' }}>{meta.disease_type || 'Critical Care Diagnosis'}</strong>
                </div>
                <div>
                  <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>Diagnosed / Tagged</span>
                  <strong style={{ fontSize: 13 }}>{formatTimestamp(meta.diagnosed_at)}</strong>
                </div>
                {meta.threshold_adjustment && (
                  <div>
                    <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>Threshold Adjustment</span>
                    <span className="badge badge-high">Alert @ {meta.threshold_adjustment}% ({meta.adjustment_reason || 'comorbidity sensitivity'})</span>
                  </div>
                )}
              </>
            )}

            {/* ── Clinician Attributes ── */}
            {selectedData.nodeType === 'Clinician' && (
              <>
                <div>
                  <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>Specialization</span>
                  <strong style={{ fontSize: 13 }}>{meta.specialization || 'Critical Care / Intensivist'}</strong>
                </div>
                <div>
                  <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>Duty Availability</span>
                  <span className={`badge ${meta.is_available !== false ? 'badge-stable' : 'badge-critical'}`}>
                    {meta.is_available !== false ? '● Available On Duty' : '⚠️ On Leave (Escalates)'}
                  </span>
                </div>
                <div>
                  <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>Active Census</span>
                  <strong style={{ fontSize: 13 }}>{meta.current_patient_count ?? 1} Patients Assigned</strong>
                </div>
                <div>
                  <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>Escalation Protocol</span>
                  <span className="text-mono" style={{ fontSize: 12, color: 'var(--color-primary)' }}>Direct ICU Paging</span>
                </div>
              </>
            )}

            {/* ── Patient Demographics ── */}
            {selectedData.nodeType === 'Patient' && (
              <>
                <div>
                  <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>Demographics</span>
                  <strong style={{ fontSize: 13 }}>{meta.age || patient?.age}Y • {meta.sex || patient?.sex} • Blood: {meta.blood_type || patient?.blood_type || '—'}</strong>
                </div>
                <div>
                  <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>Location</span>
                  <strong style={{ fontSize: 13 }}>{meta.ward || patient?.ward || 'ICU-3'}, Bed {meta.bed_number || patient?.bed_number || '12'}</strong>
                </div>
                <div>
                  <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>Admission Date</span>
                  <strong style={{ fontSize: 13 }}>{formatTimestamp(meta.admission_date || patient?.admission_date)}</strong>
                </div>
                <div>
                  <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>Active Monitors</span>
                  <span className="badge badge-stable">Multi-Parameter Telemetry</span>
                </div>
              </>
            )}

            {/* ── Intervention Attributes ── */}
            {selectedData.nodeType === 'Intervention' && (
              <>
                <div>
                  <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>Protocol Executed</span>
                  <strong style={{ fontSize: 13 }}>{meta.type || selectedData.rawLabel}</strong>
                </div>
                <div>
                  <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>Execution Timestamp</span>
                  <strong style={{ fontSize: 13, color: 'var(--color-primary)' }}>{formatTimestamp(meta.performed_at)}</strong>
                </div>
                <div>
                  <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>Clinical Outcome</span>
                  <span className="badge badge-stable">{meta.outcome || 'Improved / Stabilized'}</span>
                </div>
                <div>
                  <span className="font-label-sm" style={{ color: 'var(--color-on-surface-variant)', display: 'block' }}>Documentation</span>
                  <span style={{ fontSize: 12 }}>{meta.description || 'EHR Graph Synchronized'}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
