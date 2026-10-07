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
  AlertCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Database,
  Layers,
  Maximize2,
  RefreshCw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { fetchMasterModel } from '../../lib/api';
import { layoutPetriNet, NODE_DIMENSIONS } from '../../lib/petriLayout';
import PlaceNode from '../nodes/PlaceNode';
import TransitionNode from '../nodes/TransitionNode';

const nodeTypes = {
  placeNode: PlaceNode,
  transitionNode: TransitionNode,
};

/**
 * Inner canvas with React Flow controls and camera navigation
 */
function SnapshotCanvasInner({
  rawModelData,
  markingSnapshot = {},
  culpritActivity,
  selectedTraceStep,
  enabledTransitions = [],
  theme,
  isDrawerOpen,
  onToggleDrawer,
  onFocusNode,
}) {
  const { fitView, setCenter, zoomIn, zoomOut } = useReactFlow();

  // Compute layouted nodes and edges
  const { initialNodes, initialEdges } = useMemo(() => {
    if (!rawModelData?.nodes || !rawModelData?.edges) {
      return { initialNodes: [], initialEdges: [] };
    }
    const { nodes, edges } = layoutPetriNet(rawModelData.nodes, rawModelData.edges, 'LR');
    return { initialNodes: nodes, initialEdges: edges };
  }, [rawModelData]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync state whenever model data changes
  useEffect(() => {
    if (rawModelData?.nodes && rawModelData?.edges) {
      const layouted = layoutPetriNet(rawModelData.nodes, rawModelData.edges, 'LR');
      setNodes(layouted.nodes);
      setEdges(layouted.edges);
    }
  }, [rawModelData, setNodes, setEdges]);

  // Compute decorated nodes with frozen marking overlay and culprit highlight
  const displayNodes = useMemo(() => {
    if (!nodes || nodes.length === 0) return [];

    return nodes.map((node) => {
      if (node.type === 'placeNode') {
        const placeName = node.data.name || node.id;
        const mark = markingSnapshot[placeName];
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
        const transLabel = node.data.label;
        const transName = node.data.name;

        const isCulprit = Boolean(
          culpritActivity &&
          (transLabel === culpritActivity || transName === culpritActivity)
        );

        const isSelected = Boolean(
          selectedTraceStep &&
          (transLabel === selectedTraceStep || transName === selectedTraceStep)
        );

        const isEnabled = Boolean(
          enabledTransitions.includes(transName) ||
          enabledTransitions.includes(transLabel) ||
          enabledTransitions.includes(node.id)
        );

        return {
          ...node,
          data: {
            ...node.data,
            isCulprit,
            isSelected,
            isEnabled,
            isActive: false,
          },
        };
      }

      return node;
    });
  }, [nodes, markingSnapshot, culpritActivity, selectedTraceStep, enabledTransitions]);

  // Camera Focus helper
  const focusOnNodeByIdOrName = useCallback(
    (identifier, zoomLevel = 1.1) => {
      if (!identifier) return;
      const target = displayNodes.find(
        (n) =>
          n.id === identifier ||
          n.data.name === identifier ||
          n.data.label === identifier
      );
      if (target?.position) {
        const dim =
          target.type === 'placeNode'
            ? NODE_DIMENSIONS.place
            : NODE_DIMENSIONS.transition;
        setCenter(
          target.position.x + dim.width / 2,
          target.position.y + dim.height / 2,
          { zoom: zoomLevel, duration: 550 }
        );
      }
    },
    [displayNodes, setCenter]
  );

  // Expose focus function to parent if needed
  useEffect(() => {
    if (onFocusNode) {
      onFocusNode.current = focusOnNodeByIdOrName;
    }
  }, [onFocusNode, focusOnNodeByIdOrName]);

  // Initial auto-centering on the culprit transition
  const hasAutoCenteredRef = useRef(false);
  useEffect(() => {
    if (displayNodes.length > 0 && !hasAutoCenteredRef.current) {
      hasAutoCenteredRef.current = true;
      const culpritNode = displayNodes.find((n) => n.data.isCulprit);
      if (culpritNode?.position) {
        setTimeout(() => {
          focusOnNodeByIdOrName(culpritNode.id, 1.05);
        }, 120);
      } else {
        setTimeout(() => {
          fitView({ padding: 0.2, duration: 450 });
        }, 120);
      }
    }
  }, [displayNodes, focusOnNodeByIdOrName, fitView]);

  // React to trace step selection from the inspector
  useEffect(() => {
    if (selectedTraceStep) {
      focusOnNodeByIdOrName(selectedTraceStep, 1.15);
    }
  }, [selectedTraceStep, focusOnNodeByIdOrName]);

  const handleFocusDeviation = useCallback(() => {
    const culpritNode = displayNodes.find((n) => n.data.isCulprit);
    if (culpritNode) {
      focusOnNodeByIdOrName(culpritNode.id, 1.15);
    } else {
      fitView({ padding: 0.2, duration: 400 });
    }
  }, [displayNodes, focusOnNodeByIdOrName, fitView]);

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 450 });
  }, [fitView]);

  // MiniMap color resolver
  const nodeColor = useCallback((node) => {
    if (node.data?.isCulprit) return 'var(--system-red)';
    if (node.data?.isSelected) return 'var(--system-blue)';
    if (node.type === 'placeNode') {
      if ((node.data?.token || 0) > 0) return 'var(--system-blue)';
      if ((node.data?.missing || 0) > 0) return 'var(--system-orange)';
      return 'var(--card-border)';
    }
    return 'var(--surface-container-high)';
  }, []);

  return (
    <div className="petri-canvas-wrapper" style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Floating Cupertino Controls HUD */}
      <div className="snapshot-canvas-hud" role="toolbar" aria-label="Canvas Navigation Controls">
        <button
          type="button"
          className="hud-btn hud-btn--accent"
          onClick={handleFocusDeviation}
          title="Focus on deviation trigger activity"
        >
          <Crosshair size={14} aria-hidden="true" />
          <span>Focus Deviation</span>
        </button>

        <span className="hud-divider" aria-hidden="true" />

        <button
          type="button"
          className="hud-btn"
          onClick={handleFitView}
          title="Fit entire process model in view"
        >
          <Maximize2 size={13} aria-hidden="true" />
          <span>Fit</span>
        </button>

        <button
          type="button"
          className="hud-btn"
          onClick={() => zoomIn({ duration: 250 })}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <ZoomIn size={14} aria-hidden="true" />
        </button>

        <button
          type="button"
          className="hud-btn"
          onClick={() => zoomOut({ duration: 250 })}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <ZoomOut size={14} aria-hidden="true" />
        </button>

        <span className="hud-divider" aria-hidden="true" />

        <button
          type="button"
          className="hud-btn"
          onClick={onToggleDrawer}
          title={isDrawerOpen ? 'Collapse place markings drawer' : 'Expand place markings drawer'}
        >
          <Layers size={13} aria-hidden="true" />
          <span>Places</span>
          {isDrawerOpen ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>
      </div>

      <ReactFlow
        nodes={displayNodes}
        edges={edges}
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
 * AlertSnapshotCanvas: Top-level Frozen Petri Net Snapshot View
 */
export default function AlertSnapshotCanvas({
  alert,
  apiUrl,
  theme = 'light',
  culpritActivity,
  selectedTraceStep,
  markingSnapshot = {},
  hasSnapshot = false,
  onFetchFallback,
  isLoadingFallback,
}) {
  const [modelData, setModelData] = useState(null);
  const [isLoadingModel, setIsLoadingModel] = useState(true);
  const [modelError, setModelError] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Focus ref handle passed to inner canvas
  const focusNodeRef = useRef(null);

  // Fetch Master Process Model from Neo4j
  const loadMasterModel = useCallback(async () => {
    if (!apiUrl) return;
    setIsLoadingModel(true);
    setModelError(null);
    try {
      const res = await fetchMasterModel(apiUrl);
      if (res?.data) {
        setModelData(res.data);
      } else {
        throw new Error('Master model response is empty or malformed');
      }
    } catch (err) {
      console.error('Failed to load master Petri Net model:', err);
      setModelError(err.message || 'Failed to fetch process model');
    } finally {
      setIsLoadingModel(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    loadMasterModel();
  }, [loadMasterModel]);

  // Aggregate metrics
  const totalActive = useMemo(
    () => Object.values(markingSnapshot).reduce((acc, m) => acc + (m.token || 0), 0),
    [markingSnapshot]
  );

  const totalMissing = useMemo(
    () => Object.values(markingSnapshot).reduce((acc, m) => acc + (m.missing || 0), 0),
    [markingSnapshot]
  );

  const trackedCount = useMemo(
    () => Object.keys(markingSnapshot).length,
    [markingSnapshot]
  );

  return (
    <div className="snapshot-canvas-card">
      {/* 1. Header with title and telemetry counters */}
      <div className="snapshot-canvas-header">
        <div className="snapshot-canvas-header__title-wrap">
          <Layers size={16} aria-hidden="true" />
          <h2 className="snapshot-title">Petri Net Marking Snapshot</h2>
          {!hasSnapshot && (
            <span className="snapshot-chip snapshot-chip--warning">
              Live query needed
            </span>
          )}
        </div>

        {!hasSnapshot && onFetchFallback && (
          <button
            type="button"
            className="header-btn header-btn--action"
            onClick={onFetchFallback}
            disabled={isLoadingFallback}
          >
            <Database size={13} aria-hidden="true" />
            <span>{isLoadingFallback ? 'Querying Neo4j...' : 'Fetch Marking from Neo4j'}</span>
          </button>
        )}
      </div>

      {/* 2. Compact Telemetry Strip */}
      <div className="snapshot-telemetry-banner">
        <div className="snapshot-stat">
          <span className="snapshot-stat__label">Active Tokens</span>
          <span className="snapshot-stat__value">{totalActive}</span>
        </div>
        <div className="snapshot-stat">
          <span className="snapshot-stat__label">Missing Tokens</span>
          <span className="snapshot-stat__value snapshot-stat__value--missing">{totalMissing}</span>
        </div>
        <div className="snapshot-stat">
          <span className="snapshot-stat__label">Tracked Places</span>
          <span className="snapshot-stat__value">{trackedCount}</span>
        </div>
        <div className="snapshot-stat">
          <span className="snapshot-stat__label">Deviation Step</span>
          <span className="snapshot-stat__value snapshot-stat__value--culprit" title={culpritActivity}>
            {culpritActivity}
          </span>
        </div>
      </div>

      {/* 3. Interactive Graphical Canvas Container */}
      <div className="snapshot-canvas-body">
        {isLoadingModel ? (
          <div className="snapshot-canvas-feedback" aria-busy="true">
            <span className="spinner spinner--accent" aria-hidden="true" />
            <p className="snapshot-feedback-text">Rendering Petri Net State...</p>
          </div>
        ) : modelError ? (
          <div className="snapshot-canvas-feedback snapshot-canvas-feedback--error">
            <AlertCircle size={24} className="text-destructive" aria-hidden="true" />
            <p className="snapshot-feedback-text">{modelError}</p>
            <button
              type="button"
              className="header-btn header-btn--action"
              onClick={loadMasterModel}
            >
              <RefreshCw size={13} aria-hidden="true" />
              <span>Retry</span>
            </button>
          </div>
        ) : (
          <ReactFlowProvider>
            <SnapshotCanvasInner
              rawModelData={modelData}
              markingSnapshot={markingSnapshot}
              culpritActivity={culpritActivity}
              selectedTraceStep={selectedTraceStep}
              enabledTransitions={alert.enabled_transitions || []}
              theme={theme}
              isDrawerOpen={isDrawerOpen}
              onToggleDrawer={() => setIsDrawerOpen((prev) => !prev)}
              onFocusNode={focusNodeRef}
            />
          </ReactFlowProvider>
        )}
      </div>

      {/* 4. Collapsible Place Markings Drawer */}
      {isDrawerOpen && hasSnapshot && (
        <div className="snapshot-places-drawer">
          <div className="snapshot-places-drawer__header">
            <h3 className="places-summary-heading">Place Markings Matrix</h3>
            <span className="snapshot-places-drawer__hint">
              Click a place to focus camera
            </span>
          </div>
          <div className="places-token-grid">
            {Object.entries(markingSnapshot).map(([placeName, mark]) => {
              const hasToken = (mark.token || 0) > 0;
              const hasMissing = (mark.missing || 0) > 0;
              return (
                <button
                  type="button"
                  key={placeName}
                  className={`place-token-pill ${hasToken ? 'place-token-pill--active' : ''} ${hasMissing ? 'place-token-pill--missing' : ''
                    }`}
                  onClick={() => focusNodeRef.current?.(placeName, 1.2)}
                  title={`Focus place ${placeName}`}
                >
                  <span className="place-token-name">{placeName}</span>
                  <div className="place-token-badges">
                    {hasToken && <span className="tok-badge tok-badge--active">● {mark.token}</span>}
                    {hasMissing && <span className="tok-badge tok-badge--missing">⚠️ +{mark.missing}</span>}
                    {!hasToken && !hasMissing && <span className="tok-badge tok-badge--empty">0</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
