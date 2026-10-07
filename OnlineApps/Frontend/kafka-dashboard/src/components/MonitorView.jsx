import { useState } from 'react';
import { exportAlertsToCsv } from '../lib/exportCsv';
import ActiveCasesTracker from './ActiveCasesTracker';
import ConfirmModal from './ConfirmModal';
import StatsBar from './StatsBar';
import StreamAlertsSection from './StreamAlertsSection';

export default function MonitorView({
  alerts = [],
  stats = { totalAlerts: 0, criticalCount: 0, deviationCount: 0, activeCases: 0 },
  activeCasesList = [],
  statusMessage = null,
  clearAlerts,
  onInspectCase = null,
  onDrilldownAlert = null,
}) {
  const [isTrackerOpen, setIsTrackerOpen] = useState(true);
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);

  const handleConfirmClear = () => {
    clearAlerts();
    setIsClearModalOpen(false);
  };

  const displayedAlerts = selectedCaseId
    ? alerts.filter((a) => String(a.case_id) === String(selectedCaseId))
    : alerts;

  return (
    <div className="monitor-view">
      {/* 4 Metric Cards */}
      <StatsBar
        stats={stats}
        onToggleActiveCases={() => setIsTrackerOpen((prev) => !prev)}
        isExpanded={isTrackerOpen}
      />

      {/* Section 1: Live Active Process Instances */}
      <ActiveCasesTracker
        activeCases={activeCasesList}
        isExpanded={isTrackerOpen}
        onToggleExpand={() => setIsTrackerOpen((prev) => !prev)}
        selectedCaseId={selectedCaseId}
        onSelectCase={setSelectedCaseId}
        onInspectCase={onInspectCase}
      />

      {/* Temporary toast status message if present */}
      {statusMessage && (
        <div className={`status-toast ${statusMessage.isError ? 'status-toast--error' : ''}`} role="status">
          {statusMessage.message}
        </div>
      )}

      {/* Section 2: Stream Alerts */}
      <StreamAlertsSection
        alerts={displayedAlerts}
        onClear={() => setIsClearModalOpen(true)}
        onExport={() => exportAlertsToCsv(displayedAlerts)}
        selectedCaseId={selectedCaseId}
        onResetFilter={() => setSelectedCaseId(null)}
        onInspectCase={onInspectCase}
        onSelectCase={setSelectedCaseId}
        onDrilldownAlert={onDrilldownAlert}
      />

      {/* Cupertino Native Confirmation Modal */}
      <ConfirmModal
        isOpen={isClearModalOpen}
        title="Clear Stream Alerts?"
        description={`Are you sure you want to clear ${displayedAlerts.length} ${displayedAlerts.length === 1 ? 'alert' : 'alerts'} from your local view? Real-time event streaming will continue uninterrupted.`}
        note="Stored graph replay states and audit logs in Neo4j will not be deleted."
        confirmText="Clear Alerts"
        cancelText="Cancel"
        confirmTone="danger"
        onConfirm={handleConfirmClear}
        onCancel={() => setIsClearModalOpen(false)}
      />
    </div>
  );
}
