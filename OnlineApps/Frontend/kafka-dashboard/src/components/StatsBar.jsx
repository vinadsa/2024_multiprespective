const STAT_ITEMS = [
  { key: 'totalAlerts', label: 'Total Alerts', tone: 'total' },
  { key: 'criticalCount', label: 'Critical Alerts', tone: 'critical' },
  { key: 'deviationCount', label: 'Deviation Alerts', tone: 'deviation' },
  { key: 'activeCases', label: 'Active Cases', tone: 'active' },
];

export default function StatsBar({ stats, onToggleActiveCases, isExpanded = false }) {
  return (
    <dl className="stats">
      {STAT_ITEMS.map(({ key, label, tone }) => {
        const isInteractive = key === 'activeCases' && typeof onToggleActiveCases === 'function';
        return (
          <div
            key={key}
            className={`stat-item ${isInteractive ? 'stat-item--clickable' : ''}`}
            onClick={isInteractive ? onToggleActiveCases : undefined}
            role={isInteractive ? 'button' : undefined}
            tabIndex={isInteractive ? 0 : undefined}
            title={isInteractive ? 'Klik untuk membuka/menutup panel rincian kasus aktif' : undefined}
          >
            <dt className="stat-label">
              {label}
              {key === 'activeCases' && stats.activeCases > 0 && (
                <span className="live-pulse-indicator" aria-hidden="true" />
              )}
            </dt>
            <dd className={`stat-value stat-value--${tone}`}>
              {stats[key]}
              {isInteractive && (
                <span className="stat-chevron" aria-hidden="true">
                  {isExpanded ? ' ▲' : ' ▼'}
                </span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
