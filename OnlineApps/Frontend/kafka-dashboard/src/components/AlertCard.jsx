import { memo } from 'react';
import {
  AlertTriangle,
  Clock,
  ArrowUpRight,
  User,
  Activity,
  GitCommit,
  ShieldAlert,
  ChevronRight,
} from 'lucide-react';
import {
  ORG_ISSUE_TEXT,
  formatTimestamp,
  getDeviationTitle,
  getViolations,
  isCritical,
} from '../lib/alerts';

function ViolationContext({ violation }) {
  const { type, activity, actor, orgIssues = [] } = violation;
  if (!activity && orgIssues.length === 0) return null;

  return (
    <div className="alert-context-box">
      <div className="alert-context-statement">
        {activity && (
          <span className="context-item">
            <span className="context-label">Activity</span>
            <span className="cupertino-token cupertino-token--activity">
              <Activity size={12} aria-hidden="true" />
              <span>{activity}</span>
            </span>
          </span>
        )}
        {actor && (
          <span className="context-item">
            <span className="context-label">Resource</span>
            <span className="cupertino-token cupertino-token--actor">
              <User size={12} aria-hidden="true" />
              <span>{actor}</span>
            </span>
          </span>
        )}
      </div>

      {type === 'missing_token' && (
        <p className="alert-context-desc">
          Activity executed out of sequence or skipped a mandatory prerequisite step in the SOP.
        </p>
      )}

      {type === 'organizational' && (
        <div className="alert-context-org">
          <p className="alert-context-desc">
            Resource lacks the authorized role or organizational assignment for this activity.
          </p>
          {orgIssues.length > 0 && (
            <ul className="alert-org-issues">
              {orgIssues.map((issue) => (
                <li key={issue}>
                  <span className="issue-bullet" aria-hidden="true">•</span>
                  <span>{ORG_ISSUE_TEXT[issue] ?? issue}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {type === 'unknown_activity' && (
        <p className="alert-context-desc">
          Activity is not defined in the Master SOP Process Model.
        </p>
      )}
    </div>
  );
}

function AlertCard({ alert, onInspectCase = null, onSelectCase = null }) {
  const critical = isCritical(alert);
  const tone = critical ? 'critical' : 'deviation';
  const violations = getViolations(alert);
  const score = typeof alert.cumulative_score === 'number' ? alert.cumulative_score.toFixed(2) : '0.00';

  return (
    <article className={`alert-card alert-card--${tone}`}>
      {/* 1. Header Bar: Case ID, Timestamp, Score, Badge, and Action */}
      <header className="alert-card__header">
        <div className="alert-card__header-left">
          <button
            type="button"
            className="alert-card__case-pill"
            onClick={() => onSelectCase?.(alert.case_id)}
            title={`Filter alerts to Case #${alert.case_id}`}
          >
            <GitCommit size={13} aria-hidden="true" />
            <span>Case #{alert.case_id}</span>
          </button>
          <span className="alert-card__time">
            <Clock size={12} aria-hidden="true" />
            <time dateTime={alert.timestamp}>{formatTimestamp(alert.timestamp)}</time>
          </span>
        </div>

        <div className="alert-card__header-right">
          <div className="alert-card__score-pill">
            <span className="alert-score-label">Score</span>
            <span className={`alert-score-val alert-score-val--${tone}`}>{score}</span>
          </div>

          <span className={`alert-badge alert-badge--${tone}`}>
            <span className={`alert-badge__dot alert-badge__dot--${tone}`} aria-hidden="true" />
            <span>{critical ? 'CRITICAL' : 'DEVIATION'}</span>
          </span>

          {onInspectCase && (
            <button
              type="button"
              className="alert-card__inspect-btn"
              onClick={() => onInspectCase(alert.case_id)}
              title={`Inspect Case #${alert.case_id} in Petri Net Visualizer`}
            >
              <span>Inspect</span>
              <ArrowUpRight size={13} aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      {/* 2. Violations List */}
      <div className="alert-card__violations">
        {violations.map((v, idx) => (
          <div key={idx} className="alert-violation-row">
            <div className="alert-violation-row__heading">
              <div className={`alert-violation-icon alert-violation-icon--${v.type}`}>
                {v.type === 'missing_token' ? (
                  <AlertTriangle size={15} aria-hidden="true" />
                ) : v.type === 'organizational' ? (
                  <ShieldAlert size={15} aria-hidden="true" />
                ) : (
                  <AlertTriangle size={15} aria-hidden="true" />
                )}
              </div>
              <div className="alert-violation-meta">
                <span className="alert-violation-title">{getDeviationTitle(v.type)}</span>
                <span className="alert-violation-subtitle">
                  {v.type === 'missing_token'
                    ? 'Control-Flow Sequencing Deviation'
                    : v.type === 'organizational'
                      ? 'Organizational Model Violation'
                      : 'Process Model Deviation'}
                </span>
              </div>
            </div>

            <ViolationContext violation={v} />
          </div>
        ))}
      </div>

      {/* 3. System Diagnostic & Process Audit Trail (Footer) */}
      <footer className="alert-card__footer">
        {alert.message && (
          <div className="alert-card__diagnostic">
            <span className="alert-diag-label">Diagnostic:</span>
            <span className="alert-diag-text">{alert.message}</span>
          </div>
        )}

        {alert.event_history?.length > 0 && (
          <div className="alert-card__trail">
            <span className="alert-trail-label">Trace History:</span>
            <div className="alert-trail-steps" tabIndex={0} aria-label="Process event history sequence">
              {alert.event_history.map((step, idx) => {
                const isLast = idx === alert.event_history.length - 1;
                return (
                  <span key={idx} className="alert-trail-item">
                    <span className={`trail-step ${isLast ? 'trail-step--culprit' : ''}`}>
                      {isLast && <AlertTriangle size={11} className="trail-step__icon" aria-hidden="true" />}
                      <span>{step}</span>
                    </span>
                    {!isLast && <ChevronRight size={12} className="trail-step__sep" aria-hidden="true" />}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </footer>
    </article>
  );
}

// Alerts are immutable once received, so skip re-rendering existing cards.
export default memo(AlertCard);
