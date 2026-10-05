import { useState } from 'react';
import { AlertTriangle, Building2, Play, RotateCcw, Timer } from 'lucide-react';
import OptionCardGroup from './OptionCardGroup';
import { configureConsumer } from '../lib/api';

const MODE_OPTIONS = [
  {
    value: 'online',
    title: 'Online (Control-Flow)',
    description: 'Standard mode. Evaluates if the event sequence follows the master Petri Net strictly (detects missing tokens or skipped tasks).',
    Icon: Timer,
  },
  {
    value: 'multi',
    title: 'Multi-organizational',
    description: 'Advanced mode. Evaluates control-flow PLUS organizational rules (validates if the actor has the correct Role and Team per the YAML config).',
    Icon: Building2,
  },
];

const CONFORMANCE_OPTIONS = [
  {
    value: 'continue',
    title: 'Continue',
    description: 'Resume from where it left off. Preserves existing Replay Images in Neo4j and resumes Kafka from the last committed offset.',
    Icon: Play,
  },
  {
    value: 'reset',
    title: 'Reset (Clean Slate)',
    description: 'Start fresh. Deletes all Replay Images in Neo4j, flushes memory buffers, and resets Kafka to read from the beginning.',
    Icon: RotateCcw,
  },
];

export default function ConfigForm({ initialConfig, onConfigured }) {
  const [mode, setMode] = useState(initialConfig.mode);
  const [conformance, setConformance] = useState(initialConfig.conformance);
  const [apiUrl, setApiUrl] = useState(initialConfig.apiUrl);
  const [wsUrl, setWsUrl] = useState(initialConfig.wsUrl);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    const cleanApiUrl = apiUrl.trim().replace(/\/+$/, '');
    try {
      const data = await configureConsumer(cleanApiUrl, { mode, conformance });
      if (data.status === 'success') {
        onConfigured({ mode, conformance, apiUrl: cleanApiUrl, wsUrl: wsUrl.trim() });
      } else {
        setError(data.message || 'Configuration failed');
      }
    } catch (err) {
      setError(`Configuration error: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="configuration-container">
      <form className="modern-config" onSubmit={handleSubmit}>
        <header className="config-header">
          <h1 className="configuration-title">GO-TR Monitor</h1>
          <p className="config-subtitle">Configure your real-time process mining engine</p>
        </header>

        <OptionCardGroup
          name="mode"
          legend="1. Conformance Mode"
          description="Select the depth of anomaly detection."
          options={MODE_OPTIONS}
          value={mode}
          onChange={setMode}
        />

        <OptionCardGroup
          name="conformance"
          legend="2. Running Mode"
          description="Choose how the engine handles existing history and data."
          options={CONFORMANCE_OPTIONS}
          value={conformance}
          onChange={setConformance}
        />

        <details className="advanced-settings">
          <summary>Advanced Settings</summary>
          <div className="advanced-group">
            <label htmlFor="apiUrl">API Server URL</label>
            <input
              id="apiUrl"
              type="url"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="http://localhost:8000"
              required
            />
          </div>
          <div className="advanced-group">
            <label htmlFor="wsUrl">WebSocket Server URL</label>
            <input
              id="wsUrl"
              type="text"
              value={wsUrl}
              onChange={(e) => setWsUrl(e.target.value)}
              placeholder="ws://localhost:8000/ws"
              pattern="wss?://.+"
              required
            />
            <small className="help-text">Only change these if the backend runs on a different host/port.</small>
          </div>
        </details>

        <div className="action-section">
          <button
            type="submit"
            id="start-monitoring"
            className="configure-button"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <span className="loading-text">
                <span className="spinner" aria-hidden="true" /> Configuring...
              </span>
            ) : 'Start Monitoring'}
          </button>

          {error && (
            <div className="error-message bounce-in" role="alert">
              <AlertTriangle size={18} aria-hidden="true" /> {error}
            </div>
          )}
        </div>
      </form>
    </main>
  );
}
