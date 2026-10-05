const STAT_ITEMS = [
  { key: 'totalAlerts', label: 'Total Alerts', tone: 'total' },
  { key: 'criticalCount', label: 'Critical Alerts', tone: 'critical' },
  { key: 'deviationCount', label: 'Deviation Alerts', tone: 'deviation' },
  { key: 'activeCases', label: 'Active Cases', tone: 'active' },
];

export default function StatsBar({ stats }) {
  return (
    <dl className="stats">
      {STAT_ITEMS.map(({ key, label, tone }) => (
        <div key={key} className="stat-item">
          <dt className="stat-label">{label}</dt>
          <dd className={`stat-value stat-value--${tone}`}>{stats[key]}</dd>
        </div>
      ))}
    </dl>
  );
}
