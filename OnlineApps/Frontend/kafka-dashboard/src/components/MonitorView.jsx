import { MODE_LABELS } from '../config';
import { useAlertStream } from '../hooks/useAlertStream';
import { exportAlertsToCsv } from '../lib/exportCsv';
import AlertList from './AlertList';
import StatsBar from './StatsBar';

const CONNECTION_LABELS = {
  connecting: 'Connecting...',
  connected: 'Connected',
  disconnected: 'Disconnected - Reconnecting...',
  error: 'Invalid WebSocket URL - please reconfigure',
};

export default function MonitorView({ config, onReconfigure }) {
  const { alerts, stats, connectionStatus, statusMessage, syncNow, clearAlerts } = useAlertStream(config);

  const handleClear = () => {
    if (window.confirm('Are you sure you want to clear all alerts? This only affects your local view.')) {
      clearAlerts();
    }
  };

  return (
    <main className="monitor-container">
      <h1 className="monitor-title">GO-TR Real-time Deviation Monitor</h1>

      <div className={`status status--${connectionStatus}`} role="status">
        {CONNECTION_LABELS[connectionStatus]}
      </div>

      <StatsBar stats={stats} />

      <div className="mode-indicator">
        Mode: <strong>{MODE_LABELS[config.mode] ?? config.mode}</strong>
      </div>

      <div className="toolbar">
        <button type="button" id="clear-alerts" className="btn btn--danger" onClick={handleClear} disabled={alerts.length === 0}>
          Clear All Alerts
        </button>
        <button type="button" id="export-alerts" className="btn btn--success" onClick={() => exportAlertsToCsv(alerts)} disabled={alerts.length === 0}>
          Export Alerts
        </button>
        <button type="button" id="sync-alerts" className="btn" onClick={syncNow}>
          Sync with Server
        </button>
        <button type="button" id="reconfigure" className="btn btn--secondary" onClick={onReconfigure}>
          Reconfigure
        </button>
      </div>

      {statusMessage && (
        <div className={`sync-status${statusMessage.isError ? ' sync-status--error' : ''}`} role="status">
          {statusMessage.message}
        </div>
      )}

      <AlertList alerts={alerts} />
    </main>
  );
}
