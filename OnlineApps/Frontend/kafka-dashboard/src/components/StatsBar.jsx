import { AlertCircle, AlertTriangle, Bell, Folder } from 'lucide-react';

export default function StatsBar({ stats, onToggleActiveCases, isExpanded = false }) {
  const statCards = [
    {
      key: 'totalAlerts',
      label: 'Total Alerts',
      value: stats.totalAlerts,
      icon: Bell,
      tone: 'total',
      accentColor: 'var(--system-blue)',
    },
    {
      key: 'criticalCount',
      label: 'Critical Alerts',
      value: stats.criticalCount,
      icon: AlertTriangle,
      tone: 'critical',
      accentColor: 'var(--system-red)',
      hasBorderAccent: true,
    },
    {
      key: 'deviationCount',
      label: 'Deviation Alerts',
      value: stats.deviationCount,
      icon: AlertCircle,
      tone: 'deviation',
      accentColor: 'var(--system-orange)',
    },
    {
      key: 'activeCases',
      label: 'Active Cases',
      value: stats.activeCases,
      icon: Folder,
      tone: 'active',
      accentColor: 'var(--system-green)',
      showDelta: true,
      isInteractive: true,
    },
  ];

  return (
    <section className="stats-row" aria-label="Key Performance Metrics">
      {statCards.map((card) => {
        const Icon = card.icon;
        const isClickable = card.isInteractive && typeof onToggleActiveCases === 'function';

        return (
          <div
            key={card.key}
            className={`stat-card stat-card--${card.tone} ${
              card.hasBorderAccent ? 'stat-card--border-accent' : ''
            } ${isClickable ? 'stat-card--clickable' : ''}`}
            onClick={isClickable ? onToggleActiveCases : undefined}
            role={isClickable ? 'button' : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onKeyDown={
              isClickable
                ? (e) => (e.key === 'Enter' || e.key === ' ') && onToggleActiveCases()
                : undefined
            }
            title={
              isClickable
                ? `Klik untuk ${isExpanded ? 'menyembunyikan' : 'menampilkan'} panel kasus aktif`
                : undefined
            }
          >
            <div className="stat-card__top">
              <span className="stat-card__label">{card.label}</span>
              <span
                className="stat-card__icon-wrap"
                style={{ color: card.accentColor }}
                aria-hidden="true"
              >
                <Icon size={18} strokeWidth={2.2} />
              </span>
            </div>

            <div className="stat-card__bottom">
              <span
                className="stat-card__value"
                style={{ color: card.accentColor }}
              >
                {card.value}
              </span>
              {card.showDelta && (
                <span className="stat-card__delta" style={{ color: card.accentColor }} aria-hidden="true">
                  ▲
                </span>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
