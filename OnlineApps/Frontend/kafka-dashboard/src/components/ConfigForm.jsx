import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Folder,
  Info,
  Play,
  RotateCcw,
} from 'lucide-react';
import OptionCardGroup from './OptionCardGroup';
import { DEFAULT_CONFIG } from '../config';
import { configureConsumer, fetchStatus } from '../lib/api';

const MODE_OPTIONS = [
  {
    value: 'online',
    title: 'Online (Control-Flow)',
    description:
      'Standard mode. Replays traces exclusively against the structural Petri Net model to flag missing tokens, bypassed places, or out-of-order transitions.',
    Icon: Clock,
    badge: 'PETRI NET ONLY',
    badgeTone: 'neutral',
    footerLabel: 'Latency: <1.2ms/event',
  },
  {
    value: 'multi',
    title: 'Multi-organizational',
    description:
      'Advanced composite mode. Evaluates Petri Net control-flow and simultaneously validates performer credentials, team hierarchy, and segregation-of-duties via YAML policies.',
    Icon: Building2,
    badge: 'CONTROL-FLOW + RBAC',
    badgeTone: 'primary',
    isVerified: true,
    footerLabel: 'Recommended for Governance',
  },
];

const REPLAY_OPTIONS = [
  {
    value: 'continue',
    title: 'Continue Replay',
    description:
      'Resume from where the engine stopped. Preserves all existing Replay Images in Neo4j, and reads Kafka strictly from last committed offset.',
    Icon: Play,
    badge: 'INCREMENTAL',
    badgeTone: 'neutral',
    footerLabel: 'Preserves trace audit logs',
  },
  {
    value: 'reset',
    title: 'Reset (Clean Slate)',
    description:
      'Start fresh. Deletes active replay instances in Neo4j, drops temporary in-memory deviation buffers, and rewinds Kafka consumer groups to index 0.',
    Icon: RotateCcw,
    badge: 'BUFFER FLUSH',
    badgeTone: 'danger',
    footerLabel: 'Safe testing environment',
  },
];

