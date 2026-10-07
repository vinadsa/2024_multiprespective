import { useState, useCallback } from 'react';
import { Check, ChevronDown, Copy, Download, FileCode } from 'lucide-react';

/**
 * RawPayloadViewer: Collapsible Cupertino Inset Group drawer for raw Kafka event and alert payloads.
 */
export default function RawPayloadViewer({ alert }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(JSON.stringify(alert, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy payload:', err);
    }
  }, [alert]);

  const handleExport = useCallback((e) => {
    e.stopPropagation();
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(alert, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `event_payload_${alert.case_id}_${alert.alert_id || Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }, [alert]);

  return (
    <section className="drilldown-card drilldown-card--raw" aria-label="Raw Payload Inspector">
      <button
        type="button"
        className="drilldown-card__header raw-accordion-header"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
      >
        <div className="raw-accordion-title">
          <FileCode size={14} aria-hidden="true" />
          <h2 className="drilldown-card__title">Raw Event Payload</h2>
        </div>

        <div className="raw-accordion-actions">
          <ChevronDown
            size={14}
            className={`accordion-chevron ${isExpanded ? 'accordion-chevron--open' : ''}`}
            aria-hidden="true"
          />
        </div>
      </button>

      {isExpanded && (
        <div className="drilldown-card__body drilldown-card__body--code">
          <div className="raw-payload-toolbar">
            <button
              type="button"
              className="raw-toolbar-btn"
              onClick={handleCopy}
              title="Copy JSON payload"
            >
              {copied ? <Check size={12} className="text-success" aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            <button
              type="button"
              className="raw-toolbar-btn"
              onClick={handleExport}
              title="Export JSON payload"
            >
              <Download size={12} aria-hidden="true" />
              <span>Export</span>
            </button>
          </div>
          <pre className="raw-payload-pre">
            <code>{JSON.stringify(alert, null, 2)}</code>
          </pre>
        </div>
      )}
    </section>
  );
}
