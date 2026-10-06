import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Filter,
} from 'lucide-react';

function LiveTimer({ startedAt }) {
  const [seconds, setSeconds] = useState(() => {
    if (!startedAt) return 0;
    const startTime = new Date(startedAt).getTime();
    return Math.max(0, Math.floor((Date.now() - startTime) / 1000));
  });

  useEffect(() => {
    if (!startedAt) return;
    const interval = setInterval(() => {
      const startTime = new Date(startedAt).getTime();
      setSeconds(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return (
    <span className="live-timer" title={`Started: ${startedAt}`}>
      <Clock size={11} aria-hidden="true" />
      <span>{mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}</span>
    </span>
  );
}

export default function ActiveCasesTracker({
  activeCases = [],
  isExpanded = true,
  onToggleExpand,
  selectedCaseId = null,
  onSelectCase,
  onInspectCase,
}) {
  return (
    <section className="card-panel active-cases-panel" aria-label="Live Active Process Instances">
      <div className="card-panel__header">
        <div className="card-panel__title-wrap">
          <h2 className="card-panel__title">Live Active Process Instances</h2>
          {activeCases.length > 0 && (
            <span className="card-panel__count-badge">{activeCases.length}</span>
          )}
        </div>
        <button
          type="button"
          className="card-panel__toggle-btn"
          aria-expanded={isExpanded}
          aria-label={isExpanded ? 'Collapse active cases' : 'Expand active cases'}
          onClick={onToggleExpand}
        >
          {isExpanded ? '▲ Sembunyikan' : '▼ Tampilkan'}
        </button>
      </div>

      {isExpanded && (
        <div className="card-panel__body">
          {activeCases.length === 0 ? (
            <div className="active-cases-empty">
              <span className="active-cases-empty__zzz" aria-hidden="true">
                z<sup>z<sup>z</sup></sup>
              </span>
              <p className="active-cases-empty__text">
                Tidak ada kasus proses yang sedang berjalan. Jalankan streamer log ( <code>make streamer</code> ) untuk memantau kasus secara langsung.
              </p>
            </div>
          ) : (
            <div className="active-cases-grid">
              {activeCases.map((c) => {
                const isSelected = selectedCaseId === c.case_id;
                return (
                  <article
                    key={c.case_id}
                    className={`active-case-card ${
                      c.has_deviations ? 'active-case-card--deviating' : 'active-case-card--conforming'
                    } ${isSelected ? 'active-case-card--selected' : ''}`}
                  >
                    {/* 1. Header: Case ID with Status Dot and Timer */}
                    <div className="active-case-card__header">
                      <div className="active-case-card__id-group">
                        <span
                          className={`active-case-card__status-dot ${
                            c.has_deviations
                              ? 'active-case-card__status-dot--anomaly'
                              : 'active-case-card__status-dot--conforming'
                          }`}
                          aria-hidden="true"
                        />
                        <span className="active-case-card__id">Case #{c.case_id}</span>
                      </div>
                      <LiveTimer startedAt={c.started_at} />
                    </div>

                    {/* 2. Latest Activity Chip */}
                    <div className="active-case-card__activity">
                      <span className="active-case-card__activity-label">Aktivitas Terkini</span>
                      <div className="active-case-card__activity-chip" title={c.last_activity}>
                        <Activity size={13} className="activity-chip-icon" aria-hidden="true" />
                        <span className="activity-chip-text">{c.last_activity}</span>
                      </div>
                    </div>

                    {/* 3. Meta Row: Events count and SOP status */}
                    <div className="active-case-card__meta-row">
                      <span className="active-case-card__events">
                        {c.event_count ?? 1} event{(c.event_count ?? 1) === 1 ? '' : 's'}
                      </span>
                      {c.has_deviations ? (
                        <span className="active-case-card__badge active-case-card__badge--anomaly">
                          <AlertTriangle size={11} aria-hidden="true" />
                          <span>Anomali (+{c.anomaly_score?.toFixed(1)})</span>
                        </span>
                      ) : (
                        <span className="active-case-card__badge active-case-card__badge--conforming">
                          <CheckCircle2 size={11} aria-hidden="true" />
                          <span>Sesuai SOP</span>
                        </span>
                      )}
                    </div>

                    {/* 4. Dedicated Actions Toolbar */}
                    <div className="active-case-card__actions">
                      {onInspectCase && (
                        <button
                          type="button"
                          className="btn-case-action btn-case-action--inspect"
                          onClick={() => onInspectCase(c.case_id)}
                          title="Inspeksi posisi token dan alur proses kasus ini di graf Petri Net"
                        >
                          <ArrowUpRight size={13} aria-hidden="true" />
                          <span>Inspect</span>
                        </button>
                      )}
                      {onSelectCase && (
                        <button
                          type="button"
                          className={`btn-case-action btn-case-action--filter ${
                            isSelected ? 'btn-case-action--active' : ''
                          }`}
                          onClick={() => onSelectCase(isSelected ? null : c.case_id)}
                          title={isSelected ? 'Reset filter alert' : 'Filter alert untuk kasus ini'}
                        >
                          <Filter size={12} aria-hidden="true" />
                          <span>{isSelected ? 'Reset' : 'Filter Alert'}</span>
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
