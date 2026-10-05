import { memo } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  ORG_ISSUE_TEXT,
  formatTimestamp,
  getDeviationTitle,
  getViolations,
  isCritical,
} from '../lib/alerts';

function ViolationContext({ violation }) {
  const { type, activity, actor, orgIssues } = violation;
  if (!activity) return null;

  switch (type) {
    case 'missing_token':
      return (
        <p>
          <strong>Context:</strong> Activity <code>{activity}</code> was executed, but it is out of
          order or skipped a required prerequisite in the SOP.
        </p>
      );
    case 'organizational':
      return (
        <div>
          <p>
            <strong>Context:</strong> Activity <code>{activity}</code> was executed by{' '}
            <code>{actor ?? 'unknown'}</code>, but they do not have the required authorization.
          </p>
          {orgIssues.length > 0 && (
            <ul>
              {orgIssues.map((issue) => (
                <li key={issue}>{ORG_ISSUE_TEXT[issue] ?? issue}</li>
              ))}
            </ul>
          )}
        </div>
      );
    case 'unknown_activity':
      return (
        <p>
          <strong>Context:</strong> Activity <code>{activity}</code> is not recognized in the Master
          Model (SOP).
        </p>
      );
    default:
      return null;
  }
}

function AlertCard({ alert }) {
  const critical = isCritical(alert);
  const tone = critical ? 'critical' : 'deviation';
  const violations = getViolations(alert);
  const contexts = violations.filter((v) => v.activity);
  const score = typeof alert.cumulative_score === 'number' ? alert.cumulative_score.toFixed(2) : '0.00';

  return (
    <article className={`alert-card alert-card--${tone}`}>
      <header className="alert-card__header">
        <div>
          <time className="alert-card__timestamp" dateTime={alert.timestamp}>
            {formatTimestamp(alert.timestamp)}
          </time>
          <div className="alert-card__case">Case: {alert.case_id}</div>
        </div>
        <span className={`alert-badge alert-badge--${tone}`}>
          {critical ? 'CRITICAL' : 'DEVIATION'}
        </span>
      </header>

      <ul className="alert-card__titles">
        {violations.map((v, idx) => (
          <li key={idx}>
            <AlertTriangle size={18} aria-hidden="true" /> {getDeviationTitle(v.type)}
          </li>
        ))}
      </ul>

      {contexts.length > 0 && (
        <div className="alert-card__context">
          {contexts.map((v, idx) => (
            <ViolationContext key={idx} violation={v} />
          ))}
        </div>
      )}

      <dl className="alert-card__meta">
        <div>
          <dt>System Message:</dt>
          <dd>{alert.message}</dd>
        </div>
        <div>
          <dt>Anomaly Score:</dt>
          <dd>{score}</dd>
        </div>
      </dl>

      {alert.event_history?.length > 0 && (
        <p className="alert-card__history">
          <strong>Recent History:</strong> {alert.event_history.join(' ➔ ')}
        </p>
      )}
    </article>
  );
}

// Alerts are immutable once received, so skip re-rendering existing cards.
export default memo(AlertCard);
