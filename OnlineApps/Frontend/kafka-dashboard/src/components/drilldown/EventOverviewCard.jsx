import { Activity, Clock, User } from 'lucide-react';
import { formatTimestamp, getDeviationTitle } from '../../lib/alerts';

/**
 * EventOverviewCard: Displays triggering event metadata, actor, and quantitative metrics.
 */
export default function EventOverviewCard({
  alert,
  culpritActivity,
  culpritActor,
  score,
}) {
  const deviationTitle = getDeviationTitle(alert.deviation_type);
  const formattedTime = formatTimestamp(alert.timestamp);

  return (
    <section className="drilldown-card" aria-label="Event Details">
      <div className="drilldown-card__header">
        <h2 className="drilldown-card__title">Event Details</h2>
        <span className="drilldown-timestamp">
          <Clock size={12} aria-hidden="true" />
          <time dateTime={alert.timestamp}>{formattedTime}</time>
        </span>
      </div>

      <div className="drilldown-card__body">
        {/* Trigger Activity Banner */}
        <div className="telemetry-hero">
          <div className="telemetry-hero__activity">
            <span className="telemetry-hero__caption">Trigger Activity</span>
            <div className="telemetry-hero__title">
              <Activity size={15} className="telemetry-hero__icon" aria-hidden="true" />
              <span>{culpritActivity}</span>
            </div>
          </div>

          <div className="telemetry-hero__meta-row">
            <div className="telemetry-actor-badge">
              <User size={12} aria-hidden="true" />
              <span className="telemetry-actor-label">Resource:</span>
              <strong className="telemetry-actor-name">{culpritActor}</strong>
            </div>
            <span className="badge-tag badge-tag--type">{deviationTitle}</span>
          </div>
        </div>

        {/* Quantitative Metrics Row */}
        <div className="telemetry-metrics-row">
          <div className="telemetry-stat">
            <span className="telemetry-stat__label">Running Fitness</span>
            <span className="telemetry-stat__value telemetry-stat__value--fitness">
              {typeof alert.fitness === 'number' ? `${(alert.fitness * 100).toFixed(1)}%` : 'N/A'}
            </span>
          </div>
          <div className="telemetry-stat">
            <span className="telemetry-stat__label">Anomaly Score</span>
            <span className="telemetry-stat__value telemetry-stat__value--score">
              +{score}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
