import { AlertTriangle, GitFork, ShieldAlert } from 'lucide-react';
import { getDeviationTitle } from '../../lib/alerts';

/**
 * RootCauseCard: Analyzes the underlying root causes for control-flow and organizational deviations.
 */
export default function RootCauseCard({
  alert,
  violations = [],
  markingSnapshot = {},
  culpritActivity,
  culpritActor,
}) {
  // Find places where missing tokens were inserted
  const missingPlaces = Object.entries(markingSnapshot)
    .filter(([_, mark]) => (mark.missing || 0) > 0)
    .map(([place, mark]) => ({ place, missing: mark.missing }));

  const hasMissingToken = violations.some((v) => v.type === 'missing_token') || alert.deviation_type === 'missing_token';
  const hasOrgViolation = violations.some((v) => v.type === 'organizational') || alert.deviation_type === 'organizational';

  return (
    <section className="drilldown-card" aria-label="Root Cause Analysis">
      <div className="drilldown-card__header">
        <h2 className="drilldown-card__title">Root Cause Analysis</h2>
      </div>

      <div className="drilldown-card__body">
        {/* 1. Control-Flow Diagnostic (Missing Token / Sequence) */}
        {hasMissingToken && (
          <div className="root-cause-section root-cause-section--flow">
            <div className="root-cause-header">
              <div className="violation-icon-wrap violation-icon-wrap--missing_token">
                <AlertTriangle size={14} aria-hidden="true" />
              </div>
              <div className="root-cause-titles">
                <strong className="root-cause-type">Control-Flow Sequence Deviation</strong>
                <span className="root-cause-subtitle">Petri Net prerequisite marking not satisfied</span>
              </div>
            </div>

            <p className="root-cause-desc">
              Activity <strong>&ldquo;{culpritActivity}&rdquo;</strong> executed without sufficient input tokens.
              A synthetic missing token was injected during token replay to preserve WF-Net continuity.
            </p>

            {missingPlaces.length > 0 && (
              <div className="missing-places-box">
                <span className="missing-places-label">Depleted input places:</span>
                <div className="missing-places-tags">
                  {missingPlaces.map(({ place, missing }) => (
                    <span key={place} className="missing-place-pill">
                      <code>{place}</code>
                      <span className="missing-place-count">⚠️ +{missing} missing</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. Organizational Policy Diagnostic */}
        {hasOrgViolation && (
          <div className="root-cause-section root-cause-section--org">
            <div className="root-cause-header">
              <div className="violation-icon-wrap violation-icon-wrap--organizational">
                <ShieldAlert size={14} aria-hidden="true" />
              </div>
              <div className="root-cause-titles">
                <strong className="root-cause-type">Organizational Policy Violation</strong>
                <span className="root-cause-subtitle">Unauthorized actor or team assignment</span>
              </div>
            </div>

            <p className="root-cause-desc">
              Resource <strong>&ldquo;{culpritActor}&rdquo;</strong> executed <strong>&ldquo;{culpritActivity}&rdquo;</strong> contrary
              to the configured organizational model constraints.
            </p>
          </div>
        )}

        {/* Fallback if unknown deviation type */}
        {!hasMissingToken && !hasOrgViolation && (
          <div className="root-cause-section">
            <div className="root-cause-header">
              <div className="violation-icon-wrap">
                <GitFork size={14} aria-hidden="true" />
              </div>
              <div className="root-cause-titles">
                <strong className="root-cause-type">{getDeviationTitle(alert.deviation_type)}</strong>
                <span className="root-cause-subtitle">Conformance discrepancy</span>
              </div>
            </div>
            <p className="root-cause-desc">
              {alert.message || 'Deviation observed during GO-TR graph token replay conformance checking.'}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
