import { useState } from 'react';
import { Trash2, Upload, Filter } from 'lucide-react';
import AlertCard from './AlertCard';

export default function StreamAlertsSection({
  alerts = [],
  onClear,
  onExport,
  selectedCaseId = null,
  onResetFilter,
  onInspectCase = null,
  onSelectCase = null,
  onDrilldownAlert = null,
}) {
  const [severityFilter, setSeverityFilter] = useState('all');

  const criticalCount = alerts.filter((a) => a.type === 'critical_alert').length;
  const deviationCount = alerts.filter((a) => a.type !== 'critical_alert').length;

  const filteredAlerts = alerts.filter((a) => {
    if (severityFilter === 'critical') return a.type === 'critical_alert';
    if (severityFilter === 'deviation') return a.type !== 'critical_alert';
    return true;
  });

  return (
    <section className="card-panel stream-alerts-panel" aria-label="Stream Alerts">
      {/* Panel Header */}
      <div className="card-panel__header stream-alerts-header">
        <div className="stream-alerts-header__left">
          <div className="card-panel__title-wrap">
            <h2 className="card-panel__title">Stream Alerts</h2>
            <span className="card-panel__count-badge">{alerts.length}</span>
          </div>

          {/* Cupertino Segmented Filter */}
          {alerts.length > 0 && (
            <div className="stream-filter-segmented" role="tablist" aria-label="Filter alerts by severity">
              <button
                type="button"
                role="tab"
                aria-selected={severityFilter === 'all'}
                className={`stream-filter-tab ${severityFilter === 'all' ? 'stream-filter-tab--active' : ''}`}
                onClick={() => setSeverityFilter('all')}
              >
                All ({alerts.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={severityFilter === 'critical'}
                className={`stream-filter-tab stream-filter-tab--critical ${severityFilter === 'critical' ? 'stream-filter-tab--active' : ''}`}
                onClick={() => setSeverityFilter('critical')}
              >
                <span className="filter-dot filter-dot--critical" aria-hidden="true" />
                Critical ({criticalCount})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={severityFilter === 'deviation'}
                className={`stream-filter-tab stream-filter-tab--dev ${severityFilter === 'deviation' ? 'stream-filter-tab--active' : ''}`}
                onClick={() => setSeverityFilter('deviation')}
              >
                <span className="filter-dot filter-dot--dev" aria-hidden="true" />
                Deviations ({deviationCount})
              </button>
            </div>
          )}
        </div>

        <div className="card-panel__actions">
          <button
            type="button"
            className="panel-btn panel-btn--clear"
            onClick={onClear}
            disabled={alerts.length === 0}
            title="Clear all alerts from local view"
          >
            <Trash2 size={13} aria-hidden="true" />
            <span>Clear</span>
          </button>

          <button
            type="button"
            className="panel-btn panel-btn--export"
            onClick={onExport}
            disabled={alerts.length === 0}
            title="Export alerts to CSV file"
          >
            <Upload size={13} aria-hidden="true" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Filter notification banner if a specific case is selected */}
      {selectedCaseId && (
        <div className="filter-banner" role="status">
          <div className="filter-banner__info">
            <Filter size={14} className="filter-banner__icon" aria-hidden="true" />
            <span>
              Filtered to <strong>Case #{selectedCaseId}</strong> ({alerts.length} total {alerts.length === 1 ? 'alert' : 'alerts'}).
            </span>
          </div>
          <button type="button" className="filter-banner__reset-btn" onClick={onResetFilter}>
            Show All Cases
          </button>
        </div>
      )}

      {/* Panel Body */}
      <div className="card-panel__body stream-alerts-body">
        {filteredAlerts.length === 0 ? (
          <div className="stream-alerts-empty">
            <div className="alerts-empty-emblem" aria-hidden="true">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="24" cy="24" r="23" fill="var(--system-fill)" />
                <circle cx="24" cy="24" r="16" stroke="var(--system-blue)" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6" />
                <circle cx="24" cy="24" r="10" stroke="var(--system-blue)" strokeWidth="2" opacity="0.8" />
                <circle cx="24" cy="24" r="4" fill="var(--system-blue)" />
              </svg>
            </div>
            <h3 className="alerts-empty-title">
              {alerts.length === 0
                ? 'No alerts yet. Waiting for data...'
                : `No ${severityFilter} alerts found`}
            </h3>
            <p className="alerts-empty-desc">
              {alerts.length === 0
                ? 'Listening to real-time event stream. Detected process deviations will populate here automatically.'
                : `There are currently no alerts matching the '${severityFilter}' filter for this selection.`}
            </p>
          </div>
        ) : (
          <div className="alert-list" role="feed" aria-busy="false">
            {filteredAlerts.map((alert) => (
              <AlertCard
                key={alert.alert_id}
                alert={alert}
                onInspectCase={onInspectCase}
                onSelectCase={onSelectCase}
                onDrilldownAlert={onDrilldownAlert}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