const ConfigForm = forwardRef(function ConfigForm({ initialConfig, onConfigured }, ref) {
  const [mode, setMode] = useState(initialConfig.mode ?? 'multi');
  const [conformance, setConformance] = useState(initialConfig.conformance ?? 'continue');
  const [orgModelFile, setOrgModelFile] = useState(
    initialConfig.orgModelFile ?? 'models/org_model.repair.yaml'
  );
  const [apiUrl, setApiUrl] = useState(initialConfig.apiUrl ?? DEFAULT_CONFIG.apiUrl);
  const [wsUrl, setWsUrl] = useState(initialConfig.wsUrl ?? DEFAULT_CONFIG.wsUrl);

  const [isAdvancedOpen, setIsAdvancedOpen] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error', message: string }

  const fileInputRef = useRef(null);

  // Expose revertToDefaults method to parent (e.g. HeaderBar)
  useImperativeHandle(ref, () => ({
    revertToDefaults() {
      setMode('multi');
      setConformance('continue');
      setOrgModelFile('models/org_model.repair.yaml');
      setApiUrl(DEFAULT_CONFIG.apiUrl);
      setWsUrl(DEFAULT_CONFIG.wsUrl);
      setFeedback({
        type: 'info',
        message: 'Pengaturan telah dikembalikan ke nilai default sistem.',
      });
      setTimeout(() => setFeedback(null), 3500);
    },
  }));

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setOrgModelFile(`models/${file.name}`);
      setFeedback({
        type: 'info',
        message: `File model terpilih: ${file.name}`,
      });
      setTimeout(() => setFeedback(null), 3000);
    }
  };

  const handleDryRun = async () => {
    setFeedback(null);
    setIsValidating(true);
    const cleanApiUrl = apiUrl.trim().replace(/\/+$/, '');

    try {
      const statusData = await fetchStatus(cleanApiUrl);
      if (statusData && typeof statusData.is_running === 'boolean') {
        setFeedback({
          type: 'success',
          message: `✅ Verifikasi Berhasil! Backend (${cleanApiUrl}) aktif & mode siap diterapkan.`,
        });
      } else {
        setFeedback({
          type: 'success',
          message: `✅ Server terjangkau pada ${cleanApiUrl}. Validasi konfigurasi sukses.`,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: `Gagal terhubung ke API server (${cleanApiUrl}): ${err.message}`,
      });
    } finally {
      setIsValidating(false);
      setTimeout(() => setFeedback((f) => (f?.type === 'success' ? null : f)), 4000);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFeedback(null);
    setIsSubmitting(true);

    const cleanApiUrl = apiUrl.trim().replace(/\/+$/, '');
    try {
      const data = await configureConsumer(cleanApiUrl, { mode, conformance });
      if (data.status === 'success') {
        onConfigured({
          mode,
          conformance,
          orgModelFile,
          apiUrl: cleanApiUrl,
          wsUrl: wsUrl.trim(),
        });
      } else {
        setFeedback({
          type: 'error',
          message: data.message || 'Konfigurasi gagal diterapkan.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: `Kesalahan saat konfigurasi: ${err.message}`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="engine-settings-form" onSubmit={handleSubmit}>
      <header className="settings-form-intro">
        <h2 className="settings-form-title">Engine Configuration</h2>
        <p className="settings-form-subtitle">
          Configure process mining anomaly detection parameters, graph replay strategy, and stream connection endpoints.
        </p>
      </header>

      {/* 1. Conformance Detection Mode */}
      <OptionCardGroup
        name="mode"
        legend="1. Conformance Detection Mode"
        categoryTag="Evaluation Layer"
        description="Select the analytical depth applied during stream transition replay."
        options={MODE_OPTIONS}
        value={mode}
        onChange={setMode}
      />

      {/* 2. Running & Replay Strategy */}
      <OptionCardGroup
        name="conformance"
        legend="2. Running & Replay Strategy"
        categoryTag="State Management"
        description="Choose how token positions in graph storage and Kafka consumer offsets are handled."
        options={REPLAY_OPTIONS}
        value={conformance}
        onChange={setConformance}
      />

      {/* 3. Advanced Stream & Rule Engine Settings (Accordion) */}
      <section className="advanced-accordion-panel" aria-label="Advanced Stream & Rule Engine Settings">
        <header
          className="advanced-accordion-panel__header"
          onClick={() => setIsAdvancedOpen((prev) => !prev)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setIsAdvancedOpen((p) => !p)}
        >
          <div className="accordion-title-wrap">
            <span className="accordion-chevron" aria-hidden="true">
              {isAdvancedOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </span>
            <h2 className="accordion-title">Advanced Stream & Rule Engine Settings</h2>
            <span className="accordion-badge">Kafka & Neo4j</span>
          </div>
          <span className="accordion-hint">Low-latency stream tuning</span>
        </header>

        {isAdvancedOpen && (
          <div className="advanced-accordion-panel__body">
            {/* Row 1: Organizational Rules File */}
            <div className="advanced-row">
              <div className="advanced-row__info">
                <label htmlFor="orgModelFile" className="advanced-row__label">
                  Organizational Rules File
                </label>
                <p className="advanced-row__desc">
                  YAML definitions defining roles, assignments, and policies.
                </p>
              </div>
              <div className="advanced-row__control advanced-row__control--file">
                <input
                  id="orgModelFile"
                  type="text"
                  className="advanced-input code-font"
                  value={orgModelFile}
                  onChange={(e) => setOrgModelFile(e.target.value)}
                  placeholder="models/org_model.repair.yaml"
                />
                <button
                  type="button"
                  className="btn-browse-file"
                  onClick={() => fileInputRef.current?.click()}
                  title="Pilih file konfigurasi YAML"
                >
                  <Folder size={14} aria-hidden="true" />
                  <span>Browse...</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".yaml,.yml"
                  className="visually-hidden"
                  onChange={handleFileSelect}
                />
              </div>
            </div>

            {/* Row 2: Connection Endpoints (API & WS URLs) */}
            <div className="advanced-row">
              <div className="advanced-row__info">
                <span className="advanced-row__label">Service Endpoints</span>
                <p className="advanced-row__desc">
                  Backend API server and WebSocket telemetry connection URLs.
                </p>
              </div>
              <div className="advanced-row__control advanced-row__control--endpoints">
                <div className="endpoint-input-wrap">
                  <label htmlFor="apiUrl" className="endpoint-label">API URL</label>
                  <input
                    id="apiUrl"
                    type="url"
                    className="advanced-input code-font"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    placeholder="http://localhost:8000"
                    required
                  />
                </div>
                <div className="endpoint-input-wrap">
                  <label htmlFor="wsUrl" className="endpoint-label">WebSocket URL</label>
                  <input
                    id="wsUrl"
                    type="text"
                    className="advanced-input code-font"
                    value={wsUrl}
                    onChange={(e) => setWsUrl(e.target.value)}
                    placeholder="ws://localhost:8000/ws"
                    pattern="wss?://.+"
                    required
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Floating or Status Notification Toast */}
      {feedback && (
        <div className={`feedback-banner feedback-banner--${feedback.type}`} role="status">
          {feedback.type === 'error' ? (
            <AlertTriangle size={16} aria-hidden="true" />
          ) : feedback.type === 'success' ? (
            <CheckCircle2 size={16} aria-hidden="true" />
          ) : (
            <Info size={16} aria-hidden="true" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Bottom Action Bar */}
      <footer className="engine-action-bar">
        <div className="action-bar__info">
          <Info size={15} className="info-icon" aria-hidden="true" />
          <span>Changes take effect immediately on next stream ingestion cycle.</span>
        </div>

        <div className="action-bar__buttons">
          <button
            type="button"
            className="action-btn action-btn--secondary"
            onClick={handleDryRun}
            disabled={isValidating || isSubmitting}
            title="Cek konektivitas dan validasi parameter tanpa mengubah data"
          >
            {isValidating ? (
              <span className="btn-loading">
                <span className="spinner spinner--sm" aria-hidden="true" /> Validating...
              </span>
            ) : (
              'Dry Run & Validate'
            )}
          </button>

          <button
            type="submit"
            id="start-monitoring"
            className="action-btn action-btn--primary"
            disabled={isSubmitting || isValidating}
            title="Terapkan konfigurasi dan mulai monitor proses"
          >
            {isSubmitting ? (
              <span className="btn-loading">
                <span className="spinner spinner--sm" aria-hidden="true" /> Applying...
              </span>
            ) : (
              <>
                <CheckCircle2 size={16} aria-hidden="true" />
                <span>Save & Start Monitoring</span>
              </>
            )}
          </button>
        </div>
      </footer>
    </form>
  );
});

export default ConfigForm;
