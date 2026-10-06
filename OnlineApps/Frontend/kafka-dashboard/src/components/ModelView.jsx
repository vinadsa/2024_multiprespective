import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Cpu,
  Layers,
  Maximize2,
  Radio,
  RefreshCw,
  RotateCcw,
  Workflow,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { fetchCaseMarking, fetchMasterModel } from '../lib/api';
import { layoutPetriNet } from '../lib/petriLayout';
import PlaceNode from './nodes/PlaceNode';
import TransitionNode from './nodes/TransitionNode';

const nodeTypes = {
  placeNode: PlaceNode,
  transitionNode: TransitionNode,
};

/**
 * Inner Canvas component with ReactFlow controls and dynamic token overlay
 */
function ModelCanvas({
  rawData,
  onRefresh,
  isRefreshing,
  theme,
  mode,
  setMode,
  inspectedCaseId,
  setInspectedCaseId,
  caseData,
  activeCasesList = [],
}) {
  const { fitView, zoomIn, zoomOut } = useReactFlow();

  const { initialNodes, initialEdges } = useMemo(() => {
    if (!rawData?.nodes || !rawData?.edges) return { initialNodes: [], initialEdges: [] };
    const { nodes, edges } = layoutPetriNet(rawData.nodes, rawData.edges, 'LR');
    return { initialNodes: nodes, initialEdges: edges };
  }, [rawData]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [isHudMinimized, setIsHudMinimized] = useState(false);

  // Sync state whenever rawData changes
  useEffect(() => {
    if (rawData?.nodes && rawData?.edges) {
      const layouted = layoutPetriNet(rawData.nodes, rawData.edges, 'LR');
      setNodes(layouted.nodes);
      setEdges(layouted.edges);
      setTimeout(() => {
        fitView({ padding: 0.2, duration: 400 });
      }, 50);
    }
  }, [rawData, setNodes, setEdges, fitView]);

  const handleReLayout = useCallback(() => {
    if (rawData?.nodes && rawData?.edges) {
      const layouted = layoutPetriNet(rawData.nodes, rawData.edges, 'LR');
      setNodes(layouted.nodes);
      setEdges(layouted.edges);
      setTimeout(() => {
        fitView({ padding: 0.2, duration: 400 });
      }, 50);
    }
  }, [rawData, setNodes, setEdges, fitView]);

  // Tooltip state with debouncer & instant dismiss on click
  const [activeTooltip, setActiveTooltip] = useState(null);
  const tooltipTimerRef = useRef(null);

  const handleTooltipHover = useCallback((id) => {
    clearTimeout(tooltipTimerRef.current);
    tooltipTimerRef.current = setTimeout(() => {
      setActiveTooltip(id);
    }, 350);
  }, []);

  const handleTooltipLeave = useCallback(() => {
    clearTimeout(tooltipTimerRef.current);
    setActiveTooltip(null);
  }, []);

  const handleButtonClick = useCallback((action) => {
    clearTimeout(tooltipTimerRef.current);
    setActiveTooltip(null);
    action();
  }, []);

  useEffect(() => {
    return () => clearTimeout(tooltipTimerRef.current);
  }, []);

  // Compute decorated nodes based on master mode vs dynamic case overlay
  const displayNodes = useMemo(() => {
    if (!nodes) return [];
    if (mode === 'master' || !caseData) {
      return nodes.map((node) => {
        if (node.type === 'placeNode') {
          return {
            ...node,
            data: {
              ...node.data,
              token: node.data.is_source || node.data.name === 'source' ? 1 : 0,
              missing: 0,
            },
          };
        }
        return {
          ...node,
          data: {
            ...node.data,
            isEnabled: false,
            isActive: false,
          },
        };
      });
    }

    return nodes.map((node) => {
      if (node.type === 'placeNode') {
        const placeName = node.data.name;
        const mark = caseData.marking?.[placeName];
        return {
          ...node,
          data: {
            ...node.data,
            token: mark?.token ?? 0,
            missing: mark?.missing ?? 0,
            consumed: mark?.consumed ?? 0,
            produced: mark?.produced ?? 0,
          },
        };
      }
      if (node.type === 'transitionNode') {
        const transName = node.data.name;
        const transLabel = node.data.label;
        const isEnabled = Boolean(
          caseData.enabled_transitions?.includes(transName) ||
            caseData.enabled_transitions?.includes(node.id) ||
            caseData.enabled_transitions?.includes(transLabel)
        );
        const isActive = Boolean(
          caseData.last_activity &&
            (caseData.last_activity === transLabel || caseData.last_activity === transName)
        );
        return {
          ...node,
          data: {
            ...node.data,
            isEnabled,
            isActive,
          },
        };
      }
      return node;
    });
  }, [nodes, mode, caseData]);

  // Compute decorated edges with active flow animations
  const displayEdges = useMemo(() => {
    if (!edges) return [];
    if (mode === 'master' || !caseData) {
      return edges.map((e) => ({
        ...e,
        animated: false,
        style: { stroke: 'var(--text-muted)', strokeWidth: 1.75 },
        markerEnd: { ...e.markerEnd, color: 'var(--text-muted)' },
      }));
    }

    const activePlaces = new Set();
    if (caseData.marking) {
      Object.entries(caseData.marking).forEach(([pName, pInfo]) => {
        if (pInfo?.token > 0) activePlaces.add(pName);
      });
    }

    const enabledTrans = new Set(caseData.enabled_transitions || []);

    return edges.map((e) => {
      const sourceHasToken = activePlaces.has(e.source);
      const targetIsEnabled = enabledTrans.has(e.target);

      if (sourceHasToken && targetIsEnabled) {
        return {
          ...e,
          animated: true,
          style: { stroke: 'var(--system-blue)', strokeWidth: 2.5 },
          markerEnd: { ...e.markerEnd, color: 'var(--system-blue)' },
        };
      }
      if (sourceHasToken) {
        return {
          ...e,
          animated: true,
          style: { stroke: 'var(--system-accent, var(--system-blue))', strokeWidth: 2.25 },
          markerEnd: { ...e.markerEnd, color: 'var(--system-accent, var(--system-blue))' },
        };
      }

      return {
        ...e,
        animated: false,
        style: { stroke: 'var(--text-muted)', strokeWidth: 1.75 },
        markerEnd: { ...e.markerEnd, color: 'var(--text-muted)' },
      };
    });
  }, [edges, mode, caseData]);

  // MiniMap node color logic
  const nodeColor = useCallback(
    (node) => {
      if (node.type === 'placeNode') {
        const placeName = node.data?.name;
        if (caseData?.marking?.[placeName]?.token > 0) return 'var(--system-red)';
        if (node.data?.is_source) return 'var(--system-green)';
        if (node.data?.is_sink) return 'var(--text-muted)';
        return 'var(--system-blue)';
      }
      if (node.type === 'transitionNode') {
        if (node.data?.isEnabled) return 'var(--system-blue)';
        if (node.data?.isActive) return 'var(--system-green)';
      }
      return 'var(--text-muted)';
    },
    [caseData]
  );

  const stats = rawData?.stats || {
    places_count: nodes.filter((n) => n.type === 'placeNode').length,
    transitions_count: nodes.filter((n) => n.type === 'transitionNode').length,
    arcs_count: edges.length,
  };

  const isCaseActive = mode !== 'master' && Boolean(inspectedCaseId);

  return (
    <div className="petri-canvas-wrapper">
      {/* Floating Center Case Selector Bar (Apple HIG Segmented Glass Dock) */}
      <div className="petri-case-selector-bar" role="region" aria-label="Mode & Case Selector">
        {/* Segmented Mode Control */}
        <div className="petri-segmented-control" role="tablist" aria-label="Viewing Mode">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'master'}
            className={`petri-segmented-btn ${mode === 'master' ? 'petri-segmented-btn--active' : ''}`}
            onClick={() => {
              setMode('master');
              setInspectedCaseId(null);
            }}
          >
            <Workflow size={13} aria-hidden="true" />
            <span>SOP Master</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={mode === 'live'}
            className={`petri-segmented-btn ${mode === 'live' ? 'petri-segmented-btn--active' : ''}`}
            onClick={() => {
              setMode('live');
              if (activeCasesList.length > 0) {
                const targetCase = inspectedCaseId || activeCasesList[0].case_id;
                setInspectedCaseId(targetCase);
              }
            }}
            title="Ikuti kasus yang sedang aktif secara otomatis (Live Stream)"
          >
            <Radio size={13} className={mode === 'live' ? 'petri-pulse-icon' : ''} aria-hidden="true" />
            <span>Live Follow</span>
            {activeCasesList.length > 0 && (
              <span className="petri-badge-count">{activeCasesList.length}</span>
            )}
          </button>
        </div>

        {/* Subtle Vertical Divider */}
        <span className="petri-case-selector-divider" aria-hidden="true" />

        {/* Case Picker Control */}
        <div className={`petri-case-picker ${inspectedCaseId ? 'petri-case-picker--active' : ''}`}>
          <label htmlFor="petri-case-select" className="visually-hidden">
            Pilih Kasus untuk Diinspeksi
          </label>
          <Layers size={13} className="petri-picker-icon" aria-hidden="true" />
          <select
            id="petri-case-select"
            className="petri-picker-select"
            value={inspectedCaseId || ''}
            onChange={(e) => {
              const val = e.target.value;
              if (!val) {
                setMode('master');
                setInspectedCaseId(null);
              } else {
                setMode('case');
                setInspectedCaseId(val);
              }
            }}
          >
            <option value="">
              {activeCasesList.length === 0 ? 'Pilih Kasus...' : 'Pilih Kasus Aktif...'}
            </option>
            {activeCasesList.map((c) => (
              <option key={c.case_id} value={c.case_id}>
                Case #{c.case_id} · {c.last_activity} {c.has_deviations ? '⚠️' : '✅'}
              </option>
            ))}
            {inspectedCaseId && !activeCasesList.some((c) => String(c.case_id) === String(inspectedCaseId)) && (
              <option value={inspectedCaseId}>Case #{inspectedCaseId} (Terpilih)</option>
            )}
          </select>
          <ChevronDown size={11} className="petri-picker-arrow" aria-hidden="true" />
          {inspectedCaseId && (
            <button
              type="button"
              className="petri-picker-clear-btn"
              onClick={() => {
                setMode('master');
                setInspectedCaseId(null);
              }}
              title="Kembali ke SOP Master"
              aria-label="Batalkan pilihan kasus"
            >
              <X size={10} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Floating Info Pill & Legend */}
      <div className="petri-legend-card" role="region" aria-label="Model Legend & Statistics">
        <div className="petri-legend-header">
          <div className="petri-legend-title">
            <Workflow size={15} className="petri-legend-icon" aria-hidden="true" />
            <span>
              {isCaseActive ? `Execution State (Case #${inspectedCaseId})` : 'Master Petri Net (SOP)'}
            </span>
          </div>
          <span className="petri-stats-pill">
            {stats.places_count} Places · {stats.transitions_count} Transitions · {stats.arcs_count} Arcs
          </span>
        </div>

        <div className="petri-legend-items">
          <span className="petri-legend-chip">
            <span className="legend-dot legend-dot--start" /> Start Place
          </span>
          <span className="petri-legend-chip">
            <span className="legend-dot legend-dot--place" /> Place
          </span>
          <span className="petri-legend-chip">
            <span className="legend-dot legend-dot--transition" /> Activity
          </span>
          <span className="petri-legend-chip">
            <span className="legend-dot legend-dot--end" /> Final Sink
          </span>
          {isCaseActive && (
            <>
              <span className="petri-legend-chip petri-legend-chip--highlight">
                <span className="legend-dot legend-dot--token" /> Active Token
              </span>
              <span className="petri-legend-chip petri-legend-chip--highlight">
                <span className="legend-dot legend-dot--ready" /> Ready Activity
              </span>
            </>
          )}
        </div>
      </div>

      {/* Floating Case Inspector HUD Card */}
      {isCaseActive && caseData && (
        <aside
          className={`petri-hud-card ${isHudMinimized ? 'petri-hud-card--minimized' : ''}`}
          aria-label="Case Inspector Details"
        >
          <div className="petri-hud-header">
            <div className="petri-hud-title-group">
              <Cpu size={14} className="petri-hud-icon" aria-hidden="true" />
              <span className="petri-hud-case-title">Case #{inspectedCaseId}</span>
              <span
                className={`petri-hud-status-badge ${
                  caseData.status === 'completed'
                    ? 'petri-hud-status-badge--completed'
                    : caseData.has_deviations
                    ? 'petri-hud-status-badge--deviation'
                    : 'petri-hud-status-badge--active'
                }`}
              >
                {caseData.status === 'completed'
                  ? 'Completed'
                  : caseData.status === 'timeout'
                  ? 'Timed Out'
                  : caseData.has_deviations
                  ? 'Deviating'
                  : 'Active'}
              </span>
            </div>

            <div className="petri-hud-actions">
              <button
                type="button"
                className="petri-hud-btn"
                onClick={() => setIsHudMinimized((prev) => !prev)}
                title={isHudMinimized ? 'Perluas detail inspektur' : 'Kecilkan'}
              >
                {isHudMinimized ? '+' : '–'}
              </button>
              <button
                type="button"
                className="petri-hud-btn"
                onClick={() => {
                  setMode('master');
                  setInspectedCaseId(null);
                }}
                title="Keluar ke SOP Master"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          {!isHudMinimized && (
            <div className="petri-hud-body">
              <div className="petri-hud-grid">
                <div className="petri-hud-metric">
                  <span className="petri-hud-metric-label">Active Tokens</span>
                  <span className="petri-hud-metric-value petri-hud-metric-value--token">
                    🔴 {caseData.total_active_tokens ?? 0}
                  </span>
                </div>
                <div className="petri-hud-metric">
                  <span className="petri-hud-metric-label">Missing Tokens</span>
                  <span
                    className={`petri-hud-metric-value ${
                      caseData.total_missing_tokens > 0 ? 'petri-hud-metric-value--missing' : ''
                    }`}
                  >
                    ⚠️ {caseData.total_missing_tokens ?? 0}
                  </span>
                </div>
                <div className="petri-hud-metric">
                  <span className="petri-hud-metric-label">Fitness Score</span>
                  <span className="petri-hud-metric-value">
                    {caseData.fitness != null
                      ? Number(caseData.fitness).toFixed(2)
                      : caseData.has_deviations
                      ? '0.85'
                      : '1.00'}
                  </span>
                </div>
                <div className="petri-hud-metric">
                  <span className="petri-hud-metric-label">Anomaly Score</span>
                  <span className="petri-hud-metric-value">
                    {caseData.anomaly_score != null ? `+${Number(caseData.anomaly_score).toFixed(1)}` : '0.0'}
                  </span>
                </div>
              </div>

              <div className="petri-hud-row">
                <span className="petri-hud-metric-label">Last Executed:</span>
                <span className="petri-hud-activity-name" title={caseData.last_activity || 'None'}>
                  {caseData.last_activity || '–'}
                </span>
              </div>

              {caseData.enabled_transitions?.length > 0 && (
                <div className="petri-hud-enabled-section">
                  <span className="petri-hud-metric-label">Ready Activities ({caseData.enabled_transitions.length}):</span>
                  <div className="petri-hud-chips-wrap">
                    {caseData.enabled_transitions.map((tName) => {
                      const foundNode = nodes.find((n) => n.id === tName || n.data?.name === tName);
                      const displayLabel = foundNode?.data?.label || tName;
                      return (
                        <span key={tName} className="petri-hud-chip" title={displayLabel}>
                          {displayLabel}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>
      )}

      {/* Floating Controls Toolbar with Cupertino Tooltips */}
      <div className="petri-toolbar" role="toolbar" aria-label="Canvas controls">
        <div
          className="petri-toolbar-item"
          onMouseEnter={() => handleTooltipHover('zoomIn')}
          onMouseLeave={handleTooltipLeave}
        >
          <button
            type="button"
            className="petri-toolbar-btn"
            onClick={(e) => {
              e.currentTarget.blur();
              handleButtonClick(() => zoomIn({ duration: 250 }));
            }}
            aria-label="Zoom In"
            onFocus={() => handleTooltipHover('zoomIn')}
            onBlur={handleTooltipLeave}
          >
            <ZoomIn size={15} />
          </button>
          <div
            className={`petri-tooltip ${activeTooltip === 'zoomIn' ? 'petri-tooltip--visible' : ''}`}
            role="tooltip"
          >
            <span className="petri-tooltip__title">Zoom In</span>
            <span className="petri-tooltip__desc">Perbesar skala kanvas model</span>
          </div>
        </div>

        <div
          className="petri-toolbar-item"
          onMouseEnter={() => handleTooltipHover('zoomOut')}
          onMouseLeave={handleTooltipLeave}
        >
          <button
            type="button"
            className="petri-toolbar-btn"
            onClick={(e) => {
              e.currentTarget.blur();
              handleButtonClick(() => zoomOut({ duration: 250 }));
            }}
            aria-label="Zoom Out"
            onFocus={() => handleTooltipHover('zoomOut')}
            onBlur={handleTooltipLeave}
          >
            <ZoomOut size={15} />
          </button>
          <div
            className={`petri-tooltip ${activeTooltip === 'zoomOut' ? 'petri-tooltip--visible' : ''}`}
            role="tooltip"
          >
            <span className="petri-tooltip__title">Zoom Out</span>
            <span className="petri-tooltip__desc">Perkecil skala kanvas model</span>
          </div>
        </div>

        <div
          className="petri-toolbar-item"
          onMouseEnter={() => handleTooltipHover('fitView')}
          onMouseLeave={handleTooltipLeave}
        >
          <button
            type="button"
            className="petri-toolbar-btn"
            onClick={(e) => {
              e.currentTarget.blur();
              handleButtonClick(() => fitView({ padding: 0.2, duration: 300 }));
            }}
            aria-label="Fit View"
            onFocus={() => handleTooltipHover('fitView')}
            onBlur={handleTooltipLeave}
          >
            <Maximize2 size={15} />
          </button>
          <div
            className={`petri-tooltip ${activeTooltip === 'fitView' ? 'petri-tooltip--visible' : ''}`}
            role="tooltip"
          >
            <span className="petri-tooltip__title">Fit View</span>
            <span className="petri-tooltip__desc">Pusatkan seluruh model ke layar</span>
          </div>
        </div>

        <span className="petri-toolbar-divider" aria-hidden="true" />

        <div
          className="petri-toolbar-item"
          onMouseEnter={() => handleTooltipHover('reLayout')}
          onMouseLeave={handleTooltipLeave}
        >
          <button
            type="button"
            className="petri-toolbar-btn"
            onClick={(e) => {
              e.currentTarget.blur();
              handleButtonClick(handleReLayout);
            }}
            aria-label="Re-layout DAG"
            onFocus={() => handleTooltipHover('reLayout')}
            onBlur={handleTooltipLeave}
          >
            <RotateCcw size={15} />
          </button>
          <div
            className={`petri-tooltip petri-tooltip--right ${
              activeTooltip === 'reLayout' ? 'petri-tooltip--visible' : ''
            }`}
            role="tooltip"
          >
            <span className="petri-tooltip__title">Re-layout DAG</span>
            <span className="petri-tooltip__desc">
              Tata ulang posisi node kanvas ke susunan awal (klien lokal, tanpa panggil API/DB).
            </span>
          </div>
        </div>

        <div
          className="petri-toolbar-item"
          onMouseEnter={() => handleTooltipHover('reload')}
          onMouseLeave={handleTooltipLeave}
        >
          <button
            type="button"
            className="petri-toolbar-btn"
            onClick={(e) => {
              e.currentTarget.blur();
              handleButtonClick(onRefresh);
            }}
            disabled={isRefreshing}
            aria-label="Reload Model from Neo4j"
            onFocus={() => handleTooltipHover('reload')}
            onBlur={handleTooltipLeave}
          >
            <RefreshCw size={15} className={isRefreshing ? 'spin-icon' : ''} />
          </button>
          <div
            className={`petri-tooltip petri-tooltip--right ${
              activeTooltip === 'reload' ? 'petri-tooltip--visible' : ''
            }`}
            role="tooltip"
          >
            <span className="petri-tooltip__title">Reload from Neo4j</span>
            <span className="petri-tooltip__desc">
              Ambil ulang topologi model master terbaru langsung dari database Neo4j.
            </span>
          </div>
        </div>
      </div>

      {/* React Flow Core */}
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2.5}
        defaultEdgeOptions={{
          type: 'smoothstep',
          style: { strokeWidth: 1.75, stroke: 'var(--text-muted)' },
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1.2}
          color={theme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)'}
        />

        <MiniMap
          nodeColor={nodeColor}
          nodeStrokeWidth={2}
          maskColor={theme === 'dark' ? 'rgba(0, 0, 0, 0.65)' : 'rgba(240, 240, 245, 0.7)'}
          className="petri-minimap"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}

/**
 * Master Process Model View Component with Phase 2 Dynamic Token Overlay
 */
export default function ModelView({
  apiUrl,
  theme,
  selectedCaseId = null,
  onSelectCase = null,
  activeCasesList = [],
  latestLifecycleEvent = null,
}) {
  const [modelData, setModelData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Overlay state
  const [mode, setMode] = useState(selectedCaseId ? 'case' : 'master');
  const [inspectedCaseId, setInspectedCaseId] = useState(selectedCaseId ? String(selectedCaseId) : null);
  const [caseData, setCaseData] = useState(null);

  // Track the last external prop to prevent self-trigger feedback loops
  const lastPropCaseIdRef = useRef(selectedCaseId);

  // Synchronize when outer selectedCaseId changes from external triggers (e.g. Inspect button in MonitorView)
  useEffect(() => {
    if (selectedCaseId != null && String(selectedCaseId) !== String(lastPropCaseIdRef.current)) {
      lastPropCaseIdRef.current = String(selectedCaseId);
      setMode('case');
      setInspectedCaseId(String(selectedCaseId));
    } else if (selectedCaseId == null && lastPropCaseIdRef.current != null) {
      lastPropCaseIdRef.current = null;
    }
  }, [selectedCaseId]);

  // Load Master Petri Net Toplogy
  const loadModel = useCallback(
    async (isManual = false) => {
      if (isManual) setIsRefreshing(true);
      else setLoading(true);
      setError(null);

      const controller = new AbortController();
      try {
        const response = await fetchMasterModel(apiUrl, controller.signal);
        if (response.status === 'success' && response.data) {
          setModelData(response.data);
        } else {
          throw new Error(response.message || 'Failed to parse model structure');
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Failed to connect to Neo4j Master Model');
        }
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [apiUrl]
  );

  useEffect(() => {
    loadModel(false);
  }, [loadModel]);

  // Fetch case marking from REST when a specific case is selected
  const loadCaseMarking = useCallback(
    async (caseId) => {
      if (!caseId) {
        setCaseData(null);
        return;
      }
      const controller = new AbortController();
      try {
        const res = await fetchCaseMarking(apiUrl, caseId, controller.signal);
        if (res.status === 'success' && res.data) {
          setCaseData({
            ...res.data,
            status: res.data.is_active ? 'active' : 'completed',
          });
        } else {
          console.warn(`Marking not found for case ${caseId}`);
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error(`Failed to fetch marking for case ${caseId}:`, err);
        }
      }
    },
    [apiUrl]
  );

  useEffect(() => {
    if (inspectedCaseId && mode !== 'master') {
      loadCaseMarking(inspectedCaseId);
    } else {
      setCaseData(null);
    }
  }, [inspectedCaseId, mode, loadCaseMarking]);

  // Listen to WebSocket latestLifecycleEvent for 0ms token updates
  useEffect(() => {
    if (!latestLifecycleEvent) return;

    const eventCaseId = String(latestLifecycleEvent.case_id);

    // If in Live Follow mode, auto-follow incoming event's case
    if (mode === 'live') {
      if (inspectedCaseId !== eventCaseId) {
        setInspectedCaseId(eventCaseId);
      }
    }

    // If incoming event is for our currently inspected case, apply live marking update
    if (inspectedCaseId && String(inspectedCaseId) === eventCaseId) {
      const {
        action,
        activity,
        current_marking,
        enabled_transitions,
        fitness,
        score,
        has_deviations,
        total_missing_tokens,
        total_active_tokens,
        marking,
        recap,
      } = latestLifecycleEvent;

      setCaseData((prev) => {
        const nextMarking = { ...(prev?.marking || {}) };

        if (marking && typeof marking === 'object' && Object.keys(marking).length > 0) {
          // Full marking map with token & missing per place from backend
          Object.entries(marking).forEach(([pName, pData]) => {
            nextMarking[pName] = {
              ...(nextMarking[pName] || {}),
              token: pData.token ?? 0,
              missing: pData.missing ?? 0,
              consumed: pData.consumed ?? 0,
              produced: pData.produced ?? 0,
              is_final: Boolean(pData.is_final),
            };
          });
        } else if (Array.isArray(current_marking)) {
          // Reset previous tokens and mark current places with token = 1
          Object.keys(nextMarking).forEach((p) => {
            nextMarking[p] = { ...nextMarking[p], token: 0 };
          });
          current_marking.forEach((pName) => {
            nextMarking[pName] = { ...(nextMarking[pName] || {}), token: 1 };
          });
        }

        const calculatedActive =
          total_active_tokens != null
            ? total_active_tokens
            : Object.values(nextMarking).reduce((sum, p) => sum + (p?.token || 0), 0);

        const calculatedMissing =
          total_missing_tokens != null
            ? total_missing_tokens
            : recap?.missing != null
            ? recap.missing
            : prev?.total_missing_tokens ?? 0;

        const calculatedFitness =
          fitness != null
            ? fitness
            : recap?.fitness != null
            ? recap.fitness
            : prev?.fitness;

        return {
          marking: nextMarking,
          enabled_transitions: Array.isArray(enabled_transitions)
            ? enabled_transitions
            : prev?.enabled_transitions || [],
          total_active_tokens: calculatedActive,
          total_missing_tokens: calculatedMissing,
          is_active: action !== 'completed' && action !== 'timeout',
          last_activity: activity || prev?.last_activity,
          anomaly_score: score != null ? score : prev?.anomaly_score,
          has_deviations: has_deviations != null ? has_deviations : prev?.has_deviations,
          fitness: calculatedFitness,
          status: action === 'completed' ? 'completed' : action === 'timeout' ? 'timeout' : 'active',
        };
      });
    }
  }, [latestLifecycleEvent, mode, inspectedCaseId]);

  const handleSelectCase = useCallback(
    (id) => {
      lastPropCaseIdRef.current = id != null ? String(id) : null;
      setInspectedCaseId(id != null ? String(id) : null);
      if (onSelectCase) onSelectCase(id);
    },
    [onSelectCase]
  );

  if (loading) {
    return (
      <div className="model-view-loading" aria-busy="true">
        <span className="spinner spinner--accent" aria-hidden="true" />
        <p className="model-view-loading__text">Loading Master Petri Net Model...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="model-view-error">
        <div className="model-view-error__card">
          <AlertCircle size={28} className="model-view-error__icon" aria-hidden="true" />
          <h3 className="model-view-error__title">Unable to Load Process Model</h3>
          <p className="model-view-error__msg">{error}</p>
          <button type="button" className="btn-retry" onClick={() => loadModel(true)}>
            <RefreshCw size={14} aria-hidden="true" />
            <span>Retry Connection</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="model-view-container">
      <ReactFlowProvider>
        <ModelCanvas
          rawData={modelData}
          onRefresh={() => loadModel(true)}
          isRefreshing={isRefreshing}
          theme={theme}
          mode={mode}
          setMode={setMode}
          inspectedCaseId={inspectedCaseId}
          setInspectedCaseId={handleSelectCase}
          caseData={caseData}
          activeCasesList={activeCasesList}
        />
      </ReactFlowProvider>
    </div>
  );
}
