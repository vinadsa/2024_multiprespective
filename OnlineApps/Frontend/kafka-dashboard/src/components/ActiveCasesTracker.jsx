import { useEffect, useState } from 'react';

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
      ⏱️ {mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}
    </span>
  );
}

export default function ActiveCasesTracker({
  activeCases = [],
  isExpanded = true,
  onToggleExpand,
  selectedCaseId = null,
  onSelectCase,
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
                    <div className="active-case-card__header">
                      <span className="active-case-card__id">Case #{c.case_id}</span>
                      <LiveTimer startedAt={c.started_at} />
                    </div>

                    <div className="active-case-card__activity">
                      <span className="active-case-card__activity-label">Aktivitas Terkini:</span>
                      <span className="active-case-card__activity-name" title={c.last_activity}>
                        {c.last_activity}
                      </span>
                    </div>

                    <div className="active-case-card__footer">
                      <span className="active-case-card__events">
                        {c.event_count ?? 1} event{(c.event_count ?? 1) === 1 ? '' : 's'}
                      </span>
                      {c.has_deviations ? (
                        <span className="active-case-card__badge active-case-card__badge--anomaly">
                          ⚠️ Anomali (+{c.anomaly_score?.toFixed(1)})
                        </span>
                      ) : (
                        <span className="active-case-card__badge active-case-card__badge--conforming">
                          ✅ Sesuai SOP
                        </span>
                      )}
                      {onSelectCase && (
                        <button
                          type="button"
                          className={`btn-filter-case ${isSelected ? 'btn-filter-case--active' : ''}`}
                          onClick={() => onSelectCase(isSelected ? null : c.case_id)}
                        >
                          {isSelected ? 'Reset Filter' : 'Filter Alert'}
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
