import { Trash2, Upload } from 'lucide-react';
import AlertCard from './AlertCard';

export default function StreamAlertsSection({
  alerts = [],
  onClear,
  onExport,
  selectedCaseId = null,
  onResetFilter,
}) {
  return (
    <section className="card-panel stream-alerts-panel" aria-label="Stream Alerts">
      {/* Panel Header */}
      <div className="card-panel__header">
        <div className="card-panel__title-wrap">
          <h2 className="card-panel__title">Stream Alerts</h2>
          <span className="card-panel__count-badge">{alerts.length}</span>
        </div>

        <div className="card-panel__actions">
          <button
            type="button"
            className="panel-btn panel-btn--clear"
            onClick={onClear}
            disabled={alerts.length === 0}
            title="Hapus tampilan alert lokal"
          >
            <Trash2 size={14} aria-hidden="true" />
            <span>Clear</span>
          </button>

          <button
            type="button"
            className="panel-btn panel-btn--export"
            onClick={onExport}
            disabled={alerts.length === 0}
            title="Ekspor daftar alert ke file CSV"
          >
            <Upload size={14} aria-hidden="true" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Filter notification banner if a specific case is selected */}
      {selectedCaseId && (
        <div className="filter-banner">
          <span>
            Menampilkan alert khusus <strong>Case #{selectedCaseId}</strong> ({alerts.length} alert).
          </span>
          <button type="button" className="btn-link" onClick={onResetFilter}>
            Tampilkan Semua
          </button>
        </div>
      )}

      {/* Panel Body */}
      <div className="card-panel__body stream-alerts-body">
        {alerts.length === 0 ? (
          <div className="stream-alerts-empty">
            <div className="alerts-empty-emblem" aria-hidden="true">
              <svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="22" cy="22" r="21" fill="rgba(0, 122, 255, 0.08)" />
                <circle cx="22" cy="22" r="15" stroke="var(--system-blue)" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
                <circle cx="22" cy="22" r="9" stroke="var(--system-blue)" strokeWidth="2" opacity="0.8" />
                <circle cx="22" cy="22" r="3.5" fill="var(--system-blue)" />
              </svg>
            </div>
            <h3 className="alerts-empty-title">No alerts yet. Waiting for data...</h3>
            <p className="alerts-empty-desc">
              Listening on real-time stream socket. Incoming trace deviations will populate here automatically.
            </p>
          </div>
        ) : (
          <div className="alert-list" role="feed" aria-busy="false">
            {alerts.map((alert) => (
              <AlertCard key={alert.alert_id} alert={alert} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
