import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  Copy,
  Database,
  Download,
  GitCommit,
  Layers,
  Moon,
  Sun,
} from 'lucide-react';
import {
  getViolations,
  isCritical,
} from '../lib/alerts';
import { fetchCaseMarking } from '../lib/api';
import EventOverviewCard from './drilldown/EventOverviewCard';
import RootCauseCard from './drilldown/RootCauseCard';
import OrgComplianceCard from './drilldown/OrgComplianceCard';
import TraceStepper from './drilldown/TraceStepper';
import RawPayloadViewer from './drilldown/RawPayloadViewer';
import AlertSnapshotCanvas from './drilldown/AlertSnapshotCanvas';

/**
 * AlertDetailView: Apple HIG State Snapshot Inspection View
 */
export default function AlertDetailView({
  alert,
  apiUrl,
  theme = 'light',
  onToggleTheme,
  onBack,
  onInspectLive = null,
}) {
  const [copied, setCopied] = useState(false);
  const [fallbackMarking, setFallbackMarking] = useState(null);
  const [isLoadingFallback, setIsLoadingFallback] = useState(false);
  const [selectedTraceStep, setSelectedTraceStep] = useState(null);

  // Keyboard shortcut: Esc to return to stream monitor
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onBack?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

  const critical = isCritical(alert);
  const tone = critical ? 'critical' : 'deviation';
  const violations = useViolations(alert);
  const score = typeof alert.cumulative_score === 'number' ? alert.cumulative_score.toFixed(2) : '0.00';

  // Snapshot data resolution: priority to alert.marking_snapshot, fallback to Neo4j fetch
  const markingSnapshot = useMemo(() => {
    if (alert.marking_snapshot && Object.keys(alert.marking_snapshot).length > 0) {
      return alert.marking_snapshot;
    }
    return fallbackMarking?.marking ?? {};
  }, [alert.marking_snapshot, fallbackMarking]);

  const hasSnapshot = Object.keys(markingSnapshot).length > 0;

  // Manual fallback fetch if snapshot was not embedded in legacy alerts
  const handleFetchFallback = useCallback(async () => {
    if (!apiUrl || !alert.case_id) return;
    setIsLoadingFallback(true);
    try {
      const res = await fetchCaseMarking(apiUrl, alert.case_id);
      if (res?.data) {
        setFallbackMarking(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch fallback marking from Neo4j:', err);
    } finally {
      setIsLoadingFallback(false);
    }
  }, [apiUrl, alert.case_id]);

  // Copy raw JSON payload to clipboard
  const handleCopyPayload = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(alert, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy alert payload:', err);
    }
  }, [alert]);

  // Export audit report as JSON file
  const handleExportJson = useCallback(() => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(alert, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `alert_snapshot_${alert.case_id}_${alert.alert_id || Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }, [alert]);

  // Culprit transition determination
  const culpritActivity =
    alert.culprit_activity ||
    violations[0]?.activity ||
    alert.details?.activity ||
    'Unknown Step';

  const culpritActor =
    alert.actor ||
    violations[0]?.actor ||
    alert.details?.resource ||
    alert.details?.actor ||
    'Unknown Actor';

  const hasOrgViolation =
    violations.some((v) => v.type === 'organizational') ||
    alert.deviation_type === 'organizational';

  return (
    <div className="alert-drilldown-view" role="main" aria-label={`Investigation for Case ${alert.case_id}`}>
      {/* 1. Cupertino Navigation Header (Reusing .header-bar, .header-btn, .alert-badge) */}
      <header className="header-bar" role="banner">
        <div className="header-bar__title-group">
          <button
            type="button"
            className="header-btn header-btn--back"
            onClick={onBack}
            title="Return to real-time monitor feed (Shortcut: Esc)"
          >
            <ChevronLeft size={16} aria-hidden="true" />
            <span>Stream Monitor</span>
            <kbd className="cupertino-kbd" aria-hidden="true">esc</kbd>
          </button>

          <span className="header-divider" aria-hidden="true" />

          <button
            type="button"
            className="alert-card__case-pill"
            onClick={() => onInspectLive?.(alert.case_id)}
            title={`Investigate Case #${alert.case_id}`}
          >
            <GitCommit size={13} aria-hidden="true" />
            <span>Case #{alert.case_id}</span>
          </button>

          <h1 className="header-bar__title">State Snapshot</h1>

          <span className={`alert-badge alert-badge--${tone}`}>
            <span className={`alert-badge__dot alert-badge__dot--${tone}`} aria-hidden="true" />
            <span>{critical ? 'Critical' : 'Deviation'}</span>
          </span>
        </div>

        <div className="header-bar__actions">
          <button
            type="button"
            className="header-btn header-btn--action"
            onClick={handleCopyPayload}
            title="Copy alert JSON payload to clipboard"
          >
            {copied ? <Check size={14} className="text-success" aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            <span>{copied ? 'Copied' : 'Copy JSON'}</span>
          </button>

          <button
            type="button"
            className="header-btn header-btn--action"
            onClick={handleExportJson}
            title="Export alert payload as JSON"
          >
            <Download size={14} aria-hidden="true" />
            <span>Export</span>
          </button>

          {onInspectLive && (
            <button
              type="button"
              className="header-btn header-btn--action header-btn--accent"
              onClick={() => onInspectLive(alert.case_id)}
              title="Open live Petri Net model for this case"
            >
              <span>Live Follow</span>
              <ArrowUpRight size={14} aria-hidden="true" />
            </button>
          )}

          {onToggleTheme && (
            <>
              <span className="header-divider" aria-hidden="true" />
              <button
                type="button"
                className="header-btn header-btn--theme"
                onClick={onToggleTheme}
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              >
                {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
              </button>
            </>
          )}
        </div>
      </header>

      {/* 2. Split Workspace Layout: Inspector (Left) & Canvas Snapshot (Right) */}
      <div className="drilldown-workspace">
        {/* Left Column: Modular Inspector (~440px) */}
        <aside className="drilldown-inspector" aria-label="Investigation Details">
          {/* Card 1: Event Overview */}
          <EventOverviewCard
            alert={alert}
            culpritActivity={culpritActivity}
            culpritActor={culpritActor}
            score={score}
          />

          {/* Card 2: Multi-Perspective Root Cause Analysis */}
          <RootCauseCard
            alert={alert}
            violations={violations}
            markingSnapshot={markingSnapshot}
            culpritActivity={culpritActivity}
            culpritActor={culpritActor}
          />

          {/* Card 3: Organizational Conformance Matrix */}
          {hasOrgViolation && (
            <OrgComplianceCard
              alert={alert}
              violations={violations}
              culpritActor={culpritActor}
              culpritActivity={culpritActivity}
            />
          )}

          {/* Card 4: Sequential Trace Stepper */}
          <TraceStepper
            eventHistory={alert.event_history}
            culpritActivity={culpritActivity}
            onSelectStep={(step) => setSelectedTraceStep(step)}
            selectedStep={selectedTraceStep}
          />

          {/* Card 5: Raw Event Payload Accordion */}
          <RawPayloadViewer alert={alert} />
        </aside>

        {/* Right Column: Petri Net Marking Snapshot Canvas */}
        <main className="drilldown-canvas-area" aria-label="Petri Net Snapshot Canvas">
          <AlertSnapshotCanvas
            alert={alert}
            apiUrl={apiUrl}
            theme={theme}
            culpritActivity={culpritActivity}
            selectedTraceStep={selectedTraceStep}
            markingSnapshot={markingSnapshot}
            hasSnapshot={hasSnapshot}
            onFetchFallback={handleFetchFallback}
            isLoadingFallback={isLoadingFallback}
          />
        </main>
      </div>
    </div>
  );
}

function useViolations(alert) {
  return useMemo(() => getViolations(alert), [alert]);
}
