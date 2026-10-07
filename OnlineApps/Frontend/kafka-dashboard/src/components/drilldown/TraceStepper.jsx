import { AlertTriangle } from 'lucide-react';

/**
 * TraceStepper: Renders the chronological event sequence up to the deviation point.
 */
export default function TraceStepper({
  eventHistory = [],
  onSelectStep = null,
  selectedStep = null,
}) {
  if (!eventHistory || eventHistory.length === 0) {
    return null;
  }

  return (
    <section className="drilldown-card" aria-label="Process Trace Steps">
      <div className="drilldown-card__header">
        <h2 className="drilldown-card__title">Trace History ({eventHistory.length})</h2>
      </div>

      <div className="drilldown-card__body">
        <div className="trace-stepper" role="list">
          {eventHistory.map((step, idx) => {
            const isLast = idx === eventHistory.length - 1;
            const isSelected = selectedStep === step;

            return (
              <div
                key={idx}
                className={`trace-step-row ${isLast ? 'trace-step-row--culprit' : ''} ${
                  isSelected ? 'trace-step-row--selected' : ''
                }`}
                role="listitem"
                onClick={() => onSelectStep?.(step, idx)}
                style={{ cursor: onSelectStep ? 'pointer' : 'default' }}
                title={isLast ? 'Activity where deviation occurred' : `Step ${idx + 1}: ${step}`}
              >
                <div className="trace-step-idx">{idx + 1}</div>
                <div className="trace-step-content">
                  <span className="trace-step-label">{step}</span>
                  {isLast && (
                    <span className="trace-step-badge">
                      <AlertTriangle size={11} aria-hidden="true" />
                      <span>Deviation point</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
